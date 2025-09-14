// Main Application Module
class App {
    constructor() {
        // Managers are already globally accessible from their respective files
    }

    // Initialize the app
    init() {
        // Wait a bit for DOM and all scripts to be fully ready
        setTimeout(() => {
            if (window.authManager) {
                window.authManager.checkAuth();
            }
            if (window.chatManager) {
                window.chatManager.loadChatHistory();
            }
            if (window.uiManager) {
                window.uiManager.setupEventListeners();
            }

            // Check for project parameter in URL
            this.checkProjectParameter();
        }, 100);
    }

    // Check for project parameter in URL
    checkProjectParameter() {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (projectId) {
            // Load project context if needed
            console.log('Loading project context:', projectId);
            // You can implement project-specific logic here
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const app = new App();
    app.init();
});