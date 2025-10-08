// Chat Manager - Handles chat functionality
class ChatManager {
    constructor() {
        this.messages = [];
        this.attachedFiles = [];
        this.isLoading = false;
        this.lastUserMessage = ''; // Store last user message for context-aware code summaries
        // Use the backend API URL
        this.API_BASE_URL = 'https://www.roassistant.me';
        this.currentProject = null;
        this.projects = window.storageUtils ? window.storageUtils.getUserData('roblox_projects', []) : [];
    }

    // Send message functionality
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message && this.attachedFiles.length === 0) return;
        if (this.isLoading) {
            console.log('Message blocked: AI is still typing');
            return;
        }

        try {
            this.isLoading = true;
            this.updateSendButton(true);

            // Check if this is the first user message in a new chat
            const isFirstMessage = this.messages.length === 0;

            // Store last user message for context-aware code summaries
            this.lastUserMessage = message;

            // Add user message to chat
            this.addMessage('user', message);
            messageInput.value = '';

            // Generate chat title if this is the first user message
            if (isFirstMessage && message.trim()) {
                // Generate title asynchronously but don't wait for it
                this.generateChatTitle(message).then(title => {
                    if (title && title !== 'New Chat') {
                        // Update the chat title in the UI
                        // Update the chat name and title
                        if (window.updateChatName) {
                            window.updateChatName(title);
                        } else {
                            const chatTitle = document.getElementById('chatTitle');
                            if (chatTitle) {
                                chatTitle.textContent = title;
                            }
                        }

                        // Save the updated chat with new title
                        this.saveChatHistory();

                                        // Update the sidebar display
                        this.updateRecentChats();

                        console.log('[ChatManager] Chat title updated to:', title);
                    }
                }).catch(error => {
                    console.error('[ChatManager] Error updating chat title:', error);
                });
            }

            // Get auth token (check both possible keys)
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Prepare conversation history for context
            // Convert this.messages to API format (role + content)
            const conversationHistory = this.messages
                .filter(msg => msg.type === 'user' || msg.type === 'assistant')
                .map(msg => ({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.content
                }));

            // Prepare request body
            const requestBody = {
                prompt: message,
                model: this.getSelectedModel() || 'nexus',
                conversationHistory: conversationHistory // Send conversation history
            };

            // Add project context if available
            if (this.currentProject) {
                console.log('[ChatManager] Current project:', this.currentProject);
                console.log('[ChatManager] Project has artifacts:', this.currentProject.artifacts?.length || 0);

                // Default to 'keyword' mode if not set
                const searchMode = this.currentProject.searchMode || 'keyword';
                console.log('[ChatManager] Search mode:', searchMode);

                let contextMessage = `\n\n[Project: ${this.currentProject.name}`;

                if (this.currentProject.description) {
                    contextMessage += ` - ${this.currentProject.description}`;
                }

                // Add instructions based on search mode
                if (searchMode !== 'none' && this.currentProject.instructions) {
                    contextMessage += `\n\nProject Instructions:\n${this.currentProject.instructions}`;
                }

                // Add artifacts based on search mode
                if (searchMode === 'full' && this.currentProject.artifacts && this.currentProject.artifacts.length > 0) {
                    console.log('[ChatManager] Including ALL artifacts (full mode):', this.currentProject.artifacts.length);
                    contextMessage += '\n\nProject Artifacts (All):';
                    this.currentProject.artifacts.forEach(artifact => {
                        console.log('[ChatManager] Adding artifact:', artifact.name, 'Type:', artifact.type, 'Content length:', artifact.content ? artifact.content.length : 0);
                        contextMessage += `\n\n--- ${artifact.name} (${artifact.type}) ---\n`;
                        if (artifact.type === 'text') {
                            contextMessage += artifact.content || '[Empty content]';
                        } else if (artifact.type === 'image') {
                            contextMessage += '[Image artifact attached - refer to this when relevant]';
                        }
                    });
                } else if (searchMode === 'keyword' && this.currentProject.artifacts && this.currentProject.artifacts.length > 0) {
                    // Keyword matching with more inclusive artifact detection
                    const messageLower = message.toLowerCase();
                    const keywords = messageLower.split(/\s+/).filter(word => word.length > 2);  // Reduced from 3 to 2
                    console.log('[ChatManager] Keywords for search:', keywords);

                    // Check if user is asking about artifacts in general
                    const askingAboutArtifacts = messageLower.includes('artifact') ||
                                                messageLower.includes('script') ||
                                                messageLower.includes('code') ||
                                                messageLower.includes('file') ||
                                                messageLower.includes('read my') ||
                                                messageLower.includes('show me') ||
                                                messageLower.includes('look at') ||
                                                messageLower.includes('analyze') ||
                                                messageLower.includes('review');

                    let relevantArtifacts;
                    if (askingAboutArtifacts && (messageLower.includes('all') || messageLower.includes('every'))) {
                        // User wants to see all artifacts
                        console.log('[ChatManager] User asking about all artifacts');
                        relevantArtifacts = this.currentProject.artifacts;
                    } else {
                        // Keyword matching
                        relevantArtifacts = this.currentProject.artifacts.filter(artifact => {
                            const artifactText = (artifact.name + ' ' + (artifact.content || '')).toLowerCase();
                            return keywords.some(keyword => artifactText.includes(keyword)) ||
                                   (askingAboutArtifacts && keywords.length === 0);
                        });
                    }

                    console.log('[ChatManager] Found relevant artifacts:', relevantArtifacts.length);
                    if (relevantArtifacts.length > 0) {
                        contextMessage += '\n\nRelevant Artifacts:';
                        relevantArtifacts.forEach(artifact => {
                            console.log('[ChatManager] Adding relevant artifact:', artifact.name, 'Type:', artifact.type, 'Content length:', artifact.content ? artifact.content.length : 0);
                            contextMessage += `\n\n--- ${artifact.name} (${artifact.type}) ---\n`;
                            if (artifact.type === 'text') {
                                contextMessage += artifact.content || '[Empty content]';
                            } else if (artifact.type === 'image') {
                                contextMessage += '[Image artifact - may be relevant to your question]';
                            }
                        });
                    } else if (this.currentProject.artifacts.length > 0) {
                        // If no artifacts matched but project has artifacts, include a hint
                        console.log('[ChatManager] No relevant artifacts found for keywords, but project has', this.currentProject.artifacts.length, 'artifacts available');
                        const artifactNames = this.currentProject.artifacts.map(a => a.name).join(', ');
                        contextMessage += `\n\n[Available project artifacts: ${artifactNames}. Ask about specific artifacts to include them.]`;
                    }
                }

                contextMessage += ']';
                console.log('[ChatManager] Final context message length:', contextMessage.length);
                requestBody.prompt = message + contextMessage;

                requestBody.projectContext = {
                    name: this.currentProject.name,
                    description: this.currentProject.description,
                    searchMode: searchMode
                };
            }

            // Check if streaming is enabled
            const streamingEnabled = window.streamingEnabled || false;
            console.log(`[ChatManager] Streaming mode: ${streamingEnabled}`);

            if (streamingEnabled) {
                // Use streaming endpoint (don't await - it handles its own state)
                await this.handleStreamingResponse(requestBody, headers);
            } else {
                // Use regular endpoint
                await this.handleRegularResponse(requestBody, headers);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.hideAiThinking(); // Hide thinking animation on error
            this.addMessage('error', 'Network error. Please check your connection and try again.');
            this.isLoading = false;
            this.updateSendButton(false);
        }

        // Clear attached files (but don't reset loading state here for streaming)
        this.clearAttachedFiles();
    }

    // Handle regular non-streaming response
    async handleRegularResponse(requestBody, headers) {
        console.log('[ChatManager] Sending request to /ask endpoint...');

        // Show AI thinking animation
        this.showAiThinking();

        // Send to API
        const response = await fetch(`${this.API_BASE_URL}/ask`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        console.log(`[ChatManager] Response status: ${response.status}`);

        const data = await response.json();
        console.log('[ChatManager] Response data received:', data);

        // 🔍 Log AI routing process to console
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
        console.log('%c🤖 AI ROUTING PROCESS', 'color: #00ff00; font-weight: bold; font-size: 14px');
        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');

        if (data.fromCache) {
            console.log('%c💾 CACHE HIT - Zero API Cost!', 'color: #ffaa00; font-weight: bold');
            console.log('   Response served from cache (no API call made)');
        } else {
            if (data.routingAnalysis) {
                console.log(`%c🧠 ${data.routingAnalysis.analyzedBy} Analysis:`, 'color: #00aaff; font-weight: bold');
                console.log(`   Task complexity: ${data.routingAnalysis.complexity.toUpperCase()}`);
            }

            if (data.requestedModel && data.requestedModel !== data.model) {
                console.log('%c✅ SMART ROUTING ACTIVATED', 'color: #00ff00; font-weight: bold');
                console.log(`   Requested: ${data.requestedModel}`);
                console.log(`   Routed to: ${data.model}`);
                console.log('%c   💰 Cost savings: 95% cheaper!', 'color: #ffaa00');
            } else {
                console.log(`%c   Model used: ${data.model}`, 'color: #00aaff');
                console.log('   (No routing needed - already optimal)');
            }

            if (data.tokenUsage) {
                console.log('%c📈 Token Usage:', 'color: #ff66ff; font-weight: bold');
                console.log(`   Input tokens:  ${data.tokenUsage.inputTokens}`);
                console.log(`   Output tokens: ${data.tokenUsage.outputTokens}`);
                console.log(`   Total tokens:  ${data.tokenUsage.totalTokens}`);

                // Calculate approximate cost
                const costs = {
                    'claude-3-5-haiku': { input: 0.25, output: 1.25 },
                    'claude-4-sonnet': { input: 3, output: 15 },
                    'gpt-4o-mini': { input: 0.15, output: 0.60 }
                };

                const modelCost = costs[data.model] || { input: 1, output: 5 };
                const inputCost = (data.tokenUsage.inputTokens / 1000000) * modelCost.input;
                const outputCost = (data.tokenUsage.outputTokens / 1000000) * modelCost.output;
                const totalCost = inputCost + outputCost;

                console.log(`%c   💵 Estimated cost: $${totalCost.toFixed(6)}`, 'color: #00ff00');
            }
        }

        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');

        // Hide AI thinking animation
        this.hideAiThinking();

        if (response.ok) {
            this.addMessage('assistant', data.reply);

            // Show token usage for this response
            if (data.tokenUsage) {
                this.displayTokenUsage(data.tokenUsage);
            }

            // Update usage info if provided
            if (data.usageInfo) {
                this.updateUsageDisplay(data.usageInfo);
            }

            // Update subscription info if provided
            if (data.subscription) {
                this.updateSubscriptionDisplay(data.subscription);
            }
        } else {
            // Check if this is a limit error that should show the upgrade popup
            if (data.upgradeUrl && data.error && data.error.includes('Nexus')) {
                this.showNexusUpgradePopup();
            } else {
                this.addMessage('error', data.error || 'An error occurred while processing your request.');
            }
        }

        // Re-enable input after regular response completes
        this.isLoading = false;
        this.updateSendButton(false);
    }

    // Handle streaming response
    async handleStreamingResponse(requestBody, headers) {
        // Create message container for streaming response
        const messageId = Date.now();
        const messageContainer = this.createStreamingMessage(messageId);

        try {
            const response = await fetch(`${this.API_BASE_URL}/ask-stream`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                // Check if this is a limit error that should show the upgrade popup
                if (errorData.upgradeUrl && errorData.error && errorData.error.includes('Nexus')) {
                    this.showNexusUpgradePopup();
                } else {
                    this.addMessage('error', errorData.error || 'An error occurred while processing your request.');
                }
                // Re-enable input on error
                this.isLoading = false;
                this.updateSendButton(false);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'chunk') {
                                fullResponse += data.text;
                                this.updateStreamingMessage(messageId, fullResponse);
                            } else if (data.type === 'complete') {
                                // 🔍 Log AI routing process to console
                                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');
                                console.log('%c🤖 AI ROUTING PROCESS', 'color: #00ff00; font-weight: bold; font-size: 14px');
                                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');

                                if (data.fromCache) {
                                    console.log('%c💾 CACHE HIT - Zero API Cost!', 'color: #ffaa00; font-weight: bold');
                                    console.log('   Response served from cache (no API call made)');
                                } else {
                                    if (data.routingAnalysis) {
                                        console.log(`%c🧠 ${data.routingAnalysis.analyzedBy} Analysis:`, 'color: #00aaff; font-weight: bold');
                                        console.log(`   Task complexity: ${data.routingAnalysis.complexity.toUpperCase()}`);
                                    }

                                    if (data.requestedModel && data.requestedModel !== data.model) {
                                        console.log('%c✅ SMART ROUTING ACTIVATED', 'color: #00ff00; font-weight: bold');
                                        console.log(`   Requested: ${data.requestedModel}`);
                                        console.log(`   Routed to: ${data.model}`);
                                        console.log('%c   💰 Cost savings: 95% cheaper!', 'color: #ffaa00');
                                    } else {
                                        console.log(`%c   Model used: ${data.model}`, 'color: #00aaff');
                                        console.log('   (No routing needed - already optimal)');
                                    }

                                    if (data.tokenUsage) {
                                        console.log('%c📈 Token Usage:', 'color: #ff66ff; font-weight: bold');
                                        console.log(`   Input tokens:  ${data.tokenUsage.inputTokens}`);
                                        console.log(`   Output tokens: ${data.tokenUsage.outputTokens}`);
                                        console.log(`   Total tokens:  ${data.tokenUsage.totalTokens}`);

                                        // Calculate approximate cost
                                        const costs = {
                                            'claude-3-5-haiku': { input: 0.25, output: 1.25 },
                                            'claude-4-sonnet': { input: 3, output: 15 },
                                            'gpt-4o-mini': { input: 0.15, output: 0.60 }
                                        };

                                        const modelCost = costs[data.model] || { input: 1, output: 5 };
                                        const inputCost = (data.tokenUsage.inputTokens / 1000000) * modelCost.input;
                                        const outputCost = (data.tokenUsage.outputTokens / 1000000) * modelCost.output;
                                        const totalCost = inputCost + outputCost;

                                        console.log(`%c   💵 Estimated cost: $${totalCost.toFixed(6)}`, 'color: #00ff00');
                                    }
                                }

                                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00ff00');

                                // Show token usage
                                if (data.tokenUsage) {
                                    this.displayTokenUsage(data.tokenUsage);
                                }
                                // Update usage info if provided
                                if (data.usageInfo) {
                                    this.updateUsageDisplay(data.usageInfo);
                                }
                                // Finalize the message with proper formatting
                                this.finalizeStreamingMessage(messageId, data.fullResponse);
                                // Re-enable input when streaming is complete
                                this.isLoading = false;
                                this.updateSendButton(false);
                            } else if (data.type === 'error') {
                                this.addMessage('error', data.error);
                                // Re-enable input on error
                                this.isLoading = false;
                                this.updateSendButton(false);
                                return;
                            }
                        } catch (e) {
                            console.error('Error parsing streaming data:', e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Streaming error:', error);
            this.addMessage('error', 'Network error during streaming. Please try again.');
            // Clean up partial message
            const partialMessage = document.querySelector(`[data-message-id="${messageId}"]`);
            if (partialMessage) {
                partialMessage.remove();
            }
            // Re-enable input on error
            this.isLoading = false;
            this.updateSendButton(false);
        }
    }

    // Create a streaming message container
    createStreamingMessage(messageId) {
        const messagesContainer = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'message-container assistant';
        messageElement.setAttribute('data-message-id', messageId);

        messageElement.innerHTML = `
            <div class="message-content">
                <div class="message-text" id="streaming-${messageId}"><span class="streaming-cursor">|</span></div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
        // Allow free scrolling - no auto-scroll to bottom when AI starts

        return messageElement;
    }

    // Update streaming message content with real-time formatting
    updateStreamingMessage(messageId, content) {
        const messageElement = document.getElementById(`streaming-${messageId}`);
        if (messageElement) {
            // Apply formatting with streaming code blocks
            const formattedContent = this.formatAssistantMessageStreaming(content, messageId);
            // Add blinking cursor at the end
            messageElement.innerHTML = formattedContent + '<span class="streaming-cursor">|</span>';
            // No auto-scrolling - user can freely scroll while AI types
        }
    }

    // Format message for streaming with live code block updates
    formatAssistantMessageStreaming(content, messageId) {
        // Handle incomplete code blocks (streaming)
        let processedContent = content;

        // Check for incomplete code blocks (``` without closing)
        const incompleteCodeMatch = content.match(/```(\w+)?\n([\s\S]*?)$/);

        if (incompleteCodeMatch && !content.match(/```(\w+)?\n[\s\S]*?```/g)) {
            // We have an opening ``` but no closing yet
            const language = incompleteCodeMatch[1] || 'lua';
            const codeContent = incompleteCodeMatch[2];
            const lineCount = codeContent.split('\n').length;
            const blockId = `${messageId}_streaming_code`;

            // Replace the incomplete code block with artifact box
            processedContent = content.replace(/```(\w+)?\n[\s\S]*?$/, `
                <div class="code-artifact-box streaming">
                    <div class="artifact-icon">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                        </svg>
                    </div>
                    <div class="artifact-content">
                        <div class="artifact-title">Writing Code...</div>
                        <div class="artifact-meta">${lineCount} lines</div>
                    </div>
                    <div class="artifact-arrow">
                        <div class="streaming-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            `);
        }

        // Use regular formatting for the rest
        return this.formatAssistantMessage(processedContent, true);
    }

    // Finalize streaming message with proper formatting
    finalizeStreamingMessage(messageId, content) {
        const messageContainer = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageContainer) {
            // Remove streaming cursor and apply proper formatting
            messageContainer.innerHTML = `
                <div class="message-content">
                    <div class="message-text">${this.formatAssistantMessage(content)}</div>
                </div>
            `;
        }

        // IMPORTANT: Store the assistant message in messages array for persistence
        const chatId = this.getCurrentChatId();
        this.messages.push({
            type: 'assistant',
            content: content,
            timestamp: Date.now(),
            chatId
        });
        this.saveChatHistory();

        // No scroll manipulation when AI finishes
    }

    // Show AI thinking animation
    showAiThinking() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        // Remove any existing AI thinking animation
        this.hideAiThinking();

        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'ai-thinking';
        thinkingDiv.id = 'aiThinking';
        thinkingDiv.innerHTML = `
            <div class="roblox-loading"></div>
            <span class="ai-thinking-text">AI is thinking...</span>
        `;

        messagesContainer.appendChild(thinkingDiv);
        // No auto-scrolling when showing AI thinking
    }

    // Hide AI thinking animation
    hideAiThinking() {
        const thinkingDiv = document.getElementById('aiThinking');
        if (thinkingDiv) {
            thinkingDiv.remove();
        }
    }

    // Typewriter effect for AI responses
    async typewriterEffect(element, text, onComplete) {
        const container = element.querySelector('.message-text') || element;

        console.log('[Typewriter] Starting effect for:', text.substring(0, 50) + '...');

        // Clear any existing content first
        container.innerHTML = '';

        // Split text into words for streaming effect
        const words = text.split(' ');
        const totalWords = words.length;

        // Calculate delay based on total content length (faster typing)
        const baseDelay = Math.max(10, Math.min(50 - (totalWords / 20), 50));

        let wordIndex = 0;
        let currentText = '';

        const streamNextWord = () => {
            if (wordIndex < totalWords) {
                // Add next word
                currentText += (wordIndex > 0 ? ' ' : '') + words[wordIndex];
                wordIndex++;

                // Format and display the current text with cursor (skip panel trigger)
                container.innerHTML = this.formatAssistantMessage(currentText, true) + '<span class="typewriter-cursor">|</span>';
                // No auto-scrolling during typewriter effect

                // Continue streaming with slight randomness (reduced for faster effect)
                setTimeout(streamNextWord, baseDelay + Math.random() * 10);
            } else {
                // Streaming complete - remove cursor and show final formatted content
                container.innerHTML = this.formatAssistantMessage(text, true);

                console.log('[Typewriter] Effect completed');
                // No auto-scrolling after typewriter completes

                // Call completion callback
                if (onComplete) {
                    onComplete();
                }
            }
        };

        // Start streaming immediately (no delay)
        streamNextWord();
    }

    // Get user avatar HTML for messages
    getUserAvatarHtml() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');

            if (user.picture) {
                return `
                    <div class="message-avatar">
                        <img class="message-avatar-img" src="${user.picture}" alt="Profile" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                        <div class="message-avatar-fallback" style="display:none;">${(user.name || user.email || 'U').charAt(0).toUpperCase()}</div>
                    </div>
                `;
            } else {
                const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();
                return `
                    <div class="message-avatar">
                        <div class="message-avatar-fallback">${initial}</div>
                    </div>
                `;
            }
        } catch (error) {
            return `
                <div class="message-avatar">
                    <div class="message-avatar-fallback">U</div>
                </div>
            `;
        }
    }

    // Generate chat title from first user message
    async generateChatTitle(message) {
        try {
            console.log('[ChatManager] Generating chat title for:', message.substring(0, 50));

            // Get auth token (check both possible keys)
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json'
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`${this.API_BASE_URL}/api/generate-chat-title`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();

            if (response.ok && data.title) {
                console.log('[ChatManager] Generated chat title:', data.title);
                return data.title;
            } else {
                console.warn('[ChatManager] Failed to generate title, using fallback');
                return 'New Chat';
            }
        } catch (error) {
            console.error('[ChatManager] Error generating chat title:', error);
            return 'New Chat';
        }
    }

    // Add message to chat display and save it
    addMessage(type, content) {
        console.log('[ChatManager] addMessage called:', type, content.substring(0, 50));

        // No welcome screen to remove anymore

        // Use typewriter effect for assistant messages, regular display for others
        if (type === 'assistant') {
            this.displayAssistantMessageWithTypewriter(content);
        } else {
            this.displayMessage(type, content);
        }

        // Store message with chat ID
        const chatId = this.getCurrentChatId();
        this.messages.push({ type, content, timestamp: Date.now(), chatId });
        this.saveChatHistory();
    }

    // Generate a brief summary for code block based on user question and code content
    generateCodeSummary(code, language, userQuestion = '') {
        const codeLower = code.toLowerCase();
        const questionLower = userQuestion.toLowerCase();

        // Extract key terms from user question
        const extractKeyTerms = (question) => {
            // Remove common words and extract meaningful terms
            const commonWords = ['create', 'make', 'write', 'add', 'build', 'script', 'code', 'for', 'that', 'can', 'will', 'the', 'a', 'an', 'in', 'to', 'with', 'my', 'me', 'please', 'help', 'need', 'want', 'how'];
            const words = question.split(/\s+/)
                .filter(w => w.length > 3 && !commonWords.includes(w))
                .map(w => w.replace(/[^a-z0-9]/g, ''));
            return words.slice(0, 3);
        };

        const keyTerms = extractKeyTerms(questionLower);

        // First, try to match based on user's question context
        if (questionLower) {
            // Check if question mentions specific Roblox features
            if ((questionLower.includes('shop') || questionLower.includes('store') || questionLower.includes('buy')) &&
                (codeLower.includes('shop') || codeLower.includes('purchase') || codeLower.includes('buy'))) {
                return 'Shop System';
            } else if ((questionLower.includes('datastore') || questionLower.includes('data')) &&
                       (codeLower.includes('datastore') || codeLower.includes('data'))) {
                return 'DataStore System';
            } else if ((questionLower.includes('leaderstats') || questionLower.includes('leaderboard')) &&
                       codeLower.includes('leaderstats')) {
                return 'Leaderboard System';
            } else if ((questionLower.includes('weapon') || questionLower.includes('gun') || questionLower.includes('damage')) &&
                       codeLower.includes('damage')) {
                return 'Damage System';
            } else if ((questionLower.includes('animation') || questionLower.includes('tween') || questionLower.includes('animate')) &&
                       (codeLower.includes('tween') || codeLower.includes('animation'))) {
                return 'Animation System';
            } else if ((questionLower.includes('spawn') || questionLower.includes('respawn')) &&
                       codeLower.includes('spawn')) {
                return 'Spawn System';
            } else if ((questionLower.includes('ui') || questionLower.includes('gui') || questionLower.includes('button') || questionLower.includes('menu')) &&
                       (codeLower.includes('gui') || codeLower.includes('frame') || codeLower.includes('button'))) {
                return 'UI System';
            } else if ((questionLower.includes('tool') || questionLower.includes('item') || questionLower.includes('equip')) &&
                       codeLower.includes('tool')) {
                return 'Tool System';
            } else if ((questionLower.includes('remote') || questionLower.includes('event')) &&
                       (codeLower.includes('remote') && codeLower.includes('event'))) {
                return 'Remote Event System';
            } else if ((questionLower.includes('player') || questionLower.includes('join')) &&
                       codeLower.includes('player')) {
                return 'Player System';
            }

            // Try to extract meaningful noun phrases from question
            if (keyTerms.length > 0) {
                // Capitalize first letter of each term
                const summary = keyTerms.slice(0, 2).map(term =>
                    term.charAt(0).toUpperCase() + term.slice(1)
                ).join(' ');

                // Add "System" or "Handler" suffix if appropriate
                if (summary && !summary.includes('System') && !summary.includes('Handler')) {
                    if (codeLower.includes('function') || codeLower.includes('event')) {
                        return summary + ' Handler';
                    } else {
                        return summary + ' System';
                    }
                }
                return summary || 'Code System';
            }
        }

        // Fallback to code pattern detection
        if (codeLower.includes('http') || codeLower.includes('fetch') || codeLower.includes('request')) {
            return 'API Handler';
        } else if (codeLower.includes('button') && codeLower.includes('click')) {
            return 'Button Handler';
        } else if (codeLower.includes('datastore') || codeLower.includes('data store')) {
            return 'DataStore System';
        } else if (codeLower.includes('remote') && codeLower.includes('event')) {
            return 'Remote Event Handler';
        } else if (codeLower.includes('tween') || codeLower.includes('animation')) {
            return 'Animation System';
        } else if (codeLower.includes('player') && codeLower.includes('join')) {
            return 'Player Handler';
        } else if (codeLower.includes('gui') || codeLower.includes('frame') || codeLower.includes('textbutton')) {
            return 'UI Component';
        } else if (codeLower.includes('tool') || codeLower.includes('equipped')) {
            return 'Tool System';
        } else if (codeLower.includes('part') && (codeLower.includes('touch') || codeLower.includes('collision'))) {
            return 'Collision Handler';
        } else if (codeLower.includes('leaderstats')) {
            return 'Leaderboard System';
        } else if (codeLower.includes('spawn')) {
            return 'Spawn Handler';
        } else if (codeLower.includes('damage')) {
            return 'Damage System';
        } else if (codeLower.includes('shop') || codeLower.includes('purchase')) {
            return 'Shop System';
        } else if (codeLower.includes('function') || codeLower.includes('def ') || codeLower.includes('const ')) {
            // Extract first function name
            const funcMatch = code.match(/(?:function|def|const)\s+(\w+)/);
            if (funcMatch && funcMatch[1]) {
                const funcName = funcMatch[1];
                // Convert camelCase to Title Case (max 3 words)
                const words = funcName.replace(/([A-Z])/g, ' $1').trim().split(/\s+/).slice(0, 3);
                return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
        }

        // Final fallback to language type
        return `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
    }

    // Format assistant messages with enhanced markdown support
    formatAssistantMessage(content, skipPanel = false) {
        // Store code blocks for the panel
        const codeBlocks = [];
        let codeBlockIndex = 0;

        // PRIORITY 1: Structured scripts as clickable boxes (like Claude's artifacts)
        content = content.replace(/<roblox_script\s+name="([^"]+)"\s+type="([^"]+)"\s+location="([^"]+)">([\s\S]*?)<\/roblox_script>/g, (match, name, type, location, code) => {
            const trimmedCode = code.trim();
            const escapedCode = this.escapeHtml(trimmedCode);
            const lineCount = trimmedCode.split('\n').length;

            // Create content-based hash for consistent IDs
            const contentHash = this.hashCode(trimmedCode + name + type);
            const blockId = `structured-${contentHash}-${codeBlockIndex++}`;

            // Icon based on type
            let typeLabel = type;
            if (type === 'Part' || type === 'Model' || type === 'Tool') {
                typeLabel = `${type} (Instance)`;
            }

            // Store code block for panel display
            codeBlocks.push({
                id: blockId,
                language: 'lua',
                code: trimmedCode || `-- ${name} will be created in ${location}`,
                escapedCode: escapedCode || `-- ${name} will be created in ${location}`,
                summary: `${name} (${type})`,
                structured: true,
                scriptType: type,
                location: location
            });

            return `
                <div class="code-artifact-box structured" data-block-id="${blockId}" onclick="console.log('Clicked:', '${blockId}'); window.openCodePanel('${blockId}');">
                    <div class="artifact-icon">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                        </svg>
                    </div>
                    <div class="artifact-content">
                        <div class="artifact-title">${name}</div>
                        <div class="artifact-meta">${typeLabel} → ${location}${trimmedCode ? ` • ${lineCount} lines` : ''}</div>
                    </div>
                    <div class="artifact-arrow">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                        </svg>
                    </div>
                </div>
            `;
        });

        // PRIORITY 2: Regular code blocks as clickable boxes (like Claude's artifacts)
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const trimmedCode = code.trim();
            const escapedCode = this.escapeHtml(trimmedCode);
            const langLabel = language || 'lua';
            const lineCount = trimmedCode.split('\n').length;

            // Create content-based hash for consistent IDs (use dashes to avoid markdown interference)
            const contentHash = this.hashCode(trimmedCode);
            const blockId = `code-${contentHash}-${codeBlockIndex++}`;

            // Generate a brief summary for the code using user's question for context
            const codeSummary = this.generateCodeSummary(trimmedCode, langLabel, this.lastUserMessage || '');

            // Store code block for panel display
            codeBlocks.push({
                id: blockId,
                language: langLabel,
                code: trimmedCode,
                escapedCode: escapedCode,
                summary: codeSummary
            });

            return `
                <div class="code-artifact-box" data-block-id="${blockId}" onclick="console.log('Clicked:', '${blockId}'); window.openCodePanel('${blockId}');">
                    <div class="artifact-icon">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>
                        </svg>
                    </div>
                    <div class="artifact-content">
                        <div class="artifact-title">${codeSummary}</div>
                        <div class="artifact-meta">${lineCount} lines • Click to view</div>
                    </div>
                    <div class="artifact-arrow">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                        </svg>
                    </div>
                </div>
            `;
        });

        // Store code blocks globally for reliable access
        if (codeBlocks.length > 0) {
            // Use window object for global storage
            if (!window._codeBlocks) {
                window._codeBlocks = {};
            }
            codeBlocks.forEach(block => {
                window._codeBlocks[block.id] = block;
                console.log('[CodeBlock] Stored:', block.id, 'Total blocks:', Object.keys(window._codeBlocks).length);
            });
        }

        // Headers (must be at line start)
        content = content.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
        content = content.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
        content = content.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

        // Bold text
        content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/__(.+?)__/g, '<strong>$1</strong>');

        // Italic text
        content = content.replace(/\*(.+?)\*/g, '<em>$1</em>');
        content = content.replace(/_(.+?)_/g, '<em>$1</em>');

        // Underline text
        content = content.replace(/~~(.+?)~~/g, '<del>$1</del>');
        content = content.replace(/<u>(.+?)<\/u>/g, '<u>$1</u>');

        // Lists
        content = content.replace(/^\* (.+)$/gm, '<li>$1</li>');
        content = content.replace(/^- (.+)$/gm, '<li>$1</li>');
        content = content.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        content = content.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
            return '<ul class="md-list">' + match + '</ul>';
        });

        // Links
        content = content.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        // Inline code
        content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Line breaks
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    // Open code panel when user clicks on artifact box
    openCodePanel(blockId) {
        console.log('[CodeBlock] Opening panel for:', blockId);
        console.log('[CodeBlock] Available blocks:', Object.keys(window._codeBlocks || {}));

        if (!window._codeBlocks || !window._codeBlocks[blockId]) {
            console.error('[CodeBlock] Not found:', blockId);
            console.log('[CodeBlock] Checking all stored keys:');

            if (window._codeBlocks) {
                for (let key in window._codeBlocks) {
                    console.log('  Key:', key, '| Match:', key === blockId, '| Lengths:', key.length, blockId.length);
                }
            }
            return;
        }

        const block = window._codeBlocks[blockId];
        console.log('[CodeBlock] Found block, opening panel');
        this.showCodePanel([block]);
    }

    // Show code panel with code blocks
    showCodePanel(codeBlocks) {
        const codePanel = document.getElementById('codePanel');
        const codePanelContent = document.getElementById('codePanelContent');
        const mainContent = document.getElementById('mainContent');

        if (!codePanel || !codePanelContent) return;

        // Clear previous content
        codePanelContent.innerHTML = '';

        // Add code blocks to panel
        codeBlocks.forEach(block => {
            const blockHtml = `
                <div class="code-block-container" style="animation: slideInRight 0.5s ease;">
                    <div class="code-block-header">
                        <span class="code-language">${block.language}</span>
                        <button class="copy-code-btn" onclick="window.chatManager.copyCode('${block.id}_panel')" title="Copy code">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                            <span class="copy-text">Copy</span>
                        </button>
                    </div>
                    <pre class="code-block ${block.language}"><code id="${block.id}_panel">${block.escapedCode}</code></pre>
                </div>
            `;
            codePanelContent.innerHTML += blockHtml;
        });

        // Show panel with animation (no sidebar hiding)
        setTimeout(() => {
            codePanel.classList.add('active');
            if (mainContent) mainContent.classList.add('code-panel-active');
            // Add class to body to shift Explorer panel
            document.body.classList.add('code-panel-open');

            // Set Explorer position to match code panel width
            const explorerPanel = document.getElementById('explorerPanel');
            if (explorerPanel) {
                const codePanelWidth = codePanel.offsetWidth;
                explorerPanel.style.right = `${codePanelWidth}px`;
            }
        }, 100);
    }

    // Copy code to clipboard
    copyCode(blockId) {
        const codeBlock = document.getElementById(blockId);
        if (codeBlock) {
            const code = codeBlock.textContent;
            navigator.clipboard.writeText(code).then(() => {
                // Update button text
                const button = codeBlock.closest('.code-block-container').querySelector('.copy-code-btn');
                if (button) {
                    const copyText = button.querySelector('.copy-text');
                    copyText.textContent = 'Copied!';
                    setTimeout(() => {
                        copyText.textContent = 'Copy';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy code:', err);
            });
        }
    }

    // Generate hash code from string for consistent IDs
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Update send button state
    updateSendButton(loading) {
        const sendButton = document.getElementById('sendButton');

        if (!sendButton) return;

        if (loading) {
            sendButton.innerHTML = '<i class="loading-spinner"></i>';
            sendButton.disabled = true;
        } else {
            sendButton.innerHTML = '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            sendButton.disabled = false;
        }
    }

    // Get selected model based on user's subscription
    getSelectedModel() {
        // Use subscription's default model
        if (window.userSubscription && window.userSubscription.limits) {
            return window.userSubscription.limits.defaultModel || 'nexus';
        }
        return 'nexus';  // Default to nexus for free/guest users
    }

    // Update usage display
    updateUsageDisplay(usageInfo) {
        // Update Nexus usage counter for free users
        if (usageInfo && usageInfo.nexusUsage !== undefined) {
            this.updateNexusCounter(usageInfo.nexusUsage, usageInfo.nexusLimit || 3);
            // Store globally for model indicator
            window.currentNexusUsage = usageInfo.nexusUsage;
            // Update model indicator
            if (typeof updateModelIndicator === 'function') {
                updateModelIndicator();
            }
        }

        console.log('Usage info:', usageInfo);
    }

    // Update subscription display
    updateSubscriptionDisplay(subscription) {
        // Implementation for updating subscription info
        console.log('Subscription info:', subscription);
    }

    // Update Nexus usage counter
    updateNexusCounter(used, limit) {
        const nexusCounter = document.getElementById('nexusUsageCounter');
        if (nexusCounter) {
            // If limit is -1, user has unlimited access (Pro/Enterprise plan)
            if (limit === -1) {
                nexusCounter.textContent = 'Unlimited';
                nexusCounter.style.background = 'linear-gradient(45deg, #58a6ff, #1f6feb)';
                nexusCounter.style.color = 'white';
                nexusCounter.style.padding = '0.25rem 0.5rem';
                nexusCounter.style.borderRadius = '12px';
                nexusCounter.style.fontSize = '0.7rem';
                nexusCounter.style.fontWeight = '600';
            } else {
                // Free plan - show usage counter
                nexusCounter.textContent = `${used}/${limit}`;
                nexusCounter.style.background = '';
                nexusCounter.style.color = '';
                nexusCounter.style.padding = '';
                nexusCounter.style.borderRadius = '';
                nexusCounter.style.fontSize = '';
                nexusCounter.style.fontWeight = '';
            }

            // Don't auto-show popup - only show when user tries to use Nexus
            // The popup will be triggered by sendMessage() when they hit the limit
        }
    }

    // Show Nexus upgrade popup (centered on screen)
    showNexusUpgradePopup() {
        const modal = document.getElementById('nexusUpgradeModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // Show upgrade modal (legacy - for counter)
    showUpgradeModal() {
        this.showNexusUpgradePopup();
    }

    // Close upgrade modal
    closeUpgradeModal() {
        const modal = document.getElementById('nexusUpgradeModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Display token usage for the current response
    displayTokenUsage(tokenUsage) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer || !tokenUsage) return;

        // Create token usage indicator
        const tokenDiv = document.createElement('div');
        tokenDiv.className = 'token-usage-indicator';
        tokenDiv.innerHTML = `
            <div class="token-info">
                <span class="token-label">Tokens Used:</span>
                <span class="token-count">
                    <span class="input-tokens" title="Input tokens">${tokenUsage.inputTokens || 0}</span>
                    <span class="token-separator">→</span>
                    <span class="output-tokens" title="Output tokens">${tokenUsage.outputTokens || 0}</span>
                    <span class="total-tokens" title="Total tokens">(${tokenUsage.totalTokens || 0} total)</span>
                </span>
            </div>
        `;

        // Add CSS styles if not already present
        if (!document.getElementById('tokenUsageStyles')) {
            const style = document.createElement('style');
            style.id = 'tokenUsageStyles';
            style.textContent = `
                .token-usage-indicator {
                    margin: 10px 20px;
                    padding: 8px 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 12px;
                    color: #999;
                }
                .token-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .token-label {
                    font-weight: 500;
                    color: #aaa;
                }
                .token-count {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .input-tokens {
                    color: #4CAF50;
                    font-weight: 600;
                }
                .output-tokens {
                    color: #2196F3;
                    font-weight: 600;
                }
                .token-separator {
                    color: #666;
                }
                .total-tokens {
                    color: #999;
                    margin-left: 5px;
                    font-size: 11px;
                }
                .token-usage-dashboard {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    padding: 15px;
                    min-width: 200px;
                    z-index: 1000;
                    backdrop-filter: blur(10px);
                }
                .token-usage-dashboard h4 {
                    margin: 0 0 10px 0;
                    color: #fff;
                    font-size: 14px;
                }
                .token-stat {
                    display: flex;
                    justify-content: space-between;
                    margin: 5px 0;
                    font-size: 12px;
                }
                .token-stat-label {
                    color: #aaa;
                }
                .token-stat-value {
                    color: #fff;
                    font-weight: 600;
                }
                .token-progress {
                    width: 100%;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 2px;
                    margin-top: 10px;
                    overflow: hidden;
                }
                .token-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #4CAF50, #2196F3);
                    border-radius: 2px;
                    transition: width 0.3s ease;
                }
            `;
            document.head.appendChild(style);
        }

        messagesContainer.appendChild(tokenDiv);
        // No auto-scrolling for token usage display

        // Update global token counter if exists
        this.updateGlobalTokenCounter();
    }

    // Update global token counter
    async updateGlobalTokenCounter() {
        try {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${this.API_BASE_URL}/api/token-usage`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.displayTokenDashboard(data); // Show token usage dashboard
            }
        } catch (error) {
            console.error('Error fetching token usage:', error);
        }
    }

    // Display token usage dashboard
    displayTokenDashboard(data) {
        let dashboard = document.getElementById('tokenUsageDashboard');

        if (!dashboard) {
            dashboard = document.createElement('div');
            dashboard.id = 'tokenUsageDashboard';
            dashboard.className = 'token-usage-dashboard';
            document.body.appendChild(dashboard);
        }

        const usage = data.usage;
        const dailyPercentage = usage.dailyPercentage || 0;
        const monthlyPercentage = usage.monthlyPercentage || 0;

        // Format percentage color based on usage
        const getDailyColor = () => {
            if (dailyPercentage >= 90) return '#f85149';
            if (dailyPercentage >= 75) return '#d4ac0d';
            return '#58a6ff';
        };

        const getMonthlyColor = () => {
            if (monthlyPercentage >= 90) return '#f85149';
            if (monthlyPercentage >= 75) return '#d4ac0d';
            return '#58a6ff';
        };

        // Generate warning message based on usage
        let warningMessage = '';
        if (usage.dailyLimit !== -1 && dailyPercentage >= 75) {
            let warningColor, warningIcon, warningText;
            if (dailyPercentage >= 95) {
                warningColor = '#f85149';
                warningIcon = '⚠️';
                warningText = `Almost at daily limit! (${dailyPercentage.toFixed(1)}%)`;
            } else if (dailyPercentage >= 85) {
                warningColor = '#ff8200';
                warningIcon = '⚡';
                warningText = `Approaching daily limit (${dailyPercentage.toFixed(1)}%)`;
            } else {
                warningColor = '#d4ac0d';
                warningIcon = 'ℹ️';
                warningText = `Daily usage at ${dailyPercentage.toFixed(1)}%`;
            }
            warningMessage = `
                <div class="token-warning" style="
                    background: rgba(${warningColor === '#f85149' ? '248, 81, 73' : warningColor === '#ff8200' ? '255, 130, 0' : '212, 172, 13'}, 0.15);
                    border: 1px solid ${warningColor};
                    color: ${warningColor};
                    padding: 8px;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <span>${warningIcon}</span>
                    <span>${warningText}</span>
                    <a href="/pricing.html" style="
                        margin-left: auto;
                        color: ${warningColor};
                        text-decoration: underline;
                        font-size: 11px;
                    ">Upgrade</a>
                </div>
            `;
        } else if (usage.monthlyLimit !== -1 && monthlyPercentage >= 90 && dailyPercentage < 75) {
            warningMessage = `
                <div class="token-warning" style="
                    background: rgba(255, 130, 0, 0.15);
                    border: 1px solid #ff8200;
                    color: #ff8200;
                    padding: 8px;
                    border-radius: 8px;
                    margin-bottom: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <span>⚡</span>
                    <span>Monthly limit at ${monthlyPercentage.toFixed(1)}%</span>
                    <a href="/pricing.html" style="
                        margin-left: auto;
                        color: #ff8200;
                        text-decoration: underline;
                        font-size: 11px;
                    ">Upgrade</a>
                </div>
            `;
        }

        dashboard.innerHTML = `
            ${warningMessage}
            <h4>Token Usage</h4>
            ${usage.dailyLimit !== -1 ? `
                <div class="token-stat">
                    <span class="token-stat-label">Daily:</span>
                    <span class="token-stat-value" style="color: ${getDailyColor()}; font-weight: 600;">
                        ${dailyPercentage.toFixed(1)}%
                    </span>
                </div>
                <div class="token-progress" style="margin-bottom: 10px;">
                    <div class="token-progress-fill" style="width: ${Math.min(dailyPercentage, 100)}%; background: ${getDailyColor()};"></div>
                </div>
            ` : ''}
            ${usage.monthlyLimit !== -1 ? `
                <div class="token-stat">
                    <span class="token-stat-label">Monthly:</span>
                    <span class="token-stat-value" style="color: ${getMonthlyColor()}; font-weight: 600;">
                        ${monthlyPercentage.toFixed(1)}%
                    </span>
                </div>
                <div class="token-progress">
                    <div class="token-progress-fill" style="width: ${Math.min(monthlyPercentage, 100)}%; background: ${getMonthlyColor()};"></div>
                </div>
                ${usage.daysUntilMonthlyReset ? `
                    <div class="token-stat" style="margin-top: 8px; font-size: 11px; color: #8b949e;">
                        <span>Resets in ${usage.daysUntilMonthlyReset} day${usage.daysUntilMonthlyReset !== 1 ? 's' : ''}</span>
                    </div>
                ` : ''}
            ` : ''}
            ${data.costEstimate && data.costEstimate.monthly ? `
                <div class="token-stat" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <span class="token-stat-label">Est. Cost/Month:</span>
                    <span class="token-stat-value">$${data.costEstimate.monthly.estimated}</span>
                </div>
            ` : ''}
        `;

        // Auto-hide dashboard after 10 seconds, show again on hover
        setTimeout(() => {
            dashboard.style.opacity = '0.3';
        }, 10000);

        dashboard.onmouseenter = () => {
            dashboard.style.opacity = '1';
        };

        dashboard.onmouseleave = () => {
            dashboard.style.opacity = '0.3';
        };
    }

    // Clear attached files
    clearAttachedFiles() {
        this.attachedFiles = [];
        const fileAttachments = document.getElementById('fileAttachments');
        if (fileAttachments) {
            fileAttachments.innerHTML = '';
            fileAttachments.style.display = 'none';
        }
    }

    // Clear current chat display and messages
    clearCurrentChat() {

        // Generate new chat ID to ensure complete privacy separation
        const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('currentChatId', newChatId);

        // Clear messages array
        this.messages = [];

        // Clear the messages container
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            console.log('[ChatManager] Clearing messagesContainer innerHTML');
            messagesContainer.innerHTML = '';
        }

        // Clear attached files
        this.clearAttachedFiles();

        // Reset any selected chat in sidebar
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });

        // Reset chat title
        // Reset chat title
        if (window.updateChatName) {
            window.updateChatName('New Chat');
        } else {
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) {
                chatTitle.textContent = 'New Chat';
            }
        }

        // Clear user-scoped chat history
        if (window.storageUtils) {
            window.storageUtils.removeUserData('chatHistory');
        } else {
            localStorage.removeItem('chatHistory');
        }
    }

    // Load chat history
    loadChatHistory() {

        // Reset sidebar title when loading chats
        const sidebarTitle = document.querySelector('.sidebar-header h3');
        if (sidebarTitle) {
            sidebarTitle.textContent = 'Recents';
        }

        // First load project context
        this.loadProjectContext();

        // Load recent chats in sidebar
        this.loadRecentChats();

        // Try to load from user-specific chat history first
        try {
            const chatId = this.getCurrentChatId();
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');

            if (allChats[chatId] && allChats[chatId].messages) {
                // Load from the specific chat
                this.messages = allChats[chatId].messages;
                this.displaySavedMessages();

                // Update the chat title if it exists
                // Restore chat title
                const title = allChats[chatId].title || 'New Chat';
                if (window.updateChatName) {
                    window.updateChatName(title);
                } else {
                    const chatTitle = document.getElementById('chatTitle');
                    if (chatTitle) {
                        chatTitle.textContent = title;
                    }
                }
            } else {
                // Fall back to user-scoped chat history
                const savedMessages = window.storageUtils ?
                    window.storageUtils.getUserData('chatHistory', null) :
                    (localStorage.getItem('chatHistory') ? JSON.parse(localStorage.getItem('chatHistory')) : null);
                if (savedMessages) {
                    this.messages = Array.isArray(savedMessages) ? savedMessages : JSON.parse(savedMessages);
                    this.displaySavedMessages();
                }
            }
        } catch (error) {
            console.error('Error loading chat history:', error);

            // Final fallback to user-scoped chat history
            const savedMessages = window.storageUtils ?
                window.storageUtils.getUserData('chatHistory', null) :
                (localStorage.getItem('chatHistory') ? JSON.parse(localStorage.getItem('chatHistory')) : null);
            if (savedMessages) {
                try {
                    this.messages = Array.isArray(savedMessages) ? savedMessages : JSON.parse(savedMessages);
                    this.displaySavedMessages();
                } catch (err) {
                    console.error('Error loading fallback chat history:', err);
                }
            }
        }

        // Show welcome message if no messages
        // if (this.messages.length === 0) {
        //     this.showWelcomeMessage();
        // }

        // Fetch current Nexus usage for authenticated users
        this.fetchNexusUsage();
    }

    // Fetch current Nexus usage from server
    async fetchNexusUsage() {
        try {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (!token) return; // Only for authenticated users

            const response = await fetch(`${this.API_BASE_URL}/api/nexus-usage`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.nexusUsage !== undefined) {
                    this.updateNexusCounter(data.nexusUsage, data.nexusLimit || 3);
                }
            }
        } catch (error) {
            console.error('Error fetching Nexus usage:', error);
        }
    }

    // Display saved messages
    displaySavedMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '';
        this.messages.forEach(msg => {
            this.displayMessage(msg.type, msg.content);
        });

        // Restore last user message for context-aware code summaries
        const lastUserMsg = [...this.messages].reverse().find(msg => msg.type === 'user');
        if (lastUserMsg) {
            this.lastUserMessage = lastUserMsg.content;
        }
    }

    // Save chat history
    saveChatHistory() {
        try {
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const chatId = this.getCurrentChatId();
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');

            // Log for debugging
            console.log('[ChatManager] Saving chat history - chatId:', chatId, 'messages count:', this.messages.length);

            allChats[chatId] = {
                messages: this.messages,
                title: document.getElementById('chatTitle')?.textContent || 'New Chat',
                lastUpdated: Date.now(),
                projectContext: this.currentProject
            };
            localStorage.setItem(userStorageKey, JSON.stringify(allChats));
            // Save current chat history in user-scoped storage
            if (window.storageUtils) {
                window.storageUtils.setUserData('chatHistory', this.messages);
            } else {
                localStorage.setItem('chatHistory', JSON.stringify(this.messages));
            }

            // Update recent chats display
            this.updateRecentChats();
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    // Get current user ID
    getCurrentUserId() {
        try {
            const user = localStorage.getItem('user');
            if (user) {
                const userData = JSON.parse(user);
                return userData.email || userData.id || 'guest';
            }
        } catch (error) {
            console.error('Error getting user ID:', error);
        }
        return 'guest';
    }

    // Get user-specific storage key
    getUserStorageKey(baseKey) {
        // Use centralized storageUtils if available
        if (window.storageUtils) {
            return window.storageUtils.getUserKey(baseKey);
        }
        const userId = this.getCurrentUserId();
        return `${baseKey}_${userId}`;
    }

    // Get current chat ID
    getCurrentChatId() {
        let chatId = sessionStorage.getItem('currentChatId');
        if (!chatId) {
            chatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('currentChatId', chatId);
        }
        return chatId;
    }

    // Start new chat
    startNewChat() {

        // Save current chat before starting new one
        if (this.messages.length > 0) {
            this.saveChatHistory();
        }

        // Generate new chat ID
        const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('currentChatId', newChatId);

        this.messages = [];
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            console.log('[ChatManager] Clearing messagesContainer innerHTML in startNewChat');
            messagesContainer.innerHTML = '';
        }
        this.clearAttachedFiles();
        if (window.storageUtils) {
            window.storageUtils.removeUserData('chatHistory');
        } else {
            localStorage.removeItem('chatHistory');
        }

        // Reset chat title
        // Reset chat title
        if (window.updateChatName) {
            window.updateChatName('New Chat');
        } else {
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) {
                chatTitle.textContent = 'New Chat';
            }
        }

        // Reload project context if needed
        this.loadProjectContext();

        // Show welcome message
        // this.showWelcomeMessage();

        // Update recent chats display
        this.updateRecentChats();
    }

    // Show welcome message
    showWelcomeMessage() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        // Check if welcome message already exists
        const existingWelcome = messagesContainer.querySelector('.welcome-message');
        if (existingWelcome) {
            return; // Don't add duplicate welcome message
        }

        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        
        if (this.currentProject) {
            const iconSvg = this.getProjectIcon(this.currentProject.type);
            welcomeDiv.innerHTML = `
                <div class="welcome-content">
                    <h2><span style="display: inline-block; width: 24px; height: 24px; vertical-align: middle; margin-right: 8px;">${iconSvg}</span>Welcome to ${this.currentProject.name}!</h2>
                    <p>${this.currentProject.description}</p>
                    <p>This is your <strong>${this.currentProject.type}</strong> project workspace. I have context about your project and can help you with:</p>
                    <ul>
                        <li>"Generate scripts for my ${this.currentProject.type} game"</li>
                        <li>"Help me implement ${this.getProjectFeatures()}"</li>
                        <li>"Debug issues in my project"</li>
                        <li>"Optimize my ${this.currentProject.type} mechanics"</li>
                    </ul>
                    ${this.currentProject.files.length > 0 ? `
                        <div class="project-files-info">
                            <strong>Project Files:</strong> ${this.currentProject.files.join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            welcomeDiv.innerHTML = `
                <div class="welcome-content">
                    <div class="welcome-header">
                        <div class="welcome-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                        </div>
                        <div class="welcome-title">
                            <h2>Welcome to RoAssistant</h2>
                            <p class="welcome-subtitle">Your intelligent assistant for Roblox game development</p>
                        </div>
                    </div>
                </div>
            `;
        }
        messagesContainer.appendChild(welcomeDiv);
    }

    // Get project-specific features for welcome message
    getProjectFeatures() {
        const features = {
            'game': 'game mechanics, player systems, and interactive features',
            'script': 'automation, tools, and utility functions',
            'gui': 'user interfaces, menus, and interactive elements',
            'system': 'backend systems, data management, and core functionality',
            'other': 'custom features and specialized functionality'
        };
        return features[this.currentProject?.type] || 'custom functionality';
    }

    // Load project context from URL parameter
    loadProjectContext() {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (projectId) {
            this.currentProject = this.projects.find(p => p.id === projectId);
            if (this.currentProject) {
                this.updateProjectInterface();
                console.log('Loaded project context:', this.currentProject.name);
            }
        }
    }

    // Update interface to show project context
    updateProjectInterface() {
        if (!this.currentProject) return;

        // Update page title
        document.title = `${this.currentProject.name} - RoAssistant`;
        
        // Add project indicator to header
        this.addProjectIndicator();
    }

    // Add project indicator to the interface
    addProjectIndicator() {
        const header = document.querySelector('.header-title h1');
        if (header && this.currentProject) {
            // Get SVG icon based on project type
            const iconSvg = this.getProjectIcon(this.currentProject.type);
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 24px; height: 24px;">${iconSvg}</span>
                    <span>${this.currentProject.name}</span>
                    <span style="font-size: 0.8rem; color: #8b949e; font-weight: normal;">
                        (${this.currentProject.type})
                    </span>
                </div>
            `;
        }
    }

    // Get SVG icon for project type
    getProjectIcon(type) {
        const icons = {
            'game': `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM11 13H9v2H8v-2H6v-1h2V9h1v3h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>`,
            'script': `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`,
            'gui': `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z"/></svg>`,
            'system': `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
            'other': `<svg fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`
        };
        return icons[type] || icons['other'];
    }

    // Load and display recent chats in sidebar
    loadRecentChats() {
        try {
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');
            this.updateRecentChatsDisplay(allChats);
        } catch (error) {
            console.error('Error loading recent chats:', error);
        }
    }

    // Update recent chats display
    updateRecentChats() {
        try {
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');
            this.updateRecentChatsDisplay(allChats);
        } catch (error) {
            console.error('Error updating recent chats:', error);
        }
    }

    // Update recent chats display in sidebar
    updateRecentChatsDisplay(allChats) {
        const chatHistoryContainer = document.getElementById('chatHistory');
        if (!chatHistoryContainer) return;

        // Sort chats by lastUpdated timestamp
        const sortedChats = Object.entries(allChats)
            .sort(([, a], [, b]) => b.lastUpdated - a.lastUpdated)
            .slice(0, 10); // Show only recent 10 chats

        if (sortedChats.length === 0) {
            chatHistoryContainer.innerHTML = '<div class="no-chats">No recent chats</div>';
            return;
        }

        const currentChatId = this.getCurrentChatId();

        chatHistoryContainer.innerHTML = sortedChats.map(([chatId, chat]) => {
            const isActive = chatId === currentChatId;
            const title = chat.title || 'New Chat';
            const truncatedTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;
            const lastUpdated = new Date(chat.lastUpdated).toLocaleDateString();

            return `
                <div class="chat-item ${isActive ? 'active' : ''}" onclick="window.chatManager.loadChat('${chatId}')">
                    <div class="chat-item-content">
                        <div class="chat-title">${this.escapeHtml(truncatedTitle)}</div>
                        <div class="chat-date">${lastUpdated}</div>
                    </div>
                    <button class="chat-delete" onclick="event.stopPropagation(); window.chatManager.deleteChat('${chatId}')" title="Delete chat">
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    // Load a specific chat
    loadChat(chatId) {

        try {
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');
            const chatData = allChats[chatId];

            if (!chatData) {
                console.error('Chat not found:', chatId);
                return;
            }

            // Save current chat before switching
            this.saveChatHistory();

            // Set the new chat ID
            sessionStorage.setItem('currentChatId', chatId);

            // Load the chat data
            this.messages = chatData.messages || [];
            this.currentProject = chatData.projectContext || null;

            // Update UI
            // Load chat title
            const title = chatData.title || 'New Chat';
            if (window.updateChatName) {
                window.updateChatName(title);
            } else {
                const chatTitle = document.getElementById('chatTitle');
                if (chatTitle) {
                    chatTitle.textContent = title;
                }
            }

            // Clear and display messages
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }

            this.displaySavedMessages();

            // Show welcome message if no messages
            // if (this.messages.length === 0) {
            //     this.showWelcomeMessage();
            // }

            // Update recent chats display
            this.updateRecentChats();

        } catch (error) {
            console.error('Error loading chat:', error);
        }
    }

    // Delete a specific chat
    deleteChat(chatId) {
        if (confirm('Are you sure you want to delete this chat?')) {
            try {
                const userStorageKey = this.getUserStorageKey('allChatHistories');
                const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');
                delete allChats[chatId];
                localStorage.setItem(userStorageKey, JSON.stringify(allChats));

                // If we're deleting the current chat, start a new one
                const currentChatId = this.getCurrentChatId();
                if (chatId === currentChatId) {
                    this.startNewChat();
                } else {
                    this.updateRecentChats();
                }
            } catch (error) {
                console.error('Error deleting chat:', error);
            }
        }
    }

    // Display assistant message with typewriter effect
    displayAssistantMessageWithTypewriter(content) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';

        const timestamp = new Date().toLocaleTimeString();

        messageDiv.innerHTML = `
            <div class="message-avatar message-avatar-ai">
                <img src="./noob.png" alt="AI" class="message-avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">RoAssistant</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-text"></div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        // No auto-scrolling when AI message starts

        // Start typewriter effect
        this.typewriterEffect(messageDiv, content, () => {
            // After typing is complete, extract and save scripts
            if (window.scriptsManager) {
                const chatId = this.getCurrentChatId();
                const chatTitle = document.getElementById('chatTitle')?.textContent || 'Chat';
                window.scriptsManager.extractAndSaveScriptsFromChat(content, chatId, chatTitle);
            }
        });
    }

    // Display message without saving (used for loading saved messages)
    displayMessage(type, content) {
        const messagesContainer = document.getElementById('messagesContainer');
        console.log('[ChatManager] displayMessage:', type, 'container found:', !!messagesContainer);

        // Add debugging to track the container's contents
        if (messagesContainer) {
            console.log('[ChatManager] Messages container before adding - children count:', messagesContainer.children.length);
            console.log('[ChatManager] Messages container innerHTML length:', messagesContainer.innerHTML.length);
        } else {
            console.error('[ChatManager] messagesContainer not found!');
            return;
        }

        // No welcome screen to handle anymore

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const timestamp = new Date().toLocaleTimeString();

        if (type === 'user') {
            console.log('[ChatManager] Creating user message div');
            messageDiv.innerHTML = `
                ${this.getUserAvatarHtml()}
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">You</span>
                        <span class="message-time">${timestamp}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(content)}</div>
                </div>
            `;
        } else if (type === 'assistant') {
            messageDiv.innerHTML = `
                <div class="message-avatar message-avatar-ai">
                    <img src="./noob.png" alt="AI" class="message-avatar-img" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">RoAssistant</span>
                        <span class="message-time">${timestamp}</span>
                    </div>
                    <div class="message-text">${this.formatAssistantMessage(content)}</div>
                </div>
            `;

            // Extract and save scripts from assistant responses
            if (window.scriptsManager) {
                const chatId = this.getCurrentChatId();
                const chatTitle = document.getElementById('chatTitle')?.textContent || 'Chat';
                window.scriptsManager.extractAndSaveScriptsFromChat(content, chatId, chatTitle);
            }
        } else if (type === 'error') {
            messageDiv.innerHTML = `
                <div class="message-content error">
                    <div class="message-header">
                        <span class="message-sender">Error</span>
                        <span class="message-time">${timestamp}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(content)}</div>
                </div>
            `;
        }

        messagesContainer.appendChild(messageDiv);
        console.log('[ChatManager] Message appended to container. Total messages:', messagesContainer.children.length);

        // Only auto-scroll for user messages
        if (type === 'user') {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            console.log('[ChatManager] Scrolled to bottom');
        }
    }
}

// Make ChatManager globally available
window.chatManager = new ChatManager();

// Global functions for HTML onclick handlers
window.sendMessage = () => window.chatManager.sendMessage();
window.startNewChat = () => window.chatManager.startNewChat();
window.closeUpgradeModal = () => window.chatManager.closeUpgradeModal();
window.openCodePanel = (blockId) => window.chatManager.openCodePanel(blockId);

// Handle Enter key in message input
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.chatManager.sendMessage();
            }
        });
    }

    // Code panel resize functionality
    const codePanel = document.getElementById('codePanel');
    const resizeHandle = document.getElementById('codePanelResizeHandle');

    if (codePanel && resizeHandle) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = codePanel.offsetWidth;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const deltaX = startX - e.clientX;
            const newWidth = startWidth + deltaX;

            // Min width: 300px, Max width: 80% of window
            const minWidth = 300;
            const maxWidth = window.innerWidth * 0.8;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                codePanel.style.width = `${newWidth}px`;

                // Update Explorer position to stick to code panel
                const explorerPanel = document.getElementById('explorerPanel');
                if (explorerPanel && document.body.classList.contains('code-panel-open')) {
                    explorerPanel.style.right = `${newWidth}px`;
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }
});