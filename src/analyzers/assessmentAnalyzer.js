/**
 * Assessment Analyzer - Dynamic Analysis Engine
 * 
 * This service provides a switch-case logic to route different assessment types
 * to their specific analyzers, enabling scalable and modular analysis processing.
 */

const logger = require('../utils/logger');
const { createError, ERROR_TYPES } = require('../utils/errorHandler');

// Import specific analyzers
const talentMappingAnalyzer = require('./talentMappingAnalyzer');
const defaultAnalyzer = require('./defaultAnalyzer');

/**
 * Assessment type mappings
 * Maps assessment names to their corresponding analyzers
 */
const ASSESSMENT_ANALYZERS = {
  // Talent Mapping variations
  'AI-Driven Talent Mapping': talentMappingAnalyzer,
  'talent_mapping': talentMappingAnalyzer,
  'talent-mapping': talentMappingAnalyzer,
  'TALENT_MAPPING': talentMappingAnalyzer,
  
  // Future assessment types can be added here
  // 'personality_assessment': personalityAnalyzer,
  // 'skills_assessment': skillsAnalyzer,
  // 'cognitive_assessment': cognitiveAnalyzer,
};

/**
 * Supported assessment types for validation
 */
const SUPPORTED_ASSESSMENTS = Object.keys(ASSESSMENT_ANALYZERS);

/**
 * Main analysis function with dynamic routing
 * @param {String} assessmentName - Type of assessment to analyze
 * @param {Object} assessmentData - Assessment data to analyze
 * @param {String} jobId - Job ID for logging and tracking
 * @param {Object} rawResponses - Raw user responses (optional)
 * @returns {Promise<Object>} - Analysis result
 */
const analyzeAssessment = async (assessmentName, assessmentData, jobId, rawResponses = null) => {
  const startTime = Date.now();
  
  try {
    logger.info('Starting dynamic assessment analysis', {
      jobId,
      assessmentName,
      supportedTypes: SUPPORTED_ASSESSMENTS.length
    });

    // Validate input parameters
    if (!assessmentName || typeof assessmentName !== 'string') {
      throw createError(
        ERROR_TYPES.VALIDATION_ERROR,
        'Assessment name is required and must be a string'
      );
    }

    if (!assessmentData || typeof assessmentData !== 'object') {
      throw createError(
        ERROR_TYPES.VALIDATION_ERROR,
        'Assessment data is required and must be an object'
      );
    }

    // Normalize assessment name for lookup
    const normalizedName = assessmentName.trim();
    
    // Find appropriate analyzer using switch-case logic
    let selectedAnalyzer = null;
    let matchedAssessmentType = null;

    // Switch-case implementation for assessment routing
    switch (true) {
      // Talent Mapping cases
      case normalizedName === 'AI-Driven Talent Mapping':
      case normalizedName === 'talent_mapping':
      case normalizedName === 'talent-mapping':
      case normalizedName.toUpperCase() === 'TALENT_MAPPING':
        selectedAnalyzer = ASSESSMENT_ANALYZERS['AI-Driven Talent Mapping'];
        matchedAssessmentType = 'talent_mapping';
        logger.info('Routing to Talent Mapping analyzer', { jobId, assessmentName: normalizedName });
        break;

      // Future assessment types can be added here
      // case normalizedName === 'personality_assessment':
      //   selectedAnalyzer = ASSESSMENT_ANALYZERS['personality_assessment'];
      //   matchedAssessmentType = 'personality_assessment';
      //   break;

      // Default case for unknown assessments
      default:
        selectedAnalyzer = defaultAnalyzer;
        matchedAssessmentType = 'unknown';
        
        logger.warn('Unknown assessment type, using default analyzer', {
          jobId,
          assessmentName: normalizedName,
          supportedTypes: SUPPORTED_ASSESSMENTS
        });
        break;
    }

    // Execute analysis with selected analyzer
    const analysisResult = await selectedAnalyzer.analyze(
      assessmentData,
      jobId,
      {
        assessmentName: normalizedName,
        assessmentType: matchedAssessmentType,
        rawResponses
      }
    );

    const processingTime = Date.now() - startTime;

    logger.info('Assessment analysis completed', {
      jobId,
      assessmentName: normalizedName,
      assessmentType: matchedAssessmentType,
      processingTime: `${processingTime}ms`,
      success: true
    });

    // Add metadata to result
    return {
      ...analysisResult,
      _metadata: {
        assessmentType: matchedAssessmentType,
        processingTime,
        analyzer: selectedAnalyzer.name || 'unknown'
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('Assessment analysis failed', {
      jobId,
      assessmentName,
      error: error.message,
      processingTime: `${processingTime}ms`
    });

    // Re-throw with additional context
    const errorCode = (error && error.code) ? error.code : ERROR_TYPES.PROCESSING_ERROR.code;
    const enhancedError = createError(
      errorCode,
      `Assessment analysis failed for ${assessmentName}: ${error.message}`,
      error
    );
    
    enhancedError.assessmentName = assessmentName;
    enhancedError.processingTime = processingTime;
    
    throw enhancedError;
  }
};

/**
 * Get list of supported assessment types
 * @returns {Array<String>} - List of supported assessment names
 */
const getSupportedAssessments = () => {
  return [...SUPPORTED_ASSESSMENTS];
};

/**
 * Check if an assessment type is supported
 * @param {String} assessmentName - Assessment name to check
 * @returns {Boolean} - Whether the assessment is supported
 */
const isAssessmentSupported = (assessmentName) => {
  if (!assessmentName || typeof assessmentName !== 'string') {
    return false;
  }

  const normalizedName = assessmentName.trim();
  
  // Check using same switch-case logic
  switch (true) {
    case normalizedName === 'AI-Driven Talent Mapping':
    case normalizedName === 'talent_mapping':
    case normalizedName === 'talent-mapping':
    case normalizedName.toUpperCase() === 'TALENT_MAPPING':
      return true;
    default:
      return false;
  }
};

/**
 * Get analyzer information for debugging
 * @returns {Object} - Analyzer configuration info
 */
const getAnalyzerInfo = () => {
  return {
    supportedAssessments: SUPPORTED_ASSESSMENTS,
    totalAnalyzers: Object.keys(ASSESSMENT_ANALYZERS).length,
    hasDefaultAnalyzer: !!defaultAnalyzer,
    version: '1.0.0'
  };
};

module.exports = {
  analyzeAssessment,
  getSupportedAssessments,
  isAssessmentSupported,
  getAnalyzerInfo,
  
  // Export constants for testing
  ASSESSMENT_ANALYZERS,
  SUPPORTED_ASSESSMENTS
};
