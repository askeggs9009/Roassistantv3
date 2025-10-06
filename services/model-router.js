// Intelligent Model Routing Service
// Routes requests to appropriate models based on complexity
// Saves 60-80% costs by using Haiku for simple tasks

export class ModelRouter {
    constructor() {
        // Model capabilities and costs (per 1M tokens)
        this.models = {
            'claude-3-5-haiku': {
                name: 'Claude 3.5 Haiku',
                provider: 'anthropic',
                model: 'claude-3-5-haiku-20241022',
                costInput: 0.25,
                costOutput: 1.25,
                speed: 'fast',
                capability: 'basic',
                maxTokens: 4096,
                bestFor: ['simple edits', 'syntax fixes', 'explanations', 'small scripts']
            },
            'claude-4-sonnet': {
                name: 'RoCode 3 (Claude Sonnet)',
                provider: 'anthropic',
                model: 'claude-sonnet-4-20250514',
                costInput: 3.00,
                costOutput: 15.00,
                speed: 'medium',
                capability: 'advanced',
                maxTokens: 8192,
                bestFor: ['complex scripts', 'game systems', 'debugging', 'refactoring']
            },
            'claude-4-opus': {
                name: 'RoCode Nexus 3 (Claude Opus)',
                provider: 'anthropic',
                model: 'claude-opus-4-20250514',
                costInput: 15.00,
                costOutput: 75.00,
                speed: 'slow',
                capability: 'expert',
                maxTokens: 16384,
                bestFor: ['architecture', 'complex systems', 'optimization', 'security']
            }
        };

        // Task complexity patterns
        this.taskPatterns = {
            simple: [
                /^(fix|correct) (this|the|my) (error|bug|syntax)/i,
                /^(add|insert|put) a? ?comment/i,
                /^(rename|change name)/i,
                /^format (this|my|the) code/i,
                /^explain (what|how|why)/i,
                /^what (is|does|are)/i,
                /^(clean|tidy|organize)/i,
                /syntax error/i,
                /^make (it|this) (faster|cleaner|better)/i,
                /^(remove|delete) (the|this)/i,
                /^change .{1,20} to .{1,20}$/i,
                /^(simple|basic|easy) (script|code)/i
            ],
            medium: [
                /^(create|make|write) a? ?(script|system|function)/i,
                /^(implement|add) (feature|functionality)/i,
                /^(debug|troubleshoot)/i,
                /^(refactor|restructure|reorganize)/i,
                /leaderstats?|leaderboard/i,
                /gui|interface|ui/i,
                /tween|animation/i,
                /tool|weapon|item/i,
                /teleport|move player/i,
                /data ?store/i,
                /remote ?(event|function)/i,
                /click ?detector/i
            ],
            complex: [
                /(complex|advanced|sophisticated|comprehensive)/i,
                /full (system|game|framework)/i,
                /multiple (scripts|systems|features)/i,
                /(integrate|integration) (with|between)/i,
                /architect|architecture|design pattern/i,
                /optimize performance/i,
                /(security|secure|exploit|vulnerability)/i,
                /ai |machine learning|pathfinding|procedural/i,
                /(multiplayer|networking|replication)/i,
                /entire game/i,
                /production[- ]ready/i,
                /scalable|modular|extensible/i,
                /state management|state machine/i,
                /custom (physics|rendering|lighting)/i
            ]
        };

        // Response type patterns
        this.responsePatterns = {
            codeOnly: [
                /^(write|create|make|generate) (code|script)/i,
                /^give me (the )?(code|script)/i,
                /^show me (the )?(code|script)/i,
                /^(just|only) (the )?(code|script)/i,
                /no explanation/i,
                /code only/i
            ],
            explanation: [
                /^(explain|tell me|describe|what is)/i,
                /^(how|why|when|where) (does|do|should|would)/i,
                /^teach me/i,
                /^help me understand/i,
                /with (explanation|details|comments)/i,
                /step[- ]?by[- ]?step/i
            ]
        };

        // User preference tracking
        this.userPreferences = new Map();
        this.routingHistory = [];
        this.maxHistorySize = 1000;
    }

