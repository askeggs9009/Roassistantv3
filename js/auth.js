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

                // Only reload chat if user state changed and not on project page
                const wasLoggedIn = this.isLoggedIn;
                const isProjectPage = window.PROJECT_CHAT_MODE === true;
                if (!wasLoggedIn && !isProjectPage) {
                    console.log('[AuthManager] User state changed - clearing chat and loading user chats');
                    if (window.chatManager) {
                        window.chatManager.clearCurrentChat();
                        window.chatManager.loadChatHistory();
                    }
                } else if (isProjectPage) {
                    console.log('[AuthManager] PROJECT_CHAT_MODE detected - skipping chat clear');
                }

                // Re-read user data after refresh
                const refreshedUser = JSON.parse(localStorage.getItem('user'));
                this.showLoggedInUser(refreshedUser);
                this.isLoggedIn = true;
            } catch (error) {
                console.log('[AuthManager] Auth check failed, redirecting to welcome page:', error);

                // Check if we're not already on the welcome page to avoid redirect loop
                const currentPath = window.location.pathname;
                const isWelcomePage = currentPath.endsWith('welcome.html') || currentPath === '/welcome';
                const isLoginPage = currentPath.endsWith('login.html') || currentPath === '/login';
                const isPricingPage = currentPath.endsWith('pricing.html') || currentPath === '/pricing';
                const isAboutPage = currentPath.endsWith('about.html') || currentPath === '/about';

                // Don't redirect if we're on public pages
                if (!isWelcomePage && !isLoginPage && !isPricingPage && !isAboutPage) {
                    console.log('[AuthManager] Redirecting to welcome page...');
                    window.location.href = '/welcome.html';
                    return;
                }

                this.showGuestUser();
                this.isLoggedIn = false;

                // Clear chat and load guest chats
                if (window.chatManager) {
                    window.chatManager.clearCurrentChat();
                    window.chatManager.loadChatHistory();
                }
            }
        } else {
            console.log('[AuthManager] No auth data found, redirecting to welcome page');

            // Check if we're not already on the welcome page to avoid redirect loop
            const currentPath = window.location.pathname;
            const isWelcomePage = currentPath.endsWith('welcome.html') || currentPath === '/welcome';
            const isLoginPage = currentPath.endsWith('login.html') || currentPath === '/login';
            const isPricingPage = currentPath.endsWith('pricing.html') || currentPath === '/pricing';
            const isAboutPage = currentPath.endsWith('about.html') || currentPath === '/about';

            // Don't redirect if we're on public pages
            if (!isWelcomePage && !isLoginPage && !isPricingPage && !isAboutPage) {
                console.log('[AuthManager] Redirecting to welcome page...');
                window.location.href = '/welcome.html';
                return;
            }

            // Only reload chat if user state changed and not on project page
            const wasLoggedIn = this.isLoggedIn;
            const isProjectPage = window.PROJECT_CHAT_MODE === true;
            if (wasLoggedIn && !isProjectPage) {
                console.log('[AuthManager] User state changed - clearing chat and loading guest chats');
                if (window.chatManager) {
                    window.chatManager.clearCurrentChat();
                    window.chatManager.loadChatHistory();
                }
            } else if (isProjectPage) {
                console.log('[AuthManager] PROJECT_CHAT_MODE detected - skipping chat clear');
            }

            this.showGuestUser();
            this.isLoggedIn = false;
        }
    }

    // Refresh user data from server
    async refreshUserData() {
        try {
            const response = await fetch('https://www.roassistant.me/api/user/profile', {
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
                <div class="user-dropdown-trigger" onclick="authManager.toggleDropdown(event)" style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; width: 100%; padding: 0.5rem; border-radius: 8px; transition: background 0.2s;">
                    <div class="user-avatar-container">
                        ${avatarElement}
                        ${fallbackAvatar}
                    </div>
                    <div class="user-info" style="flex: 1;">
                        <div class="user-name">${userData.name || userData.email || 'User'}</div>
                        <div class="user-plan">
                            <span>${planDisplay} Plan</span>
                        </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="#8b949e" style="transition: transform 0.2s;">
                        <path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/>
                    </svg>
                </div>
                <div id="userDropdownMenu" class="user-dropdown-menu" style="display: none;">
                    <div class="dropdown-item" onclick="window.location.href='/account.html'">
                        <span>⚙️</span>
                        <span>Settings</span>
                    </div>
                    ${planText === 'free' ? `
                    <div class="dropdown-item" onclick="window.location.href='/pricing.html'">
                        <span>⚡</span>
                        <span>Upgrade Plan</span>
                    </div>
                    ` : ''}
                    <div class="dropdown-item" onclick="window.open('https://github.com/askeggs9009/Roassistantv3/issues', '_blank')">
                        <span>❓</span>
                        <span>Get Help</span>
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-item logout" onclick="authManager.logout()">
                        <span>🚪</span>
                        <span>Logout</span>
                    </div>
                </div>
            `;
            userProfile.style.display = 'block';
            userProfile.style.position = 'relative';

            // Add styles if not already present
            if (!document.getElementById('dropdownStyles')) {
                const style = document.createElement('style');
                style.id = 'dropdownStyles';
                style.innerHTML = `
                    .user-dropdown-trigger:hover {
                        background: rgba(255, 255, 255, 0.05) !important;
                    }

                    .user-dropdown-menu {
                        position: absolute;
                        bottom: 100%;
                        left: 0;
                        right: 0;
                        background: #1c2128;
                        border: 1px solid #30363d;
                        border-radius: 8px;
                        margin-bottom: 0.5rem;
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                        z-index: 1000;
                        overflow: hidden;
                        animation: dropdownSlideUp 0.2s ease;
                    }

                    @keyframes dropdownSlideUp {
                        from {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }

                    .dropdown-item {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        padding: 0.75rem 1rem;
                        color: #c9d1d9;
                        cursor: pointer;
                        transition: background 0.2s;
                        font-size: 0.9rem;
                    }

                    .dropdown-item:hover {
                        background: rgba(255, 255, 255, 0.1);
                    }

                    .dropdown-item.logout {
                        color: #f85149;
                    }

                    .dropdown-divider {
                        height: 1px;
                        background: #30363d;
                        margin: 0.25rem 0;
                    }

                    .dropdown-open svg {
                        transform: rotate(180deg);
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }

    // Toggle dropdown menu
    toggleDropdown(event) {
        event.stopPropagation();
        const menu = document.getElementById('userDropdownMenu');
        const trigger = document.querySelector('.user-dropdown-trigger');
        const svg = trigger.querySelector('svg');

        if (menu.style.display === 'none') {
            menu.style.display = 'block';
            svg.style.transform = 'rotate(180deg)';

            // Close dropdown when clicking outside
            document.addEventListener('click', this.closeDropdown);
        } else {
            this.closeDropdown();
        }
    }

    // Close dropdown
    closeDropdown() {
        const menu = document.getElementById('userDropdownMenu');
        const svg = document.querySelector('.user-dropdown-trigger svg');
        if (menu) {
            menu.style.display = 'none';
        }
        if (svg) {
            svg.style.transform = 'rotate(0deg)';
        }
        document.removeEventListener('click', authManager.closeDropdown);
    }

    // Show guest user
    showGuestUser() {
        const userProfile = document.getElementById('userProfile');
        if (userProfile) {
            userProfile.innerHTML = `
                <div class="user-dropdown-trigger" onclick="authManager.toggleDropdown(event)" style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; width: 100%; padding: 0.5rem; border-radius: 8px; transition: background 0.2s;">
                    <div class="user-avatar-container">
                        <div class="user-avatar-fallback" style="background: #30363d;">G</div>
                    </div>
                    <div class="user-info" style="flex: 1;">
                        <div class="user-name">Guest</div>
                        <div class="user-plan">
                            <span>Free Plan</span>
                        </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="#8b949e" style="transition: transform 0.2s;">
                        <path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"/>
                    </svg>
                </div>
                <div id="userDropdownMenu" class="user-dropdown-menu" style="display: none;">
                    <div class="dropdown-item" onclick="window.location.href='/login.html'">
                        <span>🔑</span>
                        <span>Sign In</span>
                    </div>
                    <div class="dropdown-item" onclick="window.location.href='/pricing.html'">
                        <span>⚡</span>
                        <span>View Plans</span>
                    </div>
                    <div class="dropdown-item" onclick="window.open('https://github.com/askeggs9009/Roassistantv3/issues', '_blank')">
                        <span>❓</span>
                        <span>Get Help</span>
                    </div>
                </div>
            `;
            userProfile.style.display = 'block';
            userProfile.style.position = 'relative';

            // Add styles if not already present
            if (!document.getElementById('dropdownStyles')) {
                const style = document.createElement('style');
                style.id = 'dropdownStyles';
                style.innerHTML = `
                    .user-dropdown-trigger:hover {
                        background: rgba(255, 255, 255, 0.05) !important;
                    }

                    .user-dropdown-menu {
                        position: absolute;
                        bottom: 100%;
                        left: 0;
                        right: 0;
                        background: #1c2128;
                        border: 1px solid #30363d;
                        border-radius: 8px;
                        margin-bottom: 0.5rem;
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                        z-index: 1000;
                        overflow: hidden;
                        animation: dropdownSlideUp 0.2s ease;
                    }

                    @keyframes dropdownSlideUp {
                        from {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }

                    .dropdown-item {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        padding: 0.75rem 1rem;
                        color: #c9d1d9;
                        cursor: pointer;
                        transition: background 0.2s;
                        font-size: 0.9rem;
                    }

                    .dropdown-item:hover {
                        background: rgba(255, 255, 255, 0.1);
                    }

                    .dropdown-item.logout {
                        color: #f85149;
                    }

                    .dropdown-divider {
                        height: 1px;
                        background: #30363d;
                        margin: 0.25rem 0;
                    }

                    .dropdown-open svg {
                        transform: rotate(180deg);
                    }
                `;
                document.head.appendChild(style);
            }
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

        console.log('[AuthManager] User logged out successfully, redirecting to welcome page...');

        // Redirect to welcome page
        window.location.href = '/welcome.html';
    }
}

// Create global instance
const authManager = new AuthManager();
window.authManager = authManager;