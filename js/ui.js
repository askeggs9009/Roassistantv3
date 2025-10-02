// UI Management Module
class UIManager {
    constructor() {
        this.selectedModel = 'claude-4-sonnet';
        this.currentView = 'chats';
    }

    // Setup event listeners
    setupEventListeners() {
        const messageInput = document.getElementById('messageInput');
        const modelSelector = document.getElementById('modelSelector');

        if (messageInput) {
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
        }

        if (modelSelector) {
            modelSelector.addEventListener('change', function() {
                uiManager.selectedModel = this.value;
            });
        }
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
        
        // Only restrict projects, not scripts - scripts should be accessible to all users
        if (section === 'projects' && window.authManager && !window.authManager.isLoggedIn) {
            // Show sign-in prompt
            alert('Please sign in to access Projects.');
            return;
        }
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        element.classList.add('active');
        
        this.currentView = section;
        
        // Open sidebar for scripts and chats
        if (section === 'chats' || section === 'scripts') {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar && !sidebar.classList.contains('open')) {
                sidebar.classList.add('open');
                if (overlay) overlay.classList.add('open');
            }
        }
        
        if (section === 'chats') {
            window.chatManager.loadChatHistory();
        } else if (section === 'scripts') {
            // Redirect to scripts.html
            window.location.href = 'scripts.html';
        } else if (section === 'projects') {
            // Redirect to projects.html
            window.location.href = 'projects.html';
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

// Additional UI functions
function useQuickAction(prompt) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.value = prompt;
        messageInput.focus();
        // Auto-send the message
        setTimeout(() => {
            window.chatManager.sendMessage();
        }, 100);
    }
}

function openFileDialog() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.click();
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    const fileAttachments = document.getElementById('fileAttachments');
    
    if (!fileAttachments) return;
    
    // Clear existing attachments
    fileAttachments.innerHTML = '';
    window.chatManager.attachedFiles = [];
    
    files.forEach((file, index) => {
        // Add to attached files
        window.chatManager.attachedFiles.push(file);
        
        // Create file preview
        const filePreview = document.createElement('div');
        filePreview.className = 'file-attachment';
        filePreview.innerHTML = `
            <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="remove-file" onclick="removeFile(${index})">×</button>
        `;
        
        fileAttachments.appendChild(filePreview);
    });
    
    // Show attachments area
    if (files.length > 0) {
        fileAttachments.style.display = 'block';
    }
}

function removeFile(index) {
    window.chatManager.attachedFiles.splice(index, 1);
    
    // Refresh file attachments display
    const fileAttachments = document.getElementById('fileAttachments');
    if (window.chatManager.attachedFiles.length === 0) {
        fileAttachments.style.display = 'none';
        fileAttachments.innerHTML = '';
    } else {
        // Re-render attachments with updated indices
        // This is a simplified approach - in production you might want to use file IDs
        const event = { target: { files: window.chatManager.attachedFiles } };
        handleFileSelect(event);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function logout() {
    if (window.authManager) {
        window.authManager.logout();
    }
}

function closeUpgradePrompt() {
    const upgradePrompt = document.getElementById('upgradePrompt');
    if (upgradePrompt) {
        upgradePrompt.style.display = 'none';
    }
}

// Create global UI manager instance
const uiManager = new UIManager();
window.uiManager = uiManager;