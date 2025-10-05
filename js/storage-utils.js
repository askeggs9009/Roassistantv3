// Storage Utilities - User-Scoped localStorage
class StorageUtils {
    constructor() {
        this.currentUserId = null;
        this.updateCurrentUser();
    }

    // Get current user ID from localStorage
    updateCurrentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || 'null');
            // Use email as unique identifier, or 'guest' for non-logged-in users
            this.currentUserId = user?.email || 'guest';
        } catch (error) {
            console.error('[StorageUtils] Error parsing user data:', error);
            this.currentUserId = 'guest';
        }
    }

    // Generate user-scoped key
    getUserKey(key) {
        this.updateCurrentUser(); // Always get fresh user data
        return `${this.currentUserId}_${key}`;
    }

    // Get user-scoped data
    getUserData(key, defaultValue = null) {
        try {
            const scopedKey = this.getUserKey(key);
            const data = localStorage.getItem(scopedKey);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error(`[StorageUtils] Error reading ${key}:`, error);
            return defaultValue;
        }
    }

    // Set user-scoped data
    setUserData(key, value) {
        try {
            const scopedKey = this.getUserKey(key);
            localStorage.setItem(scopedKey, JSON.stringify(value));
        } catch (error) {
            console.error(`[StorageUtils] Error writing ${key}:`, error);
        }
    }

    // Remove user-scoped data
    removeUserData(key) {
        try {
            const scopedKey = this.getUserKey(key);
            localStorage.removeItem(scopedKey);
        } catch (error) {
            console.error(`[StorageUtils] Error removing ${key}:`, error);
        }
    }

    // Clear all data for current user
    clearUserData() {
        this.updateCurrentUser();
        const prefix = `${this.currentUserId}_`;
        const keysToRemove = [];

        // Find all keys for this user
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keysToRemove.push(key);
            }
        }

        // Remove them
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`[StorageUtils] Cleared ${keysToRemove.length} items for user ${this.currentUserId}`);
    }

    // Migrate old unscoped data to user-scoped (one-time migration)
    migrateToUserScoped() {
        this.updateCurrentUser();

        const keysToMigrate = ['allChatHistories', 'roblox_ai_scripts', 'currentChatId'];

        keysToMigrate.forEach(key => {
            const oldData = localStorage.getItem(key);
            if (oldData && !localStorage.getItem(this.getUserKey(key))) {
                // Only migrate if user-scoped version doesn't exist
                localStorage.setItem(this.getUserKey(key), oldData);
                console.log(`[StorageUtils] Migrated ${key} to user-scoped storage`);
            }
        });
    }
}

// Create global instance
const storageUtils = new StorageUtils();
window.storageUtils = storageUtils;
