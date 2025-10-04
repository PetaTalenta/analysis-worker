/**
 * Optimized Assessment Processor with Deduplication, Rate Limiting, and Audit Logging
 */

const { saveAnalysisResult, saveFailedAnalysisResult, updateAnalysisJobStatus, updateAnalysisResult, updateAnalysisResultTestData, checkHealth } = require('../services/archiveService');
const { jobDeduplicationService, tokenRefundService } = require('../services/jobDeduplicationService');
const { auditLogger, AUDIT_EVENTS, RISK_LEVELS } = require('../services/auditLogger');
const notificationService = require('../services/notificationService'); // Keep for backward compatibility
const { getEventPublisher } = require('../services/eventPublisher');
const jobHeartbeat = require('../services/jobHeartbeat');
const logger = require('../utils/logger');
const { withRetry, withTimeout, ERROR_TYPES, createError } = require('../utils/errorHandler');

// Import the new dynamic assessment analyzer
const assessmentAnalyzer = require('../analyzers/assessmentAnalyzer');

// Rate limiting configuration
const RATE_LIMITS = {
  PER_USER_PER_HOUR: parseInt(process.env.RATE_LIMIT_USER_HOUR || '5'),
  PER_IP_PER_HOUR: parseInt(process.env.RATE_LIMIT_IP_HOUR || '20'),
  GLOBAL_PER_MINUTE: parseInt(process.env.RATE_LIMIT_GLOBAL_MINUTE || '100')
};

// Rate limiting storage (in production, use Redis)
const rateLimitStore = {
  userLimits: new Map(),
  ipLimits: new Map(),
  globalCount: 0,
  lastGlobalReset: Date.now()
};

/**
 * Check rate limits for job processing
 * @param {String} userId - User ID
 * @param {String} userIP - User IP address
 * @returns {Object} - Rate limit check result
 */
const checkRateLimits = (userId, userIP) => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;

  // Reset global counter every minute
  if (now - rateLimitStore.lastGlobalReset > minuteMs) {
    rateLimitStore.globalCount = 0;
    rateLimitStore.lastGlobalReset = now;
  }

  // Check global rate limit
  if (rateLimitStore.globalCount >= RATE_LIMITS.GLOBAL_PER_MINUTE) {
    auditLogger.logSecurityEvent(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED, {
      limitType: 'GLOBAL_PER_MINUTE',
      currentCount: rateLimitStore.globalCount,
      limit: RATE_LIMITS.GLOBAL_PER_MINUTE
    }, RISK_LEVELS.HIGH);

    return {
      allowed: false,
      reason: 'GLOBAL_RATE_LIMIT_EXCEEDED',
      retryAfter: minuteMs - (now - rateLimitStore.lastGlobalReset)
    };
  }

  // Check user rate limit
  const userKey = `user_${userId}`;
  const userLimit = rateLimitStore.userLimits.get(userKey);
  
  if (userLimit) {
    if (now - userLimit.resetTime > hourMs) {
      // Reset user limit
      rateLimitStore.userLimits.set(userKey, { count: 0, resetTime: now });
    } else if (userLimit.count >= RATE_LIMITS.PER_USER_PER_HOUR) {
      auditLogger.logSecurityEvent(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED, {
        limitType: 'PER_USER_PER_HOUR',
        userId,
        currentCount: userLimit.count,
        limit: RATE_LIMITS.PER_USER_PER_HOUR
      }, RISK_LEVELS.MEDIUM);

      return {
        allowed: false,
        reason: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: hourMs - (now - userLimit.resetTime)
      };
    }
  } else {
    rateLimitStore.userLimits.set(userKey, { count: 0, resetTime: now });
  }

  // Check IP rate limit
  if (userIP) {
    const ipKey = `ip_${userIP}`;
    const ipLimit = rateLimitStore.ipLimits.get(ipKey);
    
    if (ipLimit) {
      if (now - ipLimit.resetTime > hourMs) {
        rateLimitStore.ipLimits.set(ipKey, { count: 0, resetTime: now });
      } else if (ipLimit.count >= RATE_LIMITS.PER_IP_PER_HOUR) {
        auditLogger.logSecurityEvent(AUDIT_EVENTS.RATE_LIMIT_EXCEEDED, {
          limitType: 'PER_IP_PER_HOUR',
          userIP,
          currentCount: ipLimit.count,
          limit: RATE_LIMITS.PER_IP_PER_HOUR
        }, RISK_LEVELS.MEDIUM);

        return {
          allowed: false,
          reason: 'IP_RATE_LIMIT_EXCEEDED',
          retryAfter: hourMs - (now - ipLimit.resetTime)
        };
      }
    } else {
      rateLimitStore.ipLimits.set(ipKey, { count: 0, resetTime: now });
    }
  }

  return { allowed: true };
};

