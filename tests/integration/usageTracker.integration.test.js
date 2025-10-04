/**
 * Integration tests for UsageTracker service
 */

const UsageTracker = require('../../src/services/usageTracker');
const TokenCounterService = require('../../src/services/tokenCounterService');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('UsageTracker Integration', () => {
  let usageTracker;
  let tokenCounterService;

  beforeEach(() => {
    usageTracker = new UsageTracker({
      maxRecords: 100,
      retentionDays: 7
    });
    tokenCounterService = new TokenCounterService();
  });

  afterEach(() => {
    if (usageTracker) {
      usageTracker.destroy();
    }
  });

  describe('Integration with TokenCounterService', () => {
    test('should track usage from mock token counting', async () => {
      const jobId = 'integration-test-1';
      const testContent = 'This is a test prompt for token counting';

      // Get mock token count
      const tokenData = await tokenCounterService.getMockTokenCount(testContent, jobId);
      
      // Track the usage
      usageTracker.trackUsage(jobId, tokenData);

      // Verify tracking
      const stats = usageTracker.getUsageStats('daily');
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.estimatedTotalCost).toBe(0); // Free tier
      expect(stats.mockRequests).toBe(1);
    });

    test('should track usage from token counter cost calculation', () => {
      const jobId = 'integration-test-2';
      const inputTokens = 150;
      const outputTokens = 75;

      // Calculate cost using token counter service
      const estimatedCost = tokenCounterService.calculateEstimatedCost(inputTokens, outputTokens);

      // Create token data
      const tokenData = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCost,
        success: true,
        model: 'gemini-pro'
      };

      // Track the usage
      usageTracker.trackUsage(jobId, tokenData);

      // Verify tracking
      const stats = usageTracker.getUsageStats('daily');
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalInputTokens).toBe(inputTokens);
      expect(stats.totalOutputTokens).toBe(outputTokens);
      expect(stats.totalTokens).toBe(inputTokens + outputTokens);
      expect(stats.estimatedTotalCost).toBe(estimatedCost);
      expect(stats.successfulRequests).toBe(1);
    });

    test('should handle multiple token counting scenarios', async () => {
      const scenarios = [
        {
          jobId: 'scenario-1',
          content: 'Short prompt',
          success: true
        },
        {
          jobId: 'scenario-2', 
          content: 'This is a much longer prompt that should result in more tokens being counted and tracked',
          success: true
        },
        {
          jobId: 'scenario-3',
          content: 'Failed request simulation',
          success: false
        }
      ];

      // Process each scenario
      for (const scenario of scenarios) {
        const tokenData = await tokenCounterService.getMockTokenCount(scenario.content, scenario.jobId);
        tokenData.success = scenario.success;
        
        usageTracker.trackUsage(scenario.jobId, tokenData);
      }

      // Verify aggregated statistics
      const stats = usageTracker.getUsageStats('daily');
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(2);
      expect(stats.failedRequests).toBe(1);
      expect(stats.mockRequests).toBe(3);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.estimatedTotalCost).toBe(0); // Free tier
    });

    test('should track usage over time periods', async () => {
      // Add data for current time (no mocking needed for this test)
      const testData = ['Test prompt 1', 'Test prompt 2', 'Test prompt 3'];
      
      for (let i = 0; i < testData.length; i++) {
        const tokenData = await tokenCounterService.getMockTokenCount(testData[i], `time-test-${i}`);
        usageTracker.trackUsage(`time-test-${i}`, tokenData);
      }

      // Test daily statistics (should include all records from today)
      const dailyStats = usageTracker.getDailyUsage();
      expect(dailyStats.totalRequests).toBe(3);

      // Test weekly statistics  
      const weeklyStats = usageTracker.getWeeklyUsage();
      expect(weeklyStats.totalRequests).toBe(3);

      // Test monthly statistics
      const now = new Date();
      const monthlyStats = usageTracker.getMonthlyUsage(now.getFullYear(), now.getMonth());
      expect(monthlyStats.totalRequests).toBe(3);
    });

    test('should export usage data with token counter integration', async () => {
      const testData = [
        { content: 'Export test 1', success: true, mock: false },
        { content: 'Export test 2', success: true, mock: true },
        { content: 'Export test 3', success: false, mock: false }
      ];

      // Add test data
      for (let i = 0; i < testData.length; i++) {
        const tokenData = await tokenCounterService.getMockTokenCount(testData[i].content, `export-${i}`);
        tokenData.success = testData[i].success;
        tokenData.mock = testData[i].mock;
        
        usageTracker.trackUsage(`export-${i}`, tokenData);
      }

      // Test JSON export
      const jsonExport = usageTracker.exportUsageData();
      expect(jsonExport).toHaveLength(3);
      expect(jsonExport[0]).toHaveProperty('inputTokens');
      expect(jsonExport[0]).toHaveProperty('outputTokens');
      expect(jsonExport[0]).toHaveProperty('estimatedCost');

      // Test CSV export
      const csvExport = usageTracker.exportUsageData({ format: 'csv' });
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('inputTokens');
      expect(csvExport).toContain('outputTokens');
      expect(csvExport).toContain('estimatedCost');

      // Test filtered export
      const successOnlyExport = usageTracker.exportUsageData({ includeFailures: false });
      expect(successOnlyExport).toHaveLength(2);
      expect(successOnlyExport.every(record => record.success)).toBe(true);
    });
  });

  describe('Performance and Memory Management', () => {
    test('should handle large volumes of usage data efficiently', async () => {
      const startTime = Date.now();
      const recordCount = 1000;

      // Add large volume of data
      for (let i = 0; i < recordCount; i++) {
        const tokenData = {
          inputTokens: 100 + (i % 50),
          outputTokens: 50 + (i % 25),
          totalTokens: 150 + (i % 75),
          estimatedCost: 0.0001 + (i % 10) * 0.00001,
          success: i % 10 !== 0, // 10% failure rate
          model: i % 3 === 0 ? 'gemini-pro' : 'gemini-flash'
        };

        usageTracker.trackUsage(`perf-test-${i}`, tokenData);
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Verify performance (should complete within reasonable time)
      expect(processingTime).toBeLessThan(5000); // 5 seconds max

      // Verify data integrity (limited by buffer size)
      const stats = usageTracker.getUsageStats('daily');
      expect(stats.totalRequests).toBeLessThanOrEqual(100); // Limited by maxRecords
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.successfulRequests + stats.failedRequests).toBe(stats.totalRequests);

      // Verify memory usage is reasonable
      const summary = usageTracker.getCurrentUsageSummary();
      expect(summary.memoryUsageKB).toBeLessThan(1000); // Less than 1MB
    });

    test('should maintain circular buffer limits', () => {
      const smallTracker = new UsageTracker({ maxRecords: 10 });
      
      try {
        // Add more records than buffer size
        for (let i = 0; i < 25; i++) {
          const tokenData = {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            estimatedCost: 0.0001
          };

          smallTracker.trackUsage(`buffer-test-${i}`, tokenData);
        }

        // Verify buffer size is maintained
        const summary = smallTracker.getCurrentUsageSummary();
        expect(summary.totalRecords).toBe(10); // Limited by maxRecords (Math.min behavior)
        expect(smallTracker.usageData.filter(r => r !== null && r !== undefined).length).toBeLessThanOrEqual(10); // Buffer size limit
        
        // Verify the internal counter shows all records were processed
        expect(smallTracker.totalRecords).toBe(25); // Internal counter keeps incrementing

        // Verify statistics still work correctly
        const stats = smallTracker.getUsageStats('daily');
        expect(stats.totalRequests).toBeLessThanOrEqual(10); // Only buffer size records available

      } finally {
        smallTracker.destroy();
      }
    });
  });

  describe('Reporting and Monitoring Integration', () => {
    beforeEach(async () => {
      // Set up comprehensive test data with token counter integration
      const testScenarios = [
        { content: 'Successful request 1', success: true, mock: false, fallback: false },
        { content: 'Successful request 2', success: true, mock: false, fallback: false },
        { content: 'Mock request for testing', success: true, mock: true, fallback: false },
        { content: 'Failed request with fallback', success: false, mock: false, fallback: true },
        { content: 'Another successful request', success: true, mock: false, fallback: false }
      ];

      for (let i = 0; i < testScenarios.length; i++) {
        const scenario = testScenarios[i];
        let tokenData;

        if (scenario.mock) {
          tokenData = await tokenCounterService.getMockTokenCount(scenario.content, `report-${i}`);
        } else {
          // Simulate real token counting result
          tokenData = {
            inputTokens: 100 + i * 20,
            outputTokens: 50 + i * 10,
            totalTokens: 150 + i * 30,
            estimatedCost: tokenCounterService.calculateEstimatedCost(100 + i * 20, 50 + i * 10),
            success: scenario.success,
            mock: scenario.mock,
            fallbackUsed: scenario.fallback,
            model: i % 2 === 0 ? 'gemini-pro' : 'gemini-flash'
          };
        }

        usageTracker.trackUsage(`report-${i}`, tokenData, { responseTime: 1000 + i * 200 });
      }
    });

    test('should generate comprehensive usage reports with token counter integration', () => {
      const report = usageTracker.getUsageReport({
        timeframe: 'daily',
        includePerformanceMetrics: true,
        includeDetailedBreakdown: true,
        includeAlerts: true
      });

      // Verify report structure and data
      expect(report.usage.totalRequests).toBe(5);
      expect(report.usage.successfulRequests).toBe(4);
      expect(report.usage.failedRequests).toBe(1);
      expect(report.usage.successRate).toBe(80);

      // Verify token data integration
      expect(report.usage.tokens.totalTokens).toBeGreaterThan(0);
      expect(report.usage.cost.estimatedTotalCost).toBe(0); // Free tier

      // Verify performance metrics include token counting data
      expect(report.performance.averageResponseTime).toBeGreaterThan(0);
      expect(report.performance.tokenCountingLatency).toBeGreaterThan(0);
      expect(report.performance.fallbackUsageRate).toBe(20); // 1 out of 5
      expect(report.performance.mockUsageRate).toBe(20); // 1 out of 5

      // Verify detailed breakdown
      expect(report.breakdown.models).toHaveProperty('gemini-pro');
      expect(report.breakdown.models).toHaveProperty('gemini-flash');
      expect(report.breakdown.requestTypes.successful).toBe(4);
      expect(report.breakdown.requestTypes.failed).toBe(1);
      expect(report.breakdown.requestTypes.mock).toBe(1);
      expect(report.breakdown.requestTypes.fallback).toBe(1);
    });

    test('should provide real-time metrics with token counter data', () => {
      const metrics = usageTracker.getRealTimeMetrics();

      // Verify real-time metrics structure
      expect(metrics.current.last24Hours.requests).toBe(5);
      expect(metrics.current.last24Hours.tokens).toBeGreaterThan(0);
      expect(metrics.current.last24Hours.cost).toBe(0); // Free tier
      expect(metrics.current.last24Hours.successRate).toBe(80);

      // Verify system health indicators
      expect(metrics.system.status).toBe('healthy');
      expect(typeof metrics.system.isHealthy).toBe('boolean');
      expect(metrics.system.bufferUtilization).toBeGreaterThan(0);

      // Verify performance indicators
      expect(metrics.performance.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.performance.tokenCountingLatency).toBeGreaterThan(0);
      expect(metrics.performance.errorRate).toBe(20); // 1 failed out of 5
    });

    test('should export monitoring data with token counter integration', () => {
      const exportResult = usageTracker.exportForMonitoring({
        format: 'json',
        timeframe: 'daily',
        includeMetadata: true
      });

      // Verify export structure
      expect(exportResult.metadata.recordCount).toBe(5);
      expect(exportResult.summary.totalRequests).toBe(5);
      expect(exportResult.summary.totalTokens).toBeGreaterThan(0);
      expect(exportResult.summary.estimatedTotalCost).toBe(0); // Free tier

      // Verify data includes token counter information
      expect(exportResult.data).toHaveLength(5);
      exportResult.data.forEach(record => {
        expect(record).toHaveProperty('inputTokens');
        expect(record).toHaveProperty('outputTokens');
        expect(record).toHaveProperty('totalTokens');
        expect(record).toHaveProperty('estimatedCost');
        expect(record).toHaveProperty('model');
      });

      // Verify token counter specific fields
      const mockRecord = exportResult.data.find(record => record.mock);
      expect(mockRecord).toBeDefined();
      expect(mockRecord.mock).toBe(true);

      const fallbackRecord = exportResult.data.find(record => record.fallbackUsed);
      expect(fallbackRecord).toBeDefined();
      expect(fallbackRecord.fallbackUsed).toBe(true);
    });

    test('should generate appropriate alerts based on token counter data', () => {
      // Create scenario with high fallback usage
      const alertTracker = new UsageTracker();
      
      try {
        // Add data with high fallback rate
        for (let i = 0; i < 10; i++) {
          const tokenData = {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
            estimatedCost: tokenCounterService.calculateEstimatedCost(100, 50),
            success: true,
            fallbackUsed: i < 7, // 70% fallback usage
            model: 'gemini-pro'
          };

          alertTracker.trackUsage(`alert-${i}`, tokenData);
        }

        const report = alertTracker.getUsageReport({ includeAlerts: true });
        
        // Should generate fallback usage alert
        const fallbackAlert = report.alerts.find(alert => alert.type === 'fallback_usage');
        expect(fallbackAlert).toBeDefined();
        expect(fallbackAlert.severity).toBe('critical');
        expect(fallbackAlert.value).toBe(70);

      } finally {
        alertTracker.destroy();
      }
    });

    test('should handle mixed token counter scenarios in reporting', async () => {
      const mixedTracker = new UsageTracker();
      
      try {
        // Mix of real token counting, mock, and fallback scenarios
        const scenarios = [
          { type: 'mock', content: 'Mock test' },
          { type: 'real', inputTokens: 200, outputTokens: 100 },
          { type: 'fallback', content: 'Fallback test', fallback: true },
          { type: 'failed', content: 'Failed test', success: false }
        ];

        for (let i = 0; i < scenarios.length; i++) {
          const scenario = scenarios[i];
          let tokenData;

          switch (scenario.type) {
            case 'mock':
              tokenData = await tokenCounterService.getMockTokenCount(scenario.content, `mixed-${i}`);
              break;
            case 'real':
              tokenData = {
                inputTokens: scenario.inputTokens,
                outputTokens: scenario.outputTokens,
                totalTokens: scenario.inputTokens + scenario.outputTokens,
                estimatedCost: tokenCounterService.calculateEstimatedCost(scenario.inputTokens, scenario.outputTokens),
                success: true,
                model: 'gemini-pro'
              };
              break;
            case 'fallback':
              tokenData = {
                inputTokens: 80,
                outputTokens: 40,
                totalTokens: 120,
                estimatedCost: tokenCounterService.calculateEstimatedCost(80, 40),
                success: true,
                fallbackUsed: true,
                model: 'gemini-pro'
              };
              break;
            case 'failed':
              tokenData = {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                estimatedCost: 0,
                success: false,
                model: 'gemini-pro'
              };
              break;
          }

          mixedTracker.trackUsage(`mixed-${i}`, tokenData);
        }

        // Generate comprehensive report
        const report = mixedTracker.getUsageReport({
          includePerformanceMetrics: true,
          includeDetailedBreakdown: true,
          includeAlerts: true
        });

        // Verify mixed scenario handling
        expect(report.usage.totalRequests).toBe(4);
        expect(report.usage.successfulRequests).toBe(3);
        expect(report.usage.failedRequests).toBe(1);
        expect(report.breakdown.requestTypes.mock).toBe(1);
        expect(report.breakdown.requestTypes.fallback).toBe(1);
        expect(report.performance.mockUsageRate).toBe(25);
        expect(report.performance.fallbackUsageRate).toBe(25);

      } finally {
        mixedTracker.destroy();
      }
    });

    test('should maintain performance with frequent reporting calls', () => {
      const startTime = Date.now();
      
      // Generate multiple reports rapidly
      for (let i = 0; i < 50; i++) {
        usageTracker.getUsageReport();
        usageTracker.getRealTimeMetrics();
        usageTracker.exportForMonitoring();
      }

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time even with frequent calls
      expect(processingTime).toBeLessThan(2000); // 2 seconds max for 150 operations
    });
  });
});