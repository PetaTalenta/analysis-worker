/**
 * Comprehensive Audit Logging Service
 * Provides structured audit logging for compliance and monitoring
 */

const winston = require('winston');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Audit event categories
const AUDIT_CATEGORIES = {
  JOB_PROCESSING: 'JOB_PROCESSING',
  AI_OPERATIONS: 'AI_OPERATIONS',
  TOKEN_USAGE: 'TOKEN_USAGE',
  DATA_ACCESS: 'DATA_ACCESS',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM',
  COMPLIANCE: 'COMPLIANCE'
};

// Audit event types
const AUDIT_EVENTS = {
  JOB_RECEIVED: 'JOB_RECEIVED',
  JOB_STARTED: 'JOB_STARTED',
  JOB_COMPLETED: 'JOB_COMPLETED',
  JOB_FAILED: 'JOB_FAILED',
  JOB_DUPLICATE_DETECTED: 'JOB_DUPLICATE_DETECTED',
  AI_REQUEST_SENT: 'AI_REQUEST_SENT',
  AI_RESPONSE_RECEIVED: 'AI_RESPONSE_RECEIVED',
  TOKEN_COUNTED: 'TOKEN_COUNTED',
  TOKEN_REFUNDED: 'TOKEN_REFUNDED',
  DATA_ACCESSED: 'DATA_ACCESSED',
  DATA_SAVED: 'DATA_SAVED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SYSTEM_ERROR: 'SYSTEM_ERROR'
};

// Risk levels
const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

class AuditLogger {
  constructor() {
    this.auditDir = process.env.AUDIT_LOG_DIR || 'logs/audit';
    this.encryptionKey = process.env.AUDIT_ENCRYPTION_KEY || this.generateEncryptionKey();
    this.retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '2555'); // 7 years default
    
