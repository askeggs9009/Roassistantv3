// Batch Request Handler
// Combines multiple requests into single API calls for efficiency

export class BatchRequestHandler {
    constructor() {
        this.batchQueue = new Map();  // userId -> queue
        this.batchTimeout = 500;      // Wait 500ms to collect requests
        this.maxBatchSize = 5;         // Max requests per batch
        this.processing = new Map();   // Track processing batches
    }

    // Queue a request for batching
    queueRequest(userId, request) {
        if (!this.batchQueue.has(userId)) {
            this.batchQueue.set(userId, {
                requests: [],
                timer: null,
                promise: null
            });
        }

        const userQueue = this.batchQueue.get(userId);

        // Create promise for this request
        const requestPromise = new Promise((resolve, reject) => {
            userQueue.requests.push({
                ...request,
                resolve,
                reject,
                timestamp: Date.now()
            });
        });

        // Start or reset timer
        if (userQueue.timer) {
            clearTimeout(userQueue.timer);
        }

        // Process batch when timeout or size limit reached
        if (userQueue.requests.length >= this.maxBatchSize) {
            this.processBatch(userId);
        } else {
            userQueue.timer = setTimeout(() => {
                this.processBatch(userId);
            }, this.batchTimeout);
        }

        return requestPromise;
    }

    // Process a batch of requests
    async processBatch(userId) {
        const userQueue = this.batchQueue.get(userId);
        if (!userQueue || userQueue.requests.length === 0) return;

        // Clear timer
        if (userQueue.timer) {
            clearTimeout(userQueue.timer);
            userQueue.timer = null;
        }

        // Extract requests
        const batch = userQueue.requests.splice(0, this.maxBatchSize);

        // If queue still has items, schedule next batch
        if (userQueue.requests.length > 0) {
            userQueue.timer = setTimeout(() => {
                this.processBatch(userId);
            }, this.batchTimeout);
        }

        try {
            // Combine prompts intelligently
            const combinedRequest = this.combineBatch(batch);

            // Process combined request
            const response = await this.executeBatch(combinedRequest);

            // Split and distribute responses
            this.distributeBatchResponses(batch, response);

        } catch (error) {
            // Reject all requests in batch on error
            batch.forEach(req => req.reject(error));
        }
    }

    // Combine multiple requests into one
    combineBatch(batch) {
        if (batch.length === 1) {
            return batch[0];
        }

        // Group by similar request types
        const grouped = this.groupByType(batch);

        // Create combined prompt
        let combinedPrompt = '';
        let sections = [];

        grouped.forEach((requests, type) => {
            if (type === 'code-generation') {
                combinedPrompt += this.combineCodeRequests(requests);
            } else if (type === 'debugging') {
                combinedPrompt += this.combineDebugRequests(requests);
            } else {
                combinedPrompt += this.combineGeneralRequests(requests);
            }
            sections.push({ type, count: requests.length });
        });

        return {
            prompt: combinedPrompt,
            model: this.selectBatchModel(batch),
            batchInfo: {
                count: batch.length,
                sections,
                combinedAt: Date.now()
            }
        };
    }

    // Group requests by type
    groupByType(batch) {
        const groups = new Map();

        batch.forEach(request => {
            const type = this.detectRequestType(request.prompt);
            if (!groups.has(type)) {
                groups.set(type, []);
            }
            groups.get(type).push(request);
        });

        return groups;
    }

    // Detect request type
    detectRequestType(prompt) {
        const promptLower = prompt.toLowerCase();

        if (promptLower.includes('error') || promptLower.includes('fix') ||
            promptLower.includes('debug')) {
            return 'debugging';
        }

        if (promptLower.includes('create') || promptLower.includes('make') ||
            promptLower.includes('write')) {
            return 'code-generation';
        }

        if (promptLower.includes('explain') || promptLower.includes('what') ||
            promptLower.includes('how')) {
            return 'explanation';
        }

        return 'general';
    }

    // Combine code generation requests
    combineCodeRequests(requests) {
        let combined = 'Generate the following Roblox Luau scripts:\n\n';

        requests.forEach((req, index) => {
            combined += `[SCRIPT ${index + 1}]: ${req.prompt}\n`;
        });

        combined += '\nProvide each script in a separate code block with [SCRIPT N] label.';

        return combined;
    }

    // Combine debugging requests
    combineDebugRequests(requests) {
        let combined = 'Fix the following Roblox Luau code issues:\n\n';

        requests.forEach((req, index) => {
            combined += `[ISSUE ${index + 1}]: ${req.prompt}\n`;
            if (req.code) {
                combined += `\`\`\`lua\n${req.code}\n\`\`\`\n`;
            }
        });

        combined += '\nProvide fixes for each issue with [ISSUE N] label.';

        return combined;
    }

