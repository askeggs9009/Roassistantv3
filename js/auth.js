// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    checkAuth() {
        console.log('[AuthManager] Checking authentication...');

        // Check for multiple possible token names
        this.authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
        const user = localStorage.getItem('user');

        console.log('[AuthManager] Token found:', !!this.authToken);
        console.log('[AuthManager] User data found:', !!user);

        if (this.authToken && user) {
            try {
                const userData = JSON.parse(user);
                console.log('[AuthManager] User authenticated:', userData.email);
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

    // Show logged in user
    showLoggedInUser(userData) {
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            const planText = userData.plan || 'free';
            const planDisplay = planText.charAt(0).toUpperCase() + planText.slice(1);

            userProfile.innerHTML = `
                <div class="user-avatar">${(userData.name || userData.email || 'U').charAt(0).toUpperCase()}</div>
                <div class="user-info">
                    <div class="user-name">${userData.name || userData.email || 'User'}</div>
                    <div class="user-plan">${planDisplay} Plan</div>
                </div>
                <button onclick="logout()" style="background: #f85149; border: none; border-radius: 6px; color: white; padding: 0.4rem 0.8rem; font-size: 0.8rem; cursor: pointer; margin-left: 0.5rem;">
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