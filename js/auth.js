// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    checkAuth() {
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
                this.showLoggedInUser(userData);
                this.isLoggedIn = true;
            } catch (error) {
                console.log('[AuthManager] Auth check failed, showing guest user:', error);
                this.showGuestUser();
                this.isLoggedIn = false;
            }
        } else {
            console.log('[AuthManager] No auth data found, showing guest user');
            this.showGuestUser();
            this.isLoggedIn = false;
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

                    // Reload chat history for the new user
                    if (window.chatManager) {
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

            userProfile.innerHTML = `
                <div class="user-avatar">${(userData.name || userData.email || 'U').charAt(0).toUpperCase()}</div>
                <div class="user-info">
                    <div class="user-name">${userData.name || userData.email || 'User'}</div>
                    <div class="user-plan">${planDisplay} Plan</div>
                </div>
                <button onclick="authManager.logout()" style="background: #f85149; border: none; border-radius: 6px; color: white; padding: 0.4rem 0.8rem; font-size: 0.8rem; cursor: pointer; margin-left: 0.5rem;">
                    Logout
                </button>
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

        // Optionally refresh the page to reset all states
        // window.location.reload();

        console.log('[AuthManager] User logged out successfully');
    }
}

// Create global instance
const authManager = new AuthManager();
window.authManager = authManager;