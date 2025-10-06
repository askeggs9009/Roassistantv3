// Main Optimization Integration Service
// Coordinates all cost-saving features

import { getOptimizedSystemPrompt, analyzePromptComplexity, TOKEN_LIMITS } from '../config/prompt-optimization.js';
import responseCache from './response-cache.js';
import contextManager from './context-manager.js';
import modelRouter from './model-router.js';

export class OptimizationIntegrator {
    constructor() {
        this.enabled = process.env.ENABLE_OPTIMIZATIONS !== 'false';
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            tokensSaved: 0,
            costSaved: 0,
            routingDecisions: 0
        };
    }

    // Main optimization pipeline for requests
    async optimizeRequest(requestData) {
        const {
            prompt,
            model: requestedModel,
            messages = [],
            user = null,
            projectContext = null,
            forceModel = false
        } = requestData;

        const optimization = {
            originalPrompt: prompt,
            originalModel: requestedModel,
            optimizedPrompt: prompt,
            selectedModel: requestedModel,
            systemPrompt: '',
            maxTokens: null,
            cacheHit: false,
            tokenSavings: 0,
            costSavings: 0,
            optimizationSteps: []
        };

        if (!this.enabled) {
            optimization.optimizationSteps.push('Optimizations disabled');
            return optimization;
        }

        // Step 1: Check cache for common prompts
        const cacheResult = await this.checkCache(prompt, requestedModel);
        if (cacheResult.hit) {
            optimization.cacheHit = true;
            optimization.cachedResponse = cacheResult.response;
            optimization.tokenSavings = cacheResult.savedTokens;
            optimization.optimizationSteps.push(`Cache hit: saved ${cacheResult.savedTokens} tokens`);
            this.metrics.cacheHits++;
            return optimization;
        }
        this.metrics.cacheMisses++;

        // Step 2: Analyze prompt complexity and route to appropriate model
        const userSubscription = user?.subscription?.plan || 'free';
        const routingDecision = await this.routeModel(prompt, requestedModel, userSubscription, forceModel);
        optimization.selectedModel = routingDecision.model;
        optimization.routingReason = routingDecision.reason;
        optimization.complexity = routingDecision.complexity;
        optimization.optimizationSteps.push(`Model routing: ${routingDecision.reason}`);
        this.metrics.routingDecisions++;

        // Step 3: Optimize context and conversation history
        const contextOptimization = this.optimizeContext(messages, prompt, userSubscription);
        optimization.contextSummary = contextOptimization.context;
        optimization.tokenSavings += contextOptimization.tokensSaved;
        optimization.optimizationSteps.push(`Context optimization: saved ${contextOptimization.tokensSaved} tokens`);

        // Step 4: Optimize system prompt based on model and mode
        const promptMode = this.determinePromptMode(prompt, routingDecision.complexity);
        optimization.systemPrompt = getOptimizedSystemPrompt(optimization.selectedModel, promptMode);
        optimization.optimizationSteps.push(`System prompt: ${promptMode} mode`);

        // Step 5: Set token limits based on subscription and complexity
        optimization.maxTokens = this.getTokenLimit(userSubscription, routingDecision.complexity);
        optimization.optimizationSteps.push(`Token limit: ${optimization.maxTokens}`);

        // Step 6: Combine optimized prompt with context
        optimization.optimizedPrompt = this.buildOptimizedPrompt(
            prompt,
            contextOptimization.context,
            projectContext
        );

        // Calculate total savings
        const originalCost = this.estimateCost(requestedModel, prompt, messages);
        const optimizedCost = this.estimateCost(optimization.selectedModel, optimization.optimizedPrompt, []);
        optimization.costSavings = Math.max(0, originalCost - optimizedCost);
        this.metrics.costSaved += optimization.costSavings;
        this.metrics.tokensSaved += optimization.tokenSavings;

        return optimization;
    }

    // Check cache for response
    async checkCache(prompt, model) {
        const cached = await responseCache.get(prompt, model);
        if (cached) {
            return {
                hit: true,
                response: cached.response,
                savedTokens: cached.savedTokens || 0
            };
        }
        return { hit: false };
    }

    // Route to optimal model
    async routeModel(prompt, requestedModel, subscription, forceModel) {
        return await modelRouter.routeRequest(prompt, {
            subscription,
            preferredModel: requestedModel,
            forceModel: forceModel ? requestedModel : null
        });
    }

    // Optimize context
    optimizeContext(messages, prompt, subscription) {
        return contextManager.processConversation(messages, prompt, subscription);
    }

    // Determine prompt mode based on request
    determinePromptMode(prompt, complexity) {
        const promptLower = prompt.toLowerCase();

        // Code-only responses for most requests
        if (promptLower.includes('explain') || promptLower.includes('tell me') ||
            promptLower.includes('what is') || promptLower.includes('how does')) {
            return 'full';
        }

        // Minimal for very simple tasks
        if (complexity === 'simple' && prompt.length < 50) {
            return 'minimal';
        }

        // Default to code-only for token savings
        return 'codeOnly';
    }

    // Get token limit based on subscription and complexity
    getTokenLimit(subscription, complexity) {
        const limits = TOKEN_LIMITS[subscription] || TOKEN_LIMITS.free;

        // Adjust based on complexity
        const adjustments = {
            simple: 0.5,
            medium: 1.0,
            complex: 1.5
        };

        const adjustment = adjustments[complexity] || 1.0;
        return Math.floor(limits.maxOutputTokens * adjustment);
    }

    // Build optimized prompt
    buildOptimizedPrompt(prompt, context, projectContext) {
        let optimizedPrompt = prompt;

        // Add minimal project context if available
        if (projectContext) {
            const projectInfo = contextManager.createSystemMessage(projectContext, 'minimal');
            optimizedPrompt = `[${projectInfo}]\n${prompt}`;
        }

        // Add conversation context if relevant
        if (context && context.length > 0) {
            optimizedPrompt = `${context}\n\nUser: ${prompt}`;
        }

        return optimizedPrompt;
    }

    // Estimate cost for comparison
    estimateCost(model, prompt, messages) {
        const inputTokens = Math.ceil((prompt.length + messages.join('').length) / 4);
        const outputTokens = 500; // Estimate

        // Simplified cost calculation
        const costs = {
            'claude-3-5-haiku': 0.25 + (1.25 * outputTokens / 1000),
            'claude-4-sonnet': 3.00 + (15.00 * outputTokens / 1000),
            'claude-4-opus': 15.00 + (75.00 * outputTokens / 1000)
        };

        return costs[model] || costs['claude-4-sonnet'];
    }

    // Store response in cache after successful generation
    async cacheResponse(prompt, response, model, tokenCount) {
        await responseCache.set(prompt, response, model, tokenCount);
    }

    // Get optimization metrics
    getMetrics() {
        const cacheStats = responseCache.getStats();
        const routingStats = modelRouter.getRoutingStats();

        return {
            ...this.metrics,
            cache: cacheStats,
            routing: routingStats,
            estimatedMonthlySavings: this.metrics.costSaved * 30,
            cacheEfficiency: this.metrics.cacheHits /
                            (this.metrics.cacheHits + this.metrics.cacheMisses) * 100
        };
    }

    // Reset metrics (for testing)
    resetMetrics() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            tokensSaved: 0,
            costSaved: 0,
            routingDecisions: 0
        };
    }
}

// Create and export singleton instance
export const optimizer = new OptimizationIntegrator();

// Helper function to integrate with existing code
export async function optimizeAIRequest(requestData) {
    return await optimizer.optimizeRequest(requestData);
}

// Helper to store successful responses
export async function storeOptimizedResponse(prompt, response, model, tokenCount) {
    return await optimizer.cacheResponse(prompt, response, model, tokenCount);
}

// Get current optimization metrics
export function getOptimizationMetrics() {
    return optimizer.getMetrics();
}

export default optimizer;