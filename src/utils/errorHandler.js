/**
 * Error handling utilities
 */

const logger = require('./logger');

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  /**
   * Create a new AppError
   * @param {String} code - Error code
   * @param {String} message - Error message
   * @param {boolean} isRetryable - Whether error is retryable
   */
  constructor(code, message, isRetryable = false) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.isRetryable = isRetryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error types
 */
const ERROR_TYPES = {
  // Queue errors
  QUEUE_CONNECTION_ERROR: {
    code: 'QUEUE_CONNECTION_ERROR',
    message: 'Failed to connect to message queue',
    isRetryable: true
  },
  QUEUE_PUBLISH_ERROR: {
    code: 'QUEUE_PUBLISH_ERROR',
    message: 'Failed to publish message to queue',
    isRetryable: true
  },
  QUEUE_CONSUME_ERROR: {
    code: 'QUEUE_CONSUME_ERROR',
    message: 'Failed to consume message from queue',
    isRetryable: true
  },
  
  // AI service errors
  AI_SERVICE_ERROR: {
    code: 'AI_SERVICE_ERROR',
    message: 'Error calling AI service',
    isRetryable: true
  },
  AI_TIMEOUT: {
    code: 'AI_TIMEOUT',
    message: 'AI service request timed out',
    isRetryable: true
  },
  AI_RESPONSE_PARSE_ERROR: {
    code: 'AI_RESPONSE_PARSE_ERROR',
    message: 'Failed to parse AI service response',
    isRetryable: false
  },
  
  // Archive service errors
  ARCHIVE_SERVICE_ERROR: {
    code: 'ARCHIVE_SERVICE_ERROR',
    message: 'Error calling Archive service',
    isRetryable: true
  },
  
  // Notification service errors
  NOTIFICATION_SERVICE_ERROR: {
    code: 'NOTIFICATION_SERVICE_ERROR',
    message: 'Error calling Notification service',
    isRetryable: true
  },

  // Job and rate limit errors
  DUPLICATE_JOB_ERROR: {
    code: 'DUPLICATE_JOB_ERROR',
    message: 'Duplicate job detected',
    isRetryable: false
  },
  RATE_LIMIT_ERROR: {
    code: 'RATE_LIMIT_ERROR',
    message: 'Rate limit exceeded',
    isRetryable: true
  },

  // Validation errors
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Validation error',
    isRetryable: false
  },

  // General errors
  TIMEOUT_ERROR: {
    code: 'TIMEOUT_ERROR',
    message: 'Operation timed out',
    isRetryable: true
  },
  PROCESSING_ERROR: {
    code: 'PROCESSING_ERROR',
    message: 'Processing error',
    isRetryable: false
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    isRetryable: true
  }
};

/**
 * Create an error from error type
 * @param {Object} errorType - Error type from ERROR_TYPES
 * @param {String} customMessage - Custom error message (optional)
 * @param {Object} originalError - Original error (optional)
 * @returns {AppError} - Application error
 */
const createError = (errorType, customMessage = null, originalError = null) => {
  const message = customMessage || errorType.message;
  const error = new AppError(errorType.code, message, errorType.isRetryable);
  
  if (originalError) {
    error.originalError = originalError;
    error.stack = `${error.stack}\nCaused by: ${originalError.stack}`;
  }
  
  return error;
};

/**
 * Handle error with retry logic
 * @param {Function} operation - Async function to execute
 * @param {Object} options - Retry options
 * @param {Number} options.maxRetries - Maximum number of retries
 * @param {Number} options.baseDelay - Base delay in ms
 * @param {String} options.operationName - Operation name for logging
 * @param {Function} options.shouldRetry - Function to determine if retry should be attempted
 * @returns {Promise<any>} - Operation result
 */
const withRetry = async (operation, options = {}) => {
  const {
    maxRetries = parseInt(process.env.MAX_RETRIES || '3'),
    baseDelay = parseInt(process.env.RETRY_DELAY || '5000'),
    operationName = 'operation',
    shouldRetry = (error) => error?.isRetryable === true
  } = options;
  
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt <= maxRetries && shouldRetry(error)) {
        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        
        logger.warn(`Retry attempt ${attempt}/${maxRetries} for ${operationName}`, {
          error: error.message,
          delay,
          operationName
        });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // No more retries or not retryable
        break;
      }
    }
  }
  
  // If we get here, all retries failed
  logger.error(`All retry attempts failed for ${operationName}`, {
    maxRetries,
    error: lastError.message
  });
  
  throw lastError;
};

/**
 * Execute operation with timeout
 * @param {Function} operation - Async function to execute
 * @param {Number} timeout - Timeout in ms
 * @param {String} operationName - Operation name for logging
 * @returns {Promise<any>} - Operation result
 */
const withTimeout = async (operation, timeout, operationName = 'operation') => {
  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      reject(createError(ERROR_TYPES.TIMEOUT_ERROR, `${operationName} timed out after ${timeout}ms`));
    }, timeout);
    
    // Execute operation
    operation()
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

module.exports = {
  AppError,
  ERROR_TYPES,
  createError,
  withRetry,
  withTimeout
};
