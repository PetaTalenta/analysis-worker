/**
 * Job Status Heartbeat Service
 * 
 * Sends periodic heartbeat updates for long-running jobs
 * to prevent false positive stuck job detection
 */

const logger = require('../utils/logger');
const { updateAnalysisJobStatus } = require('./archiveService');

class JobHeartbeat {
  constructor() {
    this.activeJobs = new Map(); // jobId -> { intervalId, lastHeartbeat, status }
    this.heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL || '30000'); // 30 seconds
  }

  /**
   * Start heartbeat for a job
   */
  startHeartbeat(jobId, userId, status = 'processing') {
    if (this.activeJobs.has(jobId)) {
      logger.debug('Heartbeat already active for job', { jobId });
      return;
    }

    logger.debug('Starting heartbeat for job', { 
      jobId, 
      userId, 
      interval: this.heartbeatInterval 
    });

    // Send initial heartbeat
    this.sendHeartbeat(jobId, userId, status);

    // Schedule periodic heartbeats
    const intervalId = setInterval(() => {
      this.sendHeartbeat(jobId, userId, status);
    }, this.heartbeatInterval);

    // Store job tracking info
    this.activeJobs.set(jobId, {
      intervalId,
      userId,
      status,
      lastHeartbeat: new Date(),
      startTime: new Date()
    });
  }

  /**
   * Send heartbeat update
   */
  async sendHeartbeat(jobId, userId, status) {
    try {
      const jobInfo = this.activeJobs.get(jobId);
      
      if (!jobInfo) {
        logger.warn('Attempted heartbeat for unknown job', { jobId });
        return;
      }

      // Calculate processing duration
      const processingDuration = Date.now() - jobInfo.startTime.getTime();

      // Update job status with heartbeat metadata
      await updateAnalysisJobStatus(jobId, status, {
        last_heartbeat: new Date().toISOString(),
        processing_duration_ms: processingDuration,
        heartbeat_count: (jobInfo.heartbeatCount || 0) + 1
      });

      // Update local tracking
      jobInfo.lastHeartbeat = new Date();
      jobInfo.heartbeatCount = (jobInfo.heartbeatCount || 0) + 1;

      logger.debug('Heartbeat sent for job', { 
        jobId, 
        status, 
        processingDuration: `${Math.round(processingDuration / 1000)}s`,
        heartbeatCount: jobInfo.heartbeatCount
      });

    } catch (error) {
      logger.warn('Failed to send heartbeat', { 
        jobId, 
        error: error.message 
      });
      
      // Don't stop heartbeat on individual failures
      // The job might still be processing successfully
    }
  }

  /**
   * Update heartbeat status
   */
  updateHeartbeatStatus(jobId, newStatus) {
    const jobInfo = this.activeJobs.get(jobId);
    
    if (jobInfo) {
      jobInfo.status = newStatus;
      logger.debug('Updated heartbeat status', { jobId, status: newStatus });
    }
  }

  /**
   * Stop heartbeat for a job
   */
  stopHeartbeat(jobId, finalStatus = null) {
    const jobInfo = this.activeJobs.get(jobId);
    
    if (jobInfo) {
      clearInterval(jobInfo.intervalId);
      this.activeJobs.delete(jobId);
      
      logger.debug('Stopped heartbeat for job', { 
        jobId, 
        finalStatus,
        totalHeartbeats: jobInfo.heartbeatCount || 0,
        totalDuration: `${Math.round((Date.now() - jobInfo.startTime.getTime()) / 1000)}s`
      });

      // Send final status update if provided
      if (finalStatus) {
        this.sendHeartbeat(jobId, jobInfo.userId, finalStatus)
          .catch(error => {
            logger.warn('Failed to send final heartbeat', { 
              jobId, 
              finalStatus,
              error: error.message 
            });
          });
      }
    }
  }

  /**
   * Get active jobs count
   */
  getActiveJobsCount() {
    return this.activeJobs.size;
  }

  /**
   * Get job heartbeat info
   */
  getJobInfo(jobId) {
    const jobInfo = this.activeJobs.get(jobId);
    
    if (!jobInfo) {
      return null;
    }

    return {
      jobId,
      userId: jobInfo.userId,
      status: jobInfo.status,
      lastHeartbeat: jobInfo.lastHeartbeat,
      startTime: jobInfo.startTime,
      heartbeatCount: jobInfo.heartbeatCount || 0,
      processingDuration: Date.now() - jobInfo.startTime.getTime()
    };
  }

  /**
   * Get all active jobs info
   */
  getAllActiveJobs() {
    const activeJobs = [];
    
    for (const [jobId, jobInfo] of this.activeJobs) {
      activeJobs.push(this.getJobInfo(jobId));
    }
    
    return activeJobs;
  }

  /**
   * Clean up stale heartbeats (safety mechanism)
   */
  cleanupStaleHeartbeats() {
    const maxHeartbeatAge = parseInt(process.env.MAX_HEARTBEAT_AGE || '3600000'); // 1 hour
    const now = Date.now();
    const staleJobs = [];

    for (const [jobId, jobInfo] of this.activeJobs) {
      const age = now - jobInfo.startTime.getTime();
      
      if (age > maxHeartbeatAge) {
        staleJobs.push({ jobId, jobInfo, age });
      }
    }

    // Clean up stale heartbeats and mark jobs as failed
    staleJobs.forEach(async ({ jobId, jobInfo, age }) => {
      logger.warn('Cleaning up stale heartbeat and marking job as failed', { 
        jobId,
        userId: jobInfo.userId,
        age: `${Math.round(age / 1000)}s`
      });
      
      // Mark job as failed due to timeout
      try {
        const { updateAnalysisJobStatus } = require('./archiveService');
        await updateAnalysisJobStatus(jobId, 'failed', {
          error_message: `Job timed out after ${Math.round(age / 1000)} seconds. Worker heartbeat stopped responding.`
        });
        
        logger.info('Successfully marked timed out job as failed', {
          jobId,
          userId: jobInfo.userId
        });
      } catch (error) {
        logger.error('Failed to mark timed out job as failed', {
          jobId,
          userId: jobInfo.userId,
          error: error.message
        });
      }
      
      this.stopHeartbeat(jobId, 'timeout_cleanup');
    });

    if (staleJobs.length > 0) {
      logger.info('Cleaned up stale heartbeats and marked jobs as failed', { count: staleJobs.length });
    }

    return staleJobs.length;
  }

  /**
   * Start periodic cleanup of stale heartbeats
   */
  startCleanupScheduler() {
    const cleanupInterval = parseInt(process.env.HEARTBEAT_CLEANUP_INTERVAL || '600000'); // 10 minutes
    
    setInterval(() => {
      this.cleanupStaleHeartbeats();
    }, cleanupInterval);

    logger.info('Started heartbeat cleanup scheduler', { 
      interval: cleanupInterval 
    });
  }

  /**
   * Shutdown all heartbeats
   */
  shutdown() {
    logger.info('Shutting down job heartbeat service', { 
      activeJobs: this.activeJobs.size 
    });

    // Stop all active heartbeats
    for (const jobId of this.activeJobs.keys()) {
      this.stopHeartbeat(jobId);
    }
  }
}

module.exports = new JobHeartbeat();
