// PATCH FILE: Integration points for auth-server.js
// Add these imports at the top of auth-server.js

import { optimizeAIRequest, storeOptimizedResponse, getOptimizationMetrics } from './services/optimization-integrator.js';
import { tokenBudgetManager } from './services/token-budget-manager.js';
import { queueForBatch, canBatch } from './services/batch-request-handler.js';
import { getOptimizedSystemPrompt, TOKEN_LIMITS } from './config/prompt-optimization.js';

// ============================================================
// REPLACE the existing getSystemPrompt function with this:
// ============================================================

function getSystemPrompt(modelName, optimizationMode = 'codeOnly') {
    // Use optimized prompts from our configuration
    return getOptimizedSystemPrompt(modelName, optimizationMode);
}

// ============================================================
// ADD this new endpoint for optimization metrics:
// ============================================================

app.get("/api/optimization-metrics", authenticateToken, async (req, res) => {
    try {
        const metrics = getOptimizationMetrics();
        const userStats = tokenBudgetManager.getUserStats(req.user.id, req.user.subscription?.plan);

        res.json({
            success: true,
            optimization: metrics,
            tokenBudget: userStats,
            estimatedMonthlySavings: `$${(metrics.estimatedMonthlySavings || 0).toFixed(2)}`
        });
    } catch (error) {
        console.error('Error fetching optimization metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// ============================================================
// MODIFY the /ask endpoint to use optimizations:
// ============================================================

app.post("/ask", optionalAuthenticateToken, checkUsageLimits, async (req, res) => {
    try {
        const { prompt, model = "claude-4-sonnet", messages = [], projectContext } = req.body;
        const isAuthenticated = req.user !== null;
        const userId = req.user?.id || getUserIdentifier(req);
        const subscription = req.user?.subscription?.plan || 'free';

        // Step 1: Check token budget
        const estimatedTokens = Math.ceil(prompt.length / 4) + 500; // Rough estimate
        const budgetCheck = await tokenBudgetManager.canMakeRequest(
            userId,
            estimatedTokens,
            model,
            subscription
        );

        if (!budgetCheck.allowed) {
            return res.status(403).json({
                error: budgetCheck.message,
                reason: budgetCheck.reason,
                resetTime: budgetCheck.resetTime,
                suggestion: budgetCheck.suggestion
            });
        }

        // Step 2: Optimize the request
        const optimization = await optimizeAIRequest({
            prompt,
            model,
            messages,
            user: req.user,
            projectContext,
            forceModel: req.body.forceModel || false
        });

        // Step 3: Check if we have a cached response
        if (optimization.cacheHit) {
            console.log('[OPTIMIZATION] Cache hit - returning cached response');

            // Record token usage (minimal for cache hits)
            tokenBudgetManager.recordUsage(userId, 10, model, subscription);

            return res.json({
                reply: optimization.cachedResponse,
                fromCache: true,
                tokenUsage: {
                    input: 0,
                    output: 0,
                    cached: true,
                    saved: optimization.tokenSavings
                },
                optimization: {
                    cacheHit: true,
                    tokensSaved: optimization.tokenSavings
                }
            });
        }

        // Step 4: Check if request can be batched
        const batchRequest = {
            prompt: optimization.optimizedPrompt,
            model: optimization.selectedModel,
            priority: req.body.priority || 'normal'
        };

        if (canBatch(batchRequest) && !req.body.immediate) {
            const batchResult = await queueForBatch(userId, batchRequest);
            if (batchResult) {
                return res.json({
                    reply: batchResult.response,
                    fromBatch: true,
                    batchInfo: {
                        size: batchResult.batchSize,
                        tokensSaved: batchResult.tokenSavings
                    }
                });
            }
        }

        // Step 5: Use optimized model and prompt
        const config = MODEL_CONFIGS[optimization.selectedModel];
        if (!config) {
            return res.status(400).json({ error: "Invalid model selected" });
        }

        let response;
        let tokenUsage = { input: 0, output: 0 };

        if (config.provider === 'anthropic') {
            // Add max_tokens limit based on subscription
            const maxTokens = optimization.maxTokens || TOKEN_LIMITS[subscription].maxOutputTokens;

            const anthropicResponse = await anthropic.messages.create({
                model: config.model,
                max_tokens: maxTokens,
                system: optimization.systemPrompt,
                messages: [
                    { role: "user", content: optimization.optimizedPrompt }
                ],
                // Add temperature control for consistency
                temperature: optimization.complexity === 'simple' ? 0.3 : 0.7
            });

            response = anthropicResponse.content[0].text;
            tokenUsage = {
                input: anthropicResponse.usage.input_tokens,
                output: anthropicResponse.usage.output_tokens
            };
        } else if (config.provider === 'openai') {
            const openaiResponse = await openai.chat.completions.create({
                model: config.model,
                messages: [
                    { role: "system", content: optimization.systemPrompt },
                    { role: "user", content: optimization.optimizedPrompt }
                ],
                max_tokens: optimization.maxTokens,
                temperature: optimization.complexity === 'simple' ? 0.3 : 0.7
            });

            response = openaiResponse.choices[0].message.content;
            tokenUsage = {
                input: openaiResponse.usage.prompt_tokens,
                output: openaiResponse.usage.completion_tokens
            };
        }

        // Step 6: Store response in cache for future use
        await storeOptimizedResponse(
            prompt,
            response,
            optimization.selectedModel,
            tokenUsage.output
        );

        // Step 7: Record actual token usage
        const totalTokens = tokenUsage.input + tokenUsage.output;
        tokenBudgetManager.recordUsage(userId, totalTokens, optimization.selectedModel, subscription);

        // Step 8: Return optimized response
        res.json({
            reply: response,
            tokenUsage: {
                ...tokenUsage,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            optimization: {
                modelUsed: optimization.selectedModel,
                originalModel: optimization.originalModel,
                reason: optimization.routingReason,
                complexity: optimization.complexity,
                tokensSaved: optimization.tokenSavings,
                costSaved: optimization.costSavings
            },
            budget: budgetCheck.warning ? {
                warning: budgetCheck.warning,
                remainingToday: budgetCheck.remainingToday,
                remainingMonth: budgetCheck.remainingMonth
            } : null
        });

    } catch (error) {
        console.error('Optimized request error:', error);
        res.status(500).json({
            error: 'An error occurred while processing your request.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ============================================================
// MODIFY the /ask-stream endpoint similarly:
// ============================================================

app.post("/ask-stream", optionalAuthenticateToken, checkUsageLimits, async (req, res) => {
    try {
        const { prompt, model = "claude-4-sonnet", messages = [] } = req.body;
        const userId = req.user?.id || getUserIdentifier(req);
        const subscription = req.user?.subscription?.plan || 'free';

        // Apply same optimizations as regular endpoint
        const optimization = await optimizeAIRequest({
            prompt,
            model,
            messages,
            user: req.user,
            forceModel: req.body.forceModel || false
        });

        // Check cache first
        if (optimization.cacheHit) {
            // Stream cached response
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Send cached response as stream
            const chunks = optimization.cachedResponse.match(/.{1,50}/g) || [];
            for (const chunk of chunks) {
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            res.write(`data: ${JSON.stringify({
                type: 'complete',
                fullResponse: optimization.cachedResponse,
                tokenUsage: { input: 0, output: 0, cached: true }
            })}\n\n`);

            res.end();
            return;
        }

        const config = MODEL_CONFIGS[optimization.selectedModel];

        // Set up streaming with optimized parameters
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        let fullResponse = '';
        let tokenUsage = { input: 0, output: 0 };

        if (config.provider === 'anthropic') {
            const stream = await anthropic.messages.create({
                model: config.model,
                max_tokens: optimization.maxTokens,
                system: optimization.systemPrompt,
                messages: [
                    { role: "user", content: optimization.optimizedPrompt }
                ],
                stream: true,
                temperature: optimization.complexity === 'simple' ? 0.3 : 0.7
            });

            for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta') {
                    const text = chunk.delta.text;
                    fullResponse += text;
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                } else if (chunk.type === 'message_stop') {
                    // Get final usage
                    if (chunk.usage) {
                        tokenUsage = {
                            input: chunk.usage.input_tokens,
                            output: chunk.usage.output_tokens
                        };
                    }
                }
            }
        }

        // Cache the complete response
        await storeOptimizedResponse(
            prompt,
            fullResponse,
            optimization.selectedModel,
            tokenUsage.output
        );

        // Record token usage
        const totalTokens = tokenUsage.input + tokenUsage.output;
        tokenBudgetManager.recordUsage(userId, totalTokens, optimization.selectedModel, subscription);

        // Send completion event
        res.write(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse,
            tokenUsage: {
                ...tokenUsage,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            optimization: {
                modelUsed: optimization.selectedModel,
                tokensSaved: optimization.tokenSavings
            }
        })}\n\n`);

        res.end();

    } catch (error) {
        console.error('Stream optimization error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Stream processing error'
        })}\n\n`);
        res.end();
    }
});

// ============================================================
// ADD endpoint for token budget status:
// ============================================================

app.get("/api/token-budget", authenticateToken, async (req, res) => {
    try {
        const stats = tokenBudgetManager.getUserStats(
            req.user.id,
            req.user.subscription?.plan || 'free'
        );

        res.json({
            success: true,
            budget: stats
        });
    } catch (error) {
        console.error('Error fetching token budget:', error);
        res.status(500).json({ error: 'Failed to fetch token budget' });
    }
});

// ============================================================
// ADD admin endpoint to view optimization performance:
// ============================================================

app.get("/api/admin/optimization-report", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const metrics = getOptimizationMetrics();

        res.json({
            success: true,
            report: {
                cachePerformance: {
                    hits: metrics.cacheHits,
                    misses: metrics.cacheMisses,
                    hitRate: `${metrics.cacheEfficiency.toFixed(1)}%`
                },
                tokenSavings: {
                    total: metrics.tokensSaved,
                    estimatedCost: `$${(metrics.tokensSaved * 0.00001).toFixed(2)}`
                },
                modelRouting: metrics.routing,
                monthlyProjectedSavings: `$${metrics.estimatedMonthlySavings.toFixed(2)}`
            }
        });
    } catch (error) {
        console.error('Error generating optimization report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ============================================================
// NOTES ON INTEGRATION:
// ============================================================
/*
1. Update package.json to include new dependencies if needed
2. Create the required directories:
   - ./config/
   - ./services/
   - ./cache/responses/
   - ./data/

3. Set environment variable to enable optimizations:
   ENABLE_OPTIMIZATIONS=true

4. Add Haiku model to your Anthropic configuration:
   - Model ID: claude-3-5-haiku-20241022
   - Ensure API key has access to Haiku

5. Test with different prompt types to verify routing:
   - Simple: "fix syntax error"
   - Medium: "create a teleport script"
   - Complex: "build multiplayer game system"

6. Monitor metrics endpoint regularly:
   GET /api/optimization-metrics

7. Adjust token limits in config/prompt-optimization.js based on your pricing
*/