    // Main routing decision function
    async routeRequest(prompt, userContext = {}) {
        const {
            subscription = 'free',
            recentMessages = [],
            preferredModel = null,
            forceModel = null,
            userId = null
        } = userContext;

        // If model is forced, use it (but still analyze for optimization tips)
        if (forceModel && this.models[forceModel]) {
            const analysis = this.analyzePrompt(prompt);
            return {
                model: forceModel,
                reason: 'User specified model',
                complexity: analysis.complexity,
                suggestedModel: analysis.suggestedModel,
                potentialSavings: this.calculateSavings(forceModel, analysis.suggestedModel)
            };
        }

        // Analyze the prompt
        const analysis = this.analyzePrompt(prompt);

        // Check user subscription limits
        const availableModels = this.getAvailableModels(subscription);

        // Select optimal model
        let selectedModel = this.selectOptimalModel(
            analysis,
            availableModels,
            preferredModel
        );

        // Track routing decision
        this.trackRouting(userId, prompt, selectedModel, analysis);

        // Learn from user preferences
        if (userId) {
            this.updateUserPreferences(userId, analysis.taskType, selectedModel);
        }

        return {
            model: selectedModel,
            reason: analysis.reason,
            complexity: analysis.complexity,
            taskType: analysis.taskType,
            responseMode: analysis.responseMode,
            estimatedCost: this.estimateCost(selectedModel, prompt),
            alternativeModel: analysis.alternativeModel,
            potentialSavings: this.calculateSavings(selectedModel, analysis.alternativeModel)
        };
    }

    // Analyze prompt to determine complexity and requirements
    analyzePrompt(prompt) {
        const promptLower = prompt.toLowerCase();
        const wordCount = prompt.split(/\s+/).length;

        let complexity = 'medium';
        let taskType = 'general';
        let reason = 'Default routing';
        let suggestedModel = 'claude-4-sonnet';
        let alternativeModel = null;

        // Check for simple patterns
        for (const pattern of this.taskPatterns.simple) {
            if (pattern.test(promptLower)) {
                complexity = 'simple';
                taskType = 'basic-edit';
                reason = 'Simple task detected';
                suggestedModel = 'claude-3-5-haiku';
                alternativeModel = 'claude-4-sonnet';
                break;
            }
        }

        // Check for complex patterns (override simple if found)
        for (const pattern of this.taskPatterns.complex) {
            if (pattern.test(promptLower)) {
                complexity = 'complex';
                taskType = 'architecture';
                reason = 'Complex task requiring advanced capabilities';
                suggestedModel = 'claude-4-opus';
                alternativeModel = 'claude-4-sonnet';
                break;
            }
        }

        // If not simple or complex, check medium patterns
        if (complexity === 'medium') {
            for (const pattern of this.taskPatterns.medium) {
                if (pattern.test(promptLower)) {
                    taskType = 'feature-implementation';
                    reason = 'Standard feature implementation';
                    alternativeModel = 'claude-3-5-haiku';
                    break;
                }
            }
        }

        // Check response type preference
        let responseMode = 'balanced';
        for (const pattern of this.responsePatterns.codeOnly) {
            if (pattern.test(promptLower)) {
                responseMode = 'code-only';
                break;
            }
        }
        for (const pattern of this.responsePatterns.explanation) {
            if (pattern.test(promptLower)) {
                responseMode = 'detailed';
                // Explanations might need better model
                if (complexity === 'simple') {
                    complexity = 'medium';
                    suggestedModel = 'claude-4-sonnet';
                }
                break;
            }
        }

        // Adjust based on prompt length
        if (wordCount < 10 && complexity !== 'complex') {
            complexity = 'simple';
            suggestedModel = 'claude-3-5-haiku';
            reason = 'Brief prompt - likely simple task';
        } else if (wordCount > 200) {
            if (complexity === 'simple') {
                complexity = 'medium';
                suggestedModel = 'claude-4-sonnet';
                reason = 'Long prompt requires more context understanding';
            }
        }

        // Check for code blocks in prompt (debugging scenario)
        if (prompt.includes('```')) {
            if (complexity === 'simple') {
                complexity = 'medium';
                suggestedModel = 'claude-4-sonnet';
                reason = 'Code analysis required';
            }
            taskType = 'debugging';
        }

        return {
            complexity,
            taskType,
            responseMode,
            suggestedModel,
            alternativeModel,
            reason,
            wordCount,
            hasCode: prompt.includes('```')
        };
    }

    // Get available models based on subscription
    getAvailableModels(subscription) {
        const modelAccess = {
            free: ['claude-3-5-haiku', 'claude-4-sonnet'],
            pro: ['claude-3-5-haiku', 'claude-4-sonnet', 'claude-4-opus'],
            enterprise: ['claude-3-5-haiku', 'claude-4-sonnet', 'claude-4-opus']
        };

        return modelAccess[subscription] || modelAccess.free;
    }

