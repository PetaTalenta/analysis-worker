/**
 * RabbitMQ Queue Consumer Service
 */

const rabbitmq = require('../config/rabbitmq');
const logger = require('../utils/logger');
const { processAssessmentOptimized } = require('../processors/optimizedAssessmentProcessor');
const { validateJobMessage } = require('../utils/validator');
const { initializeEventPublisher, getEventPublisher } = require('./eventPublisher');
const { updateAnalysisJobStatus } = require('../services/archiveService');
const notificationService = require('../services/notificationService');

// Consumer state
let isConsuming = false;
let channel = null;

/**
 * Initialize queue consumer
 */
const initialize = async () => {
  try {
    // Initialize RabbitMQ connection
    channel = await rabbitmq.initialize();

    // Initialize event publisher for event-driven architecture
    await initializeEventPublisher(channel);

    logger.info('Queue consumer and event publisher initialized');
  } catch (error) {
    logger.error('Failed to initialize queue consumer', { error: error.message });
    throw error;
  }
};

/**
 * Start consuming messages from the queue
 */
const startConsuming = async () => {
  try {
    if (isConsuming) {
      logger.warn('Queue consumer is already consuming messages');
      return;
    }

    if (!channel) {
      throw new Error('Queue consumer not initialized');
    }

    // Set prefetch count to enable true concurrency
    const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '10');
    await channel.prefetch(concurrency);

    // Start consuming messages with concurrency support
    await channel.consume(rabbitmq.config.queue, (message) => {
      if (message) {
        // Process message without await to enable concurrency
        processMessage(message).catch(error => {
          logger.error('Unhandled error in message processing', {
            error: error.message,
            stack: error.stack
          });
        });
      }
    }, {
      noAck: false // Manual acknowledgment
    });

    isConsuming = true;

    logger.info('Started consuming messages', {
      queue: rabbitmq.config.queue,
      concurrency: concurrency
    });
  } catch (error) {
    logger.error('Failed to start consuming messages', { error: error.message });
    throw error;
  }
};

/**
 * Process a single message from the queue
 * @param {Object} message - RabbitMQ message
 */
