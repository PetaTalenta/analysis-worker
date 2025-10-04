/**
 * Talent Mapping Analyzer
 * 
 * Specialized analyzer for AI-Driven Talent Mapping assessments
 * Handles RIASEC, OCEAN, VIA-IS, and Industry Score analysis
 */

const aiService = require('../services/aiService');
const logger = require('../utils/logger');
const { createError, ERROR_TYPES } = require('../utils/errorHandler');

/**
 * Analyzer name for identification
 */
const ANALYZER_NAME = 'TalentMappingAnalyzer';

/**
 * Required fields for talent mapping assessment
 */
const REQUIRED_FIELDS = ['riasec', 'ocean', 'viaIs'];
const OPTIONAL_FIELDS = ['industryScore'];

/**
 * Analyze talent mapping assessment data
 * @param {Object} assessmentData - Assessment data containing RIASEC, OCEAN, VIA-IS, etc.
 * @param {String} jobId - Job ID for logging and tracking
 * @param {Object} options - Additional options (assessmentName, assessmentType, rawResponses)
 * @returns {Promise<Object>} - Talent mapping analysis result
 */
const analyze = async (assessmentData, jobId, options = {}) => {
  const startTime = Date.now();
  
  try {
    logger.info('Starting talent mapping analysis', {
      jobId,
      analyzer: ANALYZER_NAME,
      assessmentName: options.assessmentName
    });

    // Validate assessment data structure
    const validationResult = validateTalentMappingData(assessmentData);
    if (!validationResult.isValid) {
      throw createError(
        ERROR_TYPES.VALIDATION_ERROR,
        `Invalid talent mapping data: ${validationResult.error}`
      );
    }

    // Log data summary for debugging
    logDataSummary(assessmentData, jobId);

    // Use existing AI service to generate persona profile
    // This maintains backward compatibility while adding the new routing layer
    const personaProfile = await aiService.generatePersonaProfile(assessmentData, jobId);

    const processingTime = Date.now() - startTime;

    logger.info('Talent mapping analysis completed', {
      jobId,
      analyzer: ANALYZER_NAME,
      archetype: personaProfile.archetype,
      processingTime: `${processingTime}ms`
    });

    // Return standardized result format
    return {
      success: true,
      analysisType: 'talent_mapping',
      result: personaProfile,
      processingTime,
      analyzer: ANALYZER_NAME
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Talent mapping analysis failed', {
      jobId,
      analyzer: ANALYZER_NAME,
      error: error.message,
      processingTime: `${processingTime}ms`
    });

    // Re-throw with analyzer context
    const errorCode = (error && error.code) ? error.code : ERROR_TYPES.PROCESSING_ERROR.code;
    const enhancedError = createError(
      errorCode,
      `Talent mapping analysis failed: ${error.message}`,
      error
    );
    
    enhancedError.analyzer = ANALYZER_NAME;
    enhancedError.processingTime = processingTime;
    
    throw enhancedError;
  }
};

/**
 * Validate talent mapping assessment data
 * @param {Object} assessmentData - Assessment data to validate
 * @returns {Object} - Validation result
 */
const validateTalentMappingData = (assessmentData) => {
  try {
    // Check if assessmentData exists and is an object
    if (!assessmentData || typeof assessmentData !== 'object') {
      return {
        isValid: false,
        error: 'Assessment data must be a non-null object'
      };
    }

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
      if (!assessmentData[field]) {
        return {
          isValid: false,
          error: `Missing required field: ${field}`
        };
      }

      // Validate field structure
      if (typeof assessmentData[field] !== 'object') {
        return {
          isValid: false,
          error: `Field ${field} must be an object`
        };
      }
    }

    // Validate RIASEC structure
    const riasecFields = ['realistic', 'investigative', 'artistic', 'social', 'enterprising', 'conventional'];
    for (const field of riasecFields) {
      if (typeof assessmentData.riasec[field] !== 'number') {
        return {
          isValid: false,
          error: `RIASEC field ${field} must be a number`
        };
      }
    }

    // Validate OCEAN structure
    const oceanFields = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    for (const field of oceanFields) {
      if (typeof assessmentData.ocean[field] !== 'number') {
        return {
          isValid: false,
          error: `OCEAN field ${field} must be a number`
        };
      }
    }

    // Validate VIA-IS structure (more flexible as it can have various character strengths)
    if (Object.keys(assessmentData.viaIs).length === 0) {
      return {
        isValid: false,
        error: 'VIA-IS must contain at least one character strength'
      };
    }

    // Validate optional industryScore if present
    if (assessmentData.industryScore && typeof assessmentData.industryScore !== 'object') {
      return {
        isValid: false,
        error: 'Industry score must be an object if provided'
      };
    }

    return { isValid: true };

  } catch (error) {
    return {
      isValid: false,
      error: `Validation error: ${error.message}`
    };
  }
};

/**
 * Log assessment data summary for debugging
 * @param {Object} assessmentData - Assessment data
 * @param {String} jobId - Job ID
 */
const logDataSummary = (assessmentData, jobId) => {
  try {
    const { riasec, ocean, viaIs, industryScore } = assessmentData;

    // Find highest RIASEC scores
    const riasecEntries = Object.entries(riasec).sort(([,a], [,b]) => b - a);
    const topRiasec = riasecEntries.slice(0, 3).map(([key, value]) => `${key}: ${value}`);

    // Find highest OCEAN scores
    const oceanEntries = Object.entries(ocean).sort(([,a], [,b]) => b - a);
    const topOcean = oceanEntries.slice(0, 3).map(([key, value]) => `${key}: ${value}`);

    // Find highest VIA-IS scores
    const viaIsEntries = Object.entries(viaIs).sort(([,a], [,b]) => b - a);
    const topViaIs = viaIsEntries.slice(0, 3).map(([key, value]) => `${key}: ${value}`);

    logger.debug('Talent mapping data summary', {
      jobId,
      topRiasec,
      topOcean,
      topViaIs,
      hasIndustryScore: !!industryScore,
      totalViaIsStrengths: Object.keys(viaIs).length
    });

  } catch (error) {
    logger.warn('Failed to log data summary', {
      jobId,
      error: error.message
    });
  }
};

/**
 * Get analyzer capabilities and requirements
 * @returns {Object} - Analyzer information
 */
const getAnalyzerInfo = () => {
  return {
    name: ANALYZER_NAME,
    version: '1.0.0',
    description: 'Specialized analyzer for AI-Driven Talent Mapping assessments',
    requiredFields: REQUIRED_FIELDS,
    optionalFields: OPTIONAL_FIELDS,
    supportedAssessmentTypes: [
      'AI-Driven Talent Mapping',
      'talent_mapping',
      'talent-mapping',
      'TALENT_MAPPING'
    ]
  };
};

module.exports = {
  analyze,
  validateTalentMappingData,
  getAnalyzerInfo,
  name: ANALYZER_NAME,
  
  // Export constants for testing
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS
};