    // Select optimal model based on analysis and constraints
    selectOptimalModel(analysis, availableModels, preferredModel) {
        // Check if suggested model is available
        if (availableModels.includes(analysis.suggestedModel)) {
            return analysis.suggestedModel;
        }

        // Check if preferred model is available and suitable
        if (preferredModel && availableModels.includes(preferredModel)) {
            const preferredCapability = this.models[preferredModel].capability;
            const requiredCapability = this.getRequiredCapability(analysis.complexity);

            if (this.isCapabilitySufficient(preferredCapability, requiredCapability)) {
                return preferredModel;
            }
        }

        // Fall back to best available model
        const requiredCapability = this.getRequiredCapability(analysis.complexity);
        for (const model of availableModels) {
            if (this.isCapabilitySufficient(this.models[model].capability, requiredCapability)) {
                return model;
            }
        }

        // Default to most capable available model
        return availableModels[availableModels.length - 1];
    }

    // Helper functions
    getRequiredCapability(complexity) {
        const mapping = {
            simple: 'basic',
            medium: 'advanced',
            complex: 'expert'
        };
        return mapping[complexity] || 'advanced';
    }

    isCapabilitySufficient(modelCapability, requiredCapability) {
        const levels = { basic: 1, advanced: 2, expert: 3 };
        return levels[modelCapability] >= levels[requiredCapability];
    }

    // Cost estimation
    estimateCost(model, prompt, estimatedOutput = 500) {
        const modelConfig = this.models[model];
        if (!modelConfig) return null;

        const inputTokens = Math.ceil(prompt.length / 4);
        const outputTokens = estimatedOutput;

        const inputCost = (inputTokens / 1000000) * modelConfig.costInput;
        const outputCost = (outputTokens / 1000000) * modelConfig.costOutput;

        return {
            inputTokens,
            outputTokens,
            inputCost,
            outputCost,
            totalCost: inputCost + outputCost,
            model: modelConfig.name
        };
    }

    calculateSavings(selectedModel, alternativeModel) {
        if (!alternativeModel || selectedModel === alternativeModel) return null;

        const selectedCost = this.models[selectedModel].costOutput;
        const alternativeCost = this.models[alternativeModel].costOutput;

        const savings = ((selectedCost - alternativeCost) / selectedCost) * 100;

        if (savings > 0) {
            return {
                amount: savings.toFixed(1),
                message: `Using ${alternativeModel} would save ~${savings.toFixed(0)}% on costs`
            };
        } else {
            return {
                amount: Math.abs(savings).toFixed(1),
                message: `Current model is ${Math.abs(savings).toFixed(0)}% more cost-effective`
            };
        }
    }

    // Track routing decisions for analytics
    trackRouting(userId, prompt, model, analysis) {
        const entry = {
            timestamp: Date.now(),
            userId,
            promptLength: prompt.length,
            model,
            complexity: analysis.complexity,
            taskType: analysis.taskType
        };

        this.routingHistory.push(entry);

        // Maintain history size limit
        if (this.routingHistory.length > this.maxHistorySize) {
            this.routingHistory.shift();
        }
    }

    // Update user preferences based on usage
    updateUserPreferences(userId, taskType, model) {
        if (!this.userPreferences.has(userId)) {
            this.userPreferences.set(userId, {});
        }

        const prefs = this.userPreferences.get(userId);
        if (!prefs[taskType]) {
            prefs[taskType] = {};
        }

        prefs[taskType][model] = (prefs[taskType][model] || 0) + 1;
    }

    // Get routing statistics
    getRoutingStats() {
        const stats = {
            totalRequests: this.routingHistory.length,
            modelUsage: {},
            complexityBreakdown: {},
            averagePromptLength: 0,
            costSavings: 0
        };

        this.routingHistory.forEach(entry => {
            // Model usage
            stats.modelUsage[entry.model] = (stats.modelUsage[entry.model] || 0) + 1;

            // Complexity breakdown
            stats.complexityBreakdown[entry.complexity] =
                (stats.complexityBreakdown[entry.complexity] || 0) + 1;

            // Average prompt length
            stats.averagePromptLength += entry.promptLength;
        });

        if (this.routingHistory.length > 0) {
            stats.averagePromptLength /= this.routingHistory.length;
        }

        // Calculate cost savings from using Haiku for simple tasks
        const haikuUsage = stats.modelUsage['claude-3-5-haiku'] || 0;
        const sonnetCost = this.models['claude-4-sonnet'].costOutput;
        const haikuCost = this.models['claude-3-5-haiku'].costOutput;
        stats.costSavings = haikuUsage * (sonnetCost - haikuCost) / 1000;

        return stats;
    }
}

// Export singleton instance
export const modelRouter = new ModelRouter();
export default modelRouter;