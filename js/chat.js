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
        
        // Store message
        this.messages.push({ type, content, timestamp: Date.now() });
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
            localStorage.setItem('chatHistory', JSON.stringify(this.messages));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    }

    // Start new chat
    startNewChat() {
        this.messages = [];
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        this.clearAttachedFiles();
        localStorage.removeItem('chatHistory');
        
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
            welcomeDiv.innerHTML = `
                <div class="welcome-content">
                    <h2>${this.currentProject.icon} Welcome to ${this.currentProject.name}!</h2>
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
            'obby': 'checkpoints, stage progression, and leaderboards',
            'simulator': 'click mechanics, upgrade systems, and pet collection',
            'tycoon': 'droppers, conveyors, and building systems',
            'fps': 'weapon systems, team mechanics, and combat',
            'rpg': 'quest systems, inventory management, and character progression',
            'racing': 'vehicle controls, lap timing, and multiplayer racing'
        };
        return features[this.currentProject?.type] || 'game mechanics';
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
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span>${this.currentProject.icon}</span>
                    <span>${this.currentProject.name}</span>
                    <span style="font-size: 0.8rem; color: #8b949e; font-weight: normal;">
                        (${this.currentProject.type})
                    </span>
                </div>
            `;
        }
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