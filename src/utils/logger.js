/**
 * Logger utility using Winston
 */

const winston = require('winston');
const path = require('path');

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue'
};

// Add colors to winston
winston.addColors(logColors);

// Create human-readable format for console and files
const readableFormat = winston.format.printf(({ timestamp, level, message, correlationId, jobId, userId, userEmail, ...meta }) => {
  // Start with basic log structure
  let log = `${timestamp} [${level.toUpperCase().padEnd(5)}]`;

  // Add correlation/job ID if available for easy tracking
  if (correlationId || jobId) {
    const trackingId = correlationId || jobId;
    log += ` [${trackingId.substring(0, 8)}]`;
  }

  log += ` ${message}`;

  // Add user context if available
  if (userId || userEmail) {
    const userInfo = userEmail ? `${userEmail}` : `user:${userId?.substring(0, 8)}`;
    log += ` (${userInfo})`;
  }

  // Only add important metadata, skip common/verbose fields
  const importantMeta = { ...meta };
  delete importantMeta.service;
  delete importantMeta.version;
  delete importantMeta.environment;

  // Format remaining metadata in a clean way
  if (Object.keys(importantMeta).length > 0) {
    const metaStr = Object.entries(importantMeta)
      .filter(([key, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        // Shorten long values
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const displayValue = stringValue.length > 50 ? stringValue.substring(0, 47) + '...' : stringValue;
        return `${key}=${displayValue}`;
      })
      .join(' ');
    if (metaStr) {
      log += ` | ${metaStr}`;
    }
  }

  return log;
});

// Enhanced console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({
    colors: {
      error: 'red',
      warn: 'yellow',
      info: 'cyan',
      debug: 'gray'
    }
  }),
  readableFormat
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'HH:mm:ss'
    }),
    winston.format.errors({ stack: true })
  ),
  defaultMeta: {
    service: 'analysis-worker'
  },
  transports: [
    // File transport for all logs (human-readable format)
    new winston.transports.File({
      filename: process.env.LOG_FILE || 'logs/analysis-worker.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'MM-dd HH:mm:ss'
        }),
        readableFormat
      )
    }),

    // File transport for error logs only (detailed format for debugging)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.json() // Keep JSON for error analysis
      )
    }),

    // Structured logs for monitoring/parsing (JSON format)
    new winston.transports.File({
      filename: 'logs/structured.log',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Add console transport for all environments
// Development: colored format, Production: JSON format for better parsing
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
} else {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper function to create logger with correlation ID
logger.withCorrelation = (correlationId) => {
  return logger.child({ correlationId });
};

// Helper function to create logger with job context
logger.withJob = (jobId, userId, userEmail) => {
  return logger.child({ jobId, userId, userEmail });
};

// Helper function to create logger with user context
logger.withUser = (userId, userEmail) => {
  return logger.child({ userId, userEmail });
};

module.exports = logger;
