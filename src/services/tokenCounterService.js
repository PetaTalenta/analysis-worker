/**
 * Token Counter Service
 * Provides token counting functionality using Gemini's countTokens API
 */

const logger = require('../utils/logger');

/**
 * TokenCounterService class for counting tokens and extracting usage metadata
 */
class TokenCounterService {
  constructor() {
    // Gemini 2.5 Flash pricing configuration (per 1M tokens in USD)
    // Updated based on official Google AI pricing as of 2024
    this.pricing = {
      // Free Tier - completely free
      free: {
        input: 0,
        output: 0,
        contextCaching: 0
      },
      // Paid Tier - per 1M tokens
      paid: {
        // Text/Image/Video content
        input: parseFloat(process.env.GEMINI_INPUT_TOKEN_PRICE || '0.30'), // $0.30 per 1M tokens
        output: parseFloat(process.env.GEMINI_OUTPUT_TOKEN_PRICE || '2.50'), // $2.50 per 1M tokens (including thinking tokens)
        contextCaching: parseFloat(process.env.GEMINI_CONTEXT_CACHING_PRICE || '0.075'), // $0.075 per 1M tokens
        contextCachingStorage: parseFloat(process.env.GEMINI_CONTEXT_STORAGE_PRICE || '1.00'), // $1.00 per 1M tokens per hour

        // Audio content (different pricing)
        inputAudio: parseFloat(process.env.GEMINI_INPUT_AUDIO_PRICE || '1.00'), // $1.00 per 1M tokens
        contextCachingAudio: parseFloat(process.env.GEMINI_CONTEXT_CACHING_AUDIO_PRICE || '0.25') // $0.25 per 1M tokens
      }
    };

    // Pricing tier configuration
    this.pricingTier = process.env.GEMINI_PRICING_TIER || 'free'; // 'free' or 'paid'

    // Character to token estimation ratio (approximate)
    this.charToTokenRatio = parseFloat(process.env.CHAR_TO_TOKEN_RATIO || '4'); // ~4 characters per token
  }

