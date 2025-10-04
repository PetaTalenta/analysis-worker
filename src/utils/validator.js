/**
 * Data validation utilities
 */

const Joi = require('joi');
const logger = require('./logger');
const { personaProfileSchema } = require('../schemas/personaProfile');

// Schema for job message validation - supports both legacy and new formats
// Assessment data validation is already done in assessment-service
const jobMessageSchema = Joi.alternatives().try(
  // New format (v2) - PHASE 2: Added resultId field
  Joi.object({
    jobId: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required(),
    userEmail: Joi.string().email().required(),
    assessment_name: Joi.string().valid('AI-Driven Talent Mapping', 'AI-Based IQ Test', 'Custom Assessment').default('AI-Driven Talent Mapping'),
    assessment_data: Joi.object().required(), // Trust that assessment-service already validated this
    raw_responses: Joi.object().allow(null).optional(),
    resultId: Joi.string().uuid().allow(null).optional(), // PHASE 2: Result ID for updating existing result
    timestamp: Joi.string().isoDate().required(),
    retryCount: Joi.number().min(0).default(0),
    messageVersion: Joi.string().valid('v2').optional()
  }),
  // Legacy format (v1) - for backward compatibility
  Joi.object({
    jobId: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required(),
    userEmail: Joi.string().email().required(),
    assessmentData: Joi.object().required(),
    assessmentName: Joi.string().valid('AI-Driven Talent Mapping', 'AI-Based IQ Test', 'Custom Assessment').default('AI-Driven Talent Mapping').optional(),
    timestamp: Joi.string().isoDate().required(),
    retryCount: Joi.number().min(0).default(0)
  })
);

// Schema for persona profile validation - Now imported from personaProfile.js for consistency

/**
 * Validate job message and normalize format
 * @param {Object} message - Job message to validate
 * @returns {Object} - Validation result with normalized data
 */
const validateJobMessage = (message) => {
  try {
    const { error, value } = jobMessageSchema.validate(message, { abortEarly: false });

    if (error) {
      logger.error('Job message validation failed', {
        jobId: message.jobId,
        errors: error.details.map(detail => detail.message)
      });

      return {
        isValid: false,
        error: error.details.map(detail => detail.message).join(', '),
        value: null
      };
    }

    // Normalize legacy format to new format
    let normalizedValue = value;
    if (value.assessmentData && !value.assessment_data) {
      // Legacy format detected - normalize to new format
      normalizedValue = {
        ...value,
        assessment_name: value.assessmentName || 'AI-Driven Talent Mapping',
        assessment_data: value.assessmentData,
        raw_responses: null,
        messageVersion: 'v1_normalized'
      };

      // Remove legacy fields
      delete normalizedValue.assessmentData;
      delete normalizedValue.assessmentName;

      logger.info('Normalized legacy message format', {
        jobId: value.jobId,
        originalFormat: 'v1',
        normalizedFormat: 'v2'
      });
    }

    return {
      isValid: true,
      error: null,
      value: normalizedValue,
      isLegacyFormat: !!value.assessmentData
    };
  } catch (validationError) {
    logger.error('Error during job message validation', {
      error: validationError.message
    });

    return {
      isValid: false,
      error: validationError.message,
      value: null
    };
  }
};

/**
 * Validate persona profile
 * @param {Object} profile - Persona profile to validate
 * @returns {Object} - Validation result
 */
const validatePersonaProfile = (profile) => {
  try {
    const { error, value } = personaProfileSchema.validate(profile, { abortEarly: false });
    
    if (error) {
      logger.error('Persona profile validation failed', {
        errors: error.details.map(detail => detail.message)
      });
      
      return {
        isValid: false,
        error: error.details.map(detail => detail.message).join(', '),
        value: null
      };
    }
    
    return {
      isValid: true,
      error: null,
      value
    };
  } catch (validationError) {
    logger.error('Error during persona profile validation', {
      error: validationError.message
    });
    
    return {
      isValid: false,
      error: validationError.message,
      value: null
    };
  }
};

module.exports = {
  validateJobMessage,
  validatePersonaProfile
};
