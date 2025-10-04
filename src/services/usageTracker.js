/**
 * Usage Tracker Service
 * Tracks and aggregates token usage metrics with circular buffer for efficiency
 */

const logger = require('../utils/logger');

/**
 * UsageTracker class for tracking token usage and calculating statistics
 */
class UsageTracker {
  constructor(options = {}) {
    // Configuration
    this.maxRecords = options.maxRecords || parseInt(process.env.USAGE_TRACKER_MAX_RECORDS || '10000');
    this.retentionDays = options.retentionDays || parseInt(process.env.USAGE_TRACKER_RETENTION_DAYS || '30');
    
    // Circular buffer for efficient memory usage
    this.usageData = [];
    this.currentIndex = 0;
    this.totalRecords = 0;
    
    // Statistics cache
    this.statsCache = {
      daily: new Map(),
      weekly: new Map(),
      monthly: new Map(),
      lastCacheUpdate: null,
      cacheValidityMs: 60000 // 1 minute cache validity
    };
    
    // Cleanup interval reference
    this.cleanupInterval = null;
    
    // Initialize cleanup interval (only in production)
    if (process.env.NODE_ENV !== 'test') {
      this._initializeCleanup();
    }
    
    logger.debug('UsageTracker initialized', {
      maxRecords: this.maxRecords,
      retentionDays: this.retentionDays
    });
  }

  /**
   * Track token usage for a request
   * @param {String} jobId - Job ID for traceability
   * @param {Object} tokenData - Token usage data
   * @param {Object} options - Additional options
   */
  trackUsage(jobId, tokenData, options = {}) {
    try {
      const timestamp = new Date();
      
      // Validate token data
      const validatedData = this._validateTokenData(tokenData);
      
      const usageRecord = {
        jobId: jobId || `unknown-${Date.now()}`,
        timestamp: timestamp,
        inputTokens: validatedData.inputTokens,
        outputTokens: validatedData.outputTokens,
        totalTokens: validatedData.totalTokens,
        model: validatedData.model || 'unknown',
        estimatedCost: validatedData.estimatedCost || 0,
        responseTime: options.responseTime || 0,
        success: validatedData.success !== false,
        mock: validatedData.mock || false,
        fallbackUsed: validatedData.fallbackUsed || false
      };

      // Add to circular buffer
      this._addToBuffer(usageRecord);
      
      // Invalidate cache
      this._invalidateCache();
      
      logger.debug('Usage tracked successfully', {
        jobId,
        inputTokens: usageRecord.inputTokens,
        outputTokens: usageRecord.outputTokens,
        totalTokens: usageRecord.totalTokens,
        estimatedCost: usageRecord.estimatedCost
      });

    } catch (error) {
      logger.error('Failed to track usage', {
        jobId,
        error: error.message,
        tokenData
      });
    }
  }

  /**
   * Get usage statistics for a specific timeframe
   * @param {String} timeframe - 'daily', 'weekly', or 'monthly'
   * @param {Date} startDate - Start date for statistics (optional)
   * @param {Date} endDate - End date for statistics (optional)
   * @returns {Object} - Usage statistics
   */
  getUsageStats(timeframe = 'daily', startDate = null, endDate = null) {
    try {
      // Check cache first
      const cacheKey = `${timeframe}-${startDate?.toISOString()}-${endDate?.toISOString()}`;
      const cachedStats = this._getCachedStats(timeframe, cacheKey);
      if (cachedStats) {
        return cachedStats;
      }

      const now = new Date();
      const stats = {
        timeframe,
        startDate: startDate || this._getTimeframeStart(timeframe, now),
        endDate: endDate || now,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        averageTokensPerRequest: 0,
        averageInputTokensPerRequest: 0,
        averageOutputTokensPerRequest: 0,
        estimatedTotalCost: 0,
        averageCostPerRequest: 0,
        peakUsageHour: null,
        peakUsageCount: 0,
        mockRequests: 0,
        fallbackRequests: 0,
        models: new Map(),
        hourlyDistribution: new Array(24).fill(0)
      };

      // Filter data by timeframe
      const filteredData = this._filterDataByTimeframe(stats.startDate, stats.endDate);
      
      // Calculate statistics
      this._calculateStats(filteredData, stats);
      
      // Cache the results
      this._setCachedStats(timeframe, cacheKey, stats);
      
      logger.debug('Usage statistics calculated', {
        timeframe,
        totalRequests: stats.totalRequests,
        totalTokens: stats.totalTokens,
        estimatedTotalCost: stats.estimatedTotalCost
      });

      return stats;

    } catch (error) {
      logger.error('Failed to get usage statistics', {
        timeframe,
        error: error.message
      });
      
      return this._getEmptyStats(timeframe, startDate, endDate);
    }
  }

  /**
   * Get daily usage statistics
   * @param {Date} date - Specific date (optional, defaults to today)
   * @returns {Object} - Daily usage statistics
   */
  getDailyUsage(date = null) {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    return this.getUsageStats('daily', startOfDay, endOfDay);
  }

