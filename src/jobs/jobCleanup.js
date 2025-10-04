/**
 * Job Cleanup Service
 * 
 * Automatically cleans up stuck jobs to prevent accumulation
 * and ensures system health.
 */

const logger = require('../utils/logger');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'atma_db',
  user: process.env.DB_USER || 'atma_user',
  password: process.env.DB_PASSWORD || 'password',
  max: 5, // Maximum number of connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * Clean up stuck jobs
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} - Cleanup result
 */
const cleanupStuckJobs = async (options = {}) => {
  const {
    maxProcessingHours = 1, // Jobs stuck for more than 1 hour
    maxQueuedHours = 24,    // Jobs queued for more than 24 hours
    dryRun = false          // If true, only log what would be cleaned
  } = options;

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Find jobs that are stuck in processing state for too long
    const stuckProcessingQuery = `
      SELECT 
        aj.id,
        aj.job_id,
        aj.user_id,
        aj.status,
        aj.created_at,
        aj.updated_at,
        EXTRACT(EPOCH FROM (NOW() - aj.updated_at))/3600 as hours_since_update,
        CASE 
          WHEN ar.user_id IS NOT NULL THEN true 
          ELSE false 
        END as has_completed_result
      FROM archive.analysis_jobs aj
      LEFT JOIN archive.analysis_results ar ON aj.user_id = ar.user_id AND ar.status = 'completed'
      WHERE aj.status = 'processing'
        AND aj.updated_at < NOW() - INTERVAL '${maxProcessingHours} hours'
    `;

    // Find jobs that are stuck in queued state for too long
    const stuckQueuedQuery = `
      SELECT 
        aj.id,
        aj.job_id,
        aj.user_id,
        aj.status,
        aj.created_at,
        aj.updated_at,
        EXTRACT(EPOCH FROM (NOW() - aj.created_at))/3600 as hours_since_created,
        CASE 
          WHEN ar.user_id IS NOT NULL THEN true 
          ELSE false 
        END as has_completed_result
      FROM archive.analysis_jobs aj
      LEFT JOIN archive.analysis_results ar ON aj.user_id = ar.user_id AND ar.status = 'completed'
      WHERE aj.status = 'queued'
        AND aj.created_at < NOW() - INTERVAL '${maxQueuedHours} hours'
    `;

    const stuckProcessingJobs = await client.query(stuckProcessingQuery);
    const stuckQueuedJobs = await client.query(stuckQueuedQuery);

    const allStuckJobs = [
      ...stuckProcessingJobs.rows,
      ...stuckQueuedJobs.rows
    ];

    logger.info('Found stuck jobs for cleanup', {
      processingJobs: stuckProcessingJobs.rows.length,
      queuedJobs: stuckQueuedJobs.rows.length,
      totalStuck: allStuckJobs.length,
      dryRun
    });

    if (allStuckJobs.length === 0) {
      await client.query('COMMIT');
      return {
        success: true,
        cleanedJobs: 0,
        message: 'No stuck jobs found'
      };
    }

    let cleanedCount = 0;
    let skippedCount = 0;

    for (const job of allStuckJobs) {
      const errorMessage = job.has_completed_result 
        ? 'Job timeout - user already has completed results'
        : 'Job timeout - exceeded maximum processing time';

      if (dryRun) {
        logger.info('Would clean up stuck job', {
          jobId: job.job_id,
          userId: job.user_id,
          status: job.status,
          hoursStuck: job.hours_since_update || job.hours_since_created,
          hasCompletedResult: job.has_completed_result,
          errorMessage
        });
        cleanedCount++;
      } else {
        try {
          await client.query(`
            UPDATE archive.analysis_jobs 
            SET 
              status = 'failed',
              updated_at = NOW(),
              error_message = $1
            WHERE id = $2
          `, [errorMessage, job.id]);

          logger.info('Cleaned up stuck job', {
            jobId: job.job_id,
            userId: job.user_id,
            previousStatus: job.status,
            hoursStuck: job.hours_since_update || job.hours_since_created,
            hasCompletedResult: job.has_completed_result
          });

          cleanedCount++;
        } catch (error) {
          logger.error('Failed to clean up stuck job', {
            jobId: job.job_id,
            error: error.message
          });
          skippedCount++;
        }
      }
    }

    await client.query('COMMIT');

    const result = {
      success: true,
      cleanedJobs: cleanedCount,
      skippedJobs: skippedCount,
      totalFound: allStuckJobs.length,
      dryRun
    };

    logger.info('Job cleanup completed', result);
    return result;

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Job cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get job statistics for monitoring
 * @returns {Promise<Object>} - Job statistics
 */
const getJobStatistics = async () => {
  const client = await pool.connect();
  
  try {
    const statsQuery = `
      SELECT 
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest_job,
        MAX(created_at) as newest_job,
        AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600) as avg_age_hours
      FROM archive.analysis_jobs
      GROUP BY status
      ORDER BY count DESC
    `;

    const stuckJobsQuery = `
      SELECT 
        COUNT(*) as stuck_count,
        MIN(created_at) as oldest_stuck,
        MAX(updated_at) as latest_update
      FROM archive.analysis_jobs
      WHERE status IN ('queued', 'processing')
        AND (
          (status = 'processing' AND updated_at < NOW() - INTERVAL '1 hour') OR
          (status = 'queued' AND created_at < NOW() - INTERVAL '24 hours')
        )
    `;

    const [statsResult, stuckResult] = await Promise.all([
      client.query(statsQuery),
      client.query(stuckJobsQuery)
    ]);

    return {
      statusBreakdown: statsResult.rows,
      stuckJobs: stuckResult.rows[0],
      timestamp: new Date().toISOString()
    };

  } finally {
    client.release();
  }
};

/**
 * Start automatic cleanup scheduler
 * @param {Object} options - Scheduler options
 */
const startCleanupScheduler = (options = {}) => {
  const {
    intervalMinutes = 60, // Run every hour
    maxProcessingHours = 1,
    maxQueuedHours = 24
  } = options;

  logger.info('Starting job cleanup scheduler', {
    intervalMinutes,
    maxProcessingHours,
    maxQueuedHours
  });

  // Run initial cleanup
  cleanupStuckJobs({ maxProcessingHours, maxQueuedHours })
    .catch(error => {
      logger.error('Initial cleanup failed', { error: error.message });
    });

  // Schedule periodic cleanup
  const intervalMs = intervalMinutes * 60 * 1000;
  setInterval(async () => {
    try {
      await cleanupStuckJobs({ maxProcessingHours, maxQueuedHours });
    } catch (error) {
      logger.error('Scheduled cleanup failed', { error: error.message });
    }
  }, intervalMs);

  // Schedule periodic statistics logging
  setInterval(async () => {
    try {
      const stats = await getJobStatistics();
      logger.info('Job statistics', stats);
    } catch (error) {
      logger.error('Failed to get job statistics', { error: error.message });
    }
  }, intervalMs * 2); // Log stats every 2 hours
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  logger.info('Shutting down job cleanup service');
  await pool.end();
};

module.exports = {
  cleanupStuckJobs,
  getJobStatistics,
  startCleanupScheduler,
  shutdown
};
