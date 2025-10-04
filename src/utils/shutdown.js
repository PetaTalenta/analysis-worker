/**
 * Graceful shutdown utility
 */

const logger = require('./logger');
const queueConsumer = require('../services/queueConsumer');
const dlqMonitor = require('../services/dlqMonitor');
const jobHeartbeat = require('../services/jobHeartbeat');
const stuckJobMonitor = require('../services/stuckJobMonitor');

// Flag to prevent multiple shutdown attempts
let isShuttingDown = false;

/**
 * Perform graceful shutdown
 * @param {String} signal - Signal that triggered shutdown
 */
async function gracefulShutdown(signal) {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    return;
  }
  
  isShuttingDown = true;
  
  logger.info(`Graceful shutdown initiated (${signal})`, {
    signal,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Stop DLQ monitoring
    logger.info('Stopping DLQ monitoring...');
    dlqMonitor.stopMonitoring();
    
    // Shutdown job heartbeats
    logger.info('Shutting down job heartbeats...');
    jobHeartbeat.shutdown();
    
    // Stop stuck job monitor
    logger.info('Stopping stuck job monitor...');
    stuckJobMonitor.stop();
    
    // Close queue consumer connection
    logger.info('Closing queue consumer connection...');
    await queueConsumer.close();
    logger.info('Queue consumer connection closed successfully');
    
    logger.info('Graceful shutdown completed successfully');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error.message,
      stack: error.stack
    });
    
    // Force exit after failed graceful shutdown
    process.exit(1);
  }
}

module.exports = {
  gracefulShutdown
};
