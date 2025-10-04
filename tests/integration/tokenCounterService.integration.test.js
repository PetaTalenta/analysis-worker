/**
 * TokenCounterService Integration Tests
 * Tests the service with more realistic scenarios and data
 */

const TokenCounterService = require('../../src/services/tokenCounterService');

// Mock logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('TokenCounterService Integration Tests', () => {
  let tokenCounterService;
  let mockClient;

  beforeEach(() => {
    tokenCounterService = new TokenCounterService();
    
    // Mock Gemini client with realistic responses
    mockClient = {
      models: {
        countTokens: jest.fn()
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Real-world content scenarios', () => {
    it('should handle typical AI prompt content', async () => {
      const realPrompt = `
        # PERAN ANDA
        Anda adalah seorang Psikolog Pakar Analisis Karir dan Kepribadian. 
        
        # KONTEKS TUGAS
        Anda akan menerima satu set data hasil asesmen psikometrik dari seorang individu.
        
        # DATA INPUT
        ## RIASEC Assessment:
        - Realistic: 75
        - Investigative: 85
        - Artistic: 60
        - Social: 45
        - Enterprising: 70
        - Conventional: 55
        
        ## OCEAN Personality Assessment:
        - Openness: 80
        - Conscientiousness: 75
        - Extraversion: 50
        - Agreeableness: 65
        - Neuroticism: 40
      `;

      const mockResponse = { totalTokens: 450 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        realPrompt,
        'integration-test-001'
      );

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(450);
      expect(result.inputTokens).toBe(450);
      expect(result.model).toBe('gemini-2.5-flash');
    });

    it('should handle structured content arrays', async () => {
      const structuredContent = [
        {
          role: 'user',
          parts: [
            {
              text: 'Analyze this assessment data and provide persona profile'
            }
          ]
        },
        {
          role: 'user', 
          parts: [
            {
              text: JSON.stringify({
                riasec: { realistic: 75, investigative: 85, artistic: 60 },
                ocean: { openness: 80, conscientiousness: 75, extraversion: 50 }
              })
            }
          ]
        }
      ];

      const mockResponse = { totalTokens: 320 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        structuredContent,
        'integration-test-002'
      );

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(320);
      expect(mockClient.models.countTokens).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: structuredContent
      });
    });

    it('should handle realistic API response metadata', async () => {
      const realisticResponse = {
        text: JSON.stringify({
          archetype: 'The Strategic Analyst',
          shortSummary: 'You are a strategic analyst with strong investigative skills...',
          strengths: ['Analytical thinking', 'Problem solving', 'Research skills'],
          weaknesses: ['Social interaction', 'Routine tasks', 'Time pressure'],
          careerRecommendation: [
            {
              careerName: 'Data Scientist',
              careerProspect: {
                jobAvailability: 'high',
                salaryPotential: 'high',
                careerProgression: 'high',
                industryGrowth: 'super high',
                skillDevelopment: 'super high'
              }
            }
          ]
        }),
        usageMetadata: {
          promptTokenCount: 450,
          candidatesTokenCount: 280,
          totalTokenCount: 730,
          thoughtsTokenCount: 15
        }
      };

      const result = await tokenCounterService.extractUsageMetadata(
        realisticResponse, 
        'integration-test-003'
      );

      expect(result.success).toBe(true);
      expect(result.inputTokens).toBe(450);
      expect(result.outputTokens).toBe(280);
      expect(result.totalTokens).toBe(730);
      expect(result.thoughtsTokenCount).toBe(15);
      expect(result.estimatedCost).toBe(0); // Free tier
    });
  });

  describe('Error handling scenarios', () => {
    it('should gracefully handle API timeout', async () => {
      mockClient.models.countTokens.mockRejectedValue(new Error('Request timeout'));

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Content that will timeout',
        'integration-test-004'
      );

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.error).toBe('Request timeout');
      expect(result.totalTokens).toBeGreaterThan(0); // Should have fallback estimation
      expect(result.estimationMethod).toBe('character_count');
    });

    it('should handle API rate limiting', async () => {
      mockClient.models.countTokens.mockRejectedValue(new Error('Rate limit exceeded'));

      const result = await tokenCounterService.countInputTokens(
        mockClient, 
        'gemini-2.5-flash', 
        'Content that hits rate limit',
        'integration-test-005'
      );

      expect(result.success).toBe(false);
      expect(result.fallbackUsed).toBe(true);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should handle malformed API responses', async () => {
      const malformedResponse = {
        // Missing usageMetadata
        text: 'Some response text',
        someOtherField: 'unexpected data'
      };

      const result = await tokenCounterService.extractUsageMetadata(
        malformedResponse, 
        'integration-test-006'
      );

      expect(result.success).toBe(true);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.totalTokens).toBe(0);
      expect(result.estimatedCost).toBe(0);
    });
  });

  describe('Mock service scenarios', () => {
    it('should provide consistent mock data for testing', async () => {
      const testContent = 'Standard test content for mock generation';
      
      const result1 = await tokenCounterService.getMockTokenCount(testContent, 'mock-test-001');
      const result2 = await tokenCounterService.getMockTokenCount(testContent, 'mock-test-002');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.mock).toBe(true);
      expect(result2.mock).toBe(true);

      // Mock data should be in reasonable ranges
      expect(result1.inputTokens).toBeGreaterThan(0);
      expect(result1.inputTokens).toBeLessThan(1000);
      expect(result1.outputTokens).toBeGreaterThan(0);
      expect(result1.outputTokens).toBeLessThan(1000);
      expect(result1.estimatedCost).toBe(0); // Free tier
    });

    it('should scale mock data with content size', async () => {
      const shortContent = 'Short';
      const longContent = 'This is a much longer piece of content that should generate significantly more tokens when processed through the mock token counting system because it contains many more words and characters than the short version.';

      const shortResult = await tokenCounterService.getMockTokenCount(shortContent, 'mock-test-003');
      const longResult = await tokenCounterService.getMockTokenCount(longContent, 'mock-test-004');

      expect(shortResult.success).toBe(true);
      expect(longResult.success).toBe(true);
      expect(longResult.inputTokens).toBeGreaterThan(shortResult.inputTokens);
      
      // Due to randomness in mock generation, we'll check that the base estimation is higher
      // rather than the final cost which includes random variation
      const shortBase = tokenCounterService._estimateTokensFromContent(shortContent);
      const longBase = tokenCounterService._estimateTokensFromContent(longContent);
      expect(longBase.inputTokens).toBeGreaterThan(shortBase.inputTokens);
    });
  });

  describe('Cost calculation scenarios', () => {
    it('should calculate realistic costs for typical usage', async () => {
      // Free tier - no cost
      const cost = tokenCounterService.calculateEstimatedCost(500, 300);
      expect(cost).toBe(0);
    });

    it('should handle high-volume scenarios', async () => {
      // Free tier - no cost
      const cost = tokenCounterService.calculateEstimatedCost(2000, 1500);
      expect(cost).toBe(0);
    });

    it('should handle edge cases in cost calculation', async () => {
      // Free tier - always zero
      const smallCost = tokenCounterService.calculateEstimatedCost(1, 1);
      expect(smallCost).toBe(0);

      // Zero usage
      const zeroCost = tokenCounterService.calculateEstimatedCost(0, 0);
      expect(zeroCost).toBe(0);

      // Large usage - still zero in free tier
      const largeCost = tokenCounterService.calculateEstimatedCost(10000, 5000);
      expect(largeCost).toBe(0);
    });
  });

  describe('Performance considerations', () => {
    it('should handle multiple concurrent token counting requests', async () => {
      const mockResponse = { totalTokens: 100 };
      mockClient.models.countTokens.mockResolvedValue(mockResponse);

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          tokenCounterService.countInputTokens(
            mockClient, 
            'gemini-2.5-flash', 
            `Test content ${i}`,
            `concurrent-test-${i}`
          )
        );
      }

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.totalTokens).toBe(100);
      });

      expect(mockClient.models.countTokens).toHaveBeenCalledTimes(5);
    });

    it('should complete mock token counting quickly', async () => {
      const startTime = Date.now();
      
      await tokenCounterService.getMockTokenCount('Test content for performance', 'perf-test-001');
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Mock token counting should complete within 200ms (including 100ms simulated delay)
      expect(duration).toBeLessThan(200);
    });
  });
});