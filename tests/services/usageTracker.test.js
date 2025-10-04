/**
 * Unit tests for UsageTracker service
 */

const UsageTracker = require('../../src/services/usageTracker');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('UsageTracker', () => {
  let usageTracker;

  beforeEach(() => {
    // Create fresh instance for each test
    usageTracker = new UsageTracker({
      maxRecords: 100,
      retentionDays: 7
    });
  });

  afterEach(() => {
    // Clean up any intervals
    if (usageTracker) {
      usageTracker.destroy();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      const tracker = new UsageTracker();
      expect(tracker.maxRecords).toBe(10000);
      expect(tracker.retentionDays).toBe(30);
      expect(tracker.usageData).toEqual([]);
      expect(tracker.currentIndex).toBe(0);
      expect(tracker.totalRecords).toBe(0);
    });

    test('should initialize with custom configuration', () => {
      const tracker = new UsageTracker({
        maxRecords: 500,
        retentionDays: 14
      });
      expect(tracker.maxRecords).toBe(500);
      expect(tracker.retentionDays).toBe(14);
    });
  });

  describe('trackUsage', () => {
    test('should track valid token usage data', () => {
      const jobId = 'test-job-123';
      const tokenData = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        model: 'gemini-pro',
        estimatedCost: 0.0001,
        success: true
      };

      usageTracker.trackUsage(jobId, tokenData);

      expect(usageTracker.totalRecords).toBe(1);
      expect(usageTracker.usageData[0]).toMatchObject({
        jobId,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        model: 'gemini-pro',
        estimatedCost: 0.0001,
        success: true
      });
    });

    test('should handle invalid token data gracefully', () => {
      const jobId = 'test-job-invalid';
      const invalidTokenData = null;

      usageTracker.trackUsage(jobId, invalidTokenData);

      expect(usageTracker.totalRecords).toBe(1);
      expect(usageTracker.usageData[0]).toMatchObject({
        jobId,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0
      });
    });

    test('should generate jobId when not provided', () => {
      const tokenData = {
        inputTokens: 50,
        outputTokens: 25,
        totalTokens: 75
      };

      usageTracker.trackUsage(null, tokenData);

      expect(usageTracker.totalRecords).toBe(1);
      expect(usageTracker.usageData[0].jobId).toMatch(/^unknown-\d+$/);
    });

    test('should track additional options', () => {
      const jobId = 'test-job-options';
      const tokenData = {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300
      };
      const options = {
        responseTime: 1500
      };

      usageTracker.trackUsage(jobId, tokenData, options);

      expect(usageTracker.usageData[0].responseTime).toBe(1500);
    });
  });

  describe('getUsageStats', () => {
    beforeEach(() => {
      // Add sample data
      const sampleData = [
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCost: 0.0001,
          model: 'gemini-pro',
          success: true
        },
        {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          estimatedCost: 0.0002,
          model: 'gemini-pro',
          success: true
        },
        {
          inputTokens: 150,
          outputTokens: 75,
          totalTokens: 225,
          estimatedCost: 0.00015,
          model: 'gemini-flash',
          success: false
        }
      ];

      sampleData.forEach((data, index) => {
        usageTracker.trackUsage(`job-${index}`, data);
      });
    });

    test('should calculate basic statistics', () => {
      const stats = usageTracker.getUsageStats('daily');

      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(1);
      expect(stats.totalInputTokens).toBe(450);
      expect(stats.totalOutputTokens).toBe(225);
      expect(stats.totalTokens).toBe(675);
      expect(stats.averageTokensPerRequest).toBe(225);
    });

    test('should calculate cost statistics', () => {
      const stats = usageTracker.getUsageStats('daily');

      expect(stats.estimatedTotalCost).toBeCloseTo(0.00045, 6);
      expect(stats.averageCostPerRequest).toBeCloseTo(0.00015, 6);
    });

    test('should track model usage', () => {
      const stats = usageTracker.getUsageStats('daily');

      expect(stats.models.has('gemini-pro')).toBe(true);
      expect(stats.models.has('gemini-flash')).toBe(true);
      
      const geminiProStats = stats.models.get('gemini-pro');
      expect(geminiProStats.requests).toBe(2);
      expect(geminiProStats.totalTokens).toBe(450);
    });

    test('should return empty stats when no data', () => {
      const emptyTracker = new UsageTracker();
      const stats = emptyTracker.getUsageStats('daily');

      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.estimatedTotalCost).toBe(0);
    });
  });

  describe('getDailyUsage', () => {
    test('should get daily usage for specific date', () => {
      const testDate = new Date('2024-01-15');
      
      // Add data for the test date
      usageTracker.trackUsage('daily-test', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });

      const stats = usageTracker.getDailyUsage(testDate);
      expect(stats.timeframe).toBe('daily');
      expect(stats.startDate.getHours()).toBe(0);
      expect(stats.endDate.getHours()).toBe(23);
    });
  });

  describe('getWeeklyUsage', () => {
    test('should get weekly usage starting from Monday', () => {
      const stats = usageTracker.getWeeklyUsage();
      expect(stats.timeframe).toBe('weekly');
      
      // Check that start date is a Monday (day 1)
      expect(stats.startDate.getDay()).toBe(1);
    });
  });

  describe('getMonthlyUsage', () => {
    test('should get monthly usage for specific month', () => {
      const stats = usageTracker.getMonthlyUsage(2024, 0); // January 2024
      
      expect(stats.timeframe).toBe('monthly');
      expect(stats.startDate.getMonth()).toBe(0);
      expect(stats.startDate.getDate()).toBe(1);
    });
  });

  describe('getAverageTokensPerRequest', () => {
    test('should calculate average tokens per request', () => {
      usageTracker.trackUsage('avg-test-1', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });
      
      usageTracker.trackUsage('avg-test-2', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300
      });

      const average = usageTracker.getAverageTokensPerRequest('daily');
      expect(average).toBe(225); // (150 + 300) / 2
    });
  });

  describe('getCurrentUsageSummary', () => {
    test('should return current usage summary', () => {
      // Add some test data
      for (let i = 0; i < 5; i++) {
        usageTracker.trackUsage(`summary-test-${i}`, {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150
        });
      }

      const summary = usageTracker.getCurrentUsageSummary();
      
      expect(summary.totalRecords).toBe(5);
      expect(summary.bufferUtilization).toBe(5); // 5/100 * 100
      expect(summary.oldestRecord).toBeDefined();
      expect(summary.newestRecord).toBeDefined();
      expect(summary.memoryUsageKB).toBeGreaterThan(0);
    });

    test('should handle empty data', () => {
      const summary = usageTracker.getCurrentUsageSummary();
      
      expect(summary.totalRecords).toBe(0);
      expect(summary.bufferUtilization).toBe(0);
      expect(summary.oldestRecord).toBeNull();
      expect(summary.newestRecord).toBeNull();
      expect(summary.memoryUsageKB).toBe(0);
    });
  });

  describe('resetStats', () => {
    test('should reset all statistics and data', () => {
      // Add some data first
      usageTracker.trackUsage('reset-test', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });

      expect(usageTracker.totalRecords).toBe(1);

      usageTracker.resetStats();

      expect(usageTracker.totalRecords).toBe(0);
      expect(usageTracker.usageData).toEqual([]);
      expect(usageTracker.currentIndex).toBe(0);
    });
  });

  describe('exportUsageData', () => {
    beforeEach(() => {
      // Add sample data for export tests
      const sampleData = [
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          success: true,
          mock: false
        },
        {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          success: false,
          mock: true
        }
      ];

      sampleData.forEach((data, index) => {
        usageTracker.trackUsage(`export-test-${index}`, data);
      });
    });

    test('should export all data by default', () => {
      const exported = usageTracker.exportUsageData();
      expect(exported).toHaveLength(2);
    });

    test('should filter out failures when requested', () => {
      const exported = usageTracker.exportUsageData({
        includeFailures: false
      });
      expect(exported).toHaveLength(1);
      expect(exported[0].success).toBe(true);
    });

    test('should filter out mock data when requested', () => {
      const exported = usageTracker.exportUsageData({
        includeMock: false
      });
      expect(exported).toHaveLength(1);
      expect(exported[0].mock).toBe(false);
    });

    test('should export as CSV format', () => {
      const exported = usageTracker.exportUsageData({
        format: 'csv'
      });
      
      expect(typeof exported).toBe('string');
      expect(exported).toContain('jobId,timestamp,inputTokens');
      expect(exported.split('\n')).toHaveLength(3); // Header + 2 data rows
    });
  });

  describe('Circular Buffer Behavior', () => {
    test('should handle buffer overflow correctly', () => {
      const smallTracker = new UsageTracker({ maxRecords: 3 });

      // Add more records than buffer size
      for (let i = 0; i < 5; i++) {
        smallTracker.trackUsage(`overflow-test-${i}`, {
          inputTokens: 100 + i,
          outputTokens: 50,
          totalTokens: 150 + i
        });
      }

      expect(smallTracker.totalRecords).toBe(5);
      expect(smallTracker.usageData).toHaveLength(3); // Buffer size
      expect(smallTracker.currentIndex).toBe(2); // (5 % 3)
    });
  });

  describe('Data Validation', () => {
    test('should handle negative token values', () => {
      usageTracker.trackUsage('negative-test', {
        inputTokens: -100,
        outputTokens: -50,
        totalTokens: -150
      });

      const record = usageTracker.usageData[0];
      expect(record.inputTokens).toBe(0);
      expect(record.outputTokens).toBe(0);
      expect(record.totalTokens).toBe(0);
    });

    test('should handle non-numeric token values', () => {
      usageTracker.trackUsage('non-numeric-test', {
        inputTokens: 'invalid',
        outputTokens: null,
        totalTokens: undefined
      });

      const record = usageTracker.usageData[0];
      expect(record.inputTokens).toBe(0);
      expect(record.outputTokens).toBe(0);
      expect(record.totalTokens).toBe(0);
    });
  });

  describe('Cache Behavior', () => {
    test('should cache statistics for performance', () => {
      // Add some data
      usageTracker.trackUsage('cache-test', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });

      // First call should calculate and cache
      const stats1 = usageTracker.getUsageStats('daily');
      
      // Second call should use cache (same result)
      const stats2 = usageTracker.getUsageStats('daily');
      
      expect(stats1).toEqual(stats2);
    });

    test('should invalidate cache when new data is added', () => {
      // Add initial data
      usageTracker.trackUsage('cache-invalidate-1', {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });

      const stats1 = usageTracker.getUsageStats('daily');
      expect(stats1.totalRequests).toBe(1);

      // Add more data (should invalidate cache)
      usageTracker.trackUsage('cache-invalidate-2', {
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300
      });

      const stats2 = usageTracker.getUsageStats('daily');
      expect(stats2.totalRequests).toBe(2);
    });
  });

  describe('Usage Reporting and Monitoring', () => {
    beforeEach(() => {
      // Add comprehensive sample data for reporting tests
      const sampleData = [
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCost: 0.0001,
          model: 'gemini-pro',
          success: true,
          mock: false,
          fallbackUsed: false
        },
        {
          inputTokens: 200,
          outputTokens: 100,
          totalTokens: 300,
          estimatedCost: 0.0002,
          model: 'gemini-pro',
          success: true,
          mock: false,
          fallbackUsed: false
        },
        {
          inputTokens: 150,
          outputTokens: 75,
          totalTokens: 225,
          estimatedCost: 0.00015,
          model: 'gemini-flash',
          success: false,
          mock: false,
          fallbackUsed: true
        },
        {
          inputTokens: 80,
          outputTokens: 40,
          totalTokens: 120,
          estimatedCost: 0.00008,
          model: 'gemini-pro',
          success: true,
          mock: true,
          fallbackUsed: false
        }
      ];

      sampleData.forEach((data, index) => {
        usageTracker.trackUsage(`report-job-${index}`, data, { responseTime: 1000 + index * 100 });
      });
    });

    describe('getUsageReport', () => {
      test('should generate comprehensive usage report', () => {
        const report = usageTracker.getUsageReport({
          timeframe: 'daily',
          includePerformanceMetrics: true,
          includeDetailedBreakdown: true,
          includeAlerts: true
        });

        // Check report structure
        expect(report).toHaveProperty('timestamp');
        expect(report).toHaveProperty('timeframe', 'daily');
        expect(report).toHaveProperty('reportType', 'usage_monitoring');
        expect(report).toHaveProperty('usage');
        expect(report).toHaveProperty('system');
        expect(report).toHaveProperty('performance');
        expect(report).toHaveProperty('breakdown');
        expect(report).toHaveProperty('alerts');

        // Check usage statistics
        expect(report.usage.totalRequests).toBe(4);
        expect(report.usage.successfulRequests).toBe(3);
        expect(report.usage.failedRequests).toBe(1);
        expect(report.usage.successRate).toBe(75);
        expect(report.usage.tokens.totalTokens).toBe(795);
        expect(report.usage.cost.estimatedTotalCost).toBeCloseTo(0.00053, 6);

        // Check system health
        expect(report.system).toHaveProperty('bufferUtilization');
        expect(report.system).toHaveProperty('memoryUsageKB');
        expect(report.system).toHaveProperty('totalRecords', 4);
      });

      test('should generate minimal report when options disabled', () => {
        const report = usageTracker.getUsageReport({
          timeframe: 'daily',
          includePerformanceMetrics: false,
          includeDetailedBreakdown: false,
          includeAlerts: false
        });

        expect(report).toHaveProperty('usage');
        expect(report).toHaveProperty('system');
        expect(report).not.toHaveProperty('performance');
        expect(report).not.toHaveProperty('breakdown');
        expect(report).not.toHaveProperty('alerts');
      });

      test('should handle errors gracefully', () => {
        // Create a tracker that will cause errors
        const errorTracker = new UsageTracker();
        jest.spyOn(errorTracker, 'getUsageStats').mockImplementation(() => {
          throw new Error('Test error');
        });

        const report = errorTracker.getUsageReport();
        
        expect(report).toHaveProperty('usage');
        expect(report.usage.totalRequests).toBe(0);
      });
    });

    describe('getRealTimeMetrics', () => {
      test('should provide real-time metrics', () => {
        const metrics = usageTracker.getRealTimeMetrics();

        expect(metrics).toHaveProperty('timestamp');
        expect(metrics).toHaveProperty('current');
        expect(metrics).toHaveProperty('system');
        expect(metrics).toHaveProperty('performance');

        // Check current metrics structure
        expect(metrics.current).toHaveProperty('lastHour');
        expect(metrics.current).toHaveProperty('last24Hours');
        expect(metrics.current.lastHour).toHaveProperty('requests');
        expect(metrics.current.lastHour).toHaveProperty('tokens');
        expect(metrics.current.lastHour).toHaveProperty('cost');
        expect(metrics.current.lastHour).toHaveProperty('successRate');

        // Check system status
        expect(metrics.system).toHaveProperty('status');
        expect(metrics.system).toHaveProperty('bufferUtilization');
        expect(metrics.system).toHaveProperty('isHealthy');

        // Check performance indicators
        expect(metrics.performance).toHaveProperty('averageResponseTime');
        expect(metrics.performance).toHaveProperty('tokenCountingLatency');
        expect(metrics.performance).toHaveProperty('errorRate');
      });

      test('should handle empty data gracefully', () => {
        const emptyTracker = new UsageTracker();
        const metrics = emptyTracker.getRealTimeMetrics();

        expect(metrics.current.lastHour.requests).toBe(0);
        expect(metrics.current.last24Hours.requests).toBe(0);
        expect(metrics.system.status).toBe('idle');
        expect(metrics.system.isHealthy).toBe(true);
      });
    });

    describe('exportForMonitoring', () => {
      test('should export data with metadata for monitoring systems', () => {
        const exportResult = usageTracker.exportForMonitoring({
          format: 'json',
          timeframe: 'daily',
          includeMetadata: true
        });

        expect(exportResult).toHaveProperty('metadata');
        expect(exportResult).toHaveProperty('summary');
        expect(exportResult).toHaveProperty('data');

        // Check metadata
        expect(exportResult.metadata).toHaveProperty('exportTimestamp');
        expect(exportResult.metadata).toHaveProperty('timeframe', 'daily');
        expect(exportResult.metadata).toHaveProperty('recordCount', 4);
        expect(exportResult.metadata).toHaveProperty('format', 'json');

        // Check summary
        expect(exportResult.summary).toHaveProperty('totalRequests', 4);
        expect(exportResult.summary).toHaveProperty('totalTokens', 795);
        expect(exportResult.summary).toHaveProperty('timeRange');

        // Check data
        expect(Array.isArray(exportResult.data)).toBe(true);
        expect(exportResult.data).toHaveLength(4);
      });

      test('should export without metadata when disabled', () => {
        const exportResult = usageTracker.exportForMonitoring({
          includeMetadata: false
        });

        expect(exportResult.metadata).toBeUndefined();
        expect(exportResult).toHaveProperty('summary');
        expect(exportResult).toHaveProperty('data');
      });

      test('should handle export errors gracefully', () => {
        const errorTracker = new UsageTracker();
        jest.spyOn(errorTracker, 'getUsageStats').mockImplementation(() => {
          throw new Error('Export error');
        });

        const exportResult = errorTracker.exportForMonitoring();
        
        expect(exportResult.metadata).toHaveProperty('error');
        expect(exportResult.metadata.success).toBe(false);
        expect(exportResult.data).toEqual([]);
      });
    });

    describe('Performance Metrics', () => {
      test('should calculate performance metrics correctly', () => {
        const report = usageTracker.getUsageReport({
          includePerformanceMetrics: true
        });

        expect(report.performance).toHaveProperty('averageResponseTime');
        expect(report.performance).toHaveProperty('tokenCountingLatency');
        expect(report.performance).toHaveProperty('fallbackUsageRate');
        expect(report.performance).toHaveProperty('mockUsageRate');
        expect(report.performance).toHaveProperty('throughputPerHour');
        expect(report.performance).toHaveProperty('errorRate');

        // Check calculated values
        expect(report.performance.errorRate).toBe(25); // 1 failed out of 4 total
        expect(report.performance.fallbackUsageRate).toBe(25); // 1 fallback out of 4 total
        expect(report.performance.mockUsageRate).toBe(25); // 1 mock out of 4 total
      });
    });

    describe('Detailed Breakdown', () => {
      test('should provide detailed usage breakdown', () => {
        const report = usageTracker.getUsageReport({
          includeDetailedBreakdown: true
        });

        expect(report.breakdown).toHaveProperty('models');
        expect(report.breakdown).toHaveProperty('hourlyDistribution');
        expect(report.breakdown).toHaveProperty('requestTypes');
        expect(report.breakdown).toHaveProperty('tokenDistribution');
        expect(report.breakdown).toHaveProperty('costBreakdown');

        // Check models breakdown
        expect(report.breakdown.models).toHaveProperty('gemini-pro');
        expect(report.breakdown.models).toHaveProperty('gemini-flash');
        expect(report.breakdown.models['gemini-pro'].requests).toBe(3);
        expect(report.breakdown.models['gemini-flash'].requests).toBe(1);

        // Check request types
        expect(report.breakdown.requestTypes.successful).toBe(3);
        expect(report.breakdown.requestTypes.failed).toBe(1);
        expect(report.breakdown.requestTypes.mock).toBe(1);
        expect(report.breakdown.requestTypes.fallback).toBe(1);
      });
    });

    describe('Usage Alerts', () => {
      test('should generate alerts for high error rates', () => {
        // Create scenario with high error rate
        const highErrorTracker = new UsageTracker();
        
        // Add mostly failed requests
        for (let i = 0; i < 10; i++) {
          highErrorTracker.trackUsage(`error-job-${i}`, {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            success: i < 2 // Only first 2 are successful (20% success rate)
          });
        }

        const report = highErrorTracker.getUsageReport({ includeAlerts: true });
        const errorRateAlert = report.alerts.find(alert => alert.type === 'error_rate');
        
        expect(errorRateAlert).toBeDefined();
        expect(errorRateAlert.severity).toBe('critical'); // 80% error rate
        expect(errorRateAlert.value).toBe(80);
      });

      test('should generate alerts for high memory usage', () => {
        // Fill up the buffer to trigger memory alert
        const memoryTracker = new UsageTracker({ maxRecords: 10 });
        
        for (let i = 0; i < 9; i++) {
          memoryTracker.trackUsage(`memory-job-${i}`, {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150
          });
        }

        const report = memoryTracker.getUsageReport({ includeAlerts: true });
        const memoryAlert = report.alerts.find(alert => alert.type === 'memory_usage');
        
        expect(memoryAlert).toBeDefined();
        expect(memoryAlert.value).toBeGreaterThan(80);
      });

      test('should generate alerts for high fallback usage', () => {
        const fallbackTracker = new UsageTracker();
        
        // Add requests with high fallback usage
        for (let i = 0; i < 10; i++) {
          fallbackTracker.trackUsage(`fallback-job-${i}`, {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            fallbackUsed: i < 6 // 60% fallback usage
          });
        }

        const report = fallbackTracker.getUsageReport({ includeAlerts: true });
        const fallbackAlert = report.alerts.find(alert => alert.type === 'fallback_usage');
        
        expect(fallbackAlert).toBeDefined();
        expect(fallbackAlert.severity).toBe('critical'); // 60% fallback rate
        expect(fallbackAlert.value).toBe(60);
      });

      test('should not generate alerts for healthy system', () => {
        const report = usageTracker.getUsageReport({ includeAlerts: true });
        
        // Should have minimal or no critical alerts for our test data
        const criticalAlerts = report.alerts.filter(alert => alert.severity === 'critical');
        expect(criticalAlerts.length).toBeLessThanOrEqual(1);
      });
    });

    describe('Structured Logging', () => {
      test('should log structured reports for external monitoring', () => {
        const logger = require('../../src/utils/logger');
        
        usageTracker.getUsageReport();
        
        // Verify structured logging was called
        expect(logger.info).toHaveBeenCalledWith(
          'Usage monitoring report generated',
          expect.objectContaining({
            component: 'usage_tracker',
            structured: true
          })
        );
      });

      test('should log real-time metrics with structured format', () => {
        const logger = require('../../src/utils/logger');
        
        usageTracker.getRealTimeMetrics();
        
        // Verify structured logging was called
        expect(logger.info).toHaveBeenCalledWith(
          'Real-time usage metrics',
          expect.objectContaining({
            component: 'usage_tracker',
            structured: true
          })
        );
      });

      test('should log export activities for audit trail', () => {
        const logger = require('../../src/utils/logger');
        
        usageTracker.exportForMonitoring();
        
        // Verify export logging was called
        expect(logger.info).toHaveBeenCalledWith(
          'Usage data exported for monitoring',
          expect.objectContaining({
            structured: true
          })
        );
      });
    });
  });
});