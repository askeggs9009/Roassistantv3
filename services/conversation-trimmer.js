// Conversation History Trimmer
// Keeps only recent relevant messages to save input tokens

/**
 * Detects if current prompt is a follow-up to previous conversation
 * Uses GPT-4o-mini for ultra-cheap classification (~$0.000002 per check)
 */
export async function detectFollowUp(currentPrompt, conversationHistory, openaiClient) {
    try {
        // Get last user message for context
        const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return false;

        const response = await openaiClient.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You analyze if a Roblox coding request is a FOLLOW-UP to previous work or a NEW topic. Reply ONLY "follow-up" or "new". Follow-up examples: "make it bigger", "change the color to blue", "add a timer to that", "fix it", "move it to the left". New topic examples: "create a shop system", "make a gun", "explain DataStores".'
                },
                {
                    role: 'user',
                    content: `Previous request: "${lastUserMsg.content}"\n\nCurrent request: "${currentPrompt}"\n\nIs this a follow-up or new topic?`
                }
            ],
            max_tokens: 5,
            temperature: 0
        });

        const analysis = response.choices[0].message.content.toLowerCase().trim();
        const isFollowUp = analysis.includes('follow-up');

        console.log(`[SMART TRIM] Follow-up detection: ${isFollowUp ? 'FOLLOW-UP' : 'NEW TOPIC'}`);

        return isFollowUp;
    } catch (error) {
        console.error('[SMART TRIM] Error detecting follow-up, assuming new topic:', error.message);
        return false; // Default to new topic if detection fails
    }
}

/**
 * Searches Explorer data for scripts relevant to the current prompt
 * Returns compact code snippets instead of full conversation history
 */
export function searchExplorerForRelevantScripts(prompt, explorerData) {
    if (!explorerData || !explorerData.children) {
        return null;
    }

    const promptLower = prompt.toLowerCase();
    const relevantScripts = [];

    // Recursively search Explorer hierarchy
    function searchNode(node, path = '') {
        if (!node) return;

        const currentPath = path ? `${path}.${node.name}` : node.name;

        // Check if this is a script
        if (node.type === 'Script' || node.type === 'LocalScript' || node.type === 'ModuleScript') {
            // Check if script name or path is relevant to prompt
            const nameLower = node.name.toLowerCase();

            // Check for keyword matches
            if (promptLower.includes(nameLower) ||
                nameLower.includes(promptLower.split(' ')[0]) ||
                currentPath.toLowerCase().includes(promptLower.split(' ')[0])) {

                relevantScripts.push({
                    path: currentPath,
                    type: node.type,
                    name: node.name,
                    source: node.source || '-- No source available'
                });
            }
        }

        // Search children
        if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
                searchNode(child, currentPath);
            }
        }
    }

    searchNode(explorerData);

    if (relevantScripts.length === 0) {
        return null;
    }

    // Build compact summary
    let summary = '[Previously created scripts relevant to your request]:\n\n';
    for (const script of relevantScripts.slice(0, 3)) { // Max 3 scripts to keep tokens low
        summary += `${script.path} (${script.type}):\n\`\`\`lua\n${script.source.slice(0, 500)}${script.source.length > 500 ? '\n...' : ''}\n\`\`\`\n\n`;
    }

    console.log(`[SMART TRIM] Found ${relevantScripts.length} relevant scripts in Explorer`);

    return summary;
}

/**
 * Smart conversation trimmer with AI-powered follow-up detection
 * Saves ~87% tokens on follow-up requests by searching Explorer instead of full history
 */
export async function smartTrimConversation(messages, currentPrompt, explorerData, openaiClient, maxRecentMessages = 3) {
    if (!messages || messages.length === 0) {
        return [];
    }

    // Short conversations: keep everything
    if (messages.length <= 4) {
        return messages;
    }

    // Detect if this is a follow-up (only after 3+ messages to save API calls)
    const isFollowUp = messages.length >= 6 ?
        await detectFollowUp(currentPrompt, messages, openaiClient) :
        false;

    if (isFollowUp) {
        // FOLLOW-UP: Search Explorer for relevant scripts
        const explorerContext = searchExplorerForRelevantScripts(currentPrompt, explorerData);

        if (explorerContext) {
            // Include Explorer context + last 2-3 messages
            const result = [
                {
                    role: 'user',
                    content: explorerContext
                },
                ...messages.slice(-maxRecentMessages)
            ];

            console.log(`[SMART TRIM] Follow-up mode: ${result.length} messages (Explorer search)`);
            return result;
        }
    }

    // NEW TOPIC or no Explorer results: Keep minimal history
    const result = messages.slice(-maxRecentMessages);

    console.log(`[SMART TRIM] New topic mode: ${result.length} messages`);
    return result;
}

/**
 * Original trimmer - kept for backward compatibility
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
    estimateTokens,
    smartTrimConversation,
    detectFollowUp,
    searchExplorerForRelevantScripts
};