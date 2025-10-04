/**
 * Stuck Job Monitor Service
 * 
 * Automatically detects and fixes jobs that are stuck in processing status
 * but already have completed analysis results
 */

const logger = require('../utils/logger');
const { Pool } = require('pg');

class StuckJobMonitor {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.monitorIntervalMs = 15 * 60 * 1000; // Check every 15 minutes
    
    // Database connection
    this.pool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'atma_db',
      user: process.env.DB_USER || 'atma_user',
      password: process.env.DB_PASSWORD
    });
  }

  /**
   * Start monitoring for stuck jobs
   */
  start() {
    if (this.isRunning) {
      logger.warn('Stuck job monitor is already running');
      return;
    }

    logger.info('Starting stuck job monitor', {
      intervalMs: this.monitorIntervalMs
    });

    this.isRunning = true;
    
    // Run initial check
    this.checkAndFixStuckJobs().catch(error => {
      logger.error('Error in initial stuck job check', { error: error.message });
    });

    // Set up periodic monitoring
    this.interval = setInterval(() => {
      this.checkAndFixStuckJobs().catch(error => {
        logger.error('Error in periodic stuck job check', { error: error.message });
      });
    }, this.monitorIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping stuck job monitor');
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.isRunning = false;
  }

  /**
   * Check for stuck jobs and fix them
   */
  async checkAndFixStuckJobs() {
    const client = await this.pool.connect();
    
    try {
      logger.debug('Checking for stuck jobs...');

      // Query 1: Find jobs that are stuck in processing but have corresponding analysis results
      const stuckJobsWithResultsQuery = `
        SELECT 
          aj.id,
          aj.job_id,
          aj.user_id,
          aj.status,
          aj.created_at,
          aj.updated_at,
          ar.id as result_id,
          ar.created_at as result_created_at,
          u.email,
          EXTRACT(EPOCH FROM (NOW() - aj.updated_at))/3600 as hours_stuck,
          'has_result' as stuck_type
        FROM archive.analysis_jobs aj
        JOIN auth.users u ON aj.user_id = u.id
        LEFT JOIN archive.analysis_results ar ON aj.user_id = ar.user_id 
          AND ar.created_at >= aj.created_at 
          AND ar.created_at <= aj.created_at + INTERVAL '10 minutes'
        WHERE aj.status = 'processing'
          AND ar.id IS NOT NULL
          AND aj.updated_at < NOW() - INTERVAL '30 minutes'
        ORDER BY aj.created_at ASC
      `;

      // Query 2: Find jobs that are stuck in processing for too long without results (timeout)
      const stuckJobsTimeoutQuery = `
        SELECT 
          aj.id,
          aj.job_id,
          aj.user_id,
          aj.status,
          aj.created_at,
          aj.updated_at,
          NULL as result_id,
          NULL as result_created_at,
          u.email,
          EXTRACT(EPOCH FROM (NOW() - aj.updated_at))/3600 as hours_stuck,
          'timeout' as stuck_type
        FROM archive.analysis_jobs aj
        JOIN auth.users u ON aj.user_id = u.id
        WHERE aj.status = 'processing'
          AND aj.updated_at < NOW() - INTERVAL '2 hours'
        ORDER BY aj.created_at ASC
      `;

      const [resultWithResults, resultTimeout] = await Promise.all([
        client.query(stuckJobsWithResultsQuery),
        client.query(stuckJobsTimeoutQuery)
      ]);

      // Combine results and deduplicate
      const allStuckJobs = [...resultWithResults.rows, ...resultTimeout.rows];
      const uniqueStuckJobs = allStuckJobs.filter((job, index, arr) => 
        arr.findIndex(j => j.id === job.id) === index
      );

      if (uniqueStuckJobs.length === 0) {
        logger.debug('No stuck jobs found');
        return { fixed: 0, total: 0 };
      }

      logger.info(`Found ${uniqueStuckJobs.length} stuck jobs to fix`, {
        stuckJobs: uniqueStuckJobs.map(job => ({
          jobId: job.job_id,
          email: job.email,
          hoursStuck: Math.round(job.hours_stuck * 100) / 100,
          type: job.stuck_type
        }))
      });

      let fixedCount = 0;

      // Fix each stuck job
      for (const job of uniqueStuckJobs) {
        try {
          await this.fixStuckJob(client, job);
          fixedCount++;
        } catch (error) {
          logger.error('Failed to fix stuck job', {
            jobId: job.job_id,
            email: job.email,
            error: error.message
          });
        }
      }

      logger.info('Stuck job monitor completed', {
        totalFound: uniqueStuckJobs.length,
        fixed: fixedCount,
        failed: uniqueStuckJobs.length - fixedCount
      });

      return { fixed: fixedCount, total: uniqueStuckJobs.length };

    } catch (error) {
      logger.error('Error in stuck job monitoring', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fix a specific stuck job
   */
  async fixStuckJob(client, job) {
    await client.query('BEGIN');

    try {
      logger.info('Fixing stuck job', {
        jobId: job.job_id,
        email: job.email,
        resultId: job.result_id,
        stuckType: job.stuck_type,
        hoursStuck: Math.round(job.hours_stuck * 100) / 100
      });

      if (job.stuck_type === 'has_result' && job.result_id) {
        // Case 1: Job has result but status is stuck - mark as completed
        const updateQuery = `
          UPDATE archive.analysis_jobs
          SET 
            status = 'completed',
            result_id = $1,
            completed_at = $2,
            updated_at = NOW()
          WHERE job_id = $3
        `;

        const updateResult = await client.query(updateQuery, [
          job.result_id,
          job.result_created_at,
          job.job_id
        ]);

        if (updateResult.rowCount === 0) {
          throw new Error('Job not found or already updated');
        }

        logger.info('Successfully fixed stuck job with existing result', {
          jobId: job.job_id,
          email: job.email,
          resultId: job.result_id
        });

      } else {
        // Case 2: Job has been processing too long without result - mark as failed
        const updateQuery = `
          UPDATE archive.analysis_jobs
          SET 
            status = 'failed',
            error_message = $1,
            updated_at = NOW()
          WHERE job_id = $2
        `;

        const errorMessage = `Job timed out after ${Math.round(job.hours_stuck * 100) / 100} hours. No result was produced.`;
        const updateResult = await client.query(updateQuery, [
          errorMessage,
          job.job_id
        ]);

        if (updateResult.rowCount === 0) {
          throw new Error('Job not found or already updated');
        }

        logger.info('Successfully marked timed out job as failed', {
          jobId: job.job_id,
          email: job.email,
          hoursStuck: Math.round(job.hours_stuck * 100) / 100
        });
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to fix stuck job', {
        jobId: job.job_id,
        email: job.email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get monitoring statistics
   */
  async getStats() {
    const client = await this.pool.connect();
    
    try {
      const statsQuery = `
        SELECT 
          COUNT(CASE WHEN aj.status = 'processing' AND ar.id IS NOT NULL THEN 1 END) as stuck_jobs,
          COUNT(CASE WHEN aj.status = 'processing' THEN 1 END) as total_processing,
          COUNT(CASE WHEN aj.status = 'completed' THEN 1 END) as total_completed,
          COUNT(CASE WHEN aj.status = 'failed' THEN 1 END) as total_failed
        FROM archive.analysis_jobs aj
        LEFT JOIN archive.analysis_results ar ON aj.user_id = ar.user_id 
          AND ar.created_at >= aj.created_at 
          AND ar.created_at <= aj.created_at + INTERVAL '10 minutes'
        WHERE aj.created_at >= NOW() - INTERVAL '24 hours'
      `;

      const result = await client.query(statsQuery);
      return result.rows[0];

    } finally {
      client.release();
    }
  }

  /**
   * Manually trigger a check (for testing/admin use)
   */
  async manualCheck() {
    logger.info('Manual stuck job check triggered');
    return await this.checkAndFixStuckJobs();
  }
}

module.exports = new StuckJobMonitor();
