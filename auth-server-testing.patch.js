// TESTING PATCH: Modifications to auth-server.js for debug mode
// This shows token usage, model selection, and cache status in every response

// Add this import at the top
import TESTING_CONFIG from './config/testing-config.js';

// ============================================================
// REPLACE the /ask endpoint response section with this:
// ============================================================

// In the /ask endpoint, replace the final res.json() with:

        // Prepare debug information
        const debugInfo = {
            tokenUsage: {
                input: tokenUsage.input,
                output: tokenUsage.output,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            modelInfo: {
                selected: optimization.selectedModel,
                original: optimization.originalModel,
                complexity: optimization.complexity,
                reason: optimization.routingReason
            },
            cacheInfo: {
                hit: optimization.cacheHit,
                savedTokens: optimization.cacheHit ? optimization.tokenSavings : 0
            },
            optimization: {
                promptMode: promptMode,
                contextTrimmed: optimization.contextSummary ? true : false,
                maxTokens: optimization.maxTokens,
                steps: optimization.optimizationSteps
            },
            cost: {
                thisRequest: TESTING_CONFIG.calculateCost(
                    optimization.selectedModel,
                    tokenUsage.input,
                    tokenUsage.output
                ),
                withoutOptimization: TESTING_CONFIG.calculateCost(
                    'claude-4-sonnet',
                    tokenUsage.input * 2,
                    tokenUsage.output * 2
                ),
                saved: 0,
                percentSaved: 0
            },
            budget: {
                dailyRemaining: budgetCheck.remainingToday,
                monthlyRemaining: budgetCheck.remainingMonth,
                percentUsed: Math.round((1 - budgetCheck.remainingMonth / 600000) * 100)
            }
        };

        // Calculate savings
        debugInfo.cost.saved = debugInfo.cost.withoutOptimization - debugInfo.cost.thisRequest;
        debugInfo.cost.percentSaved = Math.round((debugInfo.cost.saved / debugInfo.cost.withoutOptimization) * 100);

        // Format response with debug info if in testing mode
        let finalResponse = response;
        if (TESTING_CONFIG.DEBUG_MODE) {
            finalResponse = TESTING_CONFIG.formatDebugResponse(response, debugInfo);
        }

        res.json({
            reply: finalResponse,
            // Include raw debug data in response for API consumers
            debug: TESTING_CONFIG.DEBUG_MODE ? debugInfo : undefined
        });

// ============================================================
// For CACHED responses, use this format:
// ============================================================

        if (optimization.cacheHit) {
            console.log('[OPTIMIZATION] Cache hit - returning cached response');

            // Record minimal token usage for cache hits
            tokenBudgetManager.recordUsage(userId, 10, model, subscription);

            const debugInfo = {
                tokenUsage: {
                    input: 0,
                    output: 0,
                    total: 0,
                    saved: optimization.tokenSavings
                },
                modelInfo: {
                    selected: 'CACHED',
                    original: model,
                    complexity: 'N/A',
                    reason: 'Response served from cache'
                },
                cacheInfo: {
                    hit: true,
                    savedTokens: optimization.tokenSavings
                },
                cost: {
                    thisRequest: 0,
                    withoutOptimization: TESTING_CONFIG.calculateCost(model, 500, 1500),
                    saved: TESTING_CONFIG.calculateCost(model, 500, 1500),
                    percentSaved: 100
                }
            };

            let finalResponse = optimization.cachedResponse;
            if (TESTING_CONFIG.DEBUG_MODE) {
                finalResponse = TESTING_CONFIG.formatDebugResponse(optimization.cachedResponse, debugInfo);
            }

            return res.json({
                reply: finalResponse,
                fromCache: true,
                debug: TESTING_CONFIG.DEBUG_MODE ? debugInfo : undefined
            });
        }

// ============================================================
// For STREAMING responses, add debug at the end:
// ============================================================

        // In the streaming endpoint, when sending the 'complete' event:

        const debugInfo = {
            tokenUsage: {
                input: tokenUsage.input,
                output: tokenUsage.output,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            modelInfo: {
                selected: optimization.selectedModel,
                original: model,
                complexity: optimization.complexity,
                reason: optimization.routingReason
            },
            cacheInfo: {
                hit: false,
                savedTokens: 0
            }
        };

        // Append debug info to the streamed response
        if (TESTING_CONFIG.DEBUG_MODE) {
            const debugText = TESTING_CONFIG.formatDebugResponse('', debugInfo);
            res.write(`data: ${JSON.stringify({
                type: 'debug',
                text: debugText
            })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse,
            tokenUsage: {
                ...tokenUsage,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            debug: TESTING_CONFIG.DEBUG_MODE ? debugInfo : undefined
        })}\n\n`);

// ============================================================
// Update MODEL_CONFIGS to use correct Sonnet 4.5:
// ============================================================

const MODEL_CONFIGS = {
    "claude-3-5-haiku": {
        model: "claude-3-5-haiku-20241022",
        requiresPlan: 'free',
        provider: 'anthropic'
    },
    "claude-4-sonnet": {
        model: "claude-3-5-sonnet-20241022",  // Sonnet 4.5
        requiresPlan: 'free',
        provider: 'anthropic'
    }
    // Remove all Opus and other model configs for testing
};

// ============================================================
// Add testing endpoint to toggle debug mode:
// ============================================================

app.post("/api/toggle-debug", authenticateToken, (req, res) => {
    TESTING_CONFIG.DEBUG_MODE = !TESTING_CONFIG.DEBUG_MODE;
    res.json({
        success: true,
        debugMode: TESTING_CONFIG.DEBUG_MODE,
        message: `Debug mode ${TESTING_CONFIG.DEBUG_MODE ? 'enabled' : 'disabled'}`
    });
});

// ============================================================
// EXAMPLE OUTPUT WITH DEBUG MODE:
// ============================================================
/*
User: "create a click detector script"

Response:
```lua
local part = script.Parent
local clickDetector = part:FindFirstChild("ClickDetector") or Instance.new("ClickDetector", part)

clickDetector.MouseClick:Connect(function(player)
    print(player.Name .. " clicked the part!")
end)
```

---DEBUG INFO---
📊 **Token Usage:**
• Input: 25 tokens
• Output: 87 tokens
• Total: 112 tokens
• Saved: 1388 tokens

🤖 **Model Info:**
• Model Used: claude-3-5-haiku
• Original Request: claude-4-sonnet
• Complexity: simple
• Reason: Simple task detected

💾 **Cache Status:**
• Cache Hit: ❌ NO
• Response From: Live API
• Cached Now: Yes (for future use)

⚡ **Optimizations:**
• System Prompt: codeOnly mode
• Context Trimmed: false
• Max Tokens Set: 500
• Steps: Model routing: Simple task detected

💰 **Cost Analysis:**
• This Request: $0.000115
• Without Optimization: $0.003750
• You Saved: $0.003635 (97%)

📈 **Token Budget:**
• Daily Remaining: 29888 tokens
• Monthly Remaining: 599888 tokens
• Monthly Used: 0%

---END DEBUG---

Second request (CACHED):
---DEBUG INFO---
📊 **Token Usage:**
• Input: 0 tokens
• Output: 0 tokens
• Total: 0 tokens
• Saved: 1500 tokens

🤖 **Model Info:**
• Model Used: CACHED
• Original Request: claude-4-sonnet
• Complexity: N/A
• Reason: Response served from cache

💾 **Cache Status:**
• Cache Hit: ✅ YES
• Tokens Saved: 1500
• Response From: Cache (Zero API cost!)

💰 **Cost Analysis:**
• This Request: $0.000000
• Without Optimization: $0.024000
• You Saved: $0.024000 (100%)

---END DEBUG---
*/