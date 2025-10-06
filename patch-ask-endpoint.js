// Simple patch to add optimization to /ask endpoint
// Add this right after checking authentication and before making API call

// Add optimization logic in the existing /ask endpoint
// Replace everything from line 3457 onwards with this:

    const userId = req.user?.id || getUserIdentifier(req);
    const userSubscription = isAuthenticated ?
        getUserSubscription(await DatabaseManager.findUserByEmail(req.user.email))?.plan :
        'free';

    // Step 1: Optimize the request
    const optimization = await optimizeAIRequest({
        prompt,
        model,
        messages: messages || [],
        user: req.user,
        projectContext: projectContext,
        forceModel: req.body.forceModel || false
    });

    // Step 2: Check if we have a cached response
    if (optimization.cacheHit) {
        console.log('[CACHE] Returning cached response - zero API cost');

        const debugInfo = {
            tokenUsage: { input: 0, output: 0, total: 0, saved: optimization.tokenSavings },
            modelInfo: { selected: 'CACHED', original: model },
            cacheInfo: { hit: true, savedTokens: optimization.tokenSavings }
        };

        let finalResponse = optimization.cachedResponse;
        if (TESTING_CONFIG.DEBUG_MODE) {
            finalResponse = TESTING_CONFIG.formatDebugResponse(optimization.cachedResponse, debugInfo);
        }

        return res.json({
            reply: finalResponse,
            modelUsed: 'CACHED',
            fromCache: true,
            tokenUsage: { input: 0, output: 0, cached: true, saved: optimization.tokenSavings }
        });
    }

    // Step 3: Use optimized model and settings
    const config = MODEL_CONFIGS[optimization.selectedModel];
    const maxTokens = optimization.maxTokens || 2000;
    const systemPrompt = optimization.systemPrompt;

    // Continue with existing API call logic but use optimized values...
    // model = optimization.selectedModel
    // systemPrompt = optimization.systemPrompt
    // maxTokens = optimization.maxTokens

    // After getting response, cache it:
    await storeOptimizedResponse(prompt, response, optimization.selectedModel, outputTokens);

    // Add model info to response
    responseData.modelUsed = optimization.selectedModel;
    responseData.optimization = {
        modelUsed: optimization.selectedModel,
        originalModel: model,
        complexity: optimization.complexity,
        tokensSaved: optimization.tokenSavings
    };

    // Add debug info if enabled
    if (TESTING_CONFIG.DEBUG_MODE) {
        const debugInfo = {
            tokenUsage: { input: inputTokens, output: outputTokens, total: totalTokens },
            modelInfo: {
                selected: optimization.selectedModel,
                original: model,
                complexity: optimization.complexity,
                reason: optimization.routingReason
            },
            cacheInfo: { hit: false }
        };
        responseData.reply = TESTING_CONFIG.formatDebugResponse(responseData.reply, debugInfo);
    }