/**
 * Increment rate limit counters
 * @param {String} userId - User ID
 * @param {String} userIP - User IP address
 */
const incrementRateLimits = (userId, userIP) => {
  // Increment global counter
  rateLimitStore.globalCount++;

  // Increment user counter
  const userKey = `user_${userId}`;
  const userLimit = rateLimitStore.userLimits.get(userKey);
  if (userLimit) {
    userLimit.count++;
  }

  // Increment IP counter
  if (userIP) {
    const ipKey = `ip_${userIP}`;
    const ipLimit = rateLimitStore.ipLimits.get(ipKey);
    if (ipLimit) {
      ipLimit.count++;
    }
  }
};

/**
 * Process assessment job with optimizations
 * @param {Object} jobData - Job data from queue
 * @returns {Promise<Object>} - Processing result
 */
const processAssessmentOptimized = async (jobData) => {
  // Support both legacy and new format
  const {
    jobId,
    userId,
    userEmail,
    assessment_data,
    assessment_name = 'AI-Driven Talent Mapping',
    raw_responses,
    resultId,  // PHASE 2: Extract resultId from queue message
    userIP,
    // Legacy format support
    assessmentData,
    assessmentName
  } = jobData;

  // Use new format if available, fallback to legacy
  const finalAssessmentData = assessment_data || assessmentData;
  const finalAssessmentName = assessment_name || assessmentName || 'AI-Driven Talent Mapping';
  const processingTimeout = parseInt(process.env.PROCESSING_TIMEOUT || '1800000'); // 30 minutes
  const startTime = Date.now();
  let deduplicationResult = null; // Declare outside try block

  try {
    // Audit: Job received
    auditLogger.logJobEvent(AUDIT_EVENTS.JOB_RECEIVED, jobData);

    logger.info('Starting optimized assessment processing', {
      jobId,
      userEmail,
      userId
    });

    // Start heartbeat for long-running job
    jobHeartbeat.startHeartbeat(jobId, userId, 'processing');

    // Step 1: Rate limiting check
    const rateLimitResult = checkRateLimits(userId, userIP);
    if (!rateLimitResult.allowed) {
      const error = createError(ERROR_TYPES.RATE_LIMIT_ERROR, `Rate limit exceeded: ${rateLimitResult.reason}`);
      error.retryAfter = rateLimitResult.retryAfter;

      auditLogger.logJobEvent(AUDIT_EVENTS.JOB_FAILED, jobData, {
        reason: 'RATE_LIMIT_EXCEEDED',
        rateLimitReason: rateLimitResult.reason
      });

      throw error;
    }

    // Step 2: Job deduplication check (now async)
    deduplicationResult = await jobDeduplicationService.checkDuplicate(jobId, userId, finalAssessmentData);
    
    if (deduplicationResult.isDuplicate) {
      auditLogger.logJobEvent(AUDIT_EVENTS.JOB_DUPLICATE_DETECTED, jobData, {
        reason: deduplicationResult.reason,
        originalJobId: deduplicationResult.originalJobId
      });

      // Handle duplicate job
      if (deduplicationResult.reason === 'RECENTLY_PROCESSED' && deduplicationResult.originalResultId) {
        // CRITICAL FIX: Update job status to completed and publish events for duplicate job
        logger.info('Duplicate job detected - using cached result', {
          jobId,
          originalJobId: deduplicationResult.originalJobId,
          originalResultId: deduplicationResult.originalResultId
        });

        try {
          // Update job status to completed
          await updateAnalysisJobStatus(jobId, 'completed', {
            result_id: deduplicationResult.originalResultId,
            message: 'Duplicate job - used cached result from previous analysis'
          });

          logger.info('Duplicate job status updated to completed', {
            jobId,
            originalJobId: deduplicationResult.originalJobId,
            resultId: deduplicationResult.originalResultId
          });

          // Publish analysis completed event
          try {
            const eventPublisher = getEventPublisher();
            await eventPublisher.publishAnalysisCompleted({
              jobId,
              userId,
              userEmail: jobData.userEmail,
              resultId: deduplicationResult.originalResultId,
              assessmentName: finalAssessmentName,
              processingTime: 0, // No actual processing
              isDuplicate: true,
              originalJobId: deduplicationResult.originalJobId
            });

            logger.info('Duplicate job completed event published', {
              jobId,
              resultId: deduplicationResult.originalResultId
            });
          } catch (eventError) {
            logger.warn('Failed to publish duplicate job completed event, using fallback', {
              jobId,
              error: eventError.message
            });

            // Fallback to direct HTTP notification
            notificationService.sendAnalysisCompleteNotification(
              userId, 
              jobId, 
              deduplicationResult.originalResultId, 
              'completed'
            ).catch(fallbackError => {
              logger.error('Fallback notification for duplicate job also failed', {
                jobId,
                error: fallbackError.message
              });
            });
          }

          // Audit: Job completed (duplicate)
          auditLogger.logJobEvent(AUDIT_EVENTS.JOB_COMPLETED, jobData, {
            resultId: deduplicationResult.originalResultId,
            processingTime: 0,
            isDuplicate: true,
            originalJobId: deduplicationResult.originalJobId
          });

        } catch (statusError) {
          logger.error('CRITICAL: Failed to update duplicate job status to completed', {
            jobId,
            originalJobId: deduplicationResult.originalJobId,
            resultId: deduplicationResult.originalResultId,
            error: statusError.message
          });

          // Even if status update fails, return the result
          // The stuck job monitor will eventually catch and fix this
        }

        return {
          success: true,
          id: deduplicationResult.originalResultId,
          isDuplicate: true,
          originalJobId: deduplicationResult.originalJobId
        };
      } else {
        // Job is currently processing, reject
        const error = createError(ERROR_TYPES.DUPLICATE_JOB_ERROR, 
          `Duplicate job detected: ${deduplicationResult.reason}`);
        error.originalJobId = deduplicationResult.originalJobId;
        throw error;
      }
    }

    // Step 3: Mark job as processing and increment rate limits
    jobDeduplicationService.markAsProcessing(jobId, deduplicationResult.jobHash, userId);
    incrementRateLimits(userId, userIP);

    // Audit: Job started
    auditLogger.logJobEvent(AUDIT_EVENTS.JOB_STARTED, jobData, {
      jobHash: deduplicationResult.jobHash
    });

    // Step 4: Update job status to processing (with error handling)
    try {
      await updateAnalysisJobStatus(jobId, 'processing');
    } catch (statusError) {
      logger.error('Failed to update job status to processing', {
        jobId,
        userId,
        error: statusError.message
      });
      // Continue processing even if status update fails for non-critical status
    }

    // PHASE 2: Update result status to processing if resultId exists
    if (resultId) {
      try {
        await updateAnalysisResult(resultId, 'processing', jobId);
        logger.info('Analysis result status updated to processing', {
          jobId,
          userId,
          resultId
        });
      } catch (resultStatusError) {
        logger.error('Failed to update result status to processing', {
          jobId,
          userId,
          resultId,
          error: resultStatusError.message
        });
        // Continue processing even if result status update fails
      }
    }

    // Step 4.1: Publish analysis started event (async, non-blocking) - Week 2 Enhanced
    try {
      const eventPublisher = getEventPublisher();
      eventPublisher.publishAnalysisStarted({
        jobId,
        userId,
        userEmail,
        resultId, // Week 2: Include resultId for enhanced notifications
        assessmentName: finalAssessmentName,
        estimatedProcessingTime: '1-3 minutes'
      }).catch(eventError => {
        logger.warn('Failed to publish analysis started event', {
          jobId,
          userId,
          resultId,
          error: eventError.message
        });
      });
    } catch (error) {
      logger.warn('Failed to get event publisher for started event, skipping', {
        jobId,
        userId,
        resultId,
        error: error.message
      });
    }

    // Step 5: Process with timeout using dynamic assessment analyzer
    const result = await withTimeout(async () => {
      // Use dynamic assessment analyzer instead of direct AI service call
      const analysisResult = await withRetry(
        () => assessmentAnalyzer.analyzeAssessment(finalAssessmentName, finalAssessmentData, jobId, raw_responses),
        {
          operationName: 'Dynamic assessment analysis',
          shouldRetry: (error) => {
            // Retry network errors and AI service errors (guard against undefined error)
            const code = error?.code;
            return code === ERROR_TYPES.AI_SERVICE_ERROR.code ||
                   code === ERROR_TYPES.PROCESSING_ERROR.code ||
                   code === 'ECONNREFUSED' ||
                   code === 'ENOTFOUND' ||
                   code === 'ETIMEDOUT';
          }
        }
      );

      // Extract persona profile from analysis result
      // Handle both successful analysis and error responses
      let personaProfile;
      if (analysisResult.success && analysisResult.result) {
        personaProfile = analysisResult.result;

        logger.info('Assessment analysis completed successfully', {
          jobId,
          userId,
          assessmentType: analysisResult.analysisType,
          analyzer: analysisResult.analyzer,
          profileArchetype: personaProfile.archetype
        });

        // Audit: AI operation completed
        auditLogger.logAIEvent(AUDIT_EVENTS.AI_RESPONSE_RECEIVED, jobId, {
          archetype: personaProfile.archetype,
          assessmentType: analysisResult.analysisType,
          analyzer: analysisResult.analyzer,
          processingTime: Date.now() - startTime
        });
      } else {
        // Handle analysis failure or unsupported assessment type
        const errorMessage = analysisResult.error?.message || 'Assessment analysis failed';

        logger.error('Assessment analysis failed', {
          jobId,
          userId,
          assessmentName: finalAssessmentName,
          error: errorMessage,
          analysisResult
        });

        // Create error for unsupported assessment types
        throw createError(
          ERROR_TYPES.PROCESSING_ERROR,
          `Assessment analysis failed: ${errorMessage}`
        );
      }

      // PHASE 2: Save or update result based on whether resultId exists
      let saveResult;

      if (resultId) {
        // Update existing result with test_result data
        await withRetry(
          () => updateAnalysisResultTestData(resultId, personaProfile, jobId),
          {
            operationName: 'Archive service update test_result',
            shouldRetry: (error) => error.isRetryable
          }
        );

        saveResult = { id: resultId };

        logger.info('Analysis result test_result updated in Archive Service', {
          jobId,
          userId,
          resultId
        });
      } else {
        // Legacy path: Create new result (for backward compatibility)
        const allowOverwrite = deduplicationResult.allowOverwrite || false;

        saveResult = await withRetry(
          () => saveAnalysisResult(userId, finalAssessmentData, personaProfile, jobId, finalAssessmentName, raw_responses, false, allowOverwrite),
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
      }

      // Audit: Data saved
      auditLogger.logDataAccess('SAVE', userId, 'ANALYSIS_RESULT', {
        jobId,
        resultId: saveResult.id
      });

      // Mark job as completed in deduplication service
      jobDeduplicationService.markAsCompleted(jobId, deduplicationResult.jobHash, saveResult.id, userId);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Publish analysis completed event (async, non-blocking)
      try {
        const eventPublisher = getEventPublisher();

        eventPublisher.publishAnalysisCompleted({
          jobId,
          userId,
          userEmail,
          resultId: saveResult.id,
          assessmentName: finalAssessmentName,
          processingTime
        }).catch(eventError => {
          logger.warn('Failed to publish analysis completed event', {
            jobId,
            userId,
            error: eventError.message
          });

          // Fallback to direct HTTP calls for backward compatibility
          notificationService.sendAnalysisCompleteNotification(userId, jobId, saveResult.id, 'completed')
            .catch(fallbackError => {
              logger.error('Both event publishing and fallback notification failed', {
                jobId,
                userId,
                eventError: eventError.message,
                fallbackError: fallbackError.message
              });
            });
        });
      } catch (error) {
        logger.warn('Failed to get event publisher, using fallback notification', {
          jobId,
          userId,
          error: error.message
        });

        // Fallback to direct HTTP calls
        notificationService.sendAnalysisCompleteNotification(userId, jobId, saveResult.id, 'completed')
          .catch(fallbackError => {
            logger.error('Fallback notification also failed', {
              jobId,
              userId,
              error: fallbackError.message
            });
          });
      }

      // Audit: Job completed
      auditLogger.logJobEvent(AUDIT_EVENTS.JOB_COMPLETED, jobData, {
        resultId: saveResult.id,
        processingTime,
        jobHash: deduplicationResult.jobHash
      });

      // CRITICAL FIX: Update job status to completed ONLY after all operations succeed
      // This prevents race conditions where job is marked completed but then fails
      let statusUpdateSuccess = false;
      let statusUpdateRetries = 0;
      const maxStatusRetries = 3;
      
      while (!statusUpdateSuccess && statusUpdateRetries < maxStatusRetries) {
        try {
          statusUpdateRetries++;
          await updateAnalysisJobStatus(jobId, 'completed', {
            result_id: saveResult.id
          });

          logger.info('Job status successfully updated to completed', {
            jobId,
            userId,
            resultId: saveResult.id,
            retry: statusUpdateRetries
          });
          statusUpdateSuccess = true;
        } catch (statusError) {
          logger.error(`CRITICAL: Failed to update job status to completed (attempt ${statusUpdateRetries}/${maxStatusRetries})`, {
            jobId,
            userId,
            resultId: saveResult.id,
            error: statusError.message,
            retry: statusUpdateRetries
          });

          if (statusUpdateRetries >= maxStatusRetries) {
            // Final attempt failed, log critical error but don't fail the entire operation
            logger.error('CRITICAL: All attempts to update job status failed - job will remain stuck', {
              jobId,
              userId,
              resultId: saveResult.id,
              error: statusError.message,
              totalRetries: statusUpdateRetries
            });

            // Send alert to monitoring system
            auditLogger.logJobEvent(AUDIT_EVENTS.CRITICAL_ERROR, jobData, {
              error: 'Status update failed after all retries',
              resultId: saveResult.id,
              statusError: statusError.message
            });
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * statusUpdateRetries));
          }
        }
      }

      // Stop heartbeat on successful completion
      jobHeartbeat.stopHeartbeat(jobId, 'completed');

      return {
        success: true,
        id: saveResult.id,
        status: saveResult.status,
        created_at: saveResult.created_at,
        processingTime
      };

    }, processingTimeout, 'Assessment processing');

    return result;

  } catch (error) {
    const errorProcessingTime = Date.now() - startTime;

    // Log with special attention for AI timeout errors
    if (error?.code === 'AI_TIMEOUT') {
      logger.error('🚨 AI MODEL TIMEOUT - Job failed due to AI request timeout', {
        jobId,
        userId,
        userEmail: jobData.userEmail,
        error: error.message,
        errorCode: error.code,
        processingTime: `${errorProcessingTime}ms`,
        aiTimeout: process.env.AI_REQUEST_TIMEOUT || '300000ms',
        assessmentName: finalAssessmentName
      });
    } else {
      logger.error('Failed to process assessment job (optimized)', {
        jobId,
        userId,
        error: error.message,
        errorCode: error?.code,
        processingTime: `${errorProcessingTime}ms`
      });
    }

    // Mark job as failed in deduplication service
    if (deduplicationResult && deduplicationResult.jobHash) {
      jobDeduplicationService.markAsFailed(jobId, deduplicationResult.jobHash, userId);
    }

    // Handle token refund for certain error types
    if (error?.code === ERROR_TYPES.DUPLICATE_JOB_ERROR.code ||
        error?.code === ERROR_TYPES.RATE_LIMIT_ERROR.code ||
        error?.code === 'AI_TIMEOUT') {  // ✅ TAMBAH AI_TIMEOUT untuk refund
      
      // Queue token refund if tokens were consumed
      if (error.tokenData) {
        tokenRefundService.queueRefund(jobId, userId, error.tokenData, error.code);
      }
    }

    // Audit: Job failed
    auditLogger.logJobEvent(AUDIT_EVENTS.JOB_FAILED, jobData, {
      error: error?.message,
      errorCode: error?.code,
      processingTime: errorProcessingTime,
      jobHash: deduplicationResult?.jobHash
    });

    // PHASE 2: Handle failed result - update existing result if resultId exists
    if (error?.code === ERROR_TYPES.RATE_LIMIT_ERROR.code || error?.code === 'AI_TIMEOUT') {
      try {
        let failedResultId;

        if (resultId) {
          // Update existing result to failed status
          await updateAnalysisResult(resultId, 'failed', jobId);
          failedResultId = resultId;

          logger.info('Analysis result status updated to failed', {
            jobId,
            userId,
            resultId
          });
        } else {
          // Legacy path: Create new failed result
          const failedResult = await saveFailedAnalysisResult(
            userId,
            finalAssessmentData,
            error.message,
            jobId,
            finalAssessmentName,
            raw_responses
          );
          failedResultId = failedResult.id;
        }

        // Update job status linking the failed result
        try {
          await updateAnalysisJobStatus(jobId, 'failed', {
            error_message: error.message,
            result_id: failedResultId
          });
        } catch (statusError) {
          logger.error('Failed to update job status to failed with result', {
            jobId,
            resultId: failedResultId,
            statusError: statusError.message
          });
        }
      } catch (failedSaveErr) {
        logger.error('Failed to persist failed analysis result for rate limit error', {
          jobId,
          userId,
            error: failedSaveErr.message
        });
        // Fallback: at least mark job failed without result linkage
        try {
          await updateAnalysisJobStatus(jobId, 'failed', {
            error_message: error.message
          });
        } catch (statusError) {
          logger.error('Failed to update job status to failed (fallback)', {
            jobId,
            statusError: statusError.message
          });
        }
      }
    } else {
      // Generic failure path (no dedicated failed result creation here)
      try {
        await updateAnalysisJobStatus(jobId, 'failed', {
          error_message: error?.message
        });
      } catch (statusError) {
        logger.error('Failed to update job status to failed', {
          jobId,
          statusError: statusError.message
        });
      }
    }

    // Publish analysis failed event (async, non-blocking)
    try {
      const eventPublisher = getEventPublisher();

      eventPublisher.publishAnalysisFailed({
        jobId,
        userId,
        userEmail: jobData.userEmail,
        errorMessage: error.message,
        assessmentName: finalAssessmentName,
        processingTime: errorProcessingTime,
        errorType: error?.code || 'unknown'
      }).catch(eventError => {
        logger.warn('Failed to publish analysis failed event', {
          jobId,
          userId,
          error: eventError.message
        });

        // Fallback to direct HTTP calls for backward compatibility
        notificationService.sendAnalysisFailureNotification(userId, jobId, error.message)
          .catch(fallbackError => {
            logger.error('Both event publishing and fallback failure notification failed', {
              jobId,
              userId,
              eventError: eventError.message,
              fallbackError: fallbackError.message
            });
          });
      });
    } catch (publishError) {
      logger.warn('Failed to get event publisher for failure event, using fallback notification', {
        jobId,
        userId,
        error: publishError.message
      });

      // Fallback to direct HTTP calls
      notificationService.sendAnalysisFailureNotification(userId, jobId, error.message)
        .catch(fallbackError => {
          logger.error('Fallback failure notification also failed', {
            jobId,
            userId,
            error: fallbackError.message
          });
        });
    }

    // Stop heartbeat on failure
    jobHeartbeat.stopHeartbeat(jobId, 'failed');

    throw error;
  }
};

module.exports = {
  processAssessmentOptimized,
  checkRateLimits,
  RATE_LIMITS
};
