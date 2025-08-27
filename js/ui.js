// UI Management Module
class UIManager {
    constructor() {
        this.selectedModel = 'gpt-4o-mini';
        this.currentView = 'chats';
    }

    // Setup event listeners
    setupEventListeners() {
        const messageInput = document.getElementById('messageInput');
        const modelSelector = document.getElementById('modelSelector');

        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.chatManager.sendMessage();
            }
        });

        modelSelector.addEventListener('change', function() {
            if (this.value !== 'gpt-4o-mini' && (!window.authManager || !window.authManager.isLoggedIn)) {
                this.value = uiManager.selectedModel;
                alert('Please sign in to access premium models');
                return;
            }
            uiManager.selectedModel = this.value;
        });
    }

    // Toggle sidebar (mobile)
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }

    // Close sidebar
    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }

    // Set active navigation item - WITH AUTH RESTRICTIONS
    setActiveNav(element, section) {
        // Check if user is trying to access restricted sections
        if ((section === 'scripts' || section === 'projects') && window.authManager && !window.authManager.isLoggedIn) {
            // Show sign-in prompt
            alert('Please sign in to access ' + (section === 'scripts' ? 'Scripts' : 'Projects') + '.');
            return;
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        element.classList.add('active');
        
        this.currentView = section;
        
        if (section === 'chats') {
            window.chatManager.loadChatHistory();
        } else if (section === 'scripts') {
            window.scriptsManager.loadScriptsView();
        } else if (section === 'projects') {
            // Redirect to projects.html
            window.location.href = '/projects.html';
        }
    }
}

// Global UI functions (for onclick handlers)
function toggleSidebar() {
    uiManager.toggleSidebar();
}

function closeSidebar() {
    uiManager.closeSidebar();
}

function setActiveNav(element, section) {
    uiManager.setActiveNav(element, section);
}

function startNewChat() {
    window.chatManager.startNewChat();
}

function sendMessage() {
    window.chatManager.sendMessage();
}

// Create global UI manager instance
const uiManager = new UIManager();