const processMessage = async (message) => {
  const startTime = Date.now();
  let jobData = null;

  try {
    // Parse message content
    const messageContent = message.content.toString();
    jobData = JSON.parse(messageContent);

    // Get retry count from message headers or job data
    const headerRetryCount = message.properties?.headers?.retryCount || 0;
    const dataRetryCount = jobData.retryCount || 0;
    const actualRetryCount = Math.max(headerRetryCount, dataRetryCount);

    // Update job data with actual retry count
    jobData.retryCount = actualRetryCount;

    // Create job-specific logger for better tracking
    const jobLogger = logger.withJob(jobData.jobId, jobData.userId, jobData.userEmail);

    jobLogger.info('Processing assessment job', {
      retry: actualRetryCount,
      processor: 'optimized'
    });

    // Validate message structure (assessment data validation is already done in assessment-service)
    const validationResult = validateJobMessage(jobData);
    if (!validationResult.isValid) {
      throw new Error(`Invalid message format: ${validationResult.error}`);
    }

    // Process the assessment job using optimized processor
    const result = await processAssessmentOptimized(jobData);

    // Acknowledge message on successful processing
    channel.ack(message);

    const processingTime = Date.now() - startTime;

    logger.info('Assessment job completed', {
      jobId: jobData.jobId,
      resultId: result.id,
      time: `${processingTime}ms`
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    logger.error('Failed to process assessment job', {
      jobId: jobData?.jobId,
      userId: jobData?.userId,
      error: error.message,
      processingTime: `${processingTime}ms`,
      retryCount: jobData?.retryCount || 0
    });

    // Handle message retry or rejection
    await handleMessageError(message, jobData, error);
  }
};

/**
 * Handle message processing error
 * @param {Object} message - RabbitMQ message
 * @param {Object} jobData - Job data
 * @param {Error} error - Processing error
 */
const handleMessageError = async (message, jobData, error) => {
  try {
    const maxRetries = parseInt(process.env.MAX_RETRIES || '3');
    const retryCount = (jobData?.retryCount || 0) + 1;

    // Check if error should not be retried (AI service errors to prevent token consumption)
    const errCode = error?.code;
    const errMsg = error?.message || '';
    const shouldNotRetry = errCode === 'VALIDATION_ERROR' ||
                           errCode === 'AI_RESPONSE_PARSE_ERROR' ||
                           errCode === 'AI_TIMEOUT' ||  // ✅ TAMBAH INI: Jangan retry timeout!
                           errMsg.includes('AI service') ||
                           errMsg.includes('persona profile') ||
                           errMsg.includes('Invalid persona profile') ||
                           errMsg.includes('Failed to generate persona profile') ||
                           errMsg.includes('timed out') ||  // ✅ TAMBAH INI: Catch timeout messages
                           errMsg.includes('timeout');

    if (retryCount <= maxRetries && !shouldNotRetry) {
      // Retry the message by publishing a new message with updated retry count
      logger.info('Retrying assessment job', {
        jobId: jobData?.jobId,
        retryCount,
        maxRetries
      });

      // Update retry count in job data
      if (jobData) {
        jobData.retryCount = retryCount;

        // Add delay before retry (exponential backoff)
        const retryDelay = parseInt(process.env.RETRY_DELAY || '5000') * Math.pow(2, retryCount - 1);

        setTimeout(async () => {
          try {
            // Publish new message with updated retry count
            const messageBuffer = Buffer.from(JSON.stringify(jobData));
            const published = channel.publish(
              rabbitmq.config.exchange,
              rabbitmq.config.routingKey,
              messageBuffer,
              {
                persistent: rabbitmq.config.options.persistent,
                messageId: jobData.jobId,
                timestamp: Date.now(),
                headers: {
                  retryCount: retryCount,
                  originalJobId: jobData.jobId,
                  retryAttempt: true
                }
              }
            );

            if (published) {
              logger.info('Retry message published successfully', {
                jobId: jobData.jobId,
                retryCount,
                delay: retryDelay
              });
            } else {
              logger.error('Failed to publish retry message', {
                jobId: jobData.jobId,
                retryCount
              });
            }
          } catch (publishError) {
            logger.error('Error publishing retry message', {
              jobId: jobData.jobId,
              retryCount,
              error: publishError.message
            });
          }
        }, retryDelay);
      }

      // Acknowledge original message to remove it from queue
      channel.ack(message);

    } else {
      // Send to dead letter queue
      const reason = shouldNotRetry ? 'Error should not be retried (AI service error)' : 'Max retries exceeded';
      logger.error(`${reason}, sending to dead letter queue`, {
        jobId: jobData?.jobId,
        retryCount,
        maxRetries,
        shouldNotRetry,
        error: error.message
      });

      // Before sending to DLQ, publish analysis.failed event and attempt status sync
      try {
        // Optional: update job status to failed in Archive Service
        if (jobData?.jobId) {
          updateAnalysisJobStatus(jobData.jobId, 'failed', { error_message: error.message })
            .catch((statusErr) => {
              logger.warn('Failed to update analysis job status to failed', {
                jobId: jobData.jobId,
                error: statusErr.message
              });
            });
        }

        // Try to publish failure event
        try {
          const eventPublisher = getEventPublisher();
          eventPublisher.publishAnalysisFailed({
            jobId: jobData?.jobId,
            userId: jobData?.userId,
            userEmail: jobData?.userEmail,
            errorMessage: error.message,
            assessmentName: jobData?.assessmentName || 'AI-Driven Talent Mapping',
            retryCount
          });
        } catch (eventError) {
          logger.warn('Failed to publish analysis.failed event, using fallback HTTP callback', {
            jobId: jobData?.jobId,
            error: eventError.message
          });

          // Fallback HTTP callback to assessment-service to mark job failed and refund tokens
          notificationService.updateAssessmentJobStatusFailed(jobData?.jobId, null, error.message)
            .catch((fallbackErr) => {
              logger.error('Fallback HTTP callback to assessment-service failed', {
                jobId: jobData?.jobId,
                error: fallbackErr.message
              });
            });
        }
      } catch (notifyError) {
        logger.warn('Error while sending failure notifications before DLQ', {
          jobId: jobData?.jobId,
          error: notifyError.message
        });
      }

      // Reject message without requeue (goes to DLQ)
      channel.nack(message, false, false);
    }

  } catch (handlingError) {
    logger.error('Error handling message error', {
      jobId: jobData?.jobId,
      originalError: error.message,
      handlingError: handlingError.message
    });

    // Reject message without requeue as fallback
    channel.nack(message, false, false);
  }
};

/**
 * Stop consuming messages
 */
const stopConsuming = async () => {
  try {
    if (!isConsuming) {
      return;
    }
    
    // Cancel consumer
    if (channel) {
      await channel.cancel();
    }
    
    isConsuming = false;
    
    logger.info('Stopped consuming messages from queue');
  } catch (error) {
    logger.error('Error stopping queue consumer', { error: error.message });
    throw error;
  }
};

/**
 * Close queue consumer
 */
const close = async () => {
  try {
    await stopConsuming();
    await rabbitmq.close();
    
    logger.info('Queue consumer closed successfully');
  } catch (error) {
    logger.error('Error closing queue consumer', { error: error.message });
    throw error;
  }
};

/**
 * Check if consumer is healthy
 * @returns {boolean} - Consumer health status
 */
const isHealthy = () => {
  return isConsuming && rabbitmq.checkHealth();
};

module.exports = {
  initialize,
  startConsuming,
  stopConsuming,
  close,
  isHealthy
};
