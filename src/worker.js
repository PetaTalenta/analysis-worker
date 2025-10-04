/**
 * Analysis Worker - Main Entry Point
 * 
 * This worker consumes assessment jobs from RabbitMQ,
 * processes them using Google Generative AI,
 * and saves results to Archive Service.
 */

// Load environment variables
const path = require('path');

// Load environment variables
require('dotenv').config();

// Import dependencies
const logger = require('./utils/logger');
const queueConsumer = require('./services/queueConsumer');
const dlqMonitor = require('./services/dlqMonitor');
const jobHeartbeat = require('./services/jobHeartbeat');
const stuckJobMonitor = require('./services/stuckJobMonitor');
const { gracefulShutdown } = require('./utils/shutdown');

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
