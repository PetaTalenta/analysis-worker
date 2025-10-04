/**
 * Gemini 2.5 Flash Pricing Demo
 * Demonstrates the updated token counter with new pricing structure
 */

const TokenCounterService = require('../src/services/tokenCounterService');

async function demonstratePricing() {
  console.log('=== Gemini 2.5 Flash Pricing Demo ===\n');

  const tokenCounter = new TokenCounterService();

  // Sample content for demonstration
  const sampleContent = `
    Analyze this comprehensive assessment data for a software engineer position:
    
    RIASEC Profile:
    - Realistic: 75/100 (Hands-on problem solving, technical implementation)
    - Investigative: 90/100 (Research, analysis, systematic thinking)
    - Artistic: 60/100 (Creative problem solving, design thinking)
    - Social: 45/100 (Team collaboration, mentoring)
    - Enterprising: 55/100 (Leadership, project management)
    - Conventional: 70/100 (Organization, attention to detail)
    
    OCEAN Personality:
    - Openness: 85/100 (Open to new technologies and approaches)
    - Conscientiousness: 80/100 (Reliable, detail-oriented)
    - Extraversion: 50/100 (Balanced social interaction)
    - Agreeableness: 70/100 (Collaborative, team-oriented)
    - Neuroticism: 30/100 (Emotionally stable under pressure)
    
    Technical Skills Assessment:
    - Programming Languages: JavaScript (Expert), Python (Advanced), Java (Intermediate)
    - Frameworks: React, Node.js, Express, Django
    - Databases: PostgreSQL, MongoDB, Redis
    - Cloud Platforms: AWS, Docker, Kubernetes
    - Development Tools: Git, Jenkins, JIRA
    
    Please provide a detailed persona profile including career recommendations,
    skill development suggestions, and team fit analysis.
  `;

  // Estimate tokens for the sample content
  const estimatedTokens = Math.ceil(sampleContent.length / 4); // ~4 chars per token
  const estimatedOutputTokens = Math.ceil(estimatedTokens * 0.8); // Typical response ratio

  console.log('Sample Content Analysis:');
  console.log(`- Content length: ${sampleContent.length} characters`);
  console.log(`- Estimated input tokens: ${estimatedTokens.toLocaleString()}`);
  console.log(`- Estimated output tokens: ${estimatedOutputTokens.toLocaleString()}`);
  console.log(`- Total estimated tokens: ${(estimatedTokens + estimatedOutputTokens).toLocaleString()}\n`);

  // Demonstrate Free Tier
  console.log('=== FREE TIER PRICING ===');
  console.log('Current tier:', tokenCounter.getPricingInfo().tier);
  
  const freeCost = tokenCounter.calculateEstimatedCost(estimatedTokens, estimatedOutputTokens);
  const freeBreakdown = tokenCounter.calculateCostBreakdown(estimatedTokens, estimatedOutputTokens);
  
  console.log(`Total cost: $${freeCost.toFixed(6)}`);
  console.log('Cost breakdown:', JSON.stringify(freeBreakdown.costs, null, 2));
  console.log();

  // Demonstrate Paid Tier - Text Content
  console.log('=== PAID TIER PRICING - TEXT CONTENT ===');
  tokenCounter.setPricingTier('paid');
  console.log('Current tier:', tokenCounter.getPricingInfo().tier);
  
  const paidCost = tokenCounter.calculateEstimatedCost(estimatedTokens, estimatedOutputTokens);
  const paidBreakdown = tokenCounter.calculateCostBreakdown(estimatedTokens, estimatedOutputTokens);
  
  console.log(`Input tokens: ${estimatedTokens.toLocaleString()} × $0.30/1M = $${paidBreakdown.costs.input.toFixed(6)}`);
  console.log(`Output tokens: ${estimatedOutputTokens.toLocaleString()} × $2.50/1M = $${paidBreakdown.costs.output.toFixed(6)}`);
  console.log(`Total cost: $${paidCost.toFixed(6)}`);
  console.log();

  // Demonstrate Paid Tier - Audio Content
  console.log('=== PAID TIER PRICING - AUDIO CONTENT ===');
  const audioCost = tokenCounter.calculateEstimatedCost(estimatedTokens, estimatedOutputTokens, {
    contentType: 'audio'
  });
  const audioBreakdown = tokenCounter.calculateCostBreakdown(estimatedTokens, estimatedOutputTokens, {
    contentType: 'audio'
  });
  
  console.log(`Input tokens (audio): ${estimatedTokens.toLocaleString()} × $1.00/1M = $${audioBreakdown.costs.input.toFixed(6)}`);
  console.log(`Output tokens: ${estimatedOutputTokens.toLocaleString()} × $2.50/1M = $${audioBreakdown.costs.output.toFixed(6)}`);
  console.log(`Total cost: $${audioCost.toFixed(6)}`);
  console.log();

  // Demonstrate Context Caching
  console.log('=== CONTEXT CACHING PRICING ===');
  const contextCachingTokens = Math.ceil(estimatedTokens * 0.3); // 30% of input for caching
  const contextStorageHours = 24; // 24 hours storage
  
  const cachingCost = tokenCounter.calculateEstimatedCost(estimatedTokens, estimatedOutputTokens, {
    contextCachingTokens,
    contextStorageHours
  });
  const cachingBreakdown = tokenCounter.calculateCostBreakdown(estimatedTokens, estimatedOutputTokens, {
    contextCachingTokens,
    contextStorageHours
  });
  
  console.log(`Input tokens: ${estimatedTokens.toLocaleString()} × $0.30/1M = $${cachingBreakdown.costs.input.toFixed(6)}`);
  console.log(`Output tokens: ${estimatedOutputTokens.toLocaleString()} × $2.50/1M = $${cachingBreakdown.costs.output.toFixed(6)}`);
  console.log(`Context caching: ${contextCachingTokens.toLocaleString()} × $0.075/1M = $${cachingBreakdown.costs.contextCaching.toFixed(6)}`);
  console.log(`Context storage: ${contextCachingTokens.toLocaleString()} × $1.00/1M × ${contextStorageHours}h = $${cachingBreakdown.costs.contextStorage.toFixed(6)}`);
  console.log(`Total cost: $${cachingCost.toFixed(6)}`);
  console.log();

  // Cost comparison scenarios
  console.log('=== COST COMPARISON SCENARIOS ===');
  
  const scenarios = [
    { name: 'Small Request', input: 1000, output: 500 },
    { name: 'Medium Request', input: 10000, output: 5000 },
    { name: 'Large Request', input: 100000, output: 50000 },
    { name: 'Very Large Request', input: 1000000, output: 500000 }
  ];

  console.log('Scenario\t\tInput Tokens\tOutput Tokens\tText Cost\tAudio Cost');
  console.log('─'.repeat(80));
  
  scenarios.forEach(scenario => {
    const textCost = tokenCounter.calculateEstimatedCost(scenario.input, scenario.output);
    const audioCost = tokenCounter.calculateEstimatedCost(scenario.input, scenario.output, {
      contentType: 'audio'
    });
    
    console.log(`${scenario.name.padEnd(16)}\t${scenario.input.toLocaleString().padEnd(12)}\t${scenario.output.toLocaleString().padEnd(12)}\t$${textCost.toFixed(6)}\t$${audioCost.toFixed(6)}`);
  });

  console.log('\n=== PRICING INFORMATION ===');
  const pricingInfo = tokenCounter.getPricingInfo();
  console.log('Current pricing configuration:');
  console.log(JSON.stringify(pricingInfo.pricing, null, 2));

  // Reset to free tier
  tokenCounter.setPricingTier('free');
  console.log('\nDemo completed. Pricing tier reset to free.');
}

// Run the demo
if (require.main === module) {
  demonstratePricing().catch(console.error);
}

module.exports = { demonstratePricing };
