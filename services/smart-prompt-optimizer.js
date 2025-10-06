// Smart Prompt Optimizer
// Reduces token usage while keeping natural, helpful responses

// AI-powered complexity analysis using GPT-4o-mini (most cost-efficient)
export async function analyzePromptWithAI(prompt, openaiClient) {
    try {
        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You analyze Roblox Luau coding requests. Reply with ONLY "simple" or "complex". Simple tasks: syntax fixes, small edits, basic scripts, common patterns. Complex tasks: full systems, advanced logic, multiplayer, security, architecture.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 10,
            temperature: 0
        });

        const analysis = response.choices[0].message.content.toLowerCase().trim();
        const isSimple = analysis.includes('simple');

        console.log(`[AI ROUTING] GPT-4o-mini analyzed as: ${isSimple ? 'SIMPLE' : 'COMPLEX'}`);

        return {
            complexity: isSimple ? 'simple' : 'complex',
            suggestedModel: isSimple ? 'claude-3-5-haiku' : 'claude-4-sonnet',
            analyzedBy: 'gpt-4o-mini'
        };
    } catch (error) {
        console.error('[AI ROUTING] Error analyzing with GPT-4o-mini, falling back to pattern matching:', error.message);
        // Fallback to pattern matching if API fails
        return analyzePromptComplexity(prompt);
    }
}

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
    analyzePromptComplexity,
    analyzePromptWithAI
};