  /**
   * Get weekly usage statistics
   * @param {Date} weekStart - Start of week (optional)
   * @returns {Object} - Weekly usage statistics
   */
  getWeeklyUsage(weekStart = null) {
    const startDate = weekStart || this._getWeekStart(new Date());
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    
    return this.getUsageStats('weekly', startDate, endDate);
  }

  /**
   * Get monthly usage statistics
   * @param {Number} year - Year (optional)
   * @param {Number} month - Month (0-11, optional)
   * @returns {Object} - Monthly usage statistics
   */
  getMonthlyUsage(year = null, month = null) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month !== null ? month : now.getMonth();
    
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    
    return this.getUsageStats('monthly', startDate, endDate);
  }

  /**
   * Get average tokens per request
   * @param {String} timeframe - Timeframe for calculation
   * @returns {Number} - Average tokens per request
   */
  getAverageTokensPerRequest(timeframe = 'daily') {
    const stats = this.getUsageStats(timeframe);
    return stats.averageTokensPerRequest;
  }

  /**
   * Get current usage summary
   * @returns {Object} - Current usage summary
   */
  getCurrentUsageSummary() {
    try {
      const totalRecords = Math.min(this.totalRecords, this.maxRecords);
      
      if (totalRecords === 0) {
        return {
          totalRecords: 0,
          bufferUtilization: 0,
          oldestRecord: null,
          newestRecord: null,
          memoryUsageKB: 0
        };
      }

      // Find oldest and newest records
      let oldestRecord = null;
      let newestRecord = null;
      
      for (let i = 0; i < totalRecords; i++) {
        const record = this.usageData[i];
        if (record) {
          if (!oldestRecord || record.timestamp < oldestRecord.timestamp) {
            oldestRecord = record;
          }
          if (!newestRecord || record.timestamp > newestRecord.timestamp) {
            newestRecord = record;
          }
        }
      }

      // Estimate memory usage
      const estimatedRecordSize = 200; // bytes per record (approximate)
      const memoryUsageKB = Math.round((totalRecords * estimatedRecordSize) / 1024);

      return {
        totalRecords,
        bufferUtilization: Math.round((totalRecords / this.maxRecords) * 100),
        oldestRecord: oldestRecord?.timestamp || null,
        newestRecord: newestRecord?.timestamp || null,
        memoryUsageKB
      };

    } catch (error) {
      logger.error('Failed to get current usage summary', { error: error.message });
      return {
        totalRecords: 0,
        bufferUtilization: 0,
        oldestRecord: null,
        newestRecord: null,
        memoryUsageKB: 0
      };
    }
  }

  /**
   * Reset all statistics and clear data
   */
  resetStats() {
    try {
      this.usageData = [];
      this.currentIndex = 0;
      this.totalRecords = 0;
      this._invalidateCache();
      
      logger.info('Usage statistics reset successfully');
      
    } catch (error) {
      logger.error('Failed to reset usage statistics', { error: error.message });
    }
  }

  /**
   * Cleanup and destroy the usage tracker
   */
  destroy() {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      this.resetStats();
      
      logger.info('UsageTracker destroyed successfully');
      
    } catch (error) {
      logger.error('Failed to destroy UsageTracker', { error: error.message });
    }
  }

  /**
   * Export usage data for external analysis
   * @param {Object} options - Export options
   * @returns {Array} - Exported usage data
   */
  exportUsageData(options = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        includeFailures = true,
        includeMock = true,
        format = 'json'
      } = options;

      let filteredData = this._filterDataByTimeframe(startDate, endDate);
      
      if (!includeFailures) {
        filteredData = filteredData.filter(record => record.success);
      }
      
      if (!includeMock) {
        filteredData = filteredData.filter(record => !record.mock);
      }

      if (format === 'csv') {
        return this._convertToCSV(filteredData);
      }

      return filteredData;

    } catch (error) {
      logger.error('Failed to export usage data', { error: error.message });
      return [];
    }
  }

  /**
   * Get comprehensive usage report for monitoring systems
   * @param {Object} options - Report options
   * @returns {Object} - Comprehensive usage report
   */
  getUsageReport(options = {}) {
    try {
      const {
        timeframe = 'daily',
        includePerformanceMetrics = true,
        includeDetailedBreakdown = true,
        includeAlerts = true
      } = options;

      const stats = this.getUsageStats(timeframe);
      const summary = this.getCurrentUsageSummary();
      
      const report = {
        timestamp: new Date().toISOString(),
        timeframe: timeframe,
        reportType: 'usage_monitoring',
        
        // Core usage statistics
        usage: {
          totalRequests: stats.totalRequests,
          successfulRequests: stats.successfulRequests,
          failedRequests: stats.failedRequests,
          successRate: stats.totalRequests > 0 ? 
            Math.round((stats.successfulRequests / stats.totalRequests) * 100) : 0,
          
          tokens: {
            totalInputTokens: stats.totalInputTokens,
            totalOutputTokens: stats.totalOutputTokens,
            totalTokens: stats.totalTokens,
            averageTokensPerRequest: stats.averageTokensPerRequest,
            averageInputTokensPerRequest: stats.averageInputTokensPerRequest,
            averageOutputTokensPerRequest: stats.averageOutputTokensPerRequest
          },
          
          cost: {
            estimatedTotalCost: stats.estimatedTotalCost,
            averageCostPerRequest: stats.averageCostPerRequest,
            currency: 'USD'
          },
          
          timing: {
            peakUsageHour: stats.peakUsageHour,
            peakUsageCount: stats.peakUsageCount
          }
        },
        
        // System health indicators
        system: {
          bufferUtilization: summary.bufferUtilization,
          memoryUsageKB: summary.memoryUsageKB,
          totalRecords: summary.totalRecords,
          dataRetentionDays: this.retentionDays,
          oldestRecord: summary.oldestRecord,
          newestRecord: summary.newestRecord
        }
      };

      // Add performance metrics if requested
      if (includePerformanceMetrics) {
        report.performance = this._getPerformanceMetrics(stats);
      }

      // Add detailed breakdown if requested
      if (includeDetailedBreakdown) {
        report.breakdown = this._getDetailedBreakdown(stats);
      }

      // Add alerts if requested
      if (includeAlerts) {
        report.alerts = this._generateUsageAlerts(stats, summary);
      }

      // Log structured report for external monitoring
      this._logStructuredReport(report);

      return report;

    } catch (error) {
      logger.error('Failed to generate usage report', { error: error.message });
      return this._getEmptyReport(options);
    }
  }

  /**
   * Get real-time usage metrics for monitoring dashboards
   * @returns {Object} - Real-time metrics
   */
  getRealTimeMetrics() {
    try {
      const now = new Date();
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const hourlyStats = this.getUsageStats('daily', lastHour, now);
      const dailyStats = this.getUsageStats('daily', last24Hours, now);
      const summary = this.getCurrentUsageSummary();

      const metrics = {
        timestamp: now.toISOString(),
        
        // Current period metrics
        current: {
          lastHour: {
            requests: hourlyStats.totalRequests,
            tokens: hourlyStats.totalTokens,
            cost: hourlyStats.estimatedTotalCost,
            successRate: hourlyStats.totalRequests > 0 ? 
              Math.round((hourlyStats.successfulRequests / hourlyStats.totalRequests) * 100) : 0
          },
          
          last24Hours: {
            requests: dailyStats.totalRequests,
            tokens: dailyStats.totalTokens,
            cost: dailyStats.estimatedTotalCost,
            successRate: dailyStats.totalRequests > 0 ? 
              Math.round((dailyStats.successfulRequests / dailyStats.totalRequests) * 100) : 0
          }
        },
        
        // System status
        system: {
          status: this._getSystemStatus(summary),
          bufferUtilization: summary.bufferUtilization,
          memoryUsageKB: summary.memoryUsageKB,
          isHealthy: this._isSystemHealthy(summary, dailyStats)
        },
        
        // Performance indicators
        performance: {
          averageResponseTime: this._getAverageResponseTime(lastHour, now),
          tokenCountingLatency: this._getTokenCountingLatency(),
          errorRate: dailyStats.totalRequests > 0 ? 
            Math.round((dailyStats.failedRequests / dailyStats.totalRequests) * 100) : 0
        }
      };

      // Log real-time metrics for monitoring
      logger.info('Real-time usage metrics', {
        component: 'usage_tracker',
        metrics: metrics,
        structured: true
      });

      return metrics;

    } catch (error) {
      logger.error('Failed to get real-time metrics', { error: error.message });
      return this._getEmptyRealTimeMetrics();
    }
  }

  /**
   * Export usage data in multiple formats for external systems
   * @param {Object} options - Export options
   * @returns {Object} - Export result with data and metadata
   */
  exportForMonitoring(options = {}) {
    try {
      const {
        format = 'json',
        timeframe = 'daily',
        includeMetadata = true,
        compression = false
      } = options;

      const stats = this.getUsageStats(timeframe);
      const rawData = this.exportUsageData(options);
      
      const exportData = {
        metadata: includeMetadata ? {
          exportTimestamp: new Date().toISOString(),
          timeframe: timeframe,
          recordCount: rawData.length,
          format: format,
          version: '1.0'
        } : undefined,
        
        summary: {
          totalRequests: stats.totalRequests,
          totalTokens: stats.totalTokens,
          estimatedTotalCost: stats.estimatedTotalCost,
          timeRange: {
            start: stats.startDate,
            end: stats.endDate
          }
        },
        
        data: rawData
      };

      // Log export activity for audit trail
      logger.info('Usage data exported for monitoring', {
        format: format,
        recordCount: rawData.length,
        timeframe: timeframe,
        exportSize: JSON.stringify(exportData).length,
        structured: true
      });

      return exportData;

    } catch (error) {
      logger.error('Failed to export data for monitoring', { error: error.message });
      return {
        metadata: {
          exportTimestamp: new Date().toISOString(),
          error: error.message,
          success: false
        },
        summary: {},
        data: []
      };
    }
  }

  // Private methods

  /**
   * Validate token data structure
   * @param {Object} tokenData - Token data to validate
   * @returns {Object} - Validated token data
   * @private
   */
  _validateTokenData(tokenData) {
    if (!tokenData || typeof tokenData !== 'object') {
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0
      };
    }

    return {
      inputTokens: Math.max(0, parseInt(tokenData.inputTokens) || 0),
      outputTokens: Math.max(0, parseInt(tokenData.outputTokens) || 0),
      totalTokens: Math.max(0, parseInt(tokenData.totalTokens) || 0),
      model: tokenData.model || 'unknown',
      estimatedCost: Math.max(0, parseFloat(tokenData.estimatedCost) || 0),
      success: tokenData.success,
      mock: tokenData.mock,
      fallbackUsed: tokenData.fallbackUsed
    };
  }

  /**
   * Add record to circular buffer
   * @param {Object} record - Usage record to add
   * @private
   */
  _addToBuffer(record) {
    this.usageData[this.currentIndex] = record;
    this.currentIndex = (this.currentIndex + 1) % this.maxRecords;
    this.totalRecords++;
  }

  /**
   * Filter data by timeframe
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Array} - Filtered usage data
   * @private
   */
  _filterDataByTimeframe(startDate, endDate) {
    const actualRecords = Math.min(this.totalRecords, this.maxRecords);
    const filteredData = [];

    for (let i = 0; i < actualRecords; i++) {
      const record = this.usageData[i];
      if (record && record.timestamp) {
        const recordDate = new Date(record.timestamp);
        
        if ((!startDate || recordDate >= startDate) && 
            (!endDate || recordDate <= endDate)) {
          filteredData.push(record);
        }
      }
    }

    return filteredData;
  }

  /**
   * Calculate statistics from filtered data
   * @param {Array} data - Filtered usage data
   * @param {Object} stats - Statistics object to populate
   * @private
   */
  _calculateStats(data, stats) {
    if (data.length === 0) {
      return;
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let mockRequests = 0;
    let fallbackRequests = 0;
    
    const hourlyUsage = new Array(24).fill(0);
    const modelUsage = new Map();

    data.forEach(record => {
      // Basic counts
      stats.totalRequests++;
      
      if (record.success) {
        successfulRequests++;
      } else {
        failedRequests++;
      }
      
      if (record.mock) {
        mockRequests++;
      }
      
      if (record.fallbackUsed) {
        fallbackRequests++;
      }

      // Token aggregation
      totalInputTokens += record.inputTokens || 0;
      totalOutputTokens += record.outputTokens || 0;
      totalTokens += record.totalTokens || 0;
      totalCost += record.estimatedCost || 0;

      // Hourly distribution
      const hour = new Date(record.timestamp).getHours();
      hourlyUsage[hour]++;

      // Model usage
      const model = record.model || 'unknown';
      if (!modelUsage.has(model)) {
        modelUsage.set(model, {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedCost: 0
        });
      }
      
      const modelStats = modelUsage.get(model);
      modelStats.requests++;
      modelStats.inputTokens += record.inputTokens || 0;
      modelStats.outputTokens += record.outputTokens || 0;
      modelStats.totalTokens += record.totalTokens || 0;
      modelStats.estimatedCost += record.estimatedCost || 0;
    });

    // Populate statistics
    stats.successfulRequests = successfulRequests;
    stats.failedRequests = failedRequests;
    stats.mockRequests = mockRequests;
    stats.fallbackRequests = fallbackRequests;
    stats.totalInputTokens = totalInputTokens;
    stats.totalOutputTokens = totalOutputTokens;
    stats.totalTokens = totalTokens;
    stats.estimatedTotalCost = Math.round(totalCost * 1000000) / 1000000; // Round to 6 decimal places
    
    // Calculate averages
    if (stats.totalRequests > 0) {
      stats.averageTokensPerRequest = Math.round(totalTokens / stats.totalRequests);
      stats.averageInputTokensPerRequest = Math.round(totalInputTokens / stats.totalRequests);
      stats.averageOutputTokensPerRequest = Math.round(totalOutputTokens / stats.totalRequests);
      stats.averageCostPerRequest = Math.round((totalCost / stats.totalRequests) * 1000000) / 1000000;
    }

    // Find peak usage hour
    let peakHour = 0;
    let peakCount = hourlyUsage[0];
    for (let i = 1; i < 24; i++) {
      if (hourlyUsage[i] > peakCount) {
        peakCount = hourlyUsage[i];
        peakHour = i;
      }
    }
    
    stats.peakUsageHour = peakHour;
    stats.peakUsageCount = peakCount;
    stats.hourlyDistribution = hourlyUsage;
    stats.models = modelUsage;
  }

  /**
   * Get start date for timeframe
   * @param {String} timeframe - Timeframe type
   * @param {Date} referenceDate - Reference date
   * @returns {Date} - Start date
   * @private
   */
  _getTimeframeStart(timeframe, referenceDate) {
    const date = new Date(referenceDate);
    
    switch (timeframe) {
      case 'daily':
        date.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        return this._getWeekStart(date);
      case 'monthly':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
      default:
        date.setHours(0, 0, 0, 0);
    }
    
    return date;
  }

  /**
   * Get start of week (Monday)
   * @param {Date} date - Reference date
   * @returns {Date} - Start of week
   * @private
   */
  _getWeekStart(date) {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start of week
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  }

  /**
   * Get cached statistics
   * @param {String} timeframe - Timeframe type
   * @param {String} cacheKey - Cache key
   * @returns {Object|null} - Cached statistics or null
   * @private
   */
  _getCachedStats(timeframe, cacheKey) {
    const cache = this.statsCache[timeframe];
    if (!cache || !this.statsCache.lastCacheUpdate) {
      return null;
    }

    const now = Date.now();
    if (now - this.statsCache.lastCacheUpdate > this.statsCache.cacheValidityMs) {
      return null;
    }

    return cache.get(cacheKey) || null;
  }

  /**
   * Set cached statistics
   * @param {String} timeframe - Timeframe type
   * @param {String} cacheKey - Cache key
   * @param {Object} stats - Statistics to cache
   * @private
   */
  _setCachedStats(timeframe, cacheKey, stats) {
    const cache = this.statsCache[timeframe];
    if (cache) {
      cache.set(cacheKey, { ...stats });
      this.statsCache.lastCacheUpdate = Date.now();
    }
  }

  /**
   * Invalidate statistics cache
   * @private
   */
  _invalidateCache() {
    this.statsCache.daily.clear();
    this.statsCache.weekly.clear();
    this.statsCache.monthly.clear();
    this.statsCache.lastCacheUpdate = null;
  }

  /**
   * Get empty statistics object
   * @param {String} timeframe - Timeframe type
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} - Empty statistics object
   * @private
   */
  _getEmptyStats(timeframe, startDate, endDate) {
    return {
      timeframe,
      startDate: startDate || new Date(),
      endDate: endDate || new Date(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      averageTokensPerRequest: 0,
      averageInputTokensPerRequest: 0,
      averageOutputTokensPerRequest: 0,
      estimatedTotalCost: 0,
      averageCostPerRequest: 0,
      peakUsageHour: null,
      peakUsageCount: 0,
      mockRequests: 0,
      fallbackRequests: 0,
      models: new Map(),
      hourlyDistribution: new Array(24).fill(0)
    };
  }

  /**
   * Initialize cleanup interval for old records
   * @private
   */
  _initializeCleanup() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldRecords();
    }, 60 * 60 * 1000);
  }

  /**
   * Clean up old records based on retention policy
   * @private
   */
  _cleanupOldRecords() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      let cleanedCount = 0;
      const actualRecords = Math.min(this.totalRecords, this.maxRecords);
      
      for (let i = 0; i < actualRecords; i++) {
        const record = this.usageData[i];
        if (record && record.timestamp && new Date(record.timestamp) < cutoffDate) {
          this.usageData[i] = null;
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        // Compact the array by removing null entries
        this.usageData = this.usageData.filter(record => record !== null);
        this.currentIndex = this.usageData.length;
        this.totalRecords = Math.max(0, this.totalRecords - cleanedCount);
        
        this._invalidateCache();
        
        logger.debug('Cleaned up old usage records', {
          cleanedCount,
          remainingRecords: this.usageData.length
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup old records', { error: error.message });
    }
  }

  /**
   * Convert data to CSV format
   * @param {Array} data - Usage data to convert
   * @returns {String} - CSV formatted data
   * @private
   */
  _convertToCSV(data) {
    if (data.length === 0) {
      return '';
    }

    const headers = [
      'jobId', 'timestamp', 'inputTokens', 'outputTokens', 'totalTokens',
      'model', 'estimatedCost', 'responseTime', 'success', 'mock', 'fallbackUsed'
    ];

    const csvRows = [headers.join(',')];
    
    data.forEach(record => {
      const row = headers.map(header => {
        const value = record[header];
        if (value === null || value === undefined) {
          return '';
        }
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Get performance metrics for token counting operations
   * @param {Object} stats - Usage statistics
   * @returns {Object} - Performance metrics
   * @private
   */
  _getPerformanceMetrics(stats) {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Calculate performance metrics
      const recentData = this._filterDataByTimeframe(oneHourAgo, now);
      
      let totalResponseTime = 0;
      let tokenCountingLatency = 0;
      let fallbackUsageRate = 0;
      let mockUsageRate = 0;
      
      if (recentData.length > 0) {
        totalResponseTime = recentData.reduce((sum, record) => sum + (record.responseTime || 0), 0);
        const fallbackCount = recentData.filter(record => record.fallbackUsed).length;
        const mockCount = recentData.filter(record => record.mock).length;
        
        fallbackUsageRate = Math.round((fallbackCount / recentData.length) * 100);
        mockUsageRate = Math.round((mockCount / recentData.length) * 100);
        
        // Estimate token counting latency (assuming 10-20% of total response time)
        tokenCountingLatency = Math.round((totalResponseTime / recentData.length) * 0.15);
      }

      return {
        averageResponseTime: recentData.length > 0 ? Math.round(totalResponseTime / recentData.length) : 0,
        tokenCountingLatency: tokenCountingLatency,
        fallbackUsageRate: fallbackUsageRate,
        mockUsageRate: mockUsageRate,
        throughputPerHour: recentData.length,
        errorRate: stats.totalRequests > 0 ? 
          Math.round((stats.failedRequests / stats.totalRequests) * 100) : 0,
        cacheHitRate: this._calculateCacheHitRate(),
        memoryEfficiency: this._calculateMemoryEfficiency()
      };

    } catch (error) {
      logger.error('Failed to calculate performance metrics', { error: error.message });
      return {
        averageResponseTime: 0,
        tokenCountingLatency: 0,
        fallbackUsageRate: 0,
        mockUsageRate: 0,
        throughputPerHour: 0,
        errorRate: 0,
        cacheHitRate: 0,
        memoryEfficiency: 0
      };
    }
  }

  /**
   * Get detailed breakdown of usage patterns
   * @param {Object} stats - Usage statistics
   * @returns {Object} - Detailed breakdown
   * @private
   */
  _getDetailedBreakdown(stats) {
    try {
      // Convert Map to plain object for JSON serialization
      const modelsBreakdown = {};
      if (stats.models && stats.models instanceof Map) {
        for (const [model, modelStats] of stats.models.entries()) {
          modelsBreakdown[model] = {
            requests: modelStats.requests,
            inputTokens: modelStats.inputTokens,
            outputTokens: modelStats.outputTokens,
            totalTokens: modelStats.totalTokens,
            estimatedCost: modelStats.estimatedCost,
            averageTokensPerRequest: modelStats.requests > 0 ? 
              Math.round(modelStats.totalTokens / modelStats.requests) : 0
          };
        }
      }

      return {
        models: modelsBreakdown,
        hourlyDistribution: stats.hourlyDistribution || new Array(24).fill(0),
        requestTypes: {
          successful: stats.successfulRequests || 0,
          failed: stats.failedRequests || 0,
          mock: stats.mockRequests || 0,
          fallback: stats.fallbackRequests || 0
        },
        tokenDistribution: {
          inputTokens: stats.totalInputTokens || 0,
          outputTokens: stats.totalOutputTokens || 0,
          averageInputPerRequest: stats.averageInputTokensPerRequest || 0,
          averageOutputPerRequest: stats.averageOutputTokensPerRequest || 0
        },
        costBreakdown: {
          totalCost: stats.estimatedTotalCost || 0,
          averageCostPerRequest: stats.averageCostPerRequest || 0,
          inputCostRatio: this._calculateInputCostRatio(stats),
          outputCostRatio: this._calculateOutputCostRatio(stats)
        }
      };

    } catch (error) {
      logger.error('Failed to generate detailed breakdown', { error: error.message });
      return {
        models: {},
        hourlyDistribution: new Array(24).fill(0),
        requestTypes: { successful: 0, failed: 0, mock: 0, fallback: 0 },
        tokenDistribution: { inputTokens: 0, outputTokens: 0, averageInputPerRequest: 0, averageOutputPerRequest: 0 },
        costBreakdown: { totalCost: 0, averageCostPerRequest: 0, inputCostRatio: 0, outputCostRatio: 0 }
      };
    }
  }

  /**
   * Generate usage alerts based on thresholds
   * @param {Object} stats - Usage statistics
   * @param {Object} summary - Usage summary
   * @returns {Array} - Array of alerts
   * @private
   */
  _generateUsageAlerts(stats, summary) {
    const alerts = [];

    try {
      // High error rate alert
      const errorRate = stats.totalRequests > 0 ? 
        (stats.failedRequests / stats.totalRequests) * 100 : 0;
      if (errorRate > 10) {
        alerts.push({
          type: 'error_rate',
          severity: errorRate > 25 ? 'critical' : 'warning',
          message: `High error rate detected: ${Math.round(errorRate)}%`,
          value: errorRate,
          threshold: 10
        });
      }

      // High memory usage alert
      if (summary.bufferUtilization > 80) {
        alerts.push({
          type: 'memory_usage',
          severity: summary.bufferUtilization > 95 ? 'critical' : 'warning',
          message: `High buffer utilization: ${summary.bufferUtilization}%`,
          value: summary.bufferUtilization,
          threshold: 80
        });
      }

      // High cost alert (daily threshold)
      const dailyCostThreshold = parseFloat(process.env.DAILY_COST_ALERT_THRESHOLD || '10.0');
      if (stats.estimatedTotalCost > dailyCostThreshold) {
        alerts.push({
          type: 'cost_threshold',
          severity: stats.estimatedTotalCost > dailyCostThreshold * 2 ? 'critical' : 'warning',
          message: `Daily cost threshold exceeded: $${stats.estimatedTotalCost.toFixed(6)}`,
          value: stats.estimatedTotalCost,
          threshold: dailyCostThreshold
        });
      }

      // High fallback usage alert
      const fallbackRate = stats.totalRequests > 0 ? 
        (stats.fallbackRequests / stats.totalRequests) * 100 : 0;
      if (fallbackRate > 20) {
        alerts.push({
          type: 'fallback_usage',
          severity: fallbackRate > 50 ? 'critical' : 'warning',
          message: `High fallback usage rate: ${Math.round(fallbackRate)}%`,
          value: fallbackRate,
          threshold: 20
        });
      }

      // No recent activity alert
      if (summary.newestRecord) {
        const timeSinceLastActivity = Date.now() - new Date(summary.newestRecord).getTime();
        const hoursInactive = timeSinceLastActivity / (1000 * 60 * 60);
        if (hoursInactive > 2) {
          alerts.push({
            type: 'inactivity',
            severity: hoursInactive > 24 ? 'warning' : 'info',
            message: `No recent activity detected: ${Math.round(hoursInactive)} hours`,
            value: hoursInactive,
            threshold: 2
          });
        }
      }

    } catch (error) {
      logger.error('Failed to generate usage alerts', { error: error.message });
      alerts.push({
        type: 'system_error',
        severity: 'warning',
        message: 'Failed to generate usage alerts',
        value: null,
        threshold: null
      });
    }

    return alerts;
  }

  /**
   * Log structured report for external monitoring systems
   * @param {Object} report - Usage report
   * @private
   */
  _logStructuredReport(report) {
    try {
      // Log for external monitoring systems (structured format)
      logger.info('Usage monitoring report generated', {
        component: 'usage_tracker',
        reportType: report.reportType,
        timeframe: report.timeframe,
        timestamp: report.timestamp,
        
        // Key metrics for monitoring systems
        metrics: {
          totalRequests: report.usage?.totalRequests || 0,
          successRate: report.usage?.successRate || 0,
          totalTokens: report.usage?.tokens?.totalTokens || 0,
          estimatedCost: report.usage?.cost?.estimatedTotalCost || 0,
          bufferUtilization: report.system?.bufferUtilization || 0,
          alertCount: report.alerts?.length || 0
        },
        
        // System health indicators
        health: {
          isHealthy: (report.alerts?.length || 0) === 0,
          criticalAlerts: report.alerts?.filter(alert => alert.severity === 'critical').length || 0,
          warningAlerts: report.alerts?.filter(alert => alert.severity === 'warning').length || 0
        },
        
        structured: true
      });

    } catch (error) {
      logger.error('Failed to log structured report', { error: error.message });
    }
  }

  /**
   * Get system status based on summary
   * @param {Object} summary - Usage summary
   * @returns {String} - System status
   * @private
   */
  _getSystemStatus(summary) {
    if (summary.bufferUtilization > 95) {
      return 'critical';
    } else if (summary.bufferUtilization > 80) {
      return 'warning';
    } else if (summary.totalRecords === 0) {
      return 'idle';
    } else {
      return 'healthy';
    }
  }

  /**
   * Check if system is healthy
   * @param {Object} summary - Usage summary
   * @param {Object} stats - Usage statistics
   * @returns {Boolean} - Is system healthy
   * @private
   */
  _isSystemHealthy(summary, stats) {
    const errorRate = stats.totalRequests > 0 ? 
      (stats.failedRequests / stats.totalRequests) * 100 : 0;
    
    return summary.bufferUtilization < 90 && 
           errorRate < 15 && 
           summary.memoryUsageKB < 50000; // 50MB threshold
  }

  /**
   * Get average response time for a time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Number} - Average response time in ms
   * @private
   */
  _getAverageResponseTime(startDate, endDate) {
    try {
      const filteredData = this._filterDataByTimeframe(startDate, endDate);
      
      if (filteredData.length === 0) {
        return 0;
      }

      const totalResponseTime = filteredData.reduce((sum, record) => {
        return sum + (record.responseTime || 0);
      }, 0);

      return Math.round(totalResponseTime / filteredData.length);

    } catch (error) {
      logger.error('Failed to calculate average response time', { error: error.message });
      return 0;
    }
  }

  /**
   * Get token counting latency estimate
   * @returns {Number} - Estimated token counting latency in ms
   * @private
   */
  _getTokenCountingLatency() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const recentData = this._filterDataByTimeframe(oneHourAgo, now);
      
      if (recentData.length === 0) {
        return 0;
      }

      // Estimate token counting latency as ~15% of total response time
      const avgResponseTime = this._getAverageResponseTime(oneHourAgo, now);
      return Math.round(avgResponseTime * 0.15);

    } catch (error) {
      logger.error('Failed to calculate token counting latency', { error: error.message });
      return 0;
    }
  }

  /**
   * Calculate cache hit rate
   * @returns {Number} - Cache hit rate percentage
   * @private
   */
  _calculateCacheHitRate() {
    try {
      // Simple estimation based on cache usage
      const totalCacheEntries = this.statsCache.daily.size + 
                               this.statsCache.weekly.size + 
                               this.statsCache.monthly.size;
      
      // Estimate hit rate based on cache size and activity
      if (totalCacheEntries === 0) {
        return 0;
      }

      // Simple heuristic: more cache entries suggest higher hit rate
      return Math.min(Math.round(totalCacheEntries * 10), 95);

    } catch (error) {
      logger.error('Failed to calculate cache hit rate', { error: error.message });
      return 0;
    }
  }

  /**
   * Calculate memory efficiency
   * @returns {Number} - Memory efficiency percentage
   * @private
   */
  _calculateMemoryEfficiency() {
    try {
      const summary = this.getCurrentUsageSummary();
      
      // Calculate efficiency based on buffer utilization and memory usage
      const bufferEfficiency = 100 - summary.bufferUtilization;
      const memoryEfficiency = summary.memoryUsageKB < 10000 ? 100 : 
                              Math.max(0, 100 - (summary.memoryUsageKB / 1000));
      
      return Math.round((bufferEfficiency + memoryEfficiency) / 2);

    } catch (error) {
      logger.error('Failed to calculate memory efficiency', { error: error.message });
      return 0;
    }
  }

  /**
   * Calculate input cost ratio
   * @param {Object} stats - Usage statistics
   * @returns {Number} - Input cost ratio percentage
   * @private
   */
  _calculateInputCostRatio(stats) {
    try {
      if (!stats.totalInputTokens || !stats.totalOutputTokens) {
        return 0;
      }

      // Estimate cost ratio based on token pricing
      const inputCost = (stats.totalInputTokens / 1000) * 0.00015; // $0.00015 per 1K input tokens
      const outputCost = (stats.totalOutputTokens / 1000) * 0.0006; // $0.0006 per 1K output tokens
      const totalCost = inputCost + outputCost;

      return totalCost > 0 ? Math.round((inputCost / totalCost) * 100) : 0;

    } catch (error) {
      logger.error('Failed to calculate input cost ratio', { error: error.message });
      return 0;
    }
  }

  /**
   * Calculate output cost ratio
   * @param {Object} stats - Usage statistics
   * @returns {Number} - Output cost ratio percentage
   * @private
   */
  _calculateOutputCostRatio(stats) {
    try {
      return 100 - this._calculateInputCostRatio(stats);
    } catch (error) {
      logger.error('Failed to calculate output cost ratio', { error: error.message });
      return 0;
    }
  }

  /**
   * Get empty report structure
   * @param {Object} options - Report options
   * @returns {Object} - Empty report
   * @private
   */
  _getEmptyReport(options) {
    return {
      timestamp: new Date().toISOString(),
      timeframe: options.timeframe || 'daily',
      reportType: 'usage_monitoring',
      usage: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 0,
        tokens: { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 },
        cost: { estimatedTotalCost: 0, averageCostPerRequest: 0, currency: 'USD' },
        timing: { peakUsageHour: null, peakUsageCount: 0 }
      },
      system: {
        bufferUtilization: 0,
        memoryUsageKB: 0,
        totalRecords: 0,
        dataRetentionDays: this.retentionDays
      },
      performance: {},
      breakdown: {},
      alerts: []
    };
  }

  /**
   * Get empty real-time metrics
   * @returns {Object} - Empty real-time metrics
   * @private
   */
  _getEmptyRealTimeMetrics() {
    return {
      timestamp: new Date().toISOString(),
      current: {
        lastHour: { requests: 0, tokens: 0, cost: 0, successRate: 0 },
        last24Hours: { requests: 0, tokens: 0, cost: 0, successRate: 0 }
      },
      system: {
        status: 'idle',
        bufferUtilization: 0,
        memoryUsageKB: 0,
        isHealthy: true
      },
      performance: {
        averageResponseTime: 0,
        tokenCountingLatency: 0,
        errorRate: 0
      }
    };
  }
}

module.exports = UsageTracker;