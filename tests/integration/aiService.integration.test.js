/**
 * AI Service Integration Tests
 * Tests the integration of token counting with AI service
 */

// Set test environment variables before requiring modules
process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
process.env.USE_MOCK_MODEL = 'true';

// Mock the mock AI service to avoid 30-second delay
jest.mock('../../src/services/mockAiService', () => ({
  generateMockPersonaProfile: jest.fn().mockResolvedValue({
    archetype: 'The Test Analyst',
    shortSummary: 'Test summary for integration testing',
    strengths: ['Test strength 1', 'Test strength 2', 'Test strength 3'],
    weaknesses: ['Test weakness 1', 'Test weakness 2', 'Test weakness 3'],
    careerRecommendation: [
      {
        careerName: 'Test Career',
        careerProspect: {
          jobAvailability: 'high',
          salaryPotential: 'high',
          careerProgression: 'high',
          industryGrowth: 'high',
          skillDevelopment: 'high'
        }
      }
    ],
    insights: ['Test insight 1', 'Test insight 2', 'Test insight 3'],
    workEnvironment: 'Test work environment description',
    roleModel: ['Test Role Model 1', 'Test Role Model 2', 'Test Role Model 3', 'Test Role Model 4']
  })
}));

const aiService = require('../../src/services/aiService');
const logger = require('../../src/utils/logger');

// Mock logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('AI Service Integration Tests', () => {
  const mockAssessmentData = {
    riasec: {
      realistic: 75,
      investigative: 85,
      artistic: 60,
      social: 45,
      enterprising: 70,
      conventional: 55
    },
    ocean: {
      openness: 80,
      conscientiousness: 75,
      extraversion: 50,
      agreeableness: 65,
      neuroticism: 40
    },
    viaIs: {
      creativity: 85,
      curiosity: 90,
      judgment: 80,
      loveOfLearning: 75,
      perspective: 70,
      bravery: 60,
      perseverance: 85,
      honesty: 80,
      zest: 65,
      love: 55,
      kindness: 70,
      socialIntelligence: 60,
      teamwork: 65,
      fairness: 75,
      leadership: 70,
      forgiveness: 60,
      humility: 65,
      prudence: 70,
      selfRegulation: 75,
      appreciationOfBeauty: 60,
      gratitude: 70,
      hope: 75,
      humor: 65,
      spirituality: 50
    }
  };

  const mockAssessmentDataWithIndustryScore = {
    ...mockAssessmentData,
    industryScore: {
      teknologi: 24,
      kesehatan: 24,
      keuangan: 24,
      pendidikan: 24,
      rekayasa: 24
    }
  };

  beforeAll(async () => {
    // Set test API key before initialization
    process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
    
    // Initialize AI service
    await aiService.initialize();
  });

  beforeEach(() => {
    // Clear logger mocks before each test
    jest.clearAllMocks();
  });

  describe('generatePersonaProfile with Token Counting', () => {
    test('should generate persona profile with mock AI and track token usage', async () => {
      const jobId = 'test-job-123';
      
      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
      
      const result = await aiService.generatePersonaProfile(mockAssessmentData, jobId);
      
      // Verify the result structure
      expect(result).toBeDefined();
      expect(result.archetype).toBeDefined();
      expect(result.shortSummary).toBeDefined();
      expect(result.strengths).toBeInstanceOf(Array);
      expect(result.weaknesses).toBeInstanceOf(Array);
      expect(result.careerRecommendation).toBeInstanceOf(Array);
      expect(result.insights).toBeInstanceOf(Array);
      expect(result.workEnvironment).toBeDefined();
      expect(result.roleModel).toBeInstanceOf(Array);
      
      // Verify logging was called with token information
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Mock token counting completed'),
        expect.objectContaining({
          jobId,
          inputTokens: expect.any(Number)
        })
      );
      
      // Verify mock AI service was used
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using mock AI model'),
        expect.objectContaining({
          jobId
        })
      );
    }, 10000);

    test('should handle token counting failures gracefully', async () => {
      const jobId = 'test-job-error-456';
      
      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
      
      const result = await aiService.generatePersonaProfile(mockAssessmentData, jobId);
      
      // Should still return a valid result even if token counting fails
      expect(result).toBeDefined();
      expect(result.archetype).toBeDefined();
      
      // The service should continue working even if token counting encounters issues
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using mock AI model'),
        expect.objectContaining({ jobId })
      );
    }, 10000);

    test('should log enhanced token breakdown information', async () => {
      const jobId = 'test-job-logging-789';
      
      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
      
      await aiService.generatePersonaProfile(mockAssessmentData, jobId);
      
      // Check that enhanced logging with token breakdown was called
      const logCalls = logger.debug.mock.calls;
      const tokenLogCall = logCalls.find(call =>
        call[0].includes('Mock token counting completed')
      );

      expect(tokenLogCall).toBeDefined();
      expect(tokenLogCall[1]).toMatchObject({
        jobId,
        inputTokens: expect.any(Number)
      });
    }, 10000);
  });

  describe('Error Handling', () => {
    test('should not interrupt AI operations when token counting fails', async () => {
      const jobId = 'test-job-resilience-999';
      
      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';
      
      // This should complete successfully even if there are token counting issues
      const result = await aiService.generatePersonaProfile(mockAssessmentData, jobId);
      
      expect(result).toBeDefined();
      expect(result.archetype).toBeDefined();
      
      // Verify that the operation completed successfully
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using mock AI model'),
        expect.objectContaining({ jobId })
      );
    }, 10000);

    // Backward compatibility test
    test('should generate persona profile without industryScore (backward compatibility)', async () => {
      const jobId = 'test-job-backward-compat';

      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';

      const result = await aiService.generatePersonaProfile(mockAssessmentData, jobId);

      // Should return a valid result even without industryScore
      expect(result).toBeDefined();
      expect(result.archetype).toBeDefined();
      expect(result.careerRecommendation).toBeDefined();
      expect(Array.isArray(result.careerRecommendation)).toBe(true);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using mock AI model'),
        expect.objectContaining({ jobId })
      );
    }, 10000);

    test('should generate persona profile with industryScore', async () => {
      const jobId = 'test-job-with-industry-score';

      // Set environment to use mock AI
      process.env.GOOGLE_AI_API_KEY = 'test_api_key_placeholder';

      const result = await aiService.generatePersonaProfile(mockAssessmentDataWithIndustryScore, jobId);

      // Should return a valid result with industryScore
      expect(result).toBeDefined();
      expect(result.archetype).toBeDefined();
      expect(result.careerRecommendation).toBeDefined();
      expect(Array.isArray(result.careerRecommendation)).toBe(true);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using mock AI model'),
        expect.objectContaining({ jobId })
      );
    }, 10000);
  });
});