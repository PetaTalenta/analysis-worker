/**
 * Optimized Archive Service Integration with Circuit Breaker and Connection Pooling
 */

const axios = require('axios');
const http = require('http');
const https = require('https');
const logger = require('../utils/logger');

// Circuit breaker state
let circuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: null,
  successCount: 0
};

// Configuration
const config = {
  // Archive service base URL - all routes use /archive prefix for consistency
  baseURL: process.env.ARCHIVE_SERVICE_URL || 'http://localhost:3002',
  serviceKey: process.env.INTERNAL_SERVICE_KEY || 'internal_service_secret_key_change_in_production',
  timeout: parseInt(process.env.ARCHIVE_TIMEOUT || '30000'),
  retryAttempts: parseInt(process.env.ARCHIVE_RETRY_ATTEMPTS || '3'),
  retryDelay: parseInt(process.env.ARCHIVE_RETRY_DELAY || '1000'),
  circuitBreakerThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
  circuitBreakerTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000'),
  batchSize: parseInt(process.env.ARCHIVE_BATCH_SIZE || '10'),
  batchInterval: parseInt(process.env.ARCHIVE_BATCH_INTERVAL || '5000')
};

// Create HTTP agents with connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: config.timeout,
  freeSocketTimeout: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: config.timeout,
  freeSocketTimeout: 30000
});

// Create optimized axios instance
const archiveClient = axios.create({
  baseURL: config.baseURL,
  timeout: config.timeout,
  httpAgent: httpAgent,
  httpsAgent: httpsAgent,
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-Service': 'true',
    'X-Service-Key': config.serviceKey,
    'Connection': 'keep-alive'
  }
});

// Batch processing queue
let batchQueue = [];
let batchTimer = null;

// Add request interceptor for logging
archiveClient.interceptors.request.use(
  (config) => {
    logger.debug('Archive service request', {
      method: config.method,
      url: config.url,
      headers: config.headers
    });
    return config;
  },
  (error) => {
    logger.error('Archive service request error', { error: error.message });
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
archiveClient.interceptors.response.use(
  (response) => {
    logger.debug('Archive service response', {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url
    });
    return response;
  },
  (error) => {
    logger.error('Archive service response error', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      error: error.message
    });
    return Promise.reject(error);
  }
);

/**
 * Circuit breaker functions
 */
const isCircuitBreakerOpen = () => {
  if (!circuitBreakerState.isOpen) return false;

  const timeSinceLastFailure = Date.now() - circuitBreakerState.lastFailureTime;
  if (timeSinceLastFailure > config.circuitBreakerTimeout) {
    // Reset circuit breaker after timeout
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failureCount = 0;
    circuitBreakerState.successCount = 0;
    logger.info('Circuit breaker reset after timeout');
    return false;
  }

  return true;
};

const recordSuccess = () => {
  circuitBreakerState.successCount++;
  if (circuitBreakerState.isOpen && circuitBreakerState.successCount >= 3) {
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failureCount = 0;
    logger.info('Circuit breaker closed after successful requests');
  }
};

const recordFailure = () => {
  circuitBreakerState.failureCount++;
  circuitBreakerState.lastFailureTime = Date.now();
  circuitBreakerState.successCount = 0;

  if (circuitBreakerState.failureCount >= config.circuitBreakerThreshold) {
    circuitBreakerState.isOpen = true;
    logger.warn('Circuit breaker opened due to failures', {
      failureCount: circuitBreakerState.failureCount,
      threshold: config.circuitBreakerThreshold
    });
  }
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error) => {
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return true;
  }
  if (error.response && error.response.status >= 500) {
    return true;
  }
  if (error.code === 'ECONNABORTED') {
    return true;
  }
  return false;
};

/**
 * Retry with exponential backoff
 */
