const axios = require('axios');
const logger = require('../utils/logger');

const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
const ASSESSMENT_SERVICE_URL = process.env.ASSESSMENT_SERVICE_URL || 'http://localhost:3003';

const sendAnalysisCompleteNotification = async (userId, jobId, resultId) => {
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/notifications/analysis-complete`, {
      userId,
      jobId,
      resultId,
      status: 'completed'
    }, {
      headers: {
        'X-Internal-Service': 'true',
        'X-Service-Key': process.env.INTERNAL_SERVICE_KEY
      }
    });

    logger.info('Analysis complete notification sent', { userId, jobId, resultId });
  } catch (error) {
    logger.error('Failed to send analysis complete notification', {
      error: error.message,
      userId,
      jobId
    });
  }
};

const updateAssessmentJobStatus = async (jobId, resultId, status) => {
  try {
    await axios.post(`${ASSESSMENT_SERVICE_URL}/assessment/callback/completed`, {
      jobId,
      resultId,
      status
    }, {
      headers: {
        'X-Internal-Service': 'true',
        'X-Service-Key': process.env.INTERNAL_SERVICE_KEY
      }
    });

    logger.info('Assessment job status updated', { jobId, resultId, status });
  } catch (error) {
    logger.error('Failed to update assessment job status', {
      error: error.message,
      jobId,
      resultId,
      status
    });
  }
};

const sendAnalysisFailureNotification = async (userId, jobId, errorMessage) => {
  try {
    await axios.post(`${NOTIFICATION_SERVICE_URL}/notifications/analysis-failed`, {
      userId,
      jobId,
      errorMessage,
      status: 'failed'
    }, {
      headers: {
        'X-Internal-Service': 'true',
        'X-Service-Key': process.env.INTERNAL_SERVICE_KEY
      }
    });

    logger.info('Analysis failure notification sent', { userId, jobId, errorMessage });
  } catch (error) {
    logger.error('Failed to send analysis failure notification', {
      error: error.message,
      userId,
      jobId
    });
  }
};

const updateAssessmentJobStatusFailed = async (jobId, resultId, errorMessage) => {
  try {
    await axios.post(`${ASSESSMENT_SERVICE_URL}/assessment/callback/failed`, {
      jobId,
      resultId,
      status: 'failed',
      errorMessage
    }, {
      headers: {
        'X-Internal-Service': 'true',
        'X-Service-Key': process.env.INTERNAL_SERVICE_KEY
      }
    });

    logger.info('Assessment job status updated to failed', { jobId, resultId, errorMessage });
  } catch (error) {
    logger.error('Failed to update assessment job status to failed', {
      error: error.message,
      jobId,
      resultId,
      errorMessage
    });
  }
};

module.exports = {
  sendAnalysisCompleteNotification,
  sendAnalysisFailureNotification,
  updateAssessmentJobStatus,
  updateAssessmentJobStatusFailed
};

