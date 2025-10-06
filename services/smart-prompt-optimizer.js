// Smart Prompt Optimizer
// Reduces token usage while keeping natural, helpful responses

export function getOptimizedSystemPrompt(modelName) {
    // Shorter, more efficient system prompts
    // Key: Be concise and helpful, not verbose, but still natural

    const baseInstruction = "You are a helpful Roblox Luau coding assistant. Be concise and direct in your responses. Provide clear, working code with brief explanations. Only give detailed explanations when explicitly asked.";

    const prompts = {
        'claude-3-5-haiku': baseInstruction,
        'claude-3-7-sonnet': baseInstruction,
        'claude-4-sonnet': `You are RoCode 3, an intelligent Roblox development assistant. ${baseInstruction}`,
        'claude-4-opus': `You are RoCode Nexus 3. ${baseInstruction}`,
        'rocode-studio': `You are RoCode Studio. ${baseInstruction}`
    };

    return prompts[modelName] || baseInstruction;
}

// Detect if user wants detailed explanation
export function needsDetailedExplanation(prompt) {
    const detailKeywords = [
        'explain', 'why', 'how does', 'what is', 'tell me about',
        'describe', 'help me understand', 'walk me through',
        'in detail', 'step by step', 'tutorial'
    ];

    const promptLower = prompt.toLowerCase();
    return detailKeywords.some(keyword => promptLower.includes(keyword));
}

// Analyze prompt complexity for model routing
export function analyzePromptComplexity(prompt) {
    const promptLower = prompt.toLowerCase();
    const wordCount = prompt.split(/\s+/).length;

    // Simple tasks for Haiku
    const simplePatterns = [
        /^(fix|correct) (this|the|my) (error|bug)/i,
        /syntax error/i,
        /^change .* to .*/i,
        /^rename/i,
        /^add a? ?comment/i,
        /^format/i
    ];

    // Complex tasks for Sonnet
    const complexPatterns = [
        /complex|advanced|sophisticated/i,
        /full (system|game|module)/i,
        /multiple (scripts|systems)/i,
        /architecture|framework/i,
        /security|exploit/i,
        /multiplayer|networking/i
    ];

    for (const pattern of simplePatterns) {
        if (pattern.test(promptLower)) {
            return { complexity: 'simple', suggestedModel: 'claude-3-5-haiku' };
        }
    }

    for (const pattern of complexPatterns) {
        if (pattern.test(promptLower)) {
            return { complexity: 'complex', suggestedModel: 'claude-4-sonnet' };
        }
    }

    // Default: medium complexity
    // Use Haiku for short prompts, Sonnet for longer ones
    if (wordCount < 15 && !prompt.includes('```')) {
        return { complexity: 'simple', suggestedModel: 'claude-3-5-haiku' };
    }

    return { complexity: 'medium', suggestedModel: 'claude-4-sonnet' };
}

export default {
    getOptimizedSystemPrompt,
    needsDetailedExplanation,
    analyzePromptComplexity
};