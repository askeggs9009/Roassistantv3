// Quick Test Script for Optimizations
// Run this to see debug output in action

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-test-token';

// Test prompts with different complexity levels
const testPrompts = [
    {
        name: 'Simple Fix',
        prompt: 'fix syntax error in this code',
        expectedModel: 'claude-3-5-haiku',
        expectedCache: false
    },
    {
        name: 'Simple (Cached)',
        prompt: 'fix syntax error in this code',  // Same prompt - should hit cache
        expectedModel: 'CACHED',
        expectedCache: true
    },
    {
        name: 'Medium Task',
        prompt: 'create a teleport script with sound effects',
        expectedModel: 'claude-4-sonnet',
        expectedCache: false
    },
    {
        name: 'Complex Task',
        prompt: 'build a complete multiplayer racing game system with state management and security',
        expectedModel: 'claude-4-sonnet',  // Should use Sonnet 4.5 (no Opus)
        expectedCache: false
    },
    {
        name: 'Common Request',
        prompt: 'create a click detector script',
        expectedModel: 'claude-3-5-haiku',
        expectedCache: false  // First time
    },
    {
        name: 'Common Request (Cached)',
        prompt: 'create a click detector script',  // Should hit cache
        expectedModel: 'CACHED',
        expectedCache: true
    }
];

async function testOptimizations() {
    console.log('🧪 Testing AI Optimizations with Debug Mode\n');
    console.log('=' .repeat(60));

    for (const test of testPrompts) {
        console.log(`\n📝 Test: ${test.name}`);
        console.log(`Prompt: "${test.prompt}"`);
        console.log(`Expected Model: ${test.expectedModel}`);
        console.log(`Expected Cache: ${test.expectedCache ? 'HIT' : 'MISS'}`);
        console.log('-'.repeat(40));

        try {
            const response = await axios.post(`${API_URL}/ask`, {
                prompt: test.prompt,
                model: 'claude-4-sonnet'  // Always request Sonnet to test routing
            }, {
                headers: {
                    'Authorization': `Bearer ${AUTH_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.debug) {
                const debug = response.data.debug;

                console.log('✅ Response Received!');
                console.log(`   Model Used: ${debug.modelInfo.selected}`);
                console.log(`   Complexity: ${debug.modelInfo.complexity}`);
                console.log(`   Cache Hit: ${debug.cacheInfo.hit ? '✅' : '❌'}`);
                console.log(`   Tokens: ${debug.tokenUsage.total} (saved ${debug.tokenUsage.saved})`);
                console.log(`   Cost: $${debug.cost.thisRequest.toFixed(6)}`);
                console.log(`   Saved: $${debug.cost.saved.toFixed(6)} (${debug.cost.percentSaved}%)`);

                // Validate expectations
                if (test.expectedCache && !debug.cacheInfo.hit) {
                    console.log('   ⚠️ Expected cache hit but got miss');
                } else if (!test.expectedCache && debug.cacheInfo.hit) {
                    console.log('   ⚠️ Unexpected cache hit');
                }

                if (test.expectedModel !== debug.modelInfo.selected && test.expectedModel !== 'CACHED') {
                    console.log(`   ⚠️ Expected ${test.expectedModel} but got ${debug.modelInfo.selected}`);
                }

            } else {
                console.log('❌ No debug info in response (debug mode disabled?)');
            }

        } catch (error) {
            console.error(`❌ Request failed: ${error.message}`);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Testing Complete!');
}

// Display summary of optimizations
function displayOptimizationSummary() {
    console.log('\n📊 OPTIMIZATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`
Configuration:
• Models: Haiku + Sonnet 4.5 only (no Opus)
• Cache: Enabled with 7-day TTL
• Debug: Shows token usage in every response
• Routing: Automatic based on complexity

Expected Savings:
• Simple tasks → Haiku: 95% cheaper
• Cached responses: 100% free
• Context trimming: 20-40% reduction
• Combined: 60-80% total savings

Token Limits:
• Free: 600K/month (30K/day)
• Pro: 3M/month (150K/day)
• Enterprise: 10M/month (500K/day)

Debug Info Shown:
• Token usage (input/output/total/saved)
• Model selection and reasoning
• Cache status (hit/miss)
• Cost analysis per request
• Budget remaining
    `);
}

// Run tests
console.log('🚀 Starting Optimization Tests...\n');
displayOptimizationSummary();
testOptimizations().catch(console.error);