// Conversation History Trimmer
// Keeps only recent relevant messages to save input tokens

export function trimConversation(messages, maxMessages = 4) {
    if (!messages || messages.length === 0) {
        return '';
    }

    // Keep only the last few messages (2 exchanges = 4 messages)
    const recentMessages = messages.slice(-maxMessages);

    // If we trimmed anything, add a brief summary
    let summary = '';
    if (messages.length > maxMessages) {
        summary = '[Earlier conversation summarized: User working on Roblox scripts]\n\n';
    }

    // Format messages concisely
    const formatted = recentMessages.map(msg => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        // Truncate very long messages but keep code blocks intact
        let content = msg.content;
        if (content.length > 500 && !content.includes('```')) {
            content = content.substring(0, 500) + '...';
        }
        return `${role}: ${content}`;
    }).join('\n\n');

    return summary + formatted;
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
    estimateTokens
};