  /**
   * Count input tokens using Gemini's countTokens API
   * @param {Object} client - Gemini AI client
   * @param {String} model - Model name
   * @param {Array|String} contents - Content to count tokens for
   * @param {String} jobId - Job ID for logging
   * @returns {Promise<Object>} - Token count result
   */
  async countInputTokens(client, model, contents, jobId = null) {
    try {
      logger.debug('Counting input tokens', { 
        jobId, 
        model,
        contentType: Array.isArray(contents) ? 'array' : typeof contents,
        contentLength: Array.isArray(contents) ? contents.length : contents?.length || 0
      });

      // Prepare contents for token counting
      const formattedContents = this._formatContentsForCounting(contents);

      // Get the generative model and use countTokens API
      const geminiModel = client.getGenerativeModel({ model: model });
      const tokenCountResult = await geminiModel.countTokens({
        contents: formattedContents
      });

      const tokenCount = tokenCountResult.totalTokens || 0;

      logger.debug('Input token counting completed', {
        jobId,
        model,
        totalTokens: tokenCount
      });

      return {
        success: true,
        totalTokens: tokenCount,
        inputTokens: tokenCount,
        outputTokens: 0,
        model: model,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.warn('Failed to count input tokens using Gemini API', {
        jobId,
        model,
        error: error.message
      });

      // Fallback to character-based estimation
      const fallbackResult = this._estimateTokensFromContent(contents, jobId);
      return {
        success: false,
        error: error.message,
        fallbackUsed: true,
        ...fallbackResult,
        model: model,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Extract usage metadata from Gemini API response
   * @param {Object} response - Gemini API response
   * @param {String} jobId - Job ID for logging
   * @returns {Object} - Extracted usage metadata
   */
  async extractUsageMetadata(response, jobId = null) {
    try {
      logger.debug('Extracting usage metadata from API response', { jobId });

      // Extract usage metadata from response
      const usageMetadata = response.usageMetadata || {};
      
      const metadata = {
        success: true,
        promptTokenCount: usageMetadata.promptTokenCount || 0,
        candidatesTokenCount: usageMetadata.candidatesTokenCount || 0,
        totalTokenCount: usageMetadata.totalTokenCount || 0,
        thoughtsTokenCount: usageMetadata.thoughtsTokenCount || 0,
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0,
        timestamp: new Date().toISOString()
      };

      // Calculate estimated cost and breakdown
      metadata.estimatedCost = this.calculateEstimatedCost(
        metadata.inputTokens,
        metadata.outputTokens
      );

      // Add detailed cost breakdown
      metadata.costBreakdown = this.calculateCostBreakdown(
        metadata.inputTokens,
        metadata.outputTokens
      );

      // Add pricing tier information
      metadata.pricingTier = this.pricingTier;

      logger.debug('Usage metadata extracted successfully', {
        jobId,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        totalTokens: metadata.totalTokens,
        estimatedCost: metadata.estimatedCost
      });

      return metadata;

    } catch (error) {
      logger.warn('Failed to extract usage metadata', {
        jobId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get mock token count for testing scenarios
   * @param {Array|String} contents - Content to generate mock count for
   * @param {String} jobId - Job ID for logging
   * @returns {Promise<Object>} - Mock token count result
   */
  async getMockTokenCount(contents, jobId = null) {
    try {
      logger.debug('Generating mock token count', { jobId });

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Generate realistic mock token counts based on content
      const mockResult = this._generateMockTokenCount(contents);

      logger.debug('Mock token count generated', {
        jobId,
        inputTokens: mockResult.inputTokens,
        outputTokens: mockResult.outputTokens,
        totalTokens: mockResult.totalTokens
      });

      return {
        success: true,
        mock: true,
        ...mockResult,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to generate mock token count', {
        jobId,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Calculate estimated cost based on token usage
   * @param {Number} inputTokens - Number of input tokens
   * @param {Number} outputTokens - Number of output tokens
   * @param {Object} options - Additional options for cost calculation
   * @param {String} options.contentType - Content type: 'text', 'audio' (default: 'text')
   * @param {Number} options.contextCachingTokens - Number of context caching tokens
   * @param {Number} options.contextStorageHours - Hours of context storage
   * @returns {Number} - Estimated cost in USD
   */
  calculateEstimatedCost(inputTokens, outputTokens, options = {}) {
    try {
      // Ensure inputs are valid numbers
      const validInputTokens = Number(inputTokens) || 0;
      const validOutputTokens = Number(outputTokens) || 0;
      const validContextCachingTokens = Number(options.contextCachingTokens) || 0;
      const validContextStorageHours = Number(options.contextStorageHours) || 0;
      const contentType = options.contentType || 'text';

      // Free tier - no cost
      if (this.pricingTier === 'free') {
        return 0;
      }

      // Paid tier calculation (per 1M tokens)
      const pricing = this.pricing.paid;
      let inputCost = 0;
      let outputCost = 0;
      let contextCachingCost = 0;
      let contextStorageCost = 0;

      // Calculate input cost based on content type
      if (contentType === 'audio') {
        inputCost = (validInputTokens / 1000000) * pricing.inputAudio;
      } else {
        inputCost = (validInputTokens / 1000000) * pricing.input;
      }

      // Calculate output cost (same for all content types)
      outputCost = (validOutputTokens / 1000000) * pricing.output;

      // Calculate context caching cost
      if (validContextCachingTokens > 0) {
        if (contentType === 'audio') {
          contextCachingCost = (validContextCachingTokens / 1000000) * pricing.contextCachingAudio;
        } else {
          contextCachingCost = (validContextCachingTokens / 1000000) * pricing.contextCaching;
        }
      }

      // Calculate context storage cost
      if (validContextStorageHours > 0) {
        contextStorageCost = (validContextCachingTokens / 1000000) * pricing.contextCachingStorage * validContextStorageHours;
      }

      const totalCost = inputCost + outputCost + contextCachingCost + contextStorageCost;

      // Check for NaN or invalid results
      if (isNaN(totalCost) || !isFinite(totalCost)) {
        return 0;
      }

      return Math.round(totalCost * 1000000) / 1000000; // Round to 6 decimal places
    } catch (error) {
      logger.warn('Failed to calculate estimated cost', { error: error.message });
      return 0;
    }
  }

  /**
   * Format contents for token counting API
   * @param {Array|String} contents - Contents to format
   * @returns {Array} - Formatted contents array
   * @private
   */
  _formatContentsForCounting(contents) {
    if (Array.isArray(contents)) {
      return contents;
    }

    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    }

    if (contents && typeof contents === 'object') {
      return [contents];
    }

    return [{ role: 'user', parts: [{ text: '' }] }];
  }

  /**
   * Estimate tokens from content using character count fallback
   * @param {Array|String} contents - Content to estimate
   * @param {String} jobId - Job ID for logging
   * @returns {Object} - Estimated token count
   * @private
   */
  _estimateTokensFromContent(contents, jobId = null) {
    try {
      let totalChars = 0;

      if (Array.isArray(contents)) {
        totalChars = contents.reduce((acc, content) => {
          if (typeof content === 'string') {
            return acc + content.length;
          }
          if (content && content.parts) {
            return acc + content.parts.reduce((partAcc, part) => {
              return partAcc + (part.text ? part.text.length : 0);
            }, 0);
          }
          return acc + JSON.stringify(content).length;
        }, 0);
      } else if (typeof contents === 'string') {
        totalChars = contents.length;
      } else {
        totalChars = JSON.stringify(contents).length;
      }

      const estimatedTokens = Math.ceil(totalChars / this.charToTokenRatio);

      logger.debug('Token estimation from character count', {
        jobId,
        totalChars,
        estimatedTokens,
        charToTokenRatio: this.charToTokenRatio
      });

      return {
        totalTokens: estimatedTokens,
        inputTokens: estimatedTokens,
        outputTokens: 0,
        estimatedCost: this.calculateEstimatedCost(estimatedTokens, 0),
        costBreakdown: this.calculateCostBreakdown(estimatedTokens, 0),
        pricingTier: this.pricingTier,
        estimationMethod: 'character_count'
      };

    } catch (error) {
      logger.error('Failed to estimate tokens from content', {
        jobId,
        error: error.message
      });

      return {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        estimationMethod: 'fallback_zero'
      };
    }
  }

  /**
   * Generate realistic mock token counts for testing
   * @param {Array|String} contents - Content to generate mock count for
   * @returns {Object} - Mock token count data
   * @private
   */
  _generateMockTokenCount(contents) {
    try {
      // Base estimation on content length
      const baseEstimate = this._estimateTokensFromContent(contents);
      
      // Add some realistic variation for mock data
      const variation = 0.1; // 10% variation
      const randomFactor = 1 + (Math.random() - 0.5) * variation;
      
      const inputTokens = Math.ceil(baseEstimate.inputTokens * randomFactor);
      
      // Mock output tokens (typical response size)
      const outputTokens = Math.ceil(inputTokens * 0.3 + Math.random() * 200); // 30% of input + random
      
      const totalTokens = inputTokens + outputTokens;
      const estimatedCost = this.calculateEstimatedCost(inputTokens, outputTokens);

      return {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCost,
        costBreakdown: this.calculateCostBreakdown(inputTokens, outputTokens),
        pricingTier: this.pricingTier,
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        totalTokenCount: totalTokens
      };

    } catch (error) {
      logger.error('Failed to generate mock token count', { error: error.message });
      
      return {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: this.calculateEstimatedCost(100, 50),
        costBreakdown: this.calculateCostBreakdown(100, 50),
        pricingTier: this.pricingTier,
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150
      };
    }
  }

  /**
   * Get current pricing tier information
   * @returns {Object} - Pricing tier information
   */
  getPricingInfo() {
    return {
      tier: this.pricingTier,
      pricing: this.pricing,
      isFree: this.pricingTier === 'free',
      isPaid: this.pricingTier === 'paid'
    };
  }

  /**
   * Set pricing tier
   * @param {String} tier - Pricing tier: 'free' or 'paid'
   */
  setPricingTier(tier) {
    if (tier !== 'free' && tier !== 'paid') {
      throw new Error('Invalid pricing tier. Must be "free" or "paid"');
    }
    this.pricingTier = tier;
    logger.info('Pricing tier updated', { tier });
  }

  /**
   * Calculate cost breakdown for detailed analysis
   * @param {Number} inputTokens - Number of input tokens
   * @param {Number} outputTokens - Number of output tokens
   * @param {Object} options - Additional options for cost calculation
   * @returns {Object} - Detailed cost breakdown
   */
  calculateCostBreakdown(inputTokens, outputTokens, options = {}) {
    try {
      const validInputTokens = Number(inputTokens) || 0;
      const validOutputTokens = Number(outputTokens) || 0;
      const validContextCachingTokens = Number(options.contextCachingTokens) || 0;
      const validContextStorageHours = Number(options.contextStorageHours) || 0;
      const contentType = options.contentType || 'text';

      const breakdown = {
        tier: this.pricingTier,
        contentType,
        tokens: {
          input: validInputTokens,
          output: validOutputTokens,
          contextCaching: validContextCachingTokens,
          total: validInputTokens + validOutputTokens
        },
        costs: {
          input: 0,
          output: 0,
          contextCaching: 0,
          contextStorage: 0,
          total: 0
        },
        rates: {
          input: 0,
          output: 0,
          contextCaching: 0,
          contextStorage: 0
        }
      };

      // Free tier - no cost
      if (this.pricingTier === 'free') {
        return breakdown;
      }

      // Paid tier calculation
      const pricing = this.pricing.paid;

      // Set rates based on content type
      if (contentType === 'audio') {
        breakdown.rates.input = pricing.inputAudio;
        breakdown.rates.contextCaching = pricing.contextCachingAudio;
      } else {
        breakdown.rates.input = pricing.input;
        breakdown.rates.contextCaching = pricing.contextCaching;
      }
      breakdown.rates.output = pricing.output;
      breakdown.rates.contextStorage = pricing.contextCachingStorage;

      // Calculate costs
      breakdown.costs.input = (validInputTokens / 1000000) * breakdown.rates.input;
      breakdown.costs.output = (validOutputTokens / 1000000) * breakdown.rates.output;

      if (validContextCachingTokens > 0) {
        breakdown.costs.contextCaching = (validContextCachingTokens / 1000000) * breakdown.rates.contextCaching;
      }

      if (validContextStorageHours > 0) {
        breakdown.costs.contextStorage = (validContextCachingTokens / 1000000) * breakdown.rates.contextStorage * validContextStorageHours;
      }

      breakdown.costs.total = breakdown.costs.input + breakdown.costs.output +
                             breakdown.costs.contextCaching + breakdown.costs.contextStorage;

      // Round all costs to 6 decimal places
      Object.keys(breakdown.costs).forEach(key => {
        breakdown.costs[key] = Math.round(breakdown.costs[key] * 1000000) / 1000000;
      });

      return breakdown;
    } catch (error) {
      logger.error('Failed to calculate cost breakdown', { error: error.message });
      return {
        tier: this.pricingTier,
        contentType: options.contentType || 'text',
        tokens: { input: 0, output: 0, contextCaching: 0, total: 0 },
        costs: { input: 0, output: 0, contextCaching: 0, contextStorage: 0, total: 0 },
        rates: { input: 0, output: 0, contextCaching: 0, contextStorage: 0 },
        error: error.message
      };
    }
  }
}

module.exports = TokenCounterService;