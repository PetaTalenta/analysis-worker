/**
 * Demonstration of Usage Reporting and Monitoring Capabilities
 * 
 * This script demonstrates the new reporting and monitoring features
 * added to the UsageTracker service for token counting operations.
 */

const UsageTracker = require('../src/services/usageTracker');
const TokenCounterService = require('../src/services/tokenCounterService');

// Set NODE_ENV to test to avoid cleanup intervals
process.env.NODE_ENV = 'test';

async function demonstrateUsageReporting() {
  console.log('='.repeat(80));
  console.log('USAGE REPORTING AND MONITORING DEMONSTRATION');
  console.log('='.repeat(80));

  // Initialize services
  const usageTracker = new UsageTracker({
    maxRecords: 50,
    retentionDays: 7
  });
  
  const tokenCounter = new TokenCounterService();

  try {
    console.log('\n1. SIMULATING TOKEN USAGE DATA');
    console.log('-'.repeat(40));

    // Simulate various usage scenarios
    const scenarios = [
      { content: 'Short prompt for testing', success: true, mock: false },
      { content: 'This is a longer prompt that should generate more tokens for comprehensive testing of the token counting system', success: true, mock: false },
      { content: 'Mock request simulation', success: true, mock: true },
      { content: 'Failed request with fallback', success: false, mock: false, fallback: true },
      { content: 'Another successful request', success: true, mock: false },
      { content: 'High-cost request with many tokens', success: true, mock: false },
      { content: 'Quick test', success: true, mock: false },
      { content: 'Error scenario', success: false, mock: false }
    ];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      let tokenData;

      if (scenario.mock) {
        tokenData = await tokenCounter.getMockTokenCount(scenario.content, `demo-${i}`);
      } else {
        // Simulate realistic token data
        const baseTokens = scenario.content.length / 4; // ~4 chars per token
        tokenData = {
          inputTokens: Math.ceil(baseTokens),
          outputTokens: Math.ceil(baseTokens * 0.6), // Typical response ratio
          totalTokens: Math.ceil(baseTokens * 1.6),
          estimatedCost: tokenCounter.calculateEstimatedCost(
            Math.ceil(baseTokens), 
            Math.ceil(baseTokens * 0.6)
          ),
          success: scenario.success,
          mock: scenario.mock || false,
          fallbackUsed: scenario.fallback || false,
          model: i % 2 === 0 ? 'gemini-pro' : 'gemini-flash'
        };
      }

      usageTracker.trackUsage(`demo-${i}`, tokenData, { 
        responseTime: 800 + Math.random() * 1200 
      });

      console.log(`✓ Tracked usage for scenario ${i + 1}: ${scenario.content.substring(0, 30)}...`);
    }

    console.log('\n2. COMPREHENSIVE USAGE REPORT');
    console.log('-'.repeat(40));

    const report = usageTracker.getUsageReport({
      timeframe: 'daily',
      includePerformanceMetrics: true,
      includeDetailedBreakdown: true,
      includeAlerts: true
    });

    console.log('📊 Usage Statistics:');
    console.log(`   Total Requests: ${report.usage.totalRequests}`);
    console.log(`   Success Rate: ${report.usage.successRate}%`);
    console.log(`   Total Tokens: ${report.usage.tokens.totalTokens}`);
    console.log(`   Estimated Cost: $${report.usage.cost.estimatedTotalCost.toFixed(6)}`);
    console.log(`   Average Tokens/Request: ${report.usage.tokens.averageTokensPerRequest}`);

    console.log('\n🔧 Performance Metrics:');
    console.log(`   Average Response Time: ${report.performance.averageResponseTime}ms`);
    console.log(`   Token Counting Latency: ${report.performance.tokenCountingLatency}ms`);
    console.log(`   Error Rate: ${report.performance.errorRate}%`);
    console.log(`   Fallback Usage Rate: ${report.performance.fallbackUsageRate}%`);
    console.log(`   Mock Usage Rate: ${report.performance.mockUsageRate}%`);

    console.log('\n📈 Model Breakdown:');
    Object.entries(report.breakdown.models).forEach(([model, stats]) => {
      console.log(`   ${model}: ${stats.requests} requests, ${stats.totalTokens} tokens, $${stats.estimatedCost.toFixed(6)}`);
    });

    console.log('\n⚠️  Alerts:');
    if (report.alerts.length === 0) {
      console.log('   No alerts - system is healthy');
    } else {
      report.alerts.forEach(alert => {
        console.log(`   [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);
      });
    }

    console.log('\n3. REAL-TIME METRICS');
    console.log('-'.repeat(40));

    const realTimeMetrics = usageTracker.getRealTimeMetrics();

    console.log('⏱️  Current Period:');
    console.log(`   Last Hour: ${realTimeMetrics.current.lastHour.requests} requests, ${realTimeMetrics.current.lastHour.tokens} tokens`);
    console.log(`   Last 24 Hours: ${realTimeMetrics.current.last24Hours.requests} requests, ${realTimeMetrics.current.last24Hours.tokens} tokens`);

    console.log('\n🖥️  System Status:');
    console.log(`   Status: ${realTimeMetrics.system.status}`);
    console.log(`   Buffer Utilization: ${realTimeMetrics.system.bufferUtilization}%`);
    console.log(`   Memory Usage: ${realTimeMetrics.system.memoryUsageKB}KB`);
    console.log(`   Is Healthy: ${realTimeMetrics.system.isHealthy}`);

    console.log('\n4. DATA EXPORT FOR MONITORING');
    console.log('-'.repeat(40));

    const exportResult = usageTracker.exportForMonitoring({
      format: 'json',
      timeframe: 'daily',
      includeMetadata: true
    });

    console.log('📤 Export Summary:');
    console.log(`   Records Exported: ${exportResult.metadata.recordCount}`);
    console.log(`   Export Size: ${JSON.stringify(exportResult).length} bytes`);
    console.log(`   Time Range: ${exportResult.summary.timeRange.start} to ${exportResult.summary.timeRange.end}`);

    console.log('\n5. USAGE STATISTICS BY TIMEFRAME');
    console.log('-'.repeat(40));

    const dailyStats = usageTracker.getDailyUsage();
    const weeklyStats = usageTracker.getWeeklyUsage();
    const monthlyStats = usageTracker.getMonthlyUsage();

    console.log('📅 Daily Usage:');
    console.log(`   Requests: ${dailyStats.totalRequests}, Tokens: ${dailyStats.totalTokens}, Cost: $${dailyStats.estimatedTotalCost.toFixed(6)}`);

    console.log('📅 Weekly Usage:');
    console.log(`   Requests: ${weeklyStats.totalRequests}, Tokens: ${weeklyStats.totalTokens}, Cost: $${weeklyStats.estimatedTotalCost.toFixed(6)}`);

    console.log('📅 Monthly Usage:');
    console.log(`   Requests: ${monthlyStats.totalRequests}, Tokens: ${monthlyStats.totalTokens}, Cost: $${monthlyStats.estimatedTotalCost.toFixed(6)}`);

    console.log('\n6. SYSTEM SUMMARY');
    console.log('-'.repeat(40));

    const summary = usageTracker.getCurrentUsageSummary();
    console.log('💾 Memory and Buffer Status:');
    console.log(`   Total Records: ${summary.totalRecords}`);
    console.log(`   Buffer Utilization: ${summary.bufferUtilization}%`);
    console.log(`   Memory Usage: ${summary.memoryUsageKB}KB`);
    console.log(`   Oldest Record: ${summary.oldestRecord}`);
    console.log(`   Newest Record: ${summary.newestRecord}`);

    console.log('\n' + '='.repeat(80));
    console.log('DEMONSTRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));

    console.log('\n📋 SUMMARY OF NEW CAPABILITIES:');
    console.log('✓ Comprehensive usage reporting with performance metrics');
    console.log('✓ Real-time monitoring metrics for dashboards');
    console.log('✓ Structured logging for external monitoring systems');
    console.log('✓ Data export utilities for analysis and archiving');
    console.log('✓ Automated alert generation for system health');
    console.log('✓ Performance tracking for token counting operations');
    console.log('✓ Detailed breakdown by models, time periods, and request types');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  } finally {
    // Clean up
    usageTracker.destroy();
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateUsageReporting().catch(console.error);
}

module.exports = { demonstrateUsageReporting };