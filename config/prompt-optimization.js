// Prompt Optimization Configuration
// Reduces token usage while maintaining quality

export const OPTIMIZED_SYSTEM_PROMPTS = {
    // Ultra-compact prompts for different models
    'claude-3-5-haiku': {
        full: 'Expert Roblox Luau coder. Return only code in ```lua blocks. No explanations unless asked. Efficient, secure, optimized.',
        codeOnly: 'Return ONLY Luau code in ```lua blocks. NO text/explanations.',
        minimal: 'Luau code only.'
    },
    'claude-4-sonnet': {
        full: 'RoCode 3 assistant. Expert Roblox Luau developer. Respond with code in ```lua blocks. Explain ONLY if asked. Focus: efficient, secure code.',
        codeOnly: 'RoCode 3. Return ONLY Luau code in ```lua blocks. NO explanations.',
        minimal: 'Code only.'
    },
    'claude-4-opus': {
        full: 'RoCode Nexus 3. Advanced Roblox development. Return code in ```lua blocks first. Brief explanation ONLY if requested. Optimize for efficiency.',
        codeOnly: 'RoCode Nexus 3. ONLY Luau code in ```lua blocks. NO text.',
        minimal: 'Code only.'
    },
    'rocode-studio': {
        full: 'RoCode Studio. Elite Roblox developer. Code-first responses in ```lua blocks. Explanations minimal unless requested.',
        codeOnly: 'RoCode Studio. ONLY code in ```lua blocks.',
        minimal: 'Code.'
    }
};

// Analyze prompt complexity to determine which model to use
export function analyzePromptComplexity(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    // Simple tasks - use Haiku
    const simplePatterns = [
        /^(fix|correct|debug) (this|my|the) (error|bug|issue)/,
        /^(what|how|explain|tell me)/,
        /^(add|create|make) a? ?(simple|basic|small)/,
        /syntax error/,
        /^change .* to .*/,
        /^rename/,
        /^format/,
        /^comment/,
        /^clean/
    ];

    // Complex tasks - use Sonnet/Opus
    const complexPatterns = [
        /complex|advanced|sophisticated|comprehensive/,
        /full (system|game|module)/,
        /multiple (scripts|systems|features)/,
        /integrate|architecture|framework/,
        /optimize performance/,
        /security|exploit|vulnerability/,
        /ai |pathfinding|procedural/,
        /multiplayer|networking|datastore/
    ];

    // Check for simple tasks
    for (const pattern of simplePatterns) {
        if (pattern.test(lowerPrompt)) {
            return {
                complexity: 'simple',
                suggestedModel: 'claude-3-5-haiku',
                promptMode: 'codeOnly'
            };
        }
    }

    // Check for complex tasks
    for (const pattern of complexPatterns) {
        if (pattern.test(lowerPrompt)) {
            return {
                complexity: 'complex',
                suggestedModel: 'claude-4-opus',
                promptMode: 'full'
            };
        }
    }

    // Medium complexity by default
    return {
        complexity: 'medium',
        suggestedModel: 'claude-4-sonnet',
        promptMode: 'codeOnly'
    };
}

// Get optimized system prompt based on context
export function getOptimizedSystemPrompt(modelName, promptMode = 'codeOnly') {
    const prompts = OPTIMIZED_SYSTEM_PROMPTS[modelName];
    if (!prompts) {
        // Fallback for unknown models
        return 'Expert Roblox Luau developer. Code-focused responses.';
    }
    return prompts[promptMode] || prompts.codeOnly;
}

// Token limit configuration per model and subscription
export const TOKEN_LIMITS = {
    free: {
        maxOutputTokens: 500,  // Aggressive limit for free users
        maxInputTokens: 1000
    },
    pro: {
        maxOutputTokens: 2000,  // Moderate limit for pro users
        maxInputTokens: 4000
    },
    enterprise: {
        maxOutputTokens: 4000,  // Generous limit for enterprise
        maxInputTokens: 8000
    }
};

// Smart context trimming
export function trimContext(messages, maxTokens = 2000) {
    if (!messages || messages.length === 0) return '';

    // Keep only the last 3 message pairs (6 messages total)
    const recentMessages = messages.slice(-6);

    // Summarize older messages if they exist
    let contextSummary = '';
    if (messages.length > 6) {
        contextSummary = 'Previous context: User working on Roblox Luau scripts.\n';
    }

    // Format recent messages compactly
    const formattedMessages = recentMessages.map(msg => {
        const role = msg.role === 'user' ? 'U' : 'A';
        const content = msg.content.substring(0, 200); // Truncate long messages
        return `${role}: ${content}`;
    }).join('\n');

    return contextSummary + formattedMessages;
}