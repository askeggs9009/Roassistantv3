// Main Application Module
class App {
    constructor() {
        // Make managers globally accessible
        window.authManager = authManager;
        window.chatManager = chatManager;
        window.scriptsManager = scriptsManager;
        window.uiManager = uiManager;
    }

    // Initialize the app
    init() {
        // Wait a bit for DOM to be fully ready
        setTimeout(() => {
            window.authManager.checkAuth();
            window.chatManager.loadChatHistory();
            window.uiManager.setupEventListeners();
            
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