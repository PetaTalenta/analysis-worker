/**
 * Job Deduplication Service
 * Prevents duplicate job processing and implements token refund mechanism
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const axios = require('axios');

class JobDeduplicationService {
  constructor() {
    // In-memory cache for processed jobs (in production, use Redis)
    this.processedJobs = new Map();
    this.processingJobs = new Map();
    
    // Configuration
    this.cacheRetentionMs = parseInt(process.env.JOB_CACHE_RETENTION_MS || '3600000'); // 1 hour
    this.maxCacheSize = parseInt(process.env.MAX_JOB_CACHE_SIZE || '10000');
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    logger.info('Job Deduplication Service initialized', {
      cacheRetentionMs: this.cacheRetentionMs,
      maxCacheSize: this.maxCacheSize
    });
  }

  /**
   * Generate unique hash for assessment data
   * @param {String} userId - User ID
   * @param {Object} assessmentData - Assessment data
   * @returns {String} - Unique hash
   */
  generateJobHash(userId, assessmentData) {
    const dataString = JSON.stringify({
      userId,
      riasec: assessmentData.riasec,
      ocean: assessmentData.ocean,
      viaIs: assessmentData.viaIs
    });
    
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Check if job is duplicate
   * @param {String} jobId - Current job ID
   * @param {String} userId - User ID
   * @param {Object} assessmentData - Assessment data
   * @returns {Promise<Object>} - Deduplication result
   */
  async checkDuplicate(jobId, userId, assessmentData) {
    const jobHash = this.generateJobHash(userId, assessmentData);
    const now = Date.now();
    
    // Check if currently processing
    if (this.processingJobs.has(jobHash)) {
      const processingJob = this.processingJobs.get(jobHash);
      
      logger.warn('Duplicate job detected - currently processing', {
        currentJobId: jobId,
        originalJobId: processingJob.jobId,
        userId,
        jobHash
      });
      
      return {
        isDuplicate: true,
        reason: 'CURRENTLY_PROCESSING',
        originalJobId: processingJob.jobId,
        shouldRefundTokens: true
      };
    }
    
    // Check if recently processed
    if (this.processedJobs.has(jobHash)) {
      const processedJob = this.processedJobs.get(jobHash);
      const timeSinceProcessed = now - processedJob.timestamp;
      
      if (timeSinceProcessed < this.cacheRetentionMs) {
        logger.warn('Duplicate job detected - recently processed', {
          currentJobId: jobId,
          originalJobId: processedJob.jobId,
          userId,
          jobHash,
          timeSinceProcessed: `${timeSinceProcessed}ms`
        });
        
        // CRITICAL FIX: Check if the result is complete before blocking reprocessing
        // If result is incomplete (test_result is null), allow reprocessing
        const existingResult = await this.checkResultCompleteness(processedJob.resultId);
        
        if (existingResult && existingResult.isIncomplete) {
          logger.warn('Allowing reprocessing of incomplete result', {
            currentJobId: jobId,
            originalJobId: processedJob.jobId,
            originalResultId: processedJob.resultId,
            userId,
            reason: 'INCOMPLETE_RESULT_REPROCESSING'
          });
          
          // Remove from processed cache to allow reprocessing
          this.processedJobs.delete(jobHash);
          
          return {
            isDuplicate: false,
            jobHash,
            reason: 'INCOMPLETE_RESULT_REPROCESSING',
            originalResultId: processedJob.resultId,
            allowOverwrite: true
          };
        }

        return {
          isDuplicate: true,
          reason: 'RECENTLY_PROCESSED',
          originalJobId: processedJob.jobId,
          originalResultId: processedJob.resultId,
          shouldRefundTokens: true,
          timeSinceProcessed
        };
      }
    }
    
    return {
      isDuplicate: false,
      jobHash
    };
  }

  /**
   * Mark job as processing
   * @param {String} jobId - Job ID
   * @param {String} jobHash - Job hash
   * @param {String} userId - User ID
   */
  markAsProcessing(jobId, jobHash, userId) {
    this.processingJobs.set(jobHash, {
      jobId,
      userId,
      timestamp: Date.now()
    });
    
    logger.debug('Job marked as processing', {
      jobId,
      userId,
      jobHash
    });
  }

  /**
   * Mark job as completed
   * @param {String} jobId - Job ID
   * @param {String} jobHash - Job hash
   * @param {String} resultId - Result ID
   * @param {String} userId - User ID
   */
  markAsCompleted(jobId, jobHash, resultId, userId) {
    // Remove from processing
    this.processingJobs.delete(jobHash);
    
    // Add to processed
    this.processedJobs.set(jobHash, {
      jobId,
      resultId,
      userId,
      timestamp: Date.now()
    });
    
    // Enforce cache size limit
    if (this.processedJobs.size > this.maxCacheSize) {
      this.cleanupOldEntries();
    }
    
    logger.debug('Job marked as completed', {
      jobId,
      resultId,
      userId,
      jobHash
    });
  }

  /**
   * Mark job as failed
   * @param {String} jobId - Job ID
   * @param {String} jobHash - Job hash
   * @param {String} userId - User ID
   */
  markAsFailed(jobId, jobHash, userId) {
    // Remove from processing
    this.processingJobs.delete(jobHash);
    
    logger.debug('Job marked as failed', {
      jobId,
      userId,
      jobHash
    });
  }

  /**
   * Get existing result for duplicate job
   * @param {String} jobHash - Job hash
   * @returns {Object|null} - Existing result or null
   */
  getExistingResult(jobHash) {
    const processedJob = this.processedJobs.get(jobHash);
    if (processedJob && processedJob.resultId) {
      return {
        resultId: processedJob.resultId,
        originalJobId: processedJob.jobId,
        timestamp: processedJob.timestamp
      };
    }
    return null;
  }

  /**
   * Start cleanup interval for old entries
   */
  startCleanupInterval() {
    const cleanupInterval = Math.min(this.cacheRetentionMs / 4, 300000); // Max 5 minutes
    
    setInterval(() => {
      this.cleanupOldEntries();
    }, cleanupInterval);
  }

  /**
   * Cleanup old entries from cache
   */
  cleanupOldEntries() {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Cleanup processed jobs
    for (const [hash, job] of this.processedJobs.entries()) {
      if (now - job.timestamp > this.cacheRetentionMs) {
        this.processedJobs.delete(hash);
        cleanedCount++;
      }
    }
    
    // Cleanup stale processing jobs (older than 1 hour)
    for (const [hash, job] of this.processingJobs.entries()) {
      if (now - job.timestamp > 3600000) { // 1 hour
        this.processingJobs.delete(hash);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Cleaned up old job cache entries', {
        cleanedCount,
        remainingProcessed: this.processedJobs.size,
        remainingProcessing: this.processingJobs.size
      });
    }
  }

  /**
   * Check if analysis result is complete
   * @param {String} resultId - Result ID to check
   * @returns {Promise<Object>} - Result completeness info
   */
  async checkResultCompleteness(resultId) {
    try {
      // Create archive service client
      const archiveClient = axios.create({
        baseURL: process.env.ARCHIVE_SERVICE_URL || 'http://archive-service:3000',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SERVICE_SECRET}`
        }
      });

      const response = await archiveClient.get(`/archive/results/${resultId}`);
      const result = response.data.data;
      
      // Check if test_result is null or incomplete
      const isIncomplete = !result.test_result || 
                          typeof result.test_result !== 'object' ||
                          !result.test_result.archetype ||
                          !result.test_result.shortSummary;
      
      logger.debug('Result completeness check', {
        resultId,
        hasTestResult: !!result.test_result,
        hasArchetype: !!(result.test_result?.archetype),
        hasShortSummary: !!(result.test_result?.shortSummary),
        isIncomplete
      });
      
      return {
        resultId,
        isIncomplete,
        testResult: result.test_result,
        status: result.status
      };
    } catch (error) {
      logger.warn('Failed to check result completeness, assuming complete', {
        resultId,
        error: error.message
      });
      
      // If we can't check, assume it's complete to avoid infinite loops
      return {
        resultId,
        isIncomplete: false,
        error: error.message
      };
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    return {
      processedJobs: this.processedJobs.size,
      processingJobs: this.processingJobs.size,
      cacheRetentionMs: this.cacheRetentionMs,
      maxCacheSize: this.maxCacheSize
    };
  }
}

// Token Refund Service
class TokenRefundService {
  constructor() {
    this.refundQueue = [];
    this.processing = false;
    
    // Start refund processor
    this.startRefundProcessor();
  }

  /**
   * Queue token refund for duplicate job
   * @param {String} jobId - Job ID
   * @param {String} userId - User ID
   * @param {Object} tokenData - Token usage data
   * @param {String} reason - Refund reason
   */
  queueRefund(jobId, userId, tokenData, reason) {
    this.refundQueue.push({
      jobId,
      userId,
      tokenData,
      reason,
      timestamp: Date.now()
    });
    
    logger.info('Token refund queued', {
      jobId,
      userId,
      reason,
      inputTokens: tokenData?.inputTokens || 0,
      outputTokens: tokenData?.outputTokens || 0
    });
  }

  /**
   * Start refund processor
   */
  async startRefundProcessor() {
    setInterval(async () => {
      if (this.refundQueue.length > 0 && !this.processing) {
        await this.processRefunds();
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process pending refunds
   */
  async processRefunds() {
    if (this.processing || this.refundQueue.length === 0) return;
    
    this.processing = true;
    const refunds = this.refundQueue.splice(0, 10); // Process 10 at a time
    
    for (const refund of refunds) {
      try {
        await this.executeRefund(refund);
      } catch (error) {
        logger.error('Failed to process token refund', {
          jobId: refund.jobId,
          userId: refund.userId,
          error: error.message
        });
      }
    }
    
    this.processing = false;
  }

  /**
   * Execute token refund
   * @param {Object} refund - Refund data
   */
  async executeRefund(refund) {
    // In a real implementation, this would:
    // 1. Credit tokens back to user account
    // 2. Log the refund transaction
    // 3. Update usage statistics
    
    logger.info('Token refund processed', {
      jobId: refund.jobId,
      userId: refund.userId,
      reason: refund.reason,
      refundedTokens: (refund.tokenData?.inputTokens || 0) + (refund.tokenData?.outputTokens || 0)
    });
  }
}

// Export singleton instances
const jobDeduplicationService = new JobDeduplicationService();
const tokenRefundService = new TokenRefundService();

module.exports = {
  jobDeduplicationService,
  tokenRefundService
};
