// Sync UI - User interface for data synchronization
class SyncUI {
    constructor() {
        this.initialized = false;
    }

    // Initialize sync UI
    init() {
        if (this.initialized) return;

        // Sync UI disabled - automatic sync runs in background
        this.initialized = true;
        console.log('[SyncUI] Initialized (UI disabled - automatic sync only)');
    }

    // Add sync indicator to sidebar - DISABLED
    addSyncIndicator() {
        // Sync indicator removed - system now syncs automatically in the background
        console.log('[SyncUI] Sync indicator disabled - automatic sync is active');
        return;
    }

    // Update sync indicator
    updateSyncIndicator() {
        if (!window.syncManager) return;

        const status = window.syncManager.getSyncStatus();
        const syncIcon = document.getElementById('syncIcon');
        const syncText = document.getElementById('syncText');

        if (!syncIcon || !syncText) return;

        if (!window.authManager || !window.authManager.isLoggedIn) {
            syncIcon.textContent = '⏸️';
            syncText.textContent = 'Sync paused';
            syncText.style.color = '#8b949e';
            return;
        }

        if (status.isSyncing) {
            syncIcon.textContent = '🔄';
            syncText.textContent = 'Syncing...';
            syncText.style.color = '#58a6ff';
        } else if (status.lastSyncTime) {
            syncIcon.textContent = '✅';
            const timeAgo = this.getTimeAgo(status.lastSyncTime);
            syncText.textContent = `Synced ${timeAgo}`;
            syncText.style.color = '#3fb950';
        } else {
            syncIcon.textContent = '⏸️';
            syncText.textContent = 'Not synced';
            syncText.style.color = '#8b949e';
        }
    }

    // Handle export button
    async handleExport() {
        if (!window.authManager || !window.authManager.isLoggedIn) {
            this.showNotification('Please log in to export your data', 'warning');
            return;
        }

        if (!window.syncManager) return;

        const btn = document.getElementById('exportDataBtn');
        const originalText = btn.textContent;
        btn.textContent = '⌛';
        btn.disabled = true;

        try {
            const success = await window.syncManager.exportData();
            if (success) {
                this.showNotification('Data exported successfully!', 'success');
            }
        } catch (error) {
            this.showNotification('Failed to export data', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // Show import dialog
    showImportDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const content = await file.text();
                const success = await window.syncManager.importData(content);
                if (success) {
                    this.showNotification('Data imported successfully!', 'success');
                }
            } catch (error) {
                this.showNotification('Failed to import data', 'error');
            }
        };
        input.click();
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            background: ${type === 'success' ? '#238636' : type === 'error' ? '#da3633' : '#1f6feb'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 0.9rem;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => notification.style.opacity = '1');

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Get time ago string
    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 10) return 'just now';
        if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }
}

// Create global instance
const syncUI = new SyncUI();
window.syncUI = syncUI;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Delay initialization to ensure sidebar is ready
        setTimeout(() => syncUI.init(), 100);
    });
} else {
    setTimeout(() => syncUI.init(), 100);
}
