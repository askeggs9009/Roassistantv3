// Enhanced Authentication and Session Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.currentSession = null;
        this.token = localStorage.getItem('authToken');
        this.sessionId = localStorage.getItem('sessionId');
        this.isInitialized = false;
        
        // Event listeners for account changes
        this.accountChangeListeners = [];
        
        // Initialize on page load
        this.initialize();
    }

    // Initialize authentication state
    async initialize() {
        console.log('[AUTH] Initializing authentication...');
        
        if (this.token) {
            try {
                await this.validateSession();
            } catch (error) {
                console.error('[AUTH] Session validation failed:', error);
                this.clearSession();
            }
        }
        
        this.isInitialized = true;
        this.notifyAccountChange();
    }

    // Validate current session
    async validateSession() {
        if (!this.token) {
            throw new Error('No token available');
        }

        const response = await fetch('/api/user', {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Session validation failed');
        }

        const userData = await response.json();
        this.currentUser = userData;
        console.log('[AUTH] Session validated for user:', userData.email);
        
        return userData;
    }

    // Login with email and password
    async login(email, password) {
        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store session data
            this.token = data.token;
            this.sessionId = data.sessionId;
            this.currentUser = data.user;

            localStorage.setItem('authToken', this.token);
            localStorage.setItem('sessionId', this.sessionId);

            console.log('[AUTH] Login successful for user:', this.currentUser.email);
            this.notifyAccountChange();

            return {
                success: true,
                user: this.currentUser,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Login error:', error);
            throw error;
        }
    }

    // Signup with email verification
    async signup(email, password, name) {
        try {
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, name })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Signup failed');
            }

            // Store pending verification email
            localStorage.setItem('pendingVerificationEmail', email);

            return {
                success: true,
                requiresVerification: data.requiresVerification,
                email: data.email,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Signup error:', error);
            throw error;
        }
    }

    // Verify email with code
    async verifyEmail(email, verificationCode) {
        try {
            const response = await fetch('/auth/verify-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, verificationCode })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            // Store session data after successful verification
            this.token = data.token;
            this.sessionId = data.sessionId;
            this.currentUser = data.user;

            localStorage.setItem('authToken', this.token);
            localStorage.setItem('sessionId', this.sessionId);
            localStorage.removeItem('pendingVerificationEmail');

            console.log('[AUTH] Email verification successful for user:', this.currentUser.email);
            this.notifyAccountChange();

            return {
                success: true,
                user: this.currentUser,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Email verification error:', error);
            throw error;
        }
    }

    // Resend verification code
    async resendVerificationCode(email) {
        try {
            const response = await fetch('/auth/resend-verification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to resend verification code');
            }

            return {
                success: true,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Resend verification error:', error);
            throw error;
        }
    }

    // Logout and clear session
    async logout(clearAllSessions = false) {
        try {
            if (this.token) {
                const response = await fetch('/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        sessionId: clearAllSessions ? null : this.sessionId 
                    })
                });

                if (response.ok) {
                    console.log('[AUTH] Server logout successful');
                }
            }
        } catch (error) {
            console.error('[AUTH] Logout request failed:', error);
        } finally {
            this.clearSession();
            this.clearUserData();
            this.notifyAccountChange();
        }
    }

    // Switch to different account
    async switchAccount(newToken) {
        try {
            const response = await fetch('/api/switch-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: newToken })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Account switch failed');
            }

            // Clear previous account data if instructed
            if (data.clearPreviousData) {
                this.clearUserData();
            }

            // Set new session data
            this.token = newToken;
            this.sessionId = data.sessionId;
            this.currentUser = data.user;

            localStorage.setItem('authToken', this.token);
            localStorage.setItem('sessionId', this.sessionId);

            console.log('[AUTH] Account switched to:', this.currentUser.email);
            this.notifyAccountChange();

            return {
                success: true,
                user: this.currentUser,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Account switch error:', error);
            throw error;
        }
    }

    // Upgrade subscription
    async upgradeSubscription(plan, paymentMethod = 'card') {
        try {
            if (!this.token) {
                throw new Error('Authentication required');
            }

            const response = await fetch('/api/upgrade-subscription', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ plan, paymentMethod })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upgrade failed');
            }

            // Update current user subscription data
            if (this.currentUser) {
                this.currentUser.subscription = data.subscription;
            }

            console.log('[AUTH] Subscription upgraded to:', plan);
            this.notifyAccountChange(); // Refresh UI with new subscription

            return {
                success: true,
                subscription: data.subscription,
                message: data.message
            };

        } catch (error) {
            console.error('[AUTH] Subscription upgrade error:', error);
            throw error;
        }
    }

    // Get user chats
    async getUserChats() {
        try {
            if (!this.token) {
                throw new Error('Authentication required');
            }

            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get chats');
            }

            return data.chats;

        } catch (error) {
            console.error('[AUTH] Get chats error:', error);
            throw error;
        }
    }

    // Create new chat
    async createChat(title = 'New Chat') {
        try {
            if (!this.token) {
                throw new Error('Authentication required');
            }

            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create chat');
            }

            return data.chat;

        } catch (error) {
            console.error('[AUTH] Create chat error:', error);
            throw error;
        }
    }

    // Send message
    async sendMessage(message, model = 'gpt-4o-mini', chatId = null) {
        try {
            if (!this.token) {
                throw new Error('Authentication required');
            }

            const response = await fetch('/api/message', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message, model, chatId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send message');
            }

            return data;

        } catch (error) {
            console.error('[AUTH] Send message error:', error);
            throw error;
        }
    }

    // Clear session data
    clearSession() {
        this.currentUser = null;
        this.currentSession = null;
        this.token = null;
        this.sessionId = null;
        
        localStorage.removeItem('authToken');
        localStorage.removeItem('sessionId');
    }

    // Clear user-specific data (chats, settings, etc.)
    clearUserData() {
        // Clear chat history
        localStorage.removeItem('chatHistory');
        localStorage.removeItem('currentChatId');
        localStorage.removeItem('chatMessages');
        
        // Clear any cached user data
        localStorage.removeItem('userPreferences');
        localStorage.removeItem('lastModel');
        
        // Clear subscription cache
        localStorage.removeItem('subscriptionStatus');
        
        console.log('[AUTH] User data cleared');
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!(this.token && this.currentUser);
    }

    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }

    // Add account change listener
    addAccountChangeListener(callback) {
        this.accountChangeListeners.push(callback);
    }

    // Remove account change listener
    removeAccountChangeListener(callback) {
        const index = this.accountChangeListeners.indexOf(callback);
        if (index > -1) {
            this.accountChangeListeners.splice(index, 1);
        }
    }

    // Notify all listeners of account changes
    notifyAccountChange() {
        this.accountChangeListeners.forEach(callback => {
            try {
                callback(this.currentUser);
            } catch (error) {
                console.error('[AUTH] Account change listener error:', error);
            }
        });
    }
}

