// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    checkAuth() {
        // Check for multiple possible token names
        this.authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (this.authToken && user) {
            try {
                const userData = JSON.parse(user);
                this.showLoggedInUser(userData);
                this.isLoggedIn = true;
                console.log('User authenticated:', userData.email);
            } catch (error) {
                console.log('Auth check failed, showing guest user');
                this.showGuestUser();
                this.isLoggedIn = false;
            }
        } else {
            this.showGuestUser();
            this.isLoggedIn = false;
        }
    }

    // Show logged in user
    showLoggedInUser(userData) {
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            userProfile.innerHTML = `
                <span class="user-name">${userData.name || userData.email}</span>
                <span class="user-plan">${userData.plan || 'Free'}</span>
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
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    }
}

// Create global instance
const authManager = new AuthManager();