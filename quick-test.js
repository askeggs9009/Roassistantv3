// Quick test to verify optimizations are working
import { analyzePromptComplexity } from './config/prompt-optimization.js';
import modelRouter from './services/model-router.js';
import responseCache from './services/response-cache.js';

console.log('🧪 Quick Optimization Test\n');
console.log('=' .repeat(50));

// Test 1: Model Routing
console.log('\n1️⃣ Testing Model Routing:');
const testPrompts = [
    { prompt: 'fix syntax error', expected: 'simple' },
    { prompt: 'create a teleport system', expected: 'medium' },
    { prompt: 'build complex multiplayer system', expected: 'complex' }
];

for (const test of testPrompts) {
    const analysis = analyzePromptComplexity(test.prompt);
    console.log(`   "${test.prompt}"`);
    console.log(`   → Complexity: ${analysis.complexity}, Model: ${analysis.suggestedModel}`);
}

// Test 2: Cache System
console.log('\n2️⃣ Testing Cache System:');
await responseCache.set('test prompt', 'cached response', 'test-model', 100);
const cached = await responseCache.get('test prompt', 'test-model');
console.log(`   Cache working: ${cached ? '✅ Yes' : '❌ No'}`);
if (cached) {
    console.log(`   Cached response found, saved ${cached.savedTokens || 100} tokens`);
}

// Test 3: Prompt Optimization
console.log('\n3️⃣ Testing Prompt Optimization:');
const complexities = ['simple', 'medium', 'complex'];
for (const complexity of complexities) {
    const result = analyzePromptComplexity(
        complexity === 'simple' ? 'fix error' :
        complexity === 'medium' ? 'create gui' :
        'build entire game'
    );
    console.log(`   ${complexity}: ${result.suggestedModel} (${result.promptMode} mode)`);
}

// Test 4: Model Selection
console.log('\n4️⃣ Testing Model Selection:');
const routing = await modelRouter.routeRequest('create a click detector', {
    subscription: 'free',
    preferredModel: 'claude-4-sonnet'
});
console.log(`   Request: "create a click detector"`);
console.log(`   → Selected: ${routing.model}`);
console.log(`   → Reason: ${routing.reason}`);

console.log('\n✅ All tests completed!');
console.log('=' .repeat(50));

process.exit(0);