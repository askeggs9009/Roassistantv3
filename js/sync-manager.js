// Sync Manager - Handles data synchronization between localStorage and MongoDB
class SyncManager {
    constructor() {
        this.API_BASE_URL = 'https://www.roassistant.me';
        this.syncInterval = 30000; // 30 seconds
        this.syncTimer = null;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.pendingChanges = {
            chats: false,
            scripts: false,
            projects: false
        };
    }

    // Initialize sync manager
    init() {
        console.log('[SyncManager] Initializing...');

        // Load data from server on init
        this.loadFromServer();

        // Start auto-sync if user is logged in
        if (window.authManager && window.authManager.isLoggedIn) {
            this.startAutoSync();
        }

        // Listen for auth changes
        window.addEventListener('user-logged-in', () => {
            console.log('[SyncManager] User logged in, starting sync');
            this.loadFromServer();
            this.startAutoSync();
        });

        window.addEventListener('user-logged-out', () => {
            console.log('[SyncManager] User logged out, stopping sync');
            this.stopAutoSync();
        });
    }

    // Mark data as changed (needs sync)
    markChanged(dataType) {
        if (this.pendingChanges[dataType] !== undefined) {
            this.pendingChanges[dataType] = true;
            console.log(`[SyncManager] Marked ${dataType} for sync`);
        }
    }

    // Start automatic synchronization
    startAutoSync() {
        if (this.syncTimer) {
            return; // Already running
        }

        console.log('[SyncManager] Starting auto-sync every', this.syncInterval / 1000, 'seconds');

        // Initial sync
        this.syncToServer();

        // Set up interval
        this.syncTimer = setInterval(() => {
            this.syncToServer();
        }, this.syncInterval);
    }

    // Stop automatic synchronization
    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
            console.log('[SyncManager] Auto-sync stopped');
        }
    }

    // Get auth token
    getAuthToken() {
        return localStorage.getItem('authToken') || localStorage.getItem('token');
    }

    // Check if user is logged in
    isLoggedIn() {
        return !!this.getAuthToken();
    }

    // Sync data to server
    async syncToServer() {
        if (this.isSyncing) {
            console.log('[SyncManager] Sync already in progress, skipping...');
            return;
        }

        if (!this.isLoggedIn()) {
            console.log('[SyncManager] User not logged in, skipping sync');
            return;
        }

        // Check if there are any pending changes
        const hasPendingChanges = Object.values(this.pendingChanges).some(changed => changed);
        if (!hasPendingChanges) {
            console.log('[SyncManager] No pending changes, skipping sync');
            return;
        }

        this.isSyncing = true;
        console.log('[SyncManager] Starting sync to server...');

        try {
            const token = this.getAuthToken();
            const syncPromises = [];

            // Sync chats if changed
            if (this.pendingChanges.chats) {
                const chats = window.storageUtils.getUserData('allChatHistories', {});
                syncPromises.push(
                    fetch(`${this.API_BASE_URL}/api/user/sync-chats`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ chats })
                    }).then(res => {
                        if (res.ok) {
                            this.pendingChanges.chats = false;
                            console.log('[SyncManager] ✅ Chats synced');
                        }
                        return res.json();
                    })
                );
            }

            // Sync scripts if changed
            if (this.pendingChanges.scripts) {
                const scripts = window.storageUtils.getUserData('roblox_ai_scripts', []);
                syncPromises.push(
                    fetch(`${this.API_BASE_URL}/api/user/sync-scripts`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ scripts })
                    }).then(res => {
                        if (res.ok) {
                            this.pendingChanges.scripts = false;
                            console.log('[SyncManager] ✅ Scripts synced');
                        }
                        return res.json();
                    })
                );
            }

            // Sync projects if changed
            if (this.pendingChanges.projects) {
                const projects = window.storageUtils.getUserData('roblox_projects', []);
                syncPromises.push(
                    fetch(`${this.API_BASE_URL}/api/user/sync-projects`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ projects })
                    }).then(res => {
                        if (res.ok) {
                            this.pendingChanges.projects = false;
                            console.log('[SyncManager] ✅ Projects synced');
                        }
                        return res.json();
                    })
                );
            }

            await Promise.all(syncPromises);
            this.lastSyncTime = new Date();
            console.log('[SyncManager] Sync completed at', this.lastSyncTime.toLocaleTimeString());

        } catch (error) {
            console.error('[SyncManager] Sync failed:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    // Load data from server
    async loadFromServer() {
        if (!this.isLoggedIn()) {
            console.log('[SyncManager] User not logged in, skipping load');
            return;
        }

        console.log('[SyncManager] Loading data from server...');

        try {
            const token = this.getAuthToken();
            const response = await fetch(`${this.API_BASE_URL}/api/user/data`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load data from server');
            }

            const result = await response.json();
            const { chats, scripts, projects } = result.data;

            // Merge server data with local data (server data takes precedence)
            if (chats && Object.keys(chats).length > 0) {
                const localChats = window.storageUtils.getUserData('allChatHistories', {});
                const mergedChats = { ...localChats, ...chats };
                window.storageUtils.setUserData('allChatHistories', mergedChats);
                console.log('[SyncManager] ✅ Loaded', Object.keys(chats).length, 'chats from server');
            }

            if (scripts && scripts.length > 0) {
                const localScripts = window.storageUtils.getUserData('roblox_ai_scripts', []);
                // Merge scripts by ID, preferring server version
                const scriptMap = new Map();
                localScripts.forEach(s => scriptMap.set(s.id, s));
                scripts.forEach(s => scriptMap.set(s.id, s));
                const mergedScripts = Array.from(scriptMap.values());
                window.storageUtils.setUserData('roblox_ai_scripts', mergedScripts);
                console.log('[SyncManager] ✅ Loaded', scripts.length, 'scripts from server');
            }

            if (projects && projects.length > 0) {
                window.storageUtils.setUserData('roblox_projects', projects);
                console.log('[SyncManager] ✅ Loaded', projects.length, 'projects from server');
            }

            // Reset pending changes since we just loaded from server
            this.pendingChanges = { chats: false, scripts: false, projects: false };

        } catch (error) {
            console.error('[SyncManager] Failed to load data from server:', error);
        }
    }

    // Force immediate sync
    async forceSyncNow() {
        console.log('[SyncManager] Force syncing now...');
        // Mark all as changed
        this.pendingChanges = { chats: true, scripts: true, projects: true };
        await this.syncToServer();
    }

    // Export all data
    async exportData() {
        if (!this.isLoggedIn()) {
            alert('Please log in to export your data');
            return;
        }

        try {
            const token = this.getAuthToken();
            const response = await fetch(`${this.API_BASE_URL}/api/user/export`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to export data');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `roassistant-backup-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            console.log('[SyncManager] ✅ Data exported successfully');
            return true;
        } catch (error) {
            console.error('[SyncManager] Failed to export data:', error);
            alert('Failed to export data. Please try again.');
            return false;
        }
    }

    // Import data
    async importData(fileContent) {
        if (!this.isLoggedIn()) {
            alert('Please log in to import data');
            return;
        }

        try {
            const data = JSON.parse(fileContent);
            const { chats, scripts, projects } = data;

            const token = this.getAuthToken();
            const response = await fetch(`${this.API_BASE_URL}/api/user/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ chats, scripts, projects })
            });

            if (!response.ok) {
                throw new Error('Failed to import data');
            }

            const result = await response.json();
            console.log('[SyncManager] ✅ Data imported successfully:', result.imported);

            // Reload data from server
            await this.loadFromServer();

            // Reload the page to reflect changes
            window.location.reload();

            return true;
        } catch (error) {
            console.error('[SyncManager] Failed to import data:', error);
            alert('Failed to import data. Please check the file format and try again.');
            return false;
        }
    }

    // Get sync status
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            pendingChanges: { ...this.pendingChanges },
            isAutoSyncActive: !!this.syncTimer
        };
    }
}

// Create global instance
const syncManager = new SyncManager();
window.syncManager = syncManager;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        syncManager.init();
    });
} else {
    syncManager.init();
}
