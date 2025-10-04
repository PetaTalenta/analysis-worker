/**
 * Advanced Rate Limiter for Analysis Worker
 * Handles high-concurrency testing scenarios with free tier limitations
 */

const logger = require('../utils/logger');

class AdvancedRateLimiter {
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || 15; // Updated: 15 RPM for AI calls
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000; // 1 second base delay
    this.maxDelay = options.maxDelay || 30000; // Max 30 seconds delay

    // Token bucket state
    this.tokens = this.requestsPerMinute;
    this.lastRefill = Date.now();
    this.requestQueue = [];
    this.processing = false;

    // Statistics
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      averageDelay: 0,
      maxDelay: 0
    };

    logger.info('Advanced Rate Limiter initialized', {
      requestsPerMinute: this.requestsPerMinute,
      windowMs: this.windowMs
    });
  }

  /**
   * Refill tokens based on time elapsed
   */
  refillTokens() {
    const now = Date.now();
    const timeElapsed = now - this.lastRefill;
    const tokensToAdd = (timeElapsed / this.windowMs) * this.requestsPerMinute;

    this.tokens = Math.min(this.requestsPerMinute, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Check if request can proceed
   */
  canProceed() {
    this.refillTokens();
    return this.tokens >= 1;
  }

  /**
   * Consume a token
   */
  consumeToken() {
    if (this.canProceed()) {
      this.tokens -= 1;
      this.stats.totalRequests++;
      return true;
    }
    return false;
  }

  /**
   * Calculate delay for retry
   */
  calculateDelay(retryCount) {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 1000; // Add up to 1 second jitter
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  /**
   * Execute request with rate limiting
   */
  async executeWithRateLimit(requestFn, jobId, retryCount = 0) {
    const startTime = Date.now();

    try {
      // Try to consume token
      if (this.consumeToken()) {
        logger.debug('Request proceeding immediately', { jobId, tokensLeft: this.tokens });
        return await requestFn();
      }

      // Calculate wait time
      this.refillTokens();
      const tokensNeeded = 1 - this.tokens;
      const waitTime = (tokensNeeded / this.requestsPerMinute) * this.windowMs;

      this.stats.throttledRequests++;

      logger.info('Request throttled, waiting', {
        jobId,
        waitTime: Math.round(waitTime),
        tokensLeft: this.tokens,
        retryCount
      });

      // Wait before retry
      await this.sleep(waitTime);

      // Retry with exponential backoff if still failing
      if (retryCount < this.maxRetries) {
        return this.executeWithRateLimit(requestFn, jobId, retryCount + 1);
      } else {
        throw new Error(`Rate limit exceeded after ${this.maxRetries} retries`);
      }

    } catch (error) {
      const totalDelay = Date.now() - startTime;
      this.stats.averageDelay = (this.stats.averageDelay + totalDelay) / 2;
      this.stats.maxDelay = Math.max(this.stats.maxDelay, totalDelay);

      logger.error('Rate limited request failed', {
        jobId,
        error: error.message,
        retryCount,
        totalDelay
      });
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current statistics
   */
  getStats() {
    this.refillTokens();
    return {
      ...this.stats,
      currentTokens: this.tokens,
      requestsPerMinute: this.requestsPerMinute,
      queueLength: this.requestQueue.length
    };
  }

  /**
   * Update rate limit dynamically
   */
  updateRateLimit(newRPM) {
    this.requestsPerMinute = newRPM;
    this.tokens = Math.min(this.tokens, newRPM);
    logger.info('Rate limit updated', { newRPM });
  }
}

module.exports = AdvancedRateLimiter;
