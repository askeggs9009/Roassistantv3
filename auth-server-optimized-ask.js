// Optimized /ask endpoint replacement
// This replaces the existing /ask endpoint in auth-server.js

app.post("/ask", optionalAuthenticateToken, checkUsageLimits, async (req, res) => {
    try {
        const { prompt, model = "claude-4-sonnet", messages = [], projectContext } = req.body;
        const isAuthenticated = req.user !== null;
        const userId = req.user?.id || getUserIdentifier(req);
        const subscription = isAuthenticated ?
            getUserSubscription(await DatabaseManager.findUserByEmail(req.user.email))?.plan :
            'free';

        // Step 1: Check token budget
        const estimatedTokens = Math.ceil(prompt.length / 4) + 500;
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
                },
                budget: {
                    dailyRemaining: budgetCheck.remainingToday,
                    monthlyRemaining: budgetCheck.remainingMonth,
                    percentUsed: Math.round(budgetCheck.usagePercent * 100)
                }
            };

            let finalResponse = optimization.cachedResponse;
            if (TESTING_CONFIG.DEBUG_MODE) {
                finalResponse = TESTING_CONFIG.formatDebugResponse(optimization.cachedResponse, debugInfo);
            }

            return res.json({
                reply: finalResponse,
                fromCache: true,
                modelUsed: 'CACHED',
                tokenUsage: {
                    input: 0,
                    output: 0,
                    cached: true,
                    saved: optimization.tokenSavings
                },
                debug: TESTING_CONFIG.DEBUG_MODE ? debugInfo : undefined
            });
        }

        // Step 4: Use optimized model and prompt
        const config = MODEL_CONFIGS[optimization.selectedModel];
        if (!config) {
            return res.status(400).json({ error: "Invalid model selected" });
        }

        let response;
        let tokenUsage = { input: 0, output: 0 };

        // Set max tokens based on subscription
        const maxTokens = optimization.maxTokens || TOKEN_LIMITS[subscription].maxOutputTokens;

        if (config.provider === 'anthropic') {
            const anthropicResponse = await anthropic.messages.create({
                model: config.model,
                max_tokens: maxTokens,
                system: optimization.systemPrompt,
                messages: [
                    { role: "user", content: optimization.optimizedPrompt }
                ],
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
                max_tokens: maxTokens,
                temperature: optimization.complexity === 'simple' ? 0.3 : 0.7
            });

            response = openaiResponse.choices[0].message.content;
            tokenUsage = {
                input: openaiResponse.usage.prompt_tokens,
                output: openaiResponse.usage.completion_tokens
            };
        }

        // Step 5: Store response in cache
        await storeOptimizedResponse(
            prompt,
            response,
            optimization.selectedModel,
            tokenUsage.output
        );

        // Step 6: Record actual token usage
        const totalTokens = tokenUsage.input + tokenUsage.output;
        tokenBudgetManager.recordUsage(userId, totalTokens, optimization.selectedModel, subscription);

        // Save chat log to database
        if (isAuthenticated) {
            const user = await DatabaseManager.findUserByEmail(req.user.email);
            await DatabaseManager.saveChatLog({
                userId: user.id,
                userEmail: user.email,
                username: user.username,
                message: prompt,
                response: response,
                model: optimization.selectedModel,
                tokenCount: totalTokens,
                inputTokens: tokenUsage.input,
                outputTokens: tokenUsage.output,
                timestamp: new Date()
            });

            // Update user's total token usage
            await DatabaseManager.updateUserTokens(user.id, totalTokens);
        }

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
                hit: false,
                savedTokens: 0
            },
            optimization: {
                promptMode: 'codeOnly',
                contextTrimmed: optimization.contextSummary ? true : false,
                maxTokens: maxTokens,
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
            modelUsed: optimization.selectedModel,
            tokenUsage: {
                input: tokenUsage.input,
                output: tokenUsage.output,
                total: totalTokens,
                saved: optimization.tokenSavings
            },
            optimization: {
                modelUsed: optimization.selectedModel,
                originalModel: optimization.originalModel,
                reason: optimization.routingReason,
                complexity: optimization.complexity,
                tokensSaved: optimization.tokenSavings,
                costSaved: debugInfo.cost.saved
            },
            debug: TESTING_CONFIG.DEBUG_MODE ? debugInfo : undefined
        });

    } catch (error) {
        console.error('Optimized request error:', error);
        res.status(500).json({
            error: 'An error occurred while processing your request.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});