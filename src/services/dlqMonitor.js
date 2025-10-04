/**
 * Dead Letter Queue Monitor Service
 * 
 * Monitors DLQ for failed jobs and provides alerting
 */

const logger = require('../utils/logger');
const rabbitmq = require('../config/rabbitmq');

class DLQMonitor {
  constructor() {
    this.monitoringInterval = null;
    this.isMonitoring = false;
    this.stats = {
      totalDLQMessages: 0,
      lastCheck: null,
      alertThreshold: parseInt(process.env.DLQ_ALERT_THRESHOLD || '10')
    };
  }

  /**
   * Start monitoring DLQ
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      logger.warn('DLQ monitoring is already running');
      return;
    }

    try {
      const channel = await rabbitmq.initialize();
      const intervalMs = parseInt(process.env.DLQ_MONITOR_INTERVAL || '300000'); // 5 minutes

      this.isMonitoring = true;
      logger.info('Starting DLQ monitoring', { 
        interval: intervalMs, 
        alertThreshold: this.stats.alertThreshold 
      });

      // Initial check
      await this.checkDLQ(channel);

      // Schedule periodic checks
      this.monitoringInterval = setInterval(async () => {
        try {
          await this.checkDLQ(channel);
        } catch (error) {
          logger.error('DLQ monitoring check failed', { error: error.message });
        }
      }, intervalMs);

    } catch (error) {
      logger.error('Failed to start DLQ monitoring', { error: error.message });
      throw error;
    }
  }

  /**
   * Check DLQ status
   */
  async checkDLQ(channel) {
    try {
      const queueInfo = await channel.checkQueue(rabbitmq.config.deadLetterQueue);
      
      this.stats.totalDLQMessages = queueInfo.messageCount;
      this.stats.lastCheck = new Date().toISOString();

      logger.debug('DLQ check completed', {
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount
      });

      // Alert if threshold exceeded
      if (queueInfo.messageCount >= this.stats.alertThreshold) {
        await this.sendAlert(queueInfo);
      }

      // Log periodic stats
      if (queueInfo.messageCount > 0) {
        logger.warn('DLQ contains failed messages', {
          messageCount: queueInfo.messageCount,
          threshold: this.stats.alertThreshold,
          lastCheck: this.stats.lastCheck
        });
      }

      return queueInfo;
    } catch (error) {
      logger.error('Failed to check DLQ status', { error: error.message });
      throw error;
    }
  }

  /**
   * Send alert for high DLQ message count
   */
  async sendAlert(queueInfo) {
    const alertData = {
      type: 'DLQ_HIGH_COUNT',
      severity: queueInfo.messageCount > this.stats.alertThreshold * 2 ? 'CRITICAL' : 'WARNING',
      messageCount: queueInfo.messageCount,
      threshold: this.stats.alertThreshold,
      queue: rabbitmq.config.deadLetterQueue,
      timestamp: new Date().toISOString()
    };

    logger.error('DLQ alert triggered', alertData);

    // Here you could integrate with alerting systems like:
    // - Slack notifications
    // - Email alerts
    // - PagerDuty
    // - Discord webhooks
    // For now, we'll log the alert
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats() {
    try {
      const channel = await rabbitmq.initialize();
      const queueInfo = await this.checkDLQ(channel);
      
      return {
        ...this.stats,
        currentMessageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount
      };
    } catch (error) {
      logger.error('Failed to get DLQ stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Manually process DLQ messages (for recovery)
   */
  async processDLQMessages(limit = 10) {
    try {
      const channel = await rabbitmq.initialize();
      const processedMessages = [];

      logger.info('Starting manual DLQ processing', { limit });

      for (let i = 0; i < limit; i++) {
        const message = await channel.get(rabbitmq.config.deadLetterQueue, { noAck: false });
        
        if (!message) {
          break; // No more messages
        }

        try {
          const messageData = JSON.parse(message.content.toString());
          
          // Log the failed message details
          logger.info('Processing DLQ message', {
            jobId: messageData.jobId,
            userId: messageData.userId,
            originalError: message.properties?.headers?.['x-first-death-reason']
          });

          // Here you could implement recovery logic:
          // 1. Requeue if it's a temporary failure
          // 2. Send to manual review queue
          // 3. Update job status to permanently failed
          
          processedMessages.push({
            jobId: messageData.jobId,
            userId: messageData.userId,
            action: 'logged' // or 'requeued', 'failed', etc.
          });

          // Acknowledge the DLQ message
          channel.ack(message);

        } catch (parseError) {
          logger.error('Failed to parse DLQ message', { 
            error: parseError.message,
            messageId: message.properties?.messageId 
          });
          
          // Reject malformed messages
          channel.nack(message, false, false);
        }
      }

      logger.info('DLQ processing completed', { 
        processed: processedMessages.length,
        limit 
      });

      return processedMessages;
    } catch (error) {
      logger.error('Failed to process DLQ messages', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    logger.info('DLQ monitoring stopped');
  }
}

module.exports = new DLQMonitor();