    // Combine general requests
    combineGeneralRequests(requests) {
        let combined = 'Answer the following questions about Roblox development:\n\n';

        requests.forEach((req, index) => {
            combined += `[Q${index + 1}]: ${req.prompt}\n`;
        });

        combined += '\nProvide answers with [Q1], [Q2], etc. labels.';

        return combined;
    }

    // Select optimal model for batch
    selectBatchModel(batch) {
        // Check complexity of all requests
        let hasComplex = false;
        let allSimple = true;

        batch.forEach(req => {
            const complexity = this.estimateComplexity(req.prompt);
            if (complexity === 'complex') hasComplex = true;
            if (complexity !== 'simple') allSimple = false;
        });

        if (hasComplex) return 'claude-4-opus';
        if (allSimple) return 'claude-3-5-haiku';
        return 'claude-4-sonnet';
    }

    // Estimate request complexity
    estimateComplexity(prompt) {
        const wordCount = prompt.split(/\s+/).length;
        const hasCode = prompt.includes('```');

        if (wordCount < 20 && !hasCode) return 'simple';
        if (wordCount > 100 || hasCode) return 'complex';
        return 'medium';
    }

    // Execute the batched request
    async executeBatch(combinedRequest) {
        // This would call your AI API
        // For now, return a mock response structure
        return {
            response: 'Combined response here',
            sections: [],
            tokenUsage: {
                input: 0,
                output: 0
            }
        };
    }

    // Split and distribute responses to original requests
    distributeBatchResponses(batch, response) {
        // Parse response and extract sections
        const sections = this.parseResponse(response.response);

        batch.forEach((req, index) => {
            const section = sections[index] || 'Response not found';
            req.resolve({
                response: section,
                fromBatch: true,
                batchSize: batch.length,
                tokenSavings: this.calculateTokenSavings(batch.length)
            });
        });
    }

    // Parse batched response into sections
    parseResponse(response) {
        const sections = [];

        // Look for [SCRIPT N], [ISSUE N], [QN] patterns
        const patterns = [
            /\[SCRIPT \d+\][\s\S]*?(?=\[SCRIPT \d+\]|$)/g,
            /\[ISSUE \d+\][\s\S]*?(?=\[ISSUE \d+\]|$)/g,
            /\[Q\d+\][\s\S]*?(?=\[Q\d+\]|$)/g
        ];

        for (const pattern of patterns) {
            const matches = response.match(pattern);
            if (matches && matches.length > 0) {
                matches.forEach(match => {
                    // Remove the label from the response
                    const content = match.replace(/\[(SCRIPT|ISSUE|Q)\d+\]\s*/, '').trim();
                    sections.push(content);
                });
                break;
            }
        }

        // Fallback: split by double newlines if no patterns found
        if (sections.length === 0) {
            const parts = response.split(/\n\n+/);
            parts.forEach(part => {
                if (part.trim()) sections.push(part.trim());
            });
        }

        return sections;
    }

    // Calculate token savings from batching
    calculateTokenSavings(batchSize) {
        // Each separate request would have system prompt overhead
        // Batching saves this overhead
        const systemPromptTokens = 100;  // Estimated
        const contextTokens = 50;        // Estimated per request

        return (batchSize - 1) * (systemPromptTokens + contextTokens);
    }

    // Check if batching is beneficial for a request
    shouldBatch(request) {
        const { prompt, priority = 'normal', model } = request;

        // Don't batch high priority requests
        if (priority === 'high') return false;

        // Don't batch complex model requests
        if (model === 'claude-4-opus') return false;

        // Don't batch very long prompts
        if (prompt.length > 1000) return false;

        // Batch simple, short requests
        return true;
    }

    // Get batch statistics
    getStats() {
        const stats = {
            queuedRequests: 0,
            activeUsers: this.batchQueue.size,
            processingBatches: this.processing.size
        };

        this.batchQueue.forEach(queue => {
            stats.queuedRequests += queue.requests.length;
        });

        return stats;
    }

    // Clear user's queue (for cleanup)
    clearUserQueue(userId) {
        const userQueue = this.batchQueue.get(userId);
        if (userQueue) {
            if (userQueue.timer) {
                clearTimeout(userQueue.timer);
            }
            // Reject pending requests
            userQueue.requests.forEach(req => {
                req.reject(new Error('Queue cleared'));
            });
            this.batchQueue.delete(userId);
        }
    }
}

// Export singleton instance
export const batchHandler = new BatchRequestHandler();

// Helper function to check if request should be batched
export function canBatch(request) {
    return batchHandler.shouldBatch(request);
}

// Queue request for batching
export async function queueForBatch(userId, request) {
    if (canBatch(request)) {
        return await batchHandler.queueRequest(userId, request);
    }
    return null;  // Process normally
}

export default batchHandler;