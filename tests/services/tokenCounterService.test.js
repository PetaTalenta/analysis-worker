/**
 * TokenCounterService Unit Tests
 */

const TokenCounterService = require('../../src/services/tokenCounterService');

// Mock logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('TokenCounterService', () => {
  let tokenCounterService;
  let mockClient;

  beforeEach(() => {
    // Clear environment variables to ensure clean state
    delete process.env.GEMINI_INPUT_TOKEN_PRICE;
    delete process.env.GEMINI_OUTPUT_TOKEN_PRICE;
    delete process.env.GEMINI_CONTEXT_CACHING_PRICE;
    delete process.env.GEMINI_INPUT_AUDIO_PRICE;
    delete process.env.GEMINI_PRICING_TIER;
    delete process.env.CHAR_TO_TOKEN_RATIO;

    tokenCounterService = new TokenCounterService();

    // Mock Gemini client
    mockClient = {
      models: {
        countTokens: jest.fn()
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up environment variables after each test
    delete process.env.GEMINI_INPUT_TOKEN_PRICE;
    delete process.env.GEMINI_OUTPUT_TOKEN_PRICE;
    delete process.env.GEMINI_CONTEXT_CACHING_PRICE;
    delete process.env.GEMINI_INPUT_AUDIO_PRICE;
    delete process.env.GEMINI_PRICING_TIER;
    delete process.env.CHAR_TO_TOKEN_RATIO;
  });

  describe('constructor', () => {
    it('should initialize with default pricing configuration', () => {
      const service = new TokenCounterService();
      expect(service.pricing.paid.input).toBe(0.30);
      expect(service.pricing.paid.output).toBe(2.50);
      expect(service.pricing.free.input).toBe(0);
      expect(service.pricing.free.output).toBe(0);
      expect(service.pricingTier).toBe('free');
      expect(service.charToTokenRatio).toBe(4);
    });

    it('should use environment variables for pricing configuration', () => {
      // Store original values
      const originalInput = process.env.GEMINI_INPUT_TOKEN_PRICE;
      const originalOutput = process.env.GEMINI_OUTPUT_TOKEN_PRICE;
      const originalTier = process.env.GEMINI_PRICING_TIER;
      const originalRatio = process.env.CHAR_TO_TOKEN_RATIO;

      process.env.GEMINI_INPUT_TOKEN_PRICE = '0.35';
      process.env.GEMINI_OUTPUT_TOKEN_PRICE = '2.75';
      process.env.GEMINI_PRICING_TIER = 'paid';
      process.env.CHAR_TO_TOKEN_RATIO = '3.5';

      const service = new TokenCounterService();
      expect(service.pricing.paid.input).toBe(0.35);
      expect(service.pricing.paid.output).toBe(2.75);
      expect(service.pricingTier).toBe('paid');
      expect(service.charToTokenRatio).toBe(3.5);

      // Restore original values
      if (originalInput !== undefined) {
        process.env.GEMINI_INPUT_TOKEN_PRICE = originalInput;
      } else {
        delete process.env.GEMINI_INPUT_TOKEN_PRICE;
      }
      if (originalOutput !== undefined) {
        process.env.GEMINI_OUTPUT_TOKEN_PRICE = originalOutput;
      } else {
        delete process.env.GEMINI_OUTPUT_TOKEN_PRICE;
      }
      if (originalTier !== undefined) {
        process.env.GEMINI_PRICING_TIER = originalTier;
      } else {
        delete process.env.GEMINI_PRICING_TIER;
      }
      if (originalRatio !== undefined) {
        process.env.CHAR_TO_TOKEN_RATIO = originalRatio;
      } else {
        delete process.env.CHAR_TO_TOKEN_RATIO;
      }
    });
  });

  describe('countInputTokens', () => {
    it('should successfully count tokens using Gemini API', async () => {
      const mockResponse = { totalTokens: 150 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Test prompt content',
        'test-job-123'
      );

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(150);
      expect(result.inputTokens).toBe(150);
      expect(result.outputTokens).toBe(0);
      expect(result.model).toBe('gemini-2.5-flash');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle array content format', async () => {
      const mockResponse = { totalTokens: 200 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      const arrayContent = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'World' }] }
      ];

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        arrayContent,
        'test-job-123'
      );

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(200);
      expect(mockClient.models.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: arrayContent
      });
    });

    it('should use fallback estimation when API fails', async () => {
      mockClient.models.countTokens.mockRejectedValue(new Error('API Error'));

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Test content for fallback estimation',
        'test-job-123'
      );

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.error).toBe('API Error');
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.estimationMethod).toBe('character_count');
    });

    it('should format string content correctly for API', async () => {
      const mockResponse = { totalTokens: 100 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Simple string content',
        'test-job-123'
      );

      expect(mockClient.models.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Simple string content' }] }]
      });
    });
  });

  describe('extractUsageMetadata', () => {
    it('should extract complete usage metadata from response', async () => {
      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
          thoughtsTokenCount: 10
        }
      };

      const result = await tokenCounterService.extractUsageMetadata(mockResponse, 'test-job-123');

      expect(result.success).toBe(true);
      expect(result.promptTokenCount).toBe(100);
      expect(result.candidatesTokenCount).toBe(50);
      expect(result.totalTokenCount).toBe(150);
      expect(result.thoughtsTokenCount).toBe(10);
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.estimatedCost).toBe(0); // Free tier
      expect(result.costBreakdown).toBeDefined();
      expect(result.pricingTier).toBe('free');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle response without usage metadata', async () => {
      const mockResponse = {};

      const result = await tokenCounterService.extractUsageMetadata(mockResponse, 'test-job-123');

      expect(result.success).toBe(true);
      expect(result.promptTokenCount).toBe(0);
      expect(result.candidatesTokenCount).toBe(0);
      expect(result.totalTokenCount).toBe(0);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });

    it('should handle partial usage metadata', async () => {
      const mockResponse = {
        usageMetadata: {
          promptTokenCount: 75,
          totalTokenCount: 125
          // Missing candidatesTokenCount and thoughtsTokenCount
        }
      };

      const result = await tokenCounterService.extractUsageMetadata(mockResponse, 'test-job-123');

      expect(result.success).toBe(true);
      expect(result.promptTokenCount).toBe(75);
      expect(result.candidatesTokenCount).toBe(0);
      expect(result.totalTokenCount).toBe(125);
      expect(result.thoughtsTokenCount).toBe(0);
    });

    it('should handle extraction errors gracefully', async () => {
      // Pass invalid response that will cause error
      const result = await tokenCounterService.extractUsageMetadata(null, 'test-job-123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe('getMockTokenCount', () => {
    it('should generate realistic mock token counts', async () => {
      const result = await tokenCounterService.getMockTokenCount('Test content for mocking', 'test-job-123');

      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
      expect(result.estimatedCost).toBe(0); // Free tier
      expect(result.costBreakdown).toBeDefined();
      expect(result.pricingTier).toBe('free');
      expect(result.timestamp).toBeDefined();
    });

    it('should handle array content for mock counting', async () => {
      const arrayContent = [
        { role: 'user', parts: [{ text: 'Hello world' }] },
        { role: 'user', parts: [{ text: 'This is a test' }] }
      ];

      const result = await tokenCounterService.getMockTokenCount(arrayContent, 'test-job-123');

      expect(result.success).toBe(true);
      expect(result.mock).toBe(true);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
    });

    it('should include all required metadata fields', async () => {
      const result = await tokenCounterService.getMockTokenCount('Test', 'test-job-123');

      expect(result).toHaveProperty('promptTokenCount');
      expect(result).toHaveProperty('candidatesTokenCount');
      expect(result).toHaveProperty('totalTokenCount');
      expect(result.promptTokenCount).toBe(result.inputTokens);
      expect(result.candidatesTokenCount).toBe(result.outputTokens);
      expect(result.totalTokenCount).toBe(result.totalTokens);
    });
  });

  describe('calculateEstimatedCost', () => {
    it('should return 0 cost for free tier', () => {
      // Default is free tier
      const cost = tokenCounterService.calculateEstimatedCost(1000000, 500000);
      expect(cost).toBe(0);
    });

    it('should calculate cost correctly for paid tier with text content', () => {
      tokenCounterService.setPricingTier('paid');

      // 1M input tokens, 500K output tokens
      // Expected: (1000000/1000000 * 0.30) + (500000/1000000 * 2.50) = 0.30 + 1.25 = 1.55
      const cost = tokenCounterService.calculateEstimatedCost(1000000, 500000);
      expect(cost).toBe(1.55);

      // Reset to free tier for other tests
      tokenCounterService.setPricingTier('free');
    });

    it('should calculate cost correctly for paid tier with audio content', () => {
      tokenCounterService.setPricingTier('paid');

      // 1M input tokens (audio), 500K output tokens
      // Expected: (1000000/1000000 * 1.00) + (500000/1000000 * 2.50) = 1.00 + 1.25 = 2.25
      const cost = tokenCounterService.calculateEstimatedCost(1000000, 500000, { contentType: 'audio' });
      expect(cost).toBe(2.25);

      // Reset to free tier for other tests
      tokenCounterService.setPricingTier('free');
    });

    it('should handle context caching costs', () => {
      tokenCounterService.setPricingTier('paid');

      // 1M input tokens, 500K output tokens, 200K context caching tokens
      // Expected: (1000000/1000000 * 0.30) + (500000/1000000 * 2.50) + (200000/1000000 * 0.075) = 0.30 + 1.25 + 0.015 = 1.565
      const cost = tokenCounterService.calculateEstimatedCost(1000000, 500000, {
        contextCachingTokens: 200000
      });
      expect(cost).toBe(1.565);

      // Reset to free tier for other tests
      tokenCounterService.setPricingTier('free');
    });

    it('should handle zero tokens', () => {
      const cost = tokenCounterService.calculateEstimatedCost(0, 0);
      expect(cost).toBe(0);
    });

    it('should round to 6 decimal places', () => {
      tokenCounterService.setPricingTier('paid');
      const cost = tokenCounterService.calculateEstimatedCost(1, 1);
      expect(cost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
      tokenCounterService.setPricingTier('free');
    });

    it('should handle calculation errors gracefully', () => {
      // Test with invalid inputs
      const cost = tokenCounterService.calculateEstimatedCost(null, undefined);
      expect(cost).toBe(0);
    });
  });

  describe('_formatContentsForCounting', () => {
    it('should return array content as-is', () => {
      const arrayContent = [{ role: 'user', parts: [{ text: 'test' }] }];
      const result = tokenCounterService._formatContentsForCounting(arrayContent);
      expect(result).toBe(arrayContent);
    });

    it('should format string content correctly', () => {
      const result = tokenCounterService._formatContentsForCounting('test string');
      expect(result).toEqual([{ role: 'user', parts: [{ text: 'test string' }] }]);
    });

    it('should handle object content', () => {
      const objectContent = { role: 'user', parts: [{ text: 'test' }] };
      const result = tokenCounterService._formatContentsForCounting(objectContent);
      expect(result).toEqual([objectContent]);
    });

    it('should handle empty or null content', () => {
      const result = tokenCounterService._formatContentsForCounting(null);
      expect(result).toEqual([{ role: 'user', parts: [{ text: '' }] }]);
    });
  });

  describe('_estimateTokensFromContent', () => {
    it('should estimate tokens from string content', () => {
      const content = 'This is a test string with some content';
      const result = tokenCounterService._estimateTokensFromContent(content, 'test-job-123');
      
      const expectedTokens = Math.ceil(content.length / 4); // Default ratio is 4
      expect(result.totalTokens).toBe(expectedTokens);
      expect(result.inputTokens).toBe(expectedTokens);
      expect(result.outputTokens).toBe(0);
      expect(result.estimationMethod).toBe('character_count');
    });

    it('should estimate tokens from array content', () => {
      const content = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'World' }] }
      ];
      const result = tokenCounterService._estimateTokensFromContent(content, 'test-job-123');
      
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.estimationMethod).toBe('character_count');
    });

    it('should handle estimation errors', () => {
      // Create a content that will cause JSON.stringify to fail
      const circularContent = {};
      circularContent.self = circularContent;
      
      const result = tokenCounterService._estimateTokensFromContent(circularContent, 'test-job-123');
      
      expect(result.totalTokens).toBe(0);
      expect(result.estimationMethod).toBe('fallback_zero');
    });
  });

  describe('_generateMockTokenCount', () => {
    it('should generate consistent mock data structure', () => {
      const result = tokenCounterService._generateMockTokenCount('test content');
      
      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('outputTokens');
      expect(result).toHaveProperty('totalTokens');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('promptTokenCount');
      expect(result).toHaveProperty('candidatesTokenCount');
      expect(result).toHaveProperty('totalTokenCount');
      
      expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
      expect(result.promptTokenCount).toBe(result.inputTokens);
      expect(result.candidatesTokenCount).toBe(result.outputTokens);
      expect(result.totalTokenCount).toBe(result.totalTokens);
    });

    it('should generate different values for different content', () => {
      const result1 = tokenCounterService._generateMockTokenCount('short');
      const result2 = tokenCounterService._generateMockTokenCount('this is a much longer content string that should generate different token counts');
      
      expect(result1.inputTokens).not.toBe(result2.inputTokens);
      expect(result2.inputTokens).toBeGreaterThan(result1.inputTokens);
    });

    it('should handle mock generation errors', () => {
      // Mock the _estimateTokensFromContent to throw an error
      const originalMethod = tokenCounterService._estimateTokensFromContent;
      tokenCounterService._estimateTokensFromContent = jest.fn().mockImplementation(() => {
        throw new Error('Estimation error');
      });

      const result = tokenCounterService._generateMockTokenCount('test');
      
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      
      // Restore original method
      tokenCounterService._estimateTokensFromContent = originalMethod;
    });
  });

  describe('getPricingInfo', () => {
    it('should return correct pricing info for free tier', () => {
      const info = tokenCounterService.getPricingInfo();
      expect(info.tier).toBe('free');
      expect(info.isFree).toBe(true);
      expect(info.isPaid).toBe(false);
      expect(info.pricing).toBeDefined();
    });

    it('should return correct pricing info for paid tier', () => {
      tokenCounterService.setPricingTier('paid');
      const info = tokenCounterService.getPricingInfo();
      expect(info.tier).toBe('paid');
      expect(info.isFree).toBe(false);
      expect(info.isPaid).toBe(true);
      tokenCounterService.setPricingTier('free');
    });
  });

  describe('setPricingTier', () => {
    it('should set pricing tier correctly', () => {
      tokenCounterService.setPricingTier('paid');
      expect(tokenCounterService.getPricingInfo().tier).toBe('paid');

      tokenCounterService.setPricingTier('free');
      expect(tokenCounterService.getPricingInfo().tier).toBe('free');
    });

    it('should throw error for invalid tier', () => {
      expect(() => {
        tokenCounterService.setPricingTier('invalid');
      }).toThrow('Invalid pricing tier. Must be "free" or "paid"');
    });
  });

  describe('calculateCostBreakdown', () => {
    it('should return detailed cost breakdown for free tier', () => {
      const breakdown = tokenCounterService.calculateCostBreakdown(1000000, 500000);

      expect(breakdown.tier).toBe('free');
      expect(breakdown.tokens.input).toBe(1000000);
      expect(breakdown.tokens.output).toBe(500000);
      expect(breakdown.tokens.total).toBe(1500000);
      expect(breakdown.costs.total).toBe(0);
    });

    it('should return detailed cost breakdown for paid tier', () => {
      tokenCounterService.setPricingTier('paid');

      const breakdown = tokenCounterService.calculateCostBreakdown(1000000, 500000);

      expect(breakdown.tier).toBe('paid');
      expect(breakdown.contentType).toBe('text');
      expect(breakdown.tokens.input).toBe(1000000);
      expect(breakdown.tokens.output).toBe(500000);
      expect(breakdown.costs.input).toBe(0.30);
      expect(breakdown.costs.output).toBe(1.25);
      expect(breakdown.costs.total).toBe(1.55);
      expect(breakdown.rates.input).toBe(0.30);
      expect(breakdown.rates.output).toBe(2.50);

      tokenCounterService.setPricingTier('free');
    });

    it('should handle audio content type correctly', () => {
      tokenCounterService.setPricingTier('paid');

      const breakdown = tokenCounterService.calculateCostBreakdown(1000000, 500000, {
        contentType: 'audio'
      });

      expect(breakdown.contentType).toBe('audio');
      expect(breakdown.costs.input).toBe(1.00); // Audio input rate
      expect(breakdown.rates.input).toBe(1.00);

      tokenCounterService.setPricingTier('free');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete token counting workflow', async () => {
      const mockResponse = { totalTokens: 200 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      // Count input tokens
      const inputResult = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Test prompt',
        'test-job-123'
      );

      expect(inputResult.success).toBe(true);
      expect(inputResult.totalTokens).toBe(200);

      // Extract usage metadata
      const apiResponse = {
        usageMetadata: {
          promptTokenCount: 200,
          candidatesTokenCount: 100,
          totalTokenCount: 300
        }
      };

      const usageResult = await tokenCounterService.extractUsageMetadata(apiResponse, 'test-job-123');

      expect(usageResult.success).toBe(true);
      expect(usageResult.totalTokens).toBe(300);
      expect(usageResult.estimatedCost).toBe(0); // Free tier
    });

    it('should handle mock workflow consistently', async () => {
      const mockResult = await tokenCounterService.getMockTokenCount('Test content', 'test-job-123');

      expect(mockResult.success).toBe(true);
      expect(mockResult.mock).toBe(true);
      expect(mockResult.totalTokens).toBeGreaterThan(0);
      expect(mockResult.estimatedCost).toBe(0); // Free tier
    });
  });
});