/**
 * Default Analyzer
 * 
 * Handles unknown or unsupported assessment types
 * Provides error logging and standard responses for system stability
 */

const logger = require('../utils/logger');
const { createError, ERROR_TYPES } = require('../utils/errorHandler');
const { auditLogger, AUDIT_EVENTS, RISK_LEVELS } = require('../services/auditLogger');

/**
 * Analyzer name for identification
 */
const ANALYZER_NAME = 'DefaultAnalyzer';

/**
 * Analyze unknown assessment type
 * @param {Object} assessmentData - Assessment data (structure unknown)
 * @param {String} jobId - Job ID for logging and tracking
 * @param {Object} options - Additional options (assessmentName, assessmentType, rawResponses)
 * @returns {Promise<Object>} - Standard error response
 */
const analyze = async (assessmentData, jobId, options = {}) => {
  const startTime = Date.now();
  const { assessmentName, assessmentType } = options;
  
  try {
    logger.warn('Processing unknown assessment type with default analyzer', {
      jobId,
      analyzer: ANALYZER_NAME,
      assessmentName,
      assessmentType
    });

    // Log security event for unknown assessment type
    auditLogger.logSecurityEvent(AUDIT_EVENTS.UNKNOWN_ASSESSMENT_TYPE, {
      jobId,
      assessmentName,
      assessmentType,
      dataKeys: assessmentData ? Object.keys(assessmentData) : [],
      analyzer: ANALYZER_NAME
    }, RISK_LEVELS.MEDIUM);

    // Analyze the structure of unknown assessment data
    const dataAnalysis = analyzeUnknownData(assessmentData, jobId);

    const processingTime = Date.now() - startTime;

    // Create standard error response
    const errorResponse = {
      success: false,
      analysisType: 'unknown',
      error: {
        code: 'UNSUPPORTED_ASSESSMENT_TYPE',
        message: `Assessment type '${assessmentName}' is not currently supported`,
        details: {
          assessmentName,
          assessmentType,
          supportedTypes: [
            'AI-Driven Talent Mapping',
            'talent_mapping',
            'talent-mapping'
          ],
          suggestion: 'Please use a supported assessment type or contact support to add this assessment type'
        }
      },
      dataAnalysis,
      processingTime,
      analyzer: ANALYZER_NAME,
      timestamp: new Date().toISOString()
    };

    logger.info('Default analyzer completed with error response', {
      jobId,
      analyzer: ANALYZER_NAME,
      assessmentName,
      processingTime: `${processingTime}ms`,
      dataStructure: dataAnalysis.structure
    });

    return errorResponse;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Default analyzer failed', {
      jobId,
      analyzer: ANALYZER_NAME,
      assessmentName,
      error: error.message,
      processingTime: `${processingTime}ms`
    });

    // Even the default analyzer failed, return minimal error response
    return {
      success: false,
      analysisType: 'unknown',
      error: {
        code: 'DEFAULT_ANALYZER_ERROR',
        message: 'Failed to process unknown assessment type',
        details: {
          assessmentName,
          originalError: error.message
        }
      },
      processingTime,
      analyzer: ANALYZER_NAME,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Analyze the structure of unknown assessment data
 * @param {Object} assessmentData - Unknown assessment data
 * @param {String} jobId - Job ID for logging
 * @returns {Object} - Data structure analysis
 */
const analyzeUnknownData = (assessmentData, jobId) => {
  try {
    if (!assessmentData || typeof assessmentData !== 'object') {
      return {
        structure: 'invalid',
        type: typeof assessmentData,
        isEmpty: !assessmentData,
        analysis: 'Assessment data is not a valid object'
      };
    }

    const keys = Object.keys(assessmentData);
    const structure = {};
    
    // Analyze each field
    for (const key of keys) {
      const value = assessmentData[key];
      structure[key] = {
        type: typeof value,
        isArray: Array.isArray(value),
        isObject: typeof value === 'object' && !Array.isArray(value) && value !== null,
        hasSubfields: typeof value === 'object' && value !== null ? Object.keys(value).length : 0
      };
    }

    const analysis = {
      structure: 'object',
      totalFields: keys.length,
      fieldNames: keys,
      fieldTypes: structure,
      possibleAssessmentTypes: guessPossibleAssessmentTypes(keys),
      analysis: `Object with ${keys.length} fields: ${keys.join(', ')}`
    };

    logger.debug('Unknown data structure analyzed', {
      jobId,
      analysis: analysis.analysis,
      fieldCount: keys.length,
      possibleTypes: analysis.possibleAssessmentTypes
    });

    return analysis;

  } catch (error) {
    logger.warn('Failed to analyze unknown data structure', {
      jobId,
      error: error.message
    });

    return {
      structure: 'error',
      analysis: `Failed to analyze data structure: ${error.message}`
    };
  }
};

/**
 * Guess possible assessment types based on field names
 * @param {Array<String>} fieldNames - Field names from assessment data
 * @returns {Array<String>} - Possible assessment types
 */
const guessPossibleAssessmentTypes = (fieldNames) => {
  const guesses = [];
  
  // Check for talent mapping indicators
  const talentMappingFields = ['riasec', 'ocean', 'viaIs', 'industryScore'];
  const hasTalentMappingFields = talentMappingFields.some(field => fieldNames.includes(field));
  
  if (hasTalentMappingFields) {
    guesses.push('talent_mapping');
  }

  // Check for personality assessment indicators
  const personalityFields = ['personality', 'traits', 'characteristics', 'behavior'];
  const hasPersonalityFields = personalityFields.some(field => 
    fieldNames.some(name => name.toLowerCase().includes(field))
  );
  
  if (hasPersonalityFields) {
    guesses.push('personality_assessment');
  }

  // Check for skills assessment indicators
  const skillsFields = ['skills', 'competencies', 'abilities', 'proficiency'];
  const hasSkillsFields = skillsFields.some(field => 
    fieldNames.some(name => name.toLowerCase().includes(field))
  );
  
  if (hasSkillsFields) {
    guesses.push('skills_assessment');
  }

  // Check for cognitive assessment indicators
  const cognitiveFields = ['cognitive', 'intelligence', 'reasoning', 'memory'];
  const hasCognitiveFields = cognitiveFields.some(field => 
    fieldNames.some(name => name.toLowerCase().includes(field))
  );
  
  if (hasCognitiveFields) {
    guesses.push('cognitive_assessment');
  }

  return guesses.length > 0 ? guesses : ['unknown'];
};

/**
 * Get analyzer capabilities and information
 * @returns {Object} - Analyzer information
 */
const getAnalyzerInfo = () => {
  return {
    name: ANALYZER_NAME,
    version: '1.0.0',
    description: 'Default analyzer for unknown or unsupported assessment types',
    purpose: 'Error handling and system stability',
    capabilities: [
      'Unknown data structure analysis',
      'Assessment type guessing',
      'Standard error responses',
      'Security event logging'
    ]
  };
};

/**
 * Generate helpful error message for users
 * @param {String} assessmentName - Unknown assessment name
 * @returns {String} - User-friendly error message
 */
const generateUserErrorMessage = (assessmentName) => {
  return `Assessment type '${assessmentName}' is not currently supported. ` +
         `Supported types include: AI-Driven Talent Mapping, talent_mapping. ` +
         `Please contact support if you need this assessment type to be added.`;
};

module.exports = {
  analyze,
  analyzeUnknownData,
  guessPossibleAssessmentTypes,
  generateUserErrorMessage,
  getAnalyzerInfo,
  name: ANALYZER_NAME
};
