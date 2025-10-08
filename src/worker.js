/**
 * Analysis Worker - Main Entry Point
 * 
 * This worker consumes assessment jobs from RabbitMQ,
 * processes them using Google Generative AI,
 * and saves results to Archive Service.
 */

// Load environment variables
const path = require('path');

// Load environment variables only in development
// In production, Docker will inject environment variables from root .env via docker-compose
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: true });
  console.log('DEBUG: Environment loaded from root .env file');
  console.log('DEBUG: GOOGLE_AI_MODEL:', process.env.GOOGLE_AI_MODEL);
  console.log('DEBUG: USE_MOCK_MODEL:', process.env.USE_MOCK_MODEL);
  console.log('DEBUG: AI_TEMPERATURE:', process.env.AI_TEMPERATURE);
}

// Import dependencies
const logger = require('./utils/logger');
const queueConsumer = require('./services/queueConsumer');
const dlqMonitor = require('./services/dlqMonitor');
const jobHeartbeat = require('./services/jobHeartbeat');
const stuckJobMonitor = require('./services/stuckJobMonitor');
const { gracefulShutdown } = require('./utils/shutdown');

// Validate critical environment variables
const validateEnvironment = () => {
  const critical = [
    'GOOGLE_AI_API_KEY',
    'GOOGLE_AI_MODEL',
    'AI_TEMPERATURE',
    'USE_MOCK_MODEL',
    'RABBITMQ_URL',
    'QUEUE_NAME'
  ];

  const missing = critical.filter(key => process.env[key] === undefined);

  if (missing.length > 0) {
    logger.error('Missing critical environment variables:', { missing });
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please check /atma-backend/.env file`);
  }

  logger.info('Environment validation passed', {
    model: process.env.GOOGLE_AI_MODEL,
    temperature: process.env.AI_TEMPERATURE,
    useMockModel: process.env.USE_MOCK_MODEL,
    configSource: process.env.NODE_ENV === 'production' ? 'Docker environment' : 'root .env file'
  });
};

// Validate environment before starting
validateEnvironment();

// Log worker startup
logger.info('Analysis Worker starting up', {
  env: process.env.NODE_ENV,
  queue: process.env.QUEUE_NAME,
  concurrency: process.env.WORKER_CONCURRENCY
});

/**
 * Main function to start the worker
 */
async function startWorker() {
  try {
    // Initialize queue consumer
    await queueConsumer.initialize();

    // Start consuming messages
    await queueConsumer.startConsuming();

    // Start DLQ monitoring
    await dlqMonitor.startMonitoring();

    // Start job heartbeat cleanup scheduler
    jobHeartbeat.startCleanupScheduler();

    // Start stuck job monitor
    stuckJobMonitor.start();

    // Log successful startup
    logger.info('Analysis Worker ready - consuming messages');

    // Setup heartbeat for monitoring (reduced frequency)
    const heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL || '300000'); // 5 minutes default
    setInterval(() => {
      logger.info('Worker heartbeat', { 
        status: 'running',
        activeHeartbeats: jobHeartbeat.getActiveJobsCount()
      });
    }, heartbeatInterval);

  } catch (error) {
    logger.error('Failed to start Analysis Worker', {
      error: error.message,
      stack: error.stack
    });

    // Exit with error
    process.exit(1);
  }
}

// Handle process termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  gracefulShutdown('uncaughtException');
});

// Start the worker
startWorker();