// UI Management Class
class UIManager {
    constructor(authManager) {
        this.auth = authManager;
        this.currentChatId = null;
        this.messages = [];
        
        // Listen for account changes
        this.auth.addAccountChangeListener((user) => {
            this.onAccountChange(user);
        });
        
        this.initializeUI();
    }

    // Initialize UI components
    initializeUI() {
        this.updateUserProfile();
        this.updateSubscriptionStatus();
        this.loadChatHistory();
        this.setupEventListeners();
    }

    // Handle account changes
    async onAccountChange(user) {
        console.log('[UI] Account changed:', user?.email || 'logged out');
        
        if (user) {
            // User logged in or switched
            await this.updateUserProfile();
            await this.updateSubscriptionStatus();
            await this.loadChatHistory();
            this.showAuthenticatedUI();
        } else {
            // User logged out
            this.clearChatUI();
            this.showUnauthenticatedUI();
        }
    }

    // Update user profile display
    async updateUserProfile() {
        const user = this.auth.getCurrentUser();
        const userProfileElement = document.getElementById('userProfile');
        
        if (userProfileElement && user) {
            userProfileElement.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
                    <div class="user-details">
                        <div class="user-name">${user.name}</div>
                        <div class="user-email">${user.email}</div>
                        <div class="subscription-badge ${user.subscription?.plan || 'free'}">${(user.subscription?.plan || 'free').toUpperCase()}</div>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="btn-secondary" onclick="uiManager.showAccountSettings()">Settings</button>
                    <button class="btn-secondary" onclick="uiManager.logout()">Logout</button>
                </div>
            `;
        }
    }

    // Update subscription status display
    async updateSubscriptionStatus() {
        const user = this.auth.getCurrentUser();
        const subscriptionElement = document.getElementById('subscriptionStatus');
        const planBadgeElement = document.getElementById('planBadge');
        const usageTextElement = document.getElementById('usageText');
        const usageFillElement = document.getElementById('usageFill');

        if (user && user.subscription) {
            const subscription = user.subscription;
            const usage = subscription.usage || { daily_messages: 0, daily_limit: 10 };
            
            if (planBadgeElement) {
                planBadgeElement.textContent = subscription.plan.toUpperCase();
                planBadgeElement.className = `plan-badge ${subscription.plan}`;
            }

            if (usageTextElement && usageFillElement) {
                const usagePercent = usage.daily_limit === -1 ? 0 : 
                    Math.min((usage.daily_messages / usage.daily_limit) * 100, 100);

                usageTextElement.textContent = usage.daily_limit === -1 ? 
                    `${usage.daily_messages}/∞` : 
                    `${usage.daily_messages}/${usage.daily_limit}`;
                    
                usageFillElement.style.width = `${usagePercent}%`;
                
                // Show usage warnings
                this.updateUsageWarnings(usage);
            }

            if (subscriptionElement) {
                subscriptionElement.style.display = 'flex';
            }
        }
    }

    // Update usage warning displays
    updateUsageWarnings(usage) {
        const warningElement = document.getElementById('usageWarning');
        const limitReachedElement = document.getElementById('usageLimitReached');

        if (usage.daily_limit === -1) {
            // Unlimited plan
            if (warningElement) warningElement.style.display = 'none';
            if (limitReachedElement) limitReachedElement.style.display = 'none';
            return;
        }

        const usagePercent = (usage.daily_messages / usage.daily_limit) * 100;

        if (usagePercent >= 100) {
            // Limit reached
            if (warningElement) warningElement.style.display = 'none';
            if (limitReachedElement) limitReachedElement.style.display = 'block';
        } else if (usagePercent >= 80) {
            // Warning threshold
            if (warningElement) warningElement.style.display = 'block';
            if (limitReachedElement) limitReachedElement.style.display = 'none';
        } else {
            // Normal usage
            if (warningElement) warningElement.style.display = 'none';
            if (limitReachedElement) limitReachedElement.style.display = 'none';
        }
    }

    // Load and display chat history
    async loadChatHistory() {
        try {
            if (!this.auth.isAuthenticated()) {
                return;
            }

            const chats = await this.auth.getUserChats();
            const chatHistoryElement = document.getElementById('chatHistory');

            if (chatHistoryElement) {
                if (chats.length === 0) {
                    chatHistoryElement.innerHTML = '<div class="no-chats">No chats yet</div>';
                } else {
                    chatHistoryElement.innerHTML = chats.map(chat => `
                        <div class="chat-item ${chat.id === this.currentChatId ? 'active' : ''}" 
                             onclick="uiManager.selectChat('${chat.id}')">
                            <div class="chat-title">${chat.title}</div>
                            <div class="chat-meta">
                                ${chat.messageCount} messages • ${this.formatDate(chat.updatedAt)}
                            </div>
                        </div>
                    `).join('');
                }
            }

        } catch (error) {
            console.error('[UI] Error loading chat history:', error);
        }
    }

    // Clear chat UI
    clearChatUI() {
        this.currentChatId = null;
        this.messages = [];
        
        const chatHistoryElement = document.getElementById('chatHistory');
        const messagesElement = document.getElementById('messages');
        const userProfileElement = document.getElementById('userProfile');

        if (chatHistoryElement) {
            chatHistoryElement.innerHTML = '<div class="no-chats">Please log in to view chats</div>';
        }

        if (messagesElement) {
            messagesElement.innerHTML = '';
        }

        if (userProfileElement) {
            userProfileElement.innerHTML = '<div class="login-prompt">Please log in</div>';
        }
    }

    // Show authenticated UI
    showAuthenticatedUI() {
        // Show authenticated elements
        const authenticatedElements = document.querySelectorAll('.authenticated-only');
        authenticatedElements.forEach(element => {
            element.style.display = '';
        });

        // Hide unauthenticated elements
        const unauthenticatedElements = document.querySelectorAll('.unauthenticated-only');
        unauthenticatedElements.forEach(element => {
            element.style.display = 'none';
        });
    }

    // Show unauthenticated UI
    showUnauthenticatedUI() {
        // Hide authenticated elements
        const authenticatedElements = document.querySelectorAll('.authenticated-only');
        authenticatedElements.forEach(element => {
            element.style.display = 'none';
        });

        // Show unauthenticated elements
        const unauthenticatedElements = document.querySelectorAll('.unauthenticated-only');
        unauthenticatedElements.forEach(element => {
            element.style.display = '';
        });
    }

    // Setup event listeners
    setupEventListeners() {
        // Handle upgrade plan clicks
        const upgradeButtons = document.querySelectorAll('[data-action="upgrade"]');
        upgradeButtons.forEach(button => {
            button.addEventListener('click', () => {
                window.location.href = '/pricing.html';
            });
        });

        // Handle new chat button
        const newChatButton = document.getElementById('newChatBtn');
        if (newChatButton) {
            newChatButton.addEventListener('click', () => {
                this.createNewChat();
            });
        }
    }

    // Create new chat
    async createNewChat() {
        try {
            if (!this.auth.isAuthenticated()) {
                alert('Please log in to create a new chat');
                return;
            }

            const chat = await this.auth.createChat();
            this.currentChatId = chat.id;
            await this.loadChatHistory();
            this.selectChat(chat.id);

        } catch (error) {
            console.error('[UI] Error creating new chat:', error);
            alert('Failed to create new chat: ' + error.message);
        }
    }

    // Select a chat
    selectChat(chatId) {
        this.currentChatId = chatId;
        
        // Update active chat in UI
        const chatItems = document.querySelectorAll('.chat-item');
        chatItems.forEach(item => {
            item.classList.remove('active');
        });

        const selectedChat = document.querySelector(`.chat-item[onclick*="${chatId}"]`);
        if (selectedChat) {
            selectedChat.classList.add('active');
        }

        // Load chat messages (implement as needed)
        this.loadChatMessages(chatId);
    }

    // Load chat messages
    async loadChatMessages(chatId) {
        // Implement chat message loading
        console.log('[UI] Loading messages for chat:', chatId);
    }

    // Logout
    async logout() {
        try {
            await this.auth.logout();
            window.location.href = '/login.html';
        } catch (error) {
            console.error('[UI] Logout error:', error);
        }
    }

    // Show account settings
    showAccountSettings() {
        // Implement account settings modal
        console.log('[UI] Show account settings');
    }

    // Format date for display
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = Math.abs(now - date) / 36e5;

        if (diffInHours < 24) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInHours < 168) { // 7 days
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }
}

// Initialize global instances
const authManager = new AuthManager();
const uiManager = new UIManager(authManager);

// Export for global access
window.authManager = authManager;
window.uiManager = uiManager;