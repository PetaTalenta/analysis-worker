/**
 * Assessment Processor
 * 
 * Processes assessment data using AI and saves results to Archive Service
 */

const aiService = require('../services/aiService');
const archiveService = require('../services/archiveService');
const notificationService = require('../services/notificationService'); // Keep for backward compatibility
const { getEventPublisher } = require('../services/eventPublisher');
const logger = require('../utils/logger');
const { withRetry, withTimeout, ERROR_TYPES, createError } = require('../utils/errorHandler');

/**
 * Process assessment job
 * @param {Object} jobData - Job data from queue
 * @returns {Promise<Object>} - Processing result
 */
const processAssessment = async (jobData) => {
  const { jobId, userId, userEmail, assessmentData, assessmentName = 'AI-Driven Talent Mapping' } = jobData;
  const processingTimeout = parseInt(process.env.PROCESSING_TIMEOUT || '300000'); // 5 minutes
  const startTime = Date.now(); // Track processing time for events

  try {
    logger.info('Starting assessment processing', {
      jobId,
      userEmail
    });

    // Step 1: Update job status to processing (job already exists from Assessment Service)
    await archiveService.updateAnalysisJobStatus(jobId, 'processing');

    // Process with timeout
    return await withTimeout(async () => {
      // Step 2: Generate persona profile using AI
      const personaProfile = await withRetry(
        () => aiService.generatePersonaProfile(assessmentData, jobId),
        {
          operationName: 'AI persona generation',
          shouldRetry: (error) => {
            // Retry network errors and AI service errors (guard against undefined error)
            const code = error?.code;
            return code === ERROR_TYPES.AI_SERVICE_ERROR.code ||
                   code === 'ECONNREFUSED' ||
                   code === 'ENOTFOUND' ||
                   code === 'ETIMEDOUT';
          }
        }
      );
      
      logger.info('Persona profile generated successfully', {
        jobId,
        userId,
        profileCount: personaProfile.length
      });
      
      // Step 3: Save result to Archive Service
      const saveResult = await withRetry(
        () => archiveService.saveAnalysisResult(userId, assessmentData, personaProfile, jobId, assessmentName),
        {
          operationName: 'Archive service save',
          shouldRetry: (error) => error.isRetryable
        }
      );
      
      logger.info('Analysis result saved to Archive Service', {
        jobId,
        userId,
        resultId: saveResult.id
      });

      // Step 4: Update job status to completed with result_id
      await archiveService.updateAnalysisJobStatus(jobId, 'completed', {
        result_id: saveResult.id
      });

      // Step 4: Publish analysis completed event (replaces direct HTTP calls)
      try {
        const eventPublisher = getEventPublisher();
        const processingTime = Date.now() - startTime;

        await eventPublisher.publishAnalysisCompleted({
          jobId,
          userId,
          userEmail,
          resultId: saveResult.id,
          assessmentName,
          processingTime
        });

        logger.info('Analysis completed event published', {
          jobId,
          userId,
          resultId: saveResult.id,
          processingTime
        });
      } catch (eventError) {
        // Log but don't fail the process for event publishing errors
        logger.warn('Failed to publish analysis completed event', {
          jobId,
          userId,
          resultId: saveResult.id,
          error: eventError.message
        });

        // Fallback to direct HTTP calls for backward compatibility
        try {
          await notificationService.updateAssessmentJobStatus(jobId, saveResult.id, 'completed');
          await notificationService.sendAnalysisCompleteNotification(userId, jobId, saveResult.id, 'completed');
          logger.info('Fallback notifications sent successfully');
        } catch (fallbackError) {
          logger.error('Both event publishing and fallback notifications failed', {
            jobId,
            userId,
            eventError: eventError.message,
            fallbackError: fallbackError.message
          });
        }
      }
      
      return {
        success: true,
        id: saveResult.id,
        status: 'completed',
        userId,
        jobId
      };
    }, processingTimeout, 'assessment processing');
    
  } catch (error) {
    logger.error('Assessment processing failed', {
      jobId,
      userId,
      error: error.message,
      stack: error.stack
    });

    // Save failed result to archive with empty persona profile
    let failedResultId = null;
    try {
      const failedResult = await archiveService.saveFailedAnalysisResult(
        userId,
        assessmentData,
        error.message,
        jobId,
        assessmentName
      );
      failedResultId = failedResult.id;

      logger.info('Failed analysis result saved to Archive Service', {
        jobId,
        userId,
        resultId: failedResultId
      });
    } catch (archiveError) {
      logger.warn('Failed to save failed analysis result to Archive Service', {
        jobId,
        userId,
        error: archiveError.message
      });
    }

    // Update job status to failed in database
    await archiveService.updateAnalysisJobStatus(jobId, 'failed', {
      result_id: failedResultId,
      error_message: error.message
    });

    // Publish analysis failed event (replaces direct HTTP calls)
    try {
      const eventPublisher = getEventPublisher();

      await eventPublisher.publishAnalysisFailed({
        jobId,
        userId,
        userEmail,
        errorMessage: error.message,
        assessmentName,
        errorType: error?.code || 'unknown'
      });

      logger.info('Analysis failed event published', {
        jobId,
        userId,
        errorMessage: error.message
      });
    } catch (eventError) {
      // Log but don't fail the process for event publishing errors
      logger.warn('Failed to publish analysis failed event', {
        jobId,
        userId,
        error: eventError.message
      });

      // Fallback to direct HTTP calls for backward compatibility
      try {
        await notificationService.updateAssessmentJobStatusFailed(jobId, failedResultId, error.message);
        await notificationService.sendAnalysisFailureNotification(userId, jobId, error.message);
        logger.info('Fallback failure notifications sent successfully');
      } catch (fallbackError) {
        logger.error('Both event publishing and fallback failure notifications failed', {
          jobId,
          userId,
          eventError: eventError.message,
          fallbackError: fallbackError.message
        });
      }
    }

    // Determine if error is retryable for queue retry mechanism
    // AI service errors should not be retried to avoid consuming more tokens
    const isRetryable = error?.code === ERROR_TYPES.ARCHIVE_SERVICE_ERROR.code ||
                        error?.code === ERROR_TYPES.TIMEOUT_ERROR.code ||
                        (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT');

    // Don't retry AI service errors to prevent token consumption
    const shouldNotRetry = error?.code === ERROR_TYPES.AI_SERVICE_ERROR.code ||
                           error?.message?.includes('AI service') ||
                           error?.message?.includes('persona profile');

    throw createError(
      (isRetryable && !shouldNotRetry) ? ERROR_TYPES.INTERNAL_ERROR : ERROR_TYPES.VALIDATION_ERROR,
      `Assessment processing failed: ${error.message}`,
      error
    );
  }
};

module.exports = {
  processAssessment
};
