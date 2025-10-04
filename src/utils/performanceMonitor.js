/**
 * Performance Monitor
 * Phase 4: Monitoring & Metrics
 * 
 * Real-time monitoring untuk batch processing performance
 */

const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      batchProcessingTime: [],
      httpConnectionReuse: 0,
      queueDepth: 0,
      errorRate: 0,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };
    
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
    
    // Start periodic reporting
    this.startPeriodicReporting();
  }

  recordBatchProcessing(startTime, batchSize, success = true) {
    const duration = Date.now() - startTime;
    const record = {
      duration,
      batchSize,
      timestamp: Date.now(),
      success
    };
    
    this.metrics.batchProcessingTime.push(record);
    this.metrics.totalOperations++;
    
    if (success) {
      this.metrics.successfulOperations++;
    } else {
      this.metrics.failedOperations++;
    }

    // Keep only last 100 records untuk memory efficiency
    if (this.metrics.batchProcessingTime.length > 100) {
      this.metrics.batchProcessingTime.shift();
    }
    
    logger.debug('Batch processing recorded', {
      duration,
      batchSize,
      success,
      totalOperations: this.metrics.totalOperations
    });
  }

  recordHttpConnectionReuse() {
    this.metrics.httpConnectionReuse++;
  }

  updateQueueDepth(depth) {
    this.metrics.queueDepth = depth;
  }

  getAverageProcessingTime() {
    const times = this.metrics.batchProcessingTime;
    if (times.length === 0) return 0;
    
    const total = times.reduce((sum, record) => sum + record.duration, 0);
    return total / times.length;
  }

  getSuccessRate() {
    if (this.metrics.totalOperations === 0) return 100;
    return (this.metrics.successfulOperations / this.metrics.totalOperations) * 100;
  }

  getThroughput() {
    const uptime = Date.now() - this.startTime;
    const uptimeInSeconds = uptime / 1000;
    
    if (uptimeInSeconds === 0) return 0;
    return this.metrics.totalOperations / uptimeInSeconds;
  }

  getMetricsSummary() {
    const avgProcessingTime = this.getAverageProcessingTime();
    const successRate = this.getSuccessRate();
    const throughput = this.getThroughput();
    
    return {
      averageProcessingTime: Math.round(avgProcessingTime),
      successRate: Math.round(successRate * 100) / 100,
      throughput: Math.round(throughput * 100) / 100,
      totalOperations: this.metrics.totalOperations,
      successfulOperations: this.metrics.successfulOperations,
      failedOperations: this.metrics.failedOperations,
      currentQueueDepth: this.metrics.queueDepth,
      httpConnectionReuse: this.metrics.httpConnectionReuse,
      uptime: Math.round((Date.now() - this.startTime) / 1000)
    };
  }

  startPeriodicReporting() {
    // Report metrics every 5 minutes
    setInterval(() => {
      const summary = this.getMetricsSummary();
      
      logger.info('Performance metrics report', summary);
      
      // Alert jika performance turun
      if (summary.successRate < 95) {
        logger.warn('Low success rate detected', {
          successRate: summary.successRate,
          failedOperations: summary.failedOperations
        });
      }
      
      if (summary.averageProcessingTime > 5000) {
        logger.warn('High processing time detected', {
          averageProcessingTime: summary.averageProcessingTime
        });
      }
      
      if (summary.currentQueueDepth > 1000) {
        logger.warn('High queue depth detected', {
          queueDepth: summary.currentQueueDepth
        });
      }
      
    }, 5 * 60 * 1000); // 5 minutes
  }

  reset() {
    this.metrics = {
      batchProcessingTime: [],
      httpConnectionReuse: 0,
      queueDepth: 0,
      errorRate: 0,
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };
    
    this.startTime = Date.now();
    this.lastReportTime = Date.now();
    
    logger.info('Performance metrics reset');
  }
}

// Singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;
