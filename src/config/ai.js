/**
 * Google Generative AI Configuration
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// AI configuration
const config = {
  apiKey: process.env.GOOGLE_AI_API_KEY,
  model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-pro',
  temperature: parseFloat(process.env.AI_TEMPERATURE || '0.5'),
  useMockModel: process.env.USE_MOCK_MODEL === 'true'
  // Tidak menggunakan maxTokens agar output tidak dibatasi
};

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

    // Initialize Google Generative AI with API key
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