const withRetry = async (operation, maxRetries = config.retryAttempts) => {
  if (isCircuitBreakerOpen()) {
    throw new Error('Circuit breaker is open - Archive service unavailable');
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure();

      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = config.retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`Archive service request failed, retrying in ${delay}ms`, {
        attempt,
        maxRetries,
        error: error.message
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Batch processing functions
 */
const processBatch = async () => {
  if (batchQueue.length === 0) return;

  const batch = batchQueue.splice(0, config.batchSize);

  try {
    logger.info('Processing batch of results', { batchSize: batch.length });

    const response = await withRetry(() =>
      archiveClient.post('/archive/results/batch', { results: batch })
    );

    logger.info('Batch processed successfully', {
      batchSize: batch.length,
      successful: response.data.data.successful,
      failed: response.data.data.failed
    });

    return response.data.data;
  } catch (error) {
    logger.error('Batch processing failed', {
      batchSize: batch.length,
      error: error.message
    });

    // Re-queue failed items for individual processing
    for (const item of batch) {
      try {
        await saveAnalysisResultDirect(
          item.user_id,
          item.test_data,
          item.test_result,
          item.jobId,
          item.assessment_name,
          item.raw_responses
        );
      } catch (individualError) {
        logger.error('Individual fallback processing failed', {
          userId: item.user_id,
          jobId: item.jobId,
          error: individualError.message
        });
      }
    }
  }
};

const addToBatch = (userId, testData, testResult, jobId, assessmentName, rawResponses = null) => {
  // CRITICAL: Validate test_result completeness before adding to batch
  if (!testResult || typeof testResult !== 'object') {
    const error = new Error('Cannot batch incomplete analysis result - test_result is null or invalid');
    error.code = 'INCOMPLETE_RESULT';
    error.jobId = jobId;
    error.userId = userId;
    throw error;
  }

  // Validate required fields in test_result
  const requiredFields = ['archetype', 'shortSummary'];
  const missingFields = requiredFields.filter(field => !testResult[field]);
  if (missingFields.length > 0) {
    const error = new Error(`Cannot batch incomplete analysis result - missing required fields: ${missingFields.join(', ')}`);
    error.code = 'INCOMPLETE_RESULT';
    error.jobId = jobId;
    error.userId = userId;
    error.missingFields = missingFields;
    throw error;
  }

  // Generate UUID immediately for proper tracking
  const { v4: uuidv4 } = require('uuid');
  const resultId = uuidv4();

  batchQueue.push({
    id: resultId, // Pre-generated UUID
    user_id: userId,
    test_data: testData, // Updated field name
    test_result: testResult, // Updated field name
    assessment_name: assessmentName,
    raw_responses: rawResponses,
    status: 'completed', // Only completed results should be batched
    jobId // For logging purposes
  });

  // Start batch timer if not already running
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      processBatch();
      batchTimer = null;
    }, config.batchInterval);
  }

  // Process immediately if batch is full
  if (batchQueue.length >= config.batchSize) {
    clearTimeout(batchTimer);
    batchTimer = null;
    processBatch();
  }

  // Return the generated UUID
  return resultId;
};

/**
 * Save analysis result to Archive Service (with batching)
 * @param {String} userId - User ID
 * @param {Object} testData - Test data (formerly assessmentData)
 * @param {Object} testResult - Test result (formerly personaProfile)
 * @param {String} jobId - Job ID for logging
 * @param {String} assessmentName - Assessment name
 * @param {Object} rawResponses - Raw responses data (optional)
 * @param {Boolean} forceDirect - Force direct save (skip batching)
 * @param {Boolean} allowOverwrite - Allow overwriting existing incomplete results
 * @returns {Promise<Object>} - Save result
 */
