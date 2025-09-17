// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    async checkAuth() {
        console.log('[AuthManager] Checking authentication...');

        // Handle OAuth callback first
        this.handleOAuthCallback();

        // Check for multiple possible token names
        this.authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
        const user = localStorage.getItem('user');

        console.log('[AuthManager] Token found:', !!this.authToken);
        console.log('[AuthManager] User data found:', !!user);

        if (this.authToken && user) {
            try {
                const userData = JSON.parse(user);
                console.log('[AuthManager] User authenticated:', userData.email);
                console.log('[AuthManager] Full user data:', userData);

                // Fetch latest user data including subscription status
                await this.refreshUserData();

                // Only reload chat if user state changed
                const wasLoggedIn = this.isLoggedIn;
                if (!wasLoggedIn) {
                    console.log('[AuthManager] User state changed - clearing chat and loading user chats');
                    if (window.chatManager) {
                        window.chatManager.clearCurrentChat();
                        window.chatManager.loadChatHistory();
                    }
                }

                // Re-read user data after refresh
                const refreshedUser = JSON.parse(localStorage.getItem('user'));
                this.showLoggedInUser(refreshedUser);
                this.isLoggedIn = true;
            } catch (error) {
                console.log('[AuthManager] Auth check failed, showing guest user:', error);
                this.showGuestUser();
                this.isLoggedIn = false;

                // Clear chat and load guest chats
                if (window.chatManager) {
                    window.chatManager.clearCurrentChat();
                    window.chatManager.loadChatHistory();
                }
            }
        } else {
            console.log('[AuthManager] No auth data found, showing guest user');

            // Only reload chat if user state changed
            const wasLoggedIn = this.isLoggedIn;
            if (wasLoggedIn) {
                console.log('[AuthManager] User state changed - clearing chat and loading guest chats');
                if (window.chatManager) {
                    window.chatManager.clearCurrentChat();
                    window.chatManager.loadChatHistory();
                }
            }

            this.showGuestUser();
            this.isLoggedIn = false;
        }
    }

    // Refresh user data from server
    async refreshUserData() {
        try {
            const response = await fetch('https://roassistantv3-production.up.railway.app/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log('[AuthManager] Refreshed user data from server:', data);

                // Update stored user data with latest from server
                const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
                const updatedUser = {
                    ...currentUser,
                    ...data,
                    subscription: data.subscription || currentUser.subscription
                };

                localStorage.setItem('user', JSON.stringify(updatedUser));
                console.log('[AuthManager] Updated stored user data with subscription:', updatedUser.subscription);
            }
        } catch (error) {
            console.log('[AuthManager] Could not refresh user data:', error);
        }
    }

    // Handle OAuth callback from hash parameters
    handleOAuthCallback() {
        if (window.location.hash && window.location.hash.length > 1) {
            console.log('[AuthManager] Processing OAuth callback from hash...');

            try {
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const token = hashParams.get('token');
                const userStr = hashParams.get('user');

                if (token && userStr) {
                    console.log('[AuthManager] OAuth data found in hash');

                    // Decode and parse user data
                    const userData = JSON.parse(decodeURIComponent(userStr));

                    // Store authentication data
                    localStorage.setItem('authToken', token);
                    localStorage.setItem('token', token);
                    localStorage.setItem('user', JSON.stringify(userData));

                    console.log('[AuthManager] OAuth data stored:', userData.email);

                    // Clear hash to clean URL
                    window.location.hash = '';

                    // Clear current chat and reload history for the new user
                    if (window.chatManager) {
                        window.chatManager.clearCurrentChat();
                        window.chatManager.loadChatHistory();
                    }
                }
            } catch (error) {
                console.error('[AuthManager] Error processing OAuth callback:', error);
            }
        }
    }

    // Show logged in user
    showLoggedInUser(userData) {
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            // Fix: Access subscription.plan correctly
            const planText = (userData.subscription && userData.subscription.plan) || userData.plan || 'free';
            const planDisplay = planText.charAt(0).toUpperCase() + planText.slice(1);

            // Create avatar element based on whether user has profile picture
            const avatarElement = userData.picture
                ? `<img class="user-avatar-img" src="${userData.picture}" alt="Profile" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
                : '';

            const fallbackAvatar = `<div class="user-avatar-fallback" ${userData.picture ? 'style="display:none;"' : ''}>${(userData.name || userData.email || 'U').charAt(0).toUpperCase()}</div>`;

            userProfile.innerHTML = `
                <div class="user-avatar-container">
                    ${avatarElement}
                    ${fallbackAvatar}
                </div>
                <div class="user-info">
                    <div class="user-name">${userData.name || userData.email || 'User'}</div>
                    <div class="user-plan">
                        <span>${planDisplay} Plan</span>
                        <a href="/account.html" style="color: #58a6ff; text-decoration: none; font-size: 0.8rem; margin-left: 0.5rem;" title="Account Settings">⚙️</a>
                    </div>
                </div>
                <div style="display: flex; gap: 0.25rem;">
                    <button onclick="window.location.href='/account.html'" style="background: none; border: none; color: #8b949e; cursor: pointer; padding: 0.25rem;" title="Account Settings">
                        ⚙️
                    </button>
                    <button onclick="authManager.logout()" style="background: #f85149; border: none; border-radius: 6px; color: white; padding: 0.4rem 0.8rem; font-size: 0.8rem; cursor: pointer;">
                        Logout
                    </button>
                </div>
            `;
            userProfile.style.display = 'flex';
        }
    }

    // Show guest user
    showGuestUser() {
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            userProfile.innerHTML = `
                <span class="user-name">Guest</span>
                <button onclick="window.location.href='/login.html'" style="background: #58a6ff; border: none; border-radius: 6px; color: white; padding: 0.4rem 0.8rem; font-size: 0.8rem; cursor: pointer; margin-left: 0.5rem;">
                    Sign In
                </button>
            `;
            userProfile.style.display = 'flex';
        }
    }

    // Logout
    async logout() {
        console.log('[AuthManager] Logging out user...');

        // Clear auth data
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Update state
        this.isLoggedIn = false;
        this.authToken = null;

        // Show guest user interface
        this.showGuestUser();

        // Clear current chat and reload guest chats
        if (window.chatManager) {
            window.chatManager.clearCurrentChat();
            window.chatManager.loadChatHistory();
        }

        console.log('[AuthManager] User logged out successfully');
    }
}

// Create global instance
const authManager = new AuthManager();
window.authManager = authManager;