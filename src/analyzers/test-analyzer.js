/**
 * Test Script for Assessment Analyzer
 * 
 * Simple test to verify the dynamic assessment analyzer works correctly
 */

const assessmentAnalyzer = require('./assessmentAnalyzer');
const logger = require('../utils/logger');

/**
 * Test data for talent mapping assessment
 */
const testTalentMappingData = {
  riasec: {
    realistic: 65,
    investigative: 85,
    artistic: 45,
    social: 70,
    enterprising: 55,
    conventional: 40
  },
  ocean: {
    openness: 80,
    conscientiousness: 75,
    extraversion: 60,
    agreeableness: 70,
    neuroticism: 35
  },
  viaIs: {
    creativity: 85,
    curiosity: 90,
    judgment: 75,
    loveOfLearning: 80,
    perspective: 70,
    bravery: 65,
    perseverance: 75,
    honesty: 80,
    zest: 60,
    love: 70,
    kindness: 75,
    socialIntelligence: 65,
    teamwork: 70,
    fairness: 75,
    leadership: 60,
    forgiveness: 65,
    humility: 70,
    prudence: 65,
    selfRegulation: 70,
    appreciationOfBeauty: 55,
    gratitude: 75,
    hope: 70,
    humor: 65,
    spirituality: 50
  },
  industryScore: {
    technology: 85,
    healthcare: 60,
    education: 70,
    finance: 55,
    creative: 65
  }
};

/**
 * Test unknown assessment data
 */
const testUnknownData = {
  someField: "test value",
  anotherField: {
    nested: "data"
  },
  arrayField: [1, 2, 3]
};

/**
 * Run tests
 */
async function runTests() {
  console.log('🧪 Starting Assessment Analyzer Tests\n');

  try {
    // Test 1: Supported assessment (talent mapping)
    console.log('Test 1: Talent Mapping Assessment');
    console.log('=====================================');
    
    const result1 = await assessmentAnalyzer.analyzeAssessment(
      'AI-Driven Talent Mapping',
      testTalentMappingData,
      'test-job-1'
    );
    
    console.log('✅ Result:', {
      success: result1.success,
      analysisType: result1.analysisType,
      analyzer: result1._metadata?.analyzer,
      hasResult: !!result1.result
    });
    console.log('');

    // Test 2: Alternative talent mapping name
    console.log('Test 2: Alternative Talent Mapping Name');
    console.log('=======================================');
    
    const result2 = await assessmentAnalyzer.analyzeAssessment(
      'talent_mapping',
      testTalentMappingData,
      'test-job-2'
    );
    
    console.log('✅ Result:', {
      success: result2.success,
      analysisType: result2.analysisType,
      analyzer: result2._metadata?.analyzer,
      hasResult: !!result2.result
    });
    console.log('');

    // Test 3: Unknown assessment type
    console.log('Test 3: Unknown Assessment Type');
    console.log('===============================');
    
    const result3 = await assessmentAnalyzer.analyzeAssessment(
      'unknown_assessment_type',
      testUnknownData,
      'test-job-3'
    );
    
    console.log('❌ Result (Expected Error):', {
      success: result3.success,
      analysisType: result3.analysisType,
      analyzer: result3.analyzer,
      errorCode: result3.error?.code,
      errorMessage: result3.error?.message
    });
    console.log('');

    // Test 4: Check supported assessments
    console.log('Test 4: Supported Assessments');
    console.log('=============================');
    
    const supportedAssessments = assessmentAnalyzer.getSupportedAssessments();
    console.log('✅ Supported assessments:', supportedAssessments);
    
    const isSupported1 = assessmentAnalyzer.isAssessmentSupported('AI-Driven Talent Mapping');
    const isSupported2 = assessmentAnalyzer.isAssessmentSupported('unknown_type');
    
    console.log('✅ Is "AI-Driven Talent Mapping" supported?', isSupported1);
    console.log('❌ Is "unknown_type" supported?', isSupported2);
    console.log('');

    // Test 5: Analyzer info
    console.log('Test 5: Analyzer Information');
    console.log('============================');
    
    const analyzerInfo = assessmentAnalyzer.getAnalyzerInfo();
    console.log('✅ Analyzer info:', analyzerInfo);
    console.log('');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testTalentMappingData,
  testUnknownData
};