const saveAnalysisResult = async (userId, testData, testResult, jobId, assessmentName = 'AI-Driven Talent Mapping', rawResponses = null, forceDirect = false, allowOverwrite = false) => {
  // CRITICAL: Validate test_result is complete before saving
  if (!testResult || typeof testResult !== 'object') {
    const error = new Error('Cannot save incomplete analysis result - test_result is null or invalid');
    error.code = 'INCOMPLETE_RESULT';
    error.jobId = jobId;
    error.userId = userId;
    throw error;
  }

  // Validate required fields in test_result
  const requiredFields = ['archetype', 'shortSummary'];
  const missingFields = requiredFields.filter(field => !testResult[field]);
  if (missingFields.length > 0) {
    const error = new Error(`Cannot save incomplete analysis result - missing required fields: ${missingFields.join(', ')}`);
    error.code = 'INCOMPLETE_RESULT';
    error.jobId = jobId;
    error.userId = userId;
    error.missingFields = missingFields;
    throw error;
  }

  // Use batching for better performance unless forced direct
  if (!forceDirect && process.env.ENABLE_BATCH_PROCESSING !== 'false') {
    const resultId = addToBatch(userId, testData, testResult, jobId, assessmentName, rawResponses);

    // Return response with proper UUID for batched items
    return {
      success: true,
      id: resultId, // Use the pre-generated UUID
      status: testResult ? 'completed' : 'failed',
      created_at: new Date().toISOString(),
      batched: true
    };
  }

  // Direct processing
  return saveAnalysisResultDirect(userId, testData, testResult, jobId, assessmentName, rawResponses, allowOverwrite);
};

/**
 * Save analysis result directly (no batching)
 */
const saveAnalysisResultDirect = async (userId, testData, testResult, jobId, assessmentName = 'AI-Driven Talent Mapping', rawResponses = null, allowOverwrite = false) => {
  return withRetry(async () => {
    logger.info('Saving analysis result to Archive Service', {
      jobId,
      userId,
      profileArchetype: testResult?.archetype,
      allowOverwrite
    });

    // Prepare request body with new field names
    // Note: status, error_message, and assessment_name are now managed in analysis_jobs table only
    const requestBody = {
      user_id: userId,
      test_data: testData, // Updated field name
      test_result: testResult, // Updated field name
      raw_responses: rawResponses
    };

    // Add overwrite flag if needed
    if (allowOverwrite) {
      requestBody.allow_overwrite = true;
      logger.info('Allowing overwrite of existing incomplete results', { jobId, userId });
    }

    // Send request to Archive Service
    const response = await archiveClient.post('/archive/results', requestBody);

    logger.info('Analysis result saved successfully', {
      jobId,
      userId,
      resultId: response.data.data.id,
      status: response.status
    });

    return {
      success: true,
      id: response.data.data.id,
      status: response.data.data.status,
      created_at: response.data.data.created_at
    };
  });
};

/**
 * Update analysis result status
 * @param {String} resultId - Result ID
 * @param {String} status - New status
 * @param {String} jobId - Job ID for logging
 * @returns {Promise<Object>} - Update result
 */
const updateAnalysisResult = async (resultId, status, jobId) => {
  return withRetry(async () => {
    logger.info('Updating analysis result status', {
      jobId,
      resultId,
      status
    });

    // Prepare request body
    const requestBody = { status };

    // Send request to Archive Service
    const response = await archiveClient.put(`/archive/results/${resultId}`, requestBody);

    logger.info('Analysis result status updated successfully', {
      jobId,
      resultId,
      status: response.status
    });

    return {
      success: true,
      id: response.data.data.id,
      updated_at: response.data.data.updated_at
    };
  });
};

/**
 * Update analysis result test_result field (PHASE 2)
 * @param {String} resultId - Result ID
 * @param {Object} testResult - Test result data to update
 * @param {String} jobId - Job ID for logging
 * @returns {Promise<Object>} - Update result
 */
const updateAnalysisResultTestData = async (resultId, testResult, jobId) => {
  return withRetry(async () => {
    logger.info('Updating analysis result test_result', {
      jobId,
      resultId,
      hasTestResult: !!testResult
    });

    // Prepare request body with test_result and status
    const requestBody = {
      test_result: testResult,
      status: 'completed'
    };

    // Send request to Archive Service
    const response = await archiveClient.put(`/archive/results/${resultId}`, requestBody);

    logger.info('Analysis result test_result updated successfully', {
      jobId,
      resultId,
      status: response.status
    });

    return {
      success: true,
      id: response.data.data.id,
      updated_at: response.data.data.updated_at
    };
  });
};

/**
 * Save failed analysis result to Archive Service
 * @param {String} userId - User ID
 * @param {Object} testData - Test data (formerly assessmentData)
 * @param {String} errorMessage - Error message
 * @param {String} jobId - Job ID for logging
 * @param {String} assessmentName - Assessment name
 * @param {Object} rawResponses - Raw responses data (optional)
 * @returns {Promise<Object>} - Save result
 */
const saveFailedAnalysisResult = async (userId, testData, errorMessage, jobId, assessmentName = 'AI-Driven Talent Mapping', rawResponses = null) => {
  return withRetry(async () => {
    logger.info('Saving failed analysis result to Archive Service', {
      jobId,
      userId,
      errorMessage
    });

    // Prepare request body with empty test result and failed status
    const requestBody = {
      user_id: userId,
      test_data: testData, // Updated field name
      test_result: null, // Empty result for failed analysis
      assessment_name: assessmentName,
      raw_responses: rawResponses,
      status: 'failed',
      error_message: errorMessage
    };

    // Send request to Archive Service
    const response = await archiveClient.post('/archive/results', requestBody);

    logger.info('Failed analysis result saved successfully', {
      jobId,
      userId,
      resultId: response.data.data.id,
      status: response.status
    });

    return {
      success: true,
      id: response.data.data.id,
      status: response.data.data.status,
      created_at: response.data.data.created_at
    };
  });
};

/**
 * Check Archive Service health
 * @returns {Promise<boolean>} - Health status
 */
const checkHealth = async () => {
  try {
    const response = await archiveClient.get('/health', {
      timeout: 5000 // 5 seconds for health check
    });

    recordSuccess();
    return response.status === 200;
  } catch (error) {
    recordFailure();
    logger.error('Archive Service health check failed', { error: error.message });
    return false;
  }
};

/**
 * Update analysis job status in Archive Service
 * @param {String} jobId - Job ID
 * @param {String} status - New status
 * @param {Object} additionalData - Additional data to update
 * @returns {Promise<Object>} - Updated job data
 * @throws {Error} - Throws error for critical status updates (completed/failed)
 */
const updateAnalysisJobStatus = async (jobId, status, additionalData = {}) => {
  const isCriticalStatus = ['completed', 'failed'].includes(status);
  
  try {
    return await withRetry(async () => {
      logger.info('Updating analysis job status', { jobId, status });

      const requestBody = { status, ...additionalData };
      // Send request to Archive Service
      const response = await archiveClient.put(`/archive/jobs/${jobId}/status`, requestBody);

      logger.info('Analysis job status updated successfully', { jobId, status });
      return response.data.data;
    });
  } catch (error) {
    logger.error('Failed to update analysis job status', {
      jobId,
      status,
      error: error.message,
      responseStatus: error.response?.status,
      statusText: error.response?.statusText,
      isCriticalStatus
    });
    
    // For critical status updates (completed/failed), throw error to prevent silent failures
    if (isCriticalStatus) {
      const errorMsg = `Critical error: Failed to update job ${jobId} status to ${status}. This job may remain stuck in processing state.`;
      logger.error(errorMsg, { jobId, status, originalError: error.message });
      throw new Error(errorMsg);
    }
    
    // For non-critical updates (processing, heartbeats), allow processing to continue
    return null;
  }
};

/**
 * Force process current batch (for graceful shutdown)
 */
const flushBatch = async () => {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  if (batchQueue.length > 0) {
    logger.info('Flushing remaining batch items', { count: batchQueue.length });
    await processBatch();
  }
};

/**
 * Get circuit breaker status
 */
const getCircuitBreakerStatus = () => {
  return {
    isOpen: circuitBreakerState.isOpen,
    failureCount: circuitBreakerState.failureCount,
    successCount: circuitBreakerState.successCount,
    lastFailureTime: circuitBreakerState.lastFailureTime
  };
};

module.exports = {
  saveAnalysisResult,
  saveAnalysisResultDirect,
  saveFailedAnalysisResult,
  updateAnalysisResult,
  updateAnalysisResultTestData,
  checkHealth,
  updateAnalysisJobStatus,
  flushBatch,
  getCircuitBreakerStatus,
  // Expose config for testing
  config
};