    this.initializeAuditLogger();
    this.startCleanupScheduler();
  }

  /**
   * Initialize audit logger with secure file transport
   */
  async initializeAuditLogger() {
    // Ensure audit directory exists
    try {
      await fs.mkdir(this.auditDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create audit directory:', error);
    }

    // Create audit logger with encryption
    this.auditLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS'
        }),
        winston.format.json(),
        winston.format.printf((info) => {
          // Encrypt sensitive data
          const encrypted = this.encryptAuditData(info);
          return JSON.stringify(encrypted);
        })
      ),
      transports: [
        // Daily rotating audit files
        new winston.transports.File({
          filename: path.join(this.auditDir, 'audit-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '100m',
          maxFiles: `${this.retentionDays}d`,
          zippedArchive: true
        }),
        // High-risk events in separate file
        new winston.transports.File({
          filename: path.join(this.auditDir, 'high-risk-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '50m',
          maxFiles: `${this.retentionDays}d`,
          level: 'warn',
          zippedArchive: true
        })
      ]
    });

    console.log('Audit Logger initialized with encryption');
  }

  /**
   * Generate encryption key for audit data
   */
  generateEncryptionKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Encrypt sensitive audit data
   */
  encryptAuditData(data) {
    try {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const cipher = crypto.createCipheriv(algorithm, key, iv);

      // Clone data to avoid mutation
      const clonedData = JSON.parse(JSON.stringify(data));

      // Encrypt sensitive fields
      if (clonedData.personalData) {
        const encrypted = cipher.update(JSON.stringify(clonedData.personalData), 'utf8', 'hex');
        const finalEncrypted = cipher.final('hex');
        const authTag = cipher.getAuthTag();

        clonedData.personalData = {
          encrypted: encrypted + finalEncrypted,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex')
        };
      }

      return clonedData;
    } catch (error) {
      console.error('Audit encryption failed:', error);
      return data; // Return unencrypted if encryption fails
    }
  }

  /**
   * Log audit event
   * @param {String} category - Event category
   * @param {String} eventType - Event type
   * @param {Object} data - Event data
   * @param {String} riskLevel - Risk level
   */
  logEvent(category, eventType, data = {}, riskLevel = RISK_LEVELS.LOW) {
    const auditEvent = {
      auditId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      eventType,
      riskLevel,
      service: 'analysis-worker',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      ...data
    };

    // Add correlation ID if available
    if (data.jobId) {
      auditEvent.correlationId = data.jobId;
    }

    // Log based on risk level
    switch (riskLevel) {
      case RISK_LEVELS.CRITICAL:
        this.auditLogger.error('CRITICAL_AUDIT_EVENT', auditEvent);
        break;
      case RISK_LEVELS.HIGH:
        this.auditLogger.warn('HIGH_RISK_AUDIT_EVENT', auditEvent);
        break;
      case RISK_LEVELS.MEDIUM:
        this.auditLogger.info('MEDIUM_RISK_AUDIT_EVENT', auditEvent);
        break;
      default:
        this.auditLogger.info('AUDIT_EVENT', auditEvent);
    }

    // Real-time alerting for high-risk events
    if (riskLevel === RISK_LEVELS.HIGH || riskLevel === RISK_LEVELS.CRITICAL) {
      this.triggerAlert(auditEvent);
    }
  }

  /**
   * Log job processing events
   */
  logJobEvent(eventType, jobData, additionalData = {}) {
    const eventData = {
      jobId: jobData.jobId,
      userId: jobData.userId,
      userEmail: this.hashPII(jobData.userEmail),
      assessmentType: jobData.assessmentName,
      retryCount: jobData.retryCount || 0,
      ...additionalData
    };

    let riskLevel = RISK_LEVELS.LOW;
    if (eventType === AUDIT_EVENTS.JOB_FAILED) {
      riskLevel = RISK_LEVELS.MEDIUM;
    }
    if (eventType === AUDIT_EVENTS.JOB_DUPLICATE_DETECTED) {
      riskLevel = RISK_LEVELS.HIGH;
    }

    this.logEvent(AUDIT_CATEGORIES.JOB_PROCESSING, eventType, eventData, riskLevel);
  }

  /**
   * Log AI operations
   */
  logAIEvent(eventType, jobId, aiData = {}) {
    const eventData = {
      jobId,
      model: aiData.model,
      temperature: aiData.temperature,
      inputTokens: aiData.inputTokens,
      outputTokens: aiData.outputTokens,
      estimatedCost: aiData.estimatedCost,
      responseTime: aiData.responseTime,
      useMockModel: aiData.useMockModel
    };

    this.logEvent(AUDIT_CATEGORIES.AI_OPERATIONS, eventType, eventData, RISK_LEVELS.LOW);
  }

  /**
   * Log token usage events
   */
  logTokenEvent(eventType, jobId, tokenData = {}) {
    const eventData = {
      jobId,
      inputTokens: tokenData.inputTokens,
      outputTokens: tokenData.outputTokens,
      totalTokens: tokenData.totalTokens,
      estimatedCost: tokenData.estimatedCost,
      model: tokenData.model,
      fallbackUsed: tokenData.fallbackUsed
    };

    this.logEvent(AUDIT_CATEGORIES.TOKEN_USAGE, eventType, eventData, RISK_LEVELS.LOW);
  }

  /**
   * Log security events
   */
  logSecurityEvent(eventType, data = {}, riskLevel = RISK_LEVELS.HIGH) {
    this.logEvent(AUDIT_CATEGORIES.SECURITY, eventType, data, riskLevel);
  }

  /**
   * Log data access events
   */
  logDataAccess(operation, userId, dataType, additionalData = {}) {
    const eventData = {
      operation,
      userId: this.hashPII(userId),
      dataType,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    this.logEvent(AUDIT_CATEGORIES.DATA_ACCESS, AUDIT_EVENTS.DATA_ACCESSED, eventData, RISK_LEVELS.LOW);
  }

  /**
   * Hash PII data for audit logs
   */
  hashPII(data) {
    if (!data) return null;
    return crypto.createHash('sha256').update(data.toString()).digest('hex').substring(0, 16);
  }

  /**
   * Trigger alert for high-risk events
   */
  async triggerAlert(auditEvent) {
    // In production, this would integrate with alerting systems
    console.warn('HIGH-RISK AUDIT EVENT DETECTED:', {
      auditId: auditEvent.auditId,
      category: auditEvent.category,
      eventType: auditEvent.eventType,
      riskLevel: auditEvent.riskLevel,
      timestamp: auditEvent.timestamp
    });

    // Could integrate with:
    // - Slack/Teams notifications
    // - Email alerts
    // - SIEM systems
    // - Monitoring dashboards
  }

  /**
   * Start cleanup scheduler for old audit logs
   */
  startCleanupScheduler() {
    // Run cleanup daily at 2 AM
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    
    setInterval(async () => {
      await this.cleanupOldLogs();
    }, cleanupInterval);
  }

  /**
   * Cleanup old audit logs beyond retention period
   */
  async cleanupOldLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      const files = await fs.readdir(this.auditDir);
      let cleanedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.auditDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        this.logEvent(AUDIT_CATEGORIES.SYSTEM, 'AUDIT_CLEANUP_COMPLETED', {
          cleanedFiles: cleanedCount,
          retentionDays: this.retentionDays
        });
      }
    } catch (error) {
      this.logEvent(AUDIT_CATEGORIES.SYSTEM, 'AUDIT_CLEANUP_FAILED', {
        error: error.message
      }, RISK_LEVELS.MEDIUM);
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate, endDate) {
    // This would generate compliance reports for auditors
    const reportData = {
      reportId: crypto.randomUUID(),
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      // Report data would be extracted from audit logs
    };

    this.logEvent(AUDIT_CATEGORIES.COMPLIANCE, 'COMPLIANCE_REPORT_GENERATED', reportData);
    return reportData;
  }
}

// Export singleton instance
const auditLogger = new AuditLogger();

module.exports = {
  auditLogger,
  AUDIT_CATEGORIES,
  AUDIT_EVENTS,
  RISK_LEVELS
};
