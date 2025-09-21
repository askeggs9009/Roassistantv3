// Chat Manager - Handles chat functionality
class ChatManager {
    constructor() {
        this.messages = [];
        this.attachedFiles = [];
        this.isLoading = false;
        // Use the backend API URL
        this.API_BASE_URL = 'https://www.roassistant.me';
        this.currentProject = null;
        this.projects = JSON.parse(localStorage.getItem('roblox_projects') || '[]');
    }

    // Send message functionality
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message && this.attachedFiles.length === 0) return;
        if (this.isLoading) return;

        try {
            this.isLoading = true;
            this.updateSendButton(true);

            // Check if this is the first user message in a new chat
            const isFirstMessage = this.messages.length === 0;

            // Add user message to chat
            this.addMessage('user', message);
            messageInput.value = '';

            // Generate chat title if this is the first user message
            if (isFirstMessage && message.trim()) {
                // Generate title asynchronously but don't wait for it
                this.generateChatTitle(message).then(title => {
                    if (title && title !== 'New Chat') {
                        // Update the chat title in the UI
                        const chatTitle = document.getElementById('chatTitle');
                        if (chatTitle) {
                            chatTitle.textContent = title;
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

            // Prepare request body
            const requestBody = {
                prompt: message,
                model: this.getSelectedModel() || 'gpt-4o-mini'
            };

            // Add project context if available
            if (this.currentProject) {
                requestBody.projectContext = {
                    name: this.currentProject.name,
                    description: this.currentProject.description,
                    type: this.currentProject.type,
                    context: this.currentProject.context,
                    files: this.currentProject.files
                };
                
                // Add context message to prompt
                const contextMessage = `\n\n[Project Context: ${this.currentProject.name} - ${this.currentProject.description}. This is a ${this.currentProject.type} project. ${this.currentProject.context}]`;
                requestBody.prompt = message + contextMessage;
            }

            // Show AI thinking animation
            this.showAiThinking();

            // Send to API
            const response = await fetch(`${this.API_BASE_URL}/ask`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            // Hide AI thinking animation
            this.hideAiThinking();
            
            if (response.ok) {
                this.addMessage('assistant', data.reply);
                
                // Update usage info if provided
                if (data.usageInfo) {
                    this.updateUsageDisplay(data.usageInfo);
                }
                
                // Update subscription info if provided
                if (data.subscription) {
                    this.updateSubscriptionDisplay(data.subscription);
                }
            } else {
                this.addMessage('error', data.error || 'An error occurred while processing your request.');
            }

        } catch (error) {
            console.error('Error sending message:', error);
            this.hideAiThinking(); // Hide thinking animation on error
            this.addMessage('error', 'Network error. Please check your connection and try again.');
        } finally {
            this.isLoading = false;
            this.updateSendButton(false);
            this.clearAttachedFiles();
        }
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

                // Format and display the current text with cursor
                container.innerHTML = this.formatAssistantMessage(currentText) + '<span class="typewriter-cursor">|</span>';

                // Scroll to keep message visible
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }

                // Continue streaming with slight randomness (reduced for faster effect)
                setTimeout(streamNextWord, baseDelay + Math.random() * 10);
            } else {
                // Streaming complete - remove cursor and show final formatted content
                container.innerHTML = this.formatAssistantMessage(text);

                console.log('[Typewriter] Effect completed');

                // Final scroll
                const messagesContainer = document.getElementById('messagesContainer');
                if (messagesContainer) {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }

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

    // Format assistant messages with enhanced markdown support
    formatAssistantMessage(content) {
        // Generate unique ID for code blocks in this message
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        let codeBlockIndex = 0;

        // Code blocks with copy button
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            const blockId = `${messageId}_code_${codeBlockIndex++}`;
            const trimmedCode = code.trim();
            const escapedCode = this.escapeHtml(trimmedCode);
            const langLabel = language || 'lua';

            return `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-language">${langLabel}</span>
                        <button class="copy-code-btn" onclick="window.chatManager.copyCode('${blockId}')" title="Copy code">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                            <span class="copy-text">Copy</span>
                        </button>
                    </div>
                    <pre class="code-block ${langLabel}"><code id="${blockId}">${escapedCode}</code></pre>
                </div>
            `;
        });

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

    // Get selected model
    getSelectedModel() {
        const modelSelect = document.getElementById('modelSelect');
        return modelSelect ? modelSelect.value : 'gpt-4o-mini';
    }

    // Update usage display
    updateUsageDisplay(usageInfo) {
        // Implementation for updating usage counters
        console.log('Usage info:', usageInfo);
    }

    // Update subscription display
    updateSubscriptionDisplay(subscription) {
        // Implementation for updating subscription info
        console.log('Subscription info:', subscription);
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
        console.log('[ChatManager] Clearing current chat for privacy');

        // Generate new chat ID to ensure complete privacy separation
        const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('currentChatId', newChatId);

        // Clear messages array
        this.messages = [];

        // Clear the messages container
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        // Clear attached files
        this.clearAttachedFiles();

        // Reset any selected chat in sidebar
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });

        // Reset chat title
        const chatTitle = document.getElementById('chatTitle');
        if (chatTitle) {
            chatTitle.textContent = 'New Chat';
        }

        // Clear localStorage chat history (but keep user-specific histories)
        localStorage.removeItem('chatHistory');
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

        // Load from localStorage or server
        const savedMessages = localStorage.getItem('chatHistory');
        if (savedMessages) {
            try {
                this.messages = JSON.parse(savedMessages);
                this.displaySavedMessages();
            } catch (error) {
                console.error('Error loading chat history:', error);
            }
        }

        // Show welcome message if no messages
        if (this.messages.length === 0) {
            this.showWelcomeMessage();
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
    }

    // Save chat history
    saveChatHistory() {
        try {
            const userStorageKey = this.getUserStorageKey('allChatHistories');
            const chatId = this.getCurrentChatId();
            const allChats = JSON.parse(localStorage.getItem(userStorageKey) || '{}');
            allChats[chatId] = {
                messages: this.messages,
                title: document.getElementById('chatTitle')?.textContent || 'New Chat',
                lastUpdated: Date.now(),
                projectContext: this.currentProject
            };
            localStorage.setItem(userStorageKey, JSON.stringify(allChats));
            localStorage.setItem('chatHistory', JSON.stringify(this.messages));

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
            messagesContainer.innerHTML = '';
        }
        this.clearAttachedFiles();
        localStorage.removeItem('chatHistory');

        // Reset chat title
        const chatTitle = document.getElementById('chatTitle');
        if (chatTitle) {
            chatTitle.textContent = 'New Chat';
        }

        // Reload project context if needed
        this.loadProjectContext();

        // Show welcome message
        this.showWelcomeMessage();

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
                            <h2>Welcome to Roblox Luau AI</h2>
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
        document.title = `${this.currentProject.name} - Roblox Luau AI`;
        
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
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) {
                chatTitle.textContent = chatData.title || 'New Chat';
            }

            // Clear and display messages
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }

            this.displaySavedMessages();

            // Show welcome message if no messages
            if (this.messages.length === 0) {
                this.showWelcomeMessage();
            }

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
                    <span class="message-sender">Roblox Luau AI</span>
                    <span class="message-time">${timestamp}</span>
                </div>
                <div class="message-text"></div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

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
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const timestamp = new Date().toLocaleTimeString();

        if (type === 'user') {
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
                        <span class="message-sender">Roblox Luau AI</span>
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Make ChatManager globally available
window.chatManager = new ChatManager();

// Global functions for HTML onclick handlers
window.sendMessage = () => window.chatManager.sendMessage();
window.startNewChat = () => window.chatManager.startNewChat();

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
});