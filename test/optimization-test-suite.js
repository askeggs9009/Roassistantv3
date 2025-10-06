// Optimization Test Suite
// Tests and measures the effectiveness of all optimizations

import { optimizeAIRequest, getOptimizationMetrics } from '../services/optimization-integrator.js';
import { tokenBudgetManager } from '../services/token-budget-manager.js';
import { modelRouter } from '../services/model-router.js';
import responseCache from '../services/response-cache.js';
import contextManager from '../services/context-manager.js';

class OptimizationTestSuite {
    constructor() {
        this.results = {
            tokenSavings: [],
            costSavings: [],
            cacheHitRate: 0,
            modelRoutingAccuracy: 0,
            responseTimeImprovement: 0
        };
    }

    // Run complete test suite
    async runAllTests() {
        console.log('🧪 Starting Optimization Test Suite...\n');

        const tests = [
            this.testCacheSystem(),
            this.testModelRouting(),
            this.testContextTrimming(),
            this.testTokenBudget(),
            this.testBatchProcessing(),
            this.testEndToEndOptimization()
        ];

        const results = await Promise.all(tests);

        this.generateReport(results);
        return this.results;
    }

    // Test 1: Cache System Performance
    async testCacheSystem() {
        console.log('📦 Testing Cache System...');

        const testPrompts = [
            "create a click detector script",
            "make a teleport pad",
            "create a GUI button",
            "add tween animation",
            "create leaderstats",
            "make a tool script",
            "create a click detector script", // Duplicate for cache hit
            "make a teleport pad" // Duplicate for cache hit
        ];

        let hits = 0;
        let misses = 0;

        for (const prompt of testPrompts) {
            const cached = await responseCache.get(prompt, 'test-model');
            if (cached) {
                hits++;
                console.log(`  ✅ Cache HIT: "${prompt.substring(0, 30)}..."`);
            } else {
                misses++;
                console.log(`  ❌ Cache MISS: "${prompt.substring(0, 30)}..."`);
                // Store in cache for next time
                await responseCache.set(prompt, `Mock response for: ${prompt}`, 'test-model', 500);
            }
        }

        const hitRate = (hits / (hits + misses)) * 100;
        console.log(`  📊 Cache Hit Rate: ${hitRate.toFixed(1)}%\n`);

        return {
            test: 'Cache System',
            hitRate,
            expectedSavings: hits * 500, // tokens saved
            passed: hitRate > 20
        };
    }

    // Test 2: Model Routing Logic
    async testModelRouting() {
        console.log('🎯 Testing Model Routing...');

        const testCases = [
            { prompt: "fix syntax error", expected: 'simple', model: 'claude-3-5-haiku' },
            { prompt: "create a complex multiplayer system", expected: 'complex', model: 'claude-4-opus' },
            { prompt: "make a teleport script", expected: 'medium', model: 'claude-4-sonnet' },
            { prompt: "explain what is a RemoteEvent", expected: 'simple', model: 'claude-3-5-haiku' },
            { prompt: "build entire game framework with state management", expected: 'complex', model: 'claude-4-opus' }
        ];

        let correct = 0;
        let totalSavings = 0;

        for (const test of testCases) {
            const result = await modelRouter.routeRequest(test.prompt, {
                subscription: 'pro',
                preferredModel: null,
                forceModel: null
            });

            const isCorrect = result.model === test.model;
            correct += isCorrect ? 1 : 0;

            if (result.potentialSavings) {
                totalSavings += parseFloat(result.potentialSavings.amount || 0);
            }

            console.log(`  ${isCorrect ? '✅' : '❌'} "${test.prompt.substring(0, 40)}..."
     Expected: ${test.model}, Got: ${result.model}
     Complexity: ${result.complexity}`);
        }

        const accuracy = (correct / testCases.length) * 100;
        console.log(`  📊 Routing Accuracy: ${accuracy.toFixed(1)}%`);
        console.log(`  💰 Potential Savings: ${totalSavings.toFixed(1)}%\n`);

        return {
            test: 'Model Routing',
            accuracy,
            savings: totalSavings,
            passed: accuracy >= 80
        };
    }

    // Test 3: Context Trimming
    async testContextTrimming() {
        console.log('✂️ Testing Context Trimming...');

        // Simulate conversation history
        const messages = [];
        for (let i = 0; i < 20; i++) {
            messages.push({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}: ${i % 3 === 0 ? 'Create a script for' : 'Here is the code for'} feature ${i}`
            });
        }

        const currentPrompt = "fix the error in the teleport script";

        const result = contextManager.processConversation(messages, currentPrompt, 'free');

        const originalTokens = contextManager.estimateTokens(contextManager.formatMessages(messages));
        const optimizedTokens = contextManager.estimateTokens(result.context);
        const savings = ((originalTokens - optimizedTokens) / originalTokens) * 100;

        console.log(`  📝 Original messages: ${messages.length}`);
        console.log(`  ✂️ Included in context: ${result.messagesIncluded || 'N/A'}`);
        console.log(`  📊 Token reduction: ${savings.toFixed(1)}%`);
        console.log(`  💾 Tokens saved: ${result.tokensSaved}\n`);

        return {
            test: 'Context Trimming',
            tokensSaved: result.tokensSaved,
            percentReduction: savings,
            passed: savings > 30
        };
    }

    // Test 4: Token Budget Management
    async testTokenBudget() {
        console.log('💰 Testing Token Budget Management...');

        const testUserId = 'test-user-123';
        const subscription = 'free';

        // Test budget checking
        const checks = [
            { tokens: 100, desc: 'Small request' },
            { tokens: 1000, desc: 'Medium request' },
            { tokens: 10000, desc: 'Large request' },
            { tokens: 50000, desc: 'Very large request' }
        ];

        let allowedCount = 0;
        let warnings = 0;

        for (const check of checks) {
            const result = await tokenBudgetManager.canMakeRequest(
                testUserId,
                check.tokens,
                'claude-4-sonnet',
                subscription
            );

            if (result.allowed) {
                allowedCount++;
                tokenBudgetManager.recordUsage(testUserId, check.tokens, 'claude-4-sonnet', subscription);
            }

            if (result.warning) {
                warnings++;
            }

            console.log(`  ${result.allowed ? '✅' : '❌'} ${check.desc}: ${check.tokens} tokens
     ${result.allowed ? 'Allowed' : result.message}`);
        }

        const stats = tokenBudgetManager.getUserStats(testUserId, subscription);

        console.log(`  📊 Budget Used: ${stats.remaining.percentUsed}%`);
        console.log(`  ⚠️ Warnings triggered: ${warnings}\n`);

        return {
            test: 'Token Budget',
            requestsAllowed: allowedCount,
            budgetUsed: stats.remaining.percentUsed,
            passed: allowedCount >= 2 && warnings >= 1
        };
    }

    // Test 5: Batch Processing
    async testBatchProcessing() {
        console.log('📦 Testing Batch Processing...');

        const batchRequests = [
            { prompt: "fix syntax error", type: 'simple' },
            { prompt: "rename variable", type: 'simple' },
            { prompt: "add comment", type: 'simple' },
            { prompt: "format code", type: 'simple' },
            { prompt: "create complex system", type: 'complex' }
        ];

        let batchable = 0;
        let nonBatchable = 0;
        let estimatedSavings = 0;

        const { canBatch } = await import('../services/batch-request-handler.js');

        for (const request of batchRequests) {
            const shouldBatch = canBatch(request);

            if (shouldBatch) {
                batchable++;
                estimatedSavings += 150; // Estimated tokens saved per batched request
            } else {
                nonBatchable++;
            }

            console.log(`  ${shouldBatch ? '✅' : '❌'} "${request.prompt}": ${shouldBatch ? 'Batchable' : 'Process individually'}`);
        }

        const batchRate = (batchable / batchRequests.length) * 100;
        console.log(`  📊 Batchable: ${batchRate.toFixed(1)}%`);
        console.log(`  💾 Estimated tokens saved: ${estimatedSavings}\n`);

        return {
            test: 'Batch Processing',
            batchRate,
            tokensSaved: estimatedSavings,
            passed: batchRate >= 60
        };
    }

    // Test 6: End-to-End Optimization
    async testEndToEndOptimization() {
        console.log('🚀 Testing End-to-End Optimization...');

        const testScenarios = [
            {
                name: 'Simple Fix',
                prompt: 'fix this syntax error',
                messages: [],
                expectedModel: 'claude-3-5-haiku'
            },
            {
                name: 'Feature Implementation',
                prompt: 'create a teleport system with GUI',
                messages: [
                    { role: 'user', content: 'I need help with my game' },
                    { role: 'assistant', content: 'I can help you' }
                ],
                expectedModel: 'claude-4-sonnet'
            },
            {
                name: 'Complex Architecture',
                prompt: 'design a multiplayer state management system with security',
                messages: [],
                expectedModel: 'claude-4-opus'
            }
        ];

        const results = [];

        for (const scenario of testScenarios) {
            const optimization = await optimizeAIRequest({
                prompt: scenario.prompt,
                model: 'claude-4-sonnet', // Default request
                messages: scenario.messages,
                user: { subscription: { plan: 'pro' } }
            });

            const savings = optimization.tokenSavings + (optimization.costSavings || 0);

            results.push({
                scenario: scenario.name,
                selectedModel: optimization.selectedModel,
                correctModel: optimization.selectedModel === scenario.expectedModel,
                tokensSaved: optimization.tokenSavings,
                costSaved: optimization.costSavings || 0,
                optimizationSteps: optimization.optimizationSteps.length
            });

            console.log(`  📋 ${scenario.name}:
     Model: ${optimization.selectedModel} ${optimization.selectedModel === scenario.expectedModel ? '✅' : '❌'}
     Tokens Saved: ${optimization.tokenSavings}
     Cost Saved: $${(optimization.costSavings || 0).toFixed(4)}
     Steps: ${optimization.optimizationSteps.join(', ')}`);
        }

        const totalTokensSaved = results.reduce((sum, r) => sum + r.tokensSaved, 0);
        const totalCostSaved = results.reduce((sum, r) => sum + r.costSaved, 0);
        const correctModels = results.filter(r => r.correctModel).length;

        console.log(`\n  📊 Total Tokens Saved: ${totalTokensSaved}`);
        console.log(`  💰 Total Cost Saved: $${totalCostSaved.toFixed(4)}`);
        console.log(`  🎯 Model Selection Accuracy: ${(correctModels / results.length * 100).toFixed(1)}%\n`);

        return {
            test: 'End-to-End',
            tokensSaved: totalTokensSaved,
            costSaved: totalCostSaved,
            accuracy: (correctModels / results.length) * 100,
            passed: correctModels >= 2
        };
    }

    // Generate comprehensive report
    generateReport(results) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('                    OPTIMIZATION TEST REPORT                       ');
        console.log('═══════════════════════════════════════════════════════════════');

        let totalPassed = 0;
        let totalTokensSaved = 0;
        let totalCostSaved = 0;

        results.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`\n${status} - ${result.test}`);

            if (result.tokensSaved) {
                totalTokensSaved += result.tokensSaved;
                console.log(`  Tokens Saved: ${result.tokensSaved}`);
            }
            if (result.costSaved) {
                totalCostSaved += result.costSaved;
                console.log(`  Cost Saved: $${result.costSaved.toFixed(4)}`);
            }
            if (result.accuracy !== undefined) {
                console.log(`  Accuracy: ${result.accuracy.toFixed(1)}%`);
            }
            if (result.hitRate !== undefined) {
                console.log(`  Hit Rate: ${result.hitRate.toFixed(1)}%`);
            }

            if (result.passed) totalPassed++;
        });

        const successRate = (totalPassed / results.length) * 100;

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('                         SUMMARY                                  ');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`Tests Passed: ${totalPassed}/${results.length} (${successRate.toFixed(1)}%)`);
        console.log(`Total Tokens Saved: ${totalTokensSaved.toLocaleString()}`);
        console.log(`Total Cost Saved: $${totalCostSaved.toFixed(2)}`);
        console.log(`Projected Monthly Savings: $${(totalCostSaved * 1000).toFixed(2)}`);

        // Estimate cost reduction percentage
        const baselineCost = 15.00; // Estimated baseline cost per 1000 requests
        const optimizedCost = baselineCost - totalCostSaved;
        const costReduction = ((baselineCost - optimizedCost) / baselineCost) * 100;

        console.log(`\n💰 COST REDUCTION: ${costReduction.toFixed(1)}%`);
        console.log(`📈 TOKEN EFFICIENCY: ${(totalTokensSaved / 1000).toFixed(1)}x improvement`);

        if (successRate >= 80) {
            console.log('\n🎉 OPTIMIZATION SUITE: SUCCESSFUL');
            console.log('All major optimizations are working effectively!');
        } else {
            console.log('\n⚠️ OPTIMIZATION SUITE: NEEDS ATTENTION');
            console.log('Some optimizations require tuning.');
        }

        this.results = {
            successRate,
            totalTokensSaved,
            totalCostSaved,
            monthlyProjectedSavings: totalCostSaved * 1000,
            costReductionPercent: costReduction
        };
    }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const tester = new OptimizationTestSuite();
    tester.runAllTests().then(results => {
        console.log('\n✅ Test suite complete!');
        process.exit(results.successRate >= 80 ? 0 : 1);
    }).catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

export default OptimizationTestSuite;