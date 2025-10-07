// Conversation History Trimmer
// Keeps only recent relevant messages to save input tokens

/**
 * Smart conversation trimmer that preserves context while minimizing tokens
 * Strategy:
 * 1. Keep the first user message (for initial context)
 * 2. Keep the last N messages (for recent context)
 * 3. Summarize everything in between
 */
export function trimConversation(messages, maxRecentMessages = 6) {
    if (!messages || messages.length === 0) {
        return [];
    }

    // If conversation is short enough, keep everything
    if (messages.length <= maxRecentMessages + 2) {
        return messages;
    }

    const result = [];

    // 1. Keep the first user message for context
    const firstMessage = messages[0];
    if (firstMessage.role === 'user') {
        result.push({
            role: 'user',
            content: firstMessage.content
        });
    }

    // 2. Add a summary of the middle messages
    const middleCount = messages.length - maxRecentMessages - 1;
    if (middleCount > 0) {
        result.push({
            role: 'user',
            content: `[Earlier in conversation: ${middleCount} message(s) about Roblox scripting were exchanged]`
        });
    }

    // 3. Keep the last N messages for recent context
    const recentMessages = messages.slice(-maxRecentMessages);
    result.push(...recentMessages);

    return result;
}

/**
 * Trim conversation with token budget
 * More aggressive trimming based on estimated token count
 */
export function trimConversationByTokens(messages, maxTokens = 4000) {
    if (!messages || messages.length === 0) {
        return [];
    }

    let currentTokens = 0;
    const result = [];

    // Start from the most recent messages and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        const msgTokens = estimateTokens(msg.content);

        if (currentTokens + msgTokens > maxTokens) {
            // If we can't fit this message, add a summary and break
            if (i > 0) {
                result.unshift({
                    role: 'user',
                    content: `[Earlier conversation: ${i + 1} message(s) trimmed to save tokens]`
                });
            }
            break;
        }

        result.unshift(msg);
        currentTokens += msgTokens;
    }

    return result;
}

// Estimate tokens (rough approximation)
export function estimateTokens(text) {
    if (!text) return 0;
    // Roughly 1 token per 4 characters for English
    // Slightly more for code
    return Math.ceil(text.length / 3.5);
}

export default {
    trimConversation,
    trimConversationByTokens,
    estimateTokens
};