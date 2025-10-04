/**
 * RabbitMQ Configuration for Analysis Worker
 */

const amqp = require('amqplib');
const logger = require('../utils/logger');

// RabbitMQ configuration
const config = {
  url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
  exchange: process.env.EXCHANGE_NAME || 'atma_exchange',
  queue: process.env.QUEUE_NAME || 'assessment_analysis',
  routingKey: process.env.ROUTING_KEY || 'analysis.process',
  deadLetterQueue: process.env.DEAD_LETTER_QUEUE || 'assessment_analysis_dlq',
  // Events configuration for event-driven architecture
  eventsExchange: process.env.EVENTS_EXCHANGE_NAME || 'atma_events_exchange',
  eventsRoutingKeys: {
    analysisCompleted: 'analysis.completed',
    analysisFailed: 'analysis.failed',
    analysisStarted: 'analysis.started'
  },
  options: {
    durable: process.env.QUEUE_DURABLE === 'true',
    persistent: process.env.MESSAGE_PERSISTENT === 'true'
  },
  // Message TTL and timeout settings
  messageTTL: parseInt(process.env.MESSAGE_TTL || '3600000'), // 1 hour default
  queueTTL: parseInt(process.env.QUEUE_TTL || '86400000'),   // 24 hours default
  messageTimeout: parseInt(process.env.MESSAGE_TIMEOUT || '1800000') // 30 minutes default
};

// Connection and channel variables
let connection = null;
let channel = null;

/**
 * Initialize RabbitMQ connection and setup exchange/queue
 * @returns {Promise<Object>} - RabbitMQ channel
 */
const initialize = async () => {
  try {
    // Create connection
    logger.info('Connecting to RabbitMQ...');
    connection = await amqp.connect(config.url);

    // Handle connection close
    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      setTimeout(reconnect, 5000);
    });

    // Handle connection error
    connection.on('error', (err) => {
      logger.error('RabbitMQ connection error', { error: err.message });
      setTimeout(reconnect, 5000);
    });

    // Create channel
    channel = await connection.createChannel();

    // Set prefetch count for fair dispatch
    await channel.prefetch(parseInt(process.env.WORKER_CONCURRENCY || '10'));

    // Setup main exchange for job processing
    await channel.assertExchange(config.exchange, 'direct', {
      durable: config.options.durable
    });

    // Setup events exchange for event-driven architecture
    await channel.assertExchange(config.eventsExchange, 'topic', {
      durable: true
    });

    // Setup main queue with dead letter exchange (matching assessment service configuration)
    await channel.assertQueue(config.queue, {
      durable: config.options.durable,
      arguments: {
        'x-dead-letter-exchange': config.exchange,
        'x-dead-letter-routing-key': 'dlq'
      }
    });

    // Setup dead letter queue
    await channel.assertQueue(config.deadLetterQueue, {
      durable: config.options.durable
    });

    // Bind queues to exchange
    await channel.bindQueue(config.queue, config.exchange, config.routingKey);
    await channel.bindQueue(config.deadLetterQueue, config.exchange, 'dlq');

    logger.info('RabbitMQ connected', {
      queue: config.queue,
      exchange: config.exchange,
      eventsExchange: config.eventsExchange
    });

    return channel;
  } catch (error) {
    logger.error('Failed to initialize RabbitMQ', { error: error.message });
    throw error;
  }
};

/**
 * Reconnect to RabbitMQ
 */
const reconnect = async () => {
  try {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error('Error closing existing RabbitMQ connection', { error: err.message });
      }
    }

    await initialize();
  } catch (error) {
    logger.error('Failed to reconnect to RabbitMQ', { error: error.message });
    setTimeout(reconnect, 5000);
  }
};

/**
 * Get RabbitMQ channel (initialize if needed)
 * @returns {Promise<Object>} - RabbitMQ channel
 */
const getChannel = async () => {
  if (!channel) {
    await initialize();
  }
  return channel;
};

/**
 * Close RabbitMQ connection
 */
const close = async () => {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    logger.info('RabbitMQ connection closed gracefully');
  } catch (error) {
    logger.error('Error closing RabbitMQ connection', { error: error.message });
    throw error;
  }
};

/**
 * Check if RabbitMQ connection is healthy
 * @returns {Promise<boolean>} - Connection status
 */
const checkHealth = async () => {
  try {
    if (!connection || !channel) {
      return false;
    }

    // Check if connection is still open
    return connection.connection && !connection.connection.closed;
  } catch (error) {
    logger.error('Error checking RabbitMQ health', { error: error.message });
    return false;
  }
};

module.exports = {
  config,
  initialize,
  getChannel,
  close,
  checkHealth
};
