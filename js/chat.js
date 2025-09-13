// Chat Manager - Handles chat functionality
class ChatManager {
    constructor() {
        this.messages = [];
        this.attachedFiles = [];
        this.isLoading = false;
        this.API_BASE_URL = window.location.origin;
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
            
            // Add user message to chat
            this.addMessage('user', message);
            messageInput.value = '';

            // Get auth token
            const token = localStorage.getItem('token');
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

            // Send to API
            const response = await fetch(`${this.API_BASE_URL}/ask`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            
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
            this.addMessage('error', 'Network error. Please check your connection and try again.');
        } finally {
            this.isLoading = false;
            this.updateSendButton(false);
            this.clearAttachedFiles();
        }
    }

    // Add message to chat display
    addMessage(type, content) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        
        if (type === 'user') {
            messageDiv.innerHTML = `
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
        
        // Store message with chat ID
        const chatId = this.getCurrentChatId();
        this.messages.push({ type, content, timestamp: Date.now(), chatId });
        this.saveChatHistory();
    }

    // Format assistant messages (handle code blocks, etc.)
    formatAssistantMessage(content) {
        // Simple code block detection
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
            return `<pre class="code-block ${language || ''}"><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // Inline code
        content = content.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Line breaks
        content = content.replace(/\n/g, '<br>');
        
        return content;
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

    // Load chat history
    loadChatHistory() {
        // First load project context
        this.loadProjectContext();
        
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
            this.addMessage(msg.type, msg.content);
        });
    }

    // Save chat history
    saveChatHistory() {
        try {
            const chatId = this.getCurrentChatId();
            const allChats = JSON.parse(localStorage.getItem('allChatHistories') || '{}');
            allChats[chatId] = {
                messages: this.messages,
                title: document.getElementById('chatTitle')?.textContent || 'New Chat',
                lastUpdated: Date.now(),
                projectContext: this.currentProject
            };
            localStorage.setItem('allChatHistories', JSON.stringify(allChats));
            localStorage.setItem('chatHistory', JSON.stringify(this.messages));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
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
    }

    // Show welcome message
    showWelcomeMessage() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

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
                    <h2>🚀 Welcome to Roblox Luau AI!</h2>
                    <p>I'm here to help you with Roblox scripting, debugging, and game development. Try asking me:</p>
                    <ul>
                        <li>"Create a script that makes a part glow when touched"</li>
                        <li>"How do I use RemoteEvents?"</li>
                        <li>"Debug this error: attempt to index nil"</li>
                        <li>"Create a shop GUI with purchase functionality"</li>
                    </ul>
                    <p><strong>💡 Tip:</strong> <a href="/projects.html" style="color: #58a6ff;">Create a project</a> to get more focused, context-aware assistance!</p>
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