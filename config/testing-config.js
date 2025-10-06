// Testing Configuration
// Shows token usage, model selection, and cache status in responses

export const TESTING_CONFIG = {
    // Enable debug mode
    DEBUG_MODE: true,
    SHOW_TOKEN_STATS: true,
    SHOW_MODEL_INFO: true,
    SHOW_CACHE_STATUS: true,
    SHOW_OPTIMIZATION_DETAILS: true,

    // Model restrictions for testing
    ALLOWED_MODELS: ['claude-3-5-haiku', 'claude-4-sonnet'],
    DISABLED_MODELS: ['claude-4-opus', 'rocode-studio'],

    // Testing format for responses
    formatDebugResponse: function(response, debugInfo) {
        const separator = '\n\n---DEBUG INFO---\n';

        let debugText = separator;

        // Token usage
        if (debugInfo.tokenUsage) {
            debugText += `📊 **Token Usage:**\n`;
            debugText += `• Input: ${debugInfo.tokenUsage.input} tokens\n`;
            debugText += `• Output: ${debugInfo.tokenUsage.output} tokens\n`;
            debugText += `• Total: ${debugInfo.tokenUsage.total} tokens\n`;
            debugText += `• Saved: ${debugInfo.tokenUsage.saved || 0} tokens\n`;
        }

        // Model info
        if (debugInfo.modelInfo) {
            debugText += `\n🤖 **Model Info:**\n`;
            debugText += `• Model Used: ${debugInfo.modelInfo.selected}\n`;
            debugText += `• Original Request: ${debugInfo.modelInfo.original}\n`;
            debugText += `• Complexity: ${debugInfo.modelInfo.complexity}\n`;
            debugText += `• Reason: ${debugInfo.modelInfo.reason}\n`;
        }

        // Cache status
        if (debugInfo.cacheInfo) {
            debugText += `\n💾 **Cache Status:**\n`;
            debugText += `• Cache Hit: ${debugInfo.cacheInfo.hit ? '✅ YES' : '❌ NO'}\n`;
            if (debugInfo.cacheInfo.hit) {
                debugText += `• Tokens Saved: ${debugInfo.cacheInfo.savedTokens}\n`;
                debugText += `• Response From: Cache (Zero API cost!)\n`;
            } else {
                debugText += `• Response From: Live API\n`;
                debugText += `• Cached Now: Yes (for future use)\n`;
            }
        }

        // Optimization details
        if (debugInfo.optimization) {
            debugText += `\n⚡ **Optimizations:**\n`;
            debugText += `• System Prompt: ${debugInfo.optimization.promptMode} mode\n`;
            debugText += `• Context Trimmed: ${debugInfo.optimization.contextTrimmed || false}\n`;
            debugText += `• Max Tokens Set: ${debugInfo.optimization.maxTokens}\n`;
            if (debugInfo.optimization.steps) {
                debugText += `• Steps: ${debugInfo.optimization.steps.join(', ')}\n`;
            }
        }

        // Cost calculation
        if (debugInfo.cost) {
            debugText += `\n💰 **Cost Analysis:**\n`;
            debugText += `• This Request: $${debugInfo.cost.thisRequest.toFixed(6)}\n`;
            debugText += `• Without Optimization: $${debugInfo.cost.withoutOptimization.toFixed(6)}\n`;
            debugText += `• You Saved: $${debugInfo.cost.saved.toFixed(6)} (${debugInfo.cost.percentSaved}%)\n`;
        }

        // Budget status
        if (debugInfo.budget) {
            debugText += `\n📈 **Token Budget:**\n`;
            debugText += `• Daily Remaining: ${debugInfo.budget.dailyRemaining} tokens\n`;
            debugText += `• Monthly Remaining: ${debugInfo.budget.monthlyRemaining} tokens\n`;
            debugText += `• Monthly Used: ${debugInfo.budget.percentUsed}%\n`;
        }

        debugText += '\n---END DEBUG---';

        // Prepend debug info to response
        return response + debugText;
    },

    // Calculate cost for display
    calculateCost: function(model, inputTokens, outputTokens) {
        const costs = {
            'claude-3-5-haiku': {
                input: 0.25 / 1000000,
                output: 1.25 / 1000000
            },
            'claude-4-sonnet': {
                input: 3.00 / 1000000,
                output: 15.00 / 1000000
            }
        };

        const modelCosts = costs[model] || costs['claude-4-sonnet'];
        return (inputTokens * modelCosts.input) + (outputTokens * modelCosts.output);
    }
};

export default TESTING_CONFIG;