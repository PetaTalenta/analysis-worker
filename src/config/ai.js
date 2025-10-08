/**
 * Google Generative AI Configuration
 * Updated - All configuration must come from environment variables set in root .env file
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// Validate required environment variables
const validateEnvVars = () => {
  const required = ['GOOGLE_AI_MODEL', 'AI_TEMPERATURE'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0 && process.env.USE_MOCK_MODEL !== 'true') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please set them in /atma-backend/.env file`);
  }
};

// Validate on module load
validateEnvVars();

// AI configuration - NO HARDCODED FALLBACKS
// All values must come from environment variables set in root .env file
const config = {
  apiKey: process.env.GOOGLE_AI_API_KEY,
  model: process.env.GOOGLE_AI_MODEL, // No fallback - must be set in .env
  temperature: parseFloat(process.env.AI_TEMPERATURE), // No fallback - must be set in .env
  useMockModel: process.env.USE_MOCK_MODEL === 'true'
  // Tidak menggunakan maxTokens agar output tidak dibatasi
};

logger.info('AI Configuration loaded from environment:', {
  model: config.model,
  temperature: config.temperature,
  useMockModel: config.useMockModel,
  source: 'root .env file'
});

// Initialize Google Generative AI
let genAI = null;

/**
 * Initialize Google Generative AI
 * @returns {Object} - Google Generative AI client
 */
const initialize = () => {
  try {
    if (!config.apiKey) {
      throw new Error('GOOGLE_AI_API_KEY is not set in environment variables');
    }

    // Force re-initialize
    genAI = new GoogleGenerativeAI(config.apiKey);

    logger.info('Google Generative AI initialized successfully', {
      model: config.model,
      temperature: config.temperature
    });

    return genAI;
  } catch (error) {
    logger.error('Failed to initialize Google Generative AI', { error: error.message });
    throw error;
  }
};

/**
 * Get Google Generative AI client (initialize if needed)
 * @returns {Object} - Google Generative AI client
 */
const getClient = () => {
  if (!genAI) {
    initialize();
  }
  return genAI;
};

/**
 * Check if Google Generative AI is configured properly
 * @returns {boolean} - Configuration status
 */
const isConfigured = () => {
  return !!config.apiKey || config.useMockModel;
};

module.exports = {
  config,
  initialize,
  getClient,
  isConfigured
};
