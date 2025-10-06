// Response Caching System for Common Roblox Luau Prompts
// Saves 40-80% of token costs by reusing common responses

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class ResponseCache {
    constructor() {
        this.memoryCache = new Map();
        this.cacheDir = path.join(process.cwd(), 'cache', 'responses');
        this.maxMemorySize = 100; // Max items in memory
        this.maxDiskSize = 10000; // Max items on disk
        this.ttl = 7 * 24 * 60 * 60 * 1000; // 7 days TTL

        // Common Roblox prompt patterns
        this.commonPatterns = [
            // Click detection patterns
            { regex: /click\s+(detector|detection|script)/i, category: 'click-detection' },
            { regex: /on\s+click|when\s+clicked/i, category: 'click-detection' },

            // Teleportation patterns
            { regex: /teleport\s+(player|script|pad)/i, category: 'teleport' },
            { regex: /tp\s+player|move\s+player\s+to/i, category: 'teleport' },

            // GUI patterns
            { regex: /(create|make)\s+(gui|button|frame)/i, category: 'gui' },
            { regex: /screen\s*gui|ui\s+element/i, category: 'gui' },

            // Tween/Animation patterns
            { regex: /tween\s+(service|animation|part)/i, category: 'tween' },
            { regex: /animate\s+(part|object|gui)/i, category: 'tween' },

            // Leaderstats patterns
            { regex: /leader\s*stats|leaderboard|score\s+system/i, category: 'leaderstats' },
            { regex: /points?\s+system|currency\s+system/i, category: 'leaderstats' },

            // Tool/Weapon patterns
            { regex: /(create|make)\s+(tool|weapon|sword)/i, category: 'tool' },
            { regex: /equip\s+(tool|item)|give\s+player\s+tool/i, category: 'tool' },

            // Datastore patterns
            { regex: /data\s*store|save\s+data|load\s+data/i, category: 'datastore' },
            { regex: /persistent\s+data|save\s+progress/i, category: 'datastore' },

            // RemoteEvent patterns
            { regex: /remote\s*(event|function)/i, category: 'remote' },
            { regex: /client.*server|server.*client/i, category: 'remote' },

            // Part spawning patterns
            { regex: /spawn\s+(part|brick|object)/i, category: 'spawn' },
            { regex: /create\s+part\s+at|instantiate/i, category: 'spawn' },

            // Raycast patterns
            { regex: /ray\s*cast|line\s+of\s+sight/i, category: 'raycast' },
            { regex: /shoot\s+ray|detect\s+hit/i, category: 'raycast' }
        ];

        this.initializeCache();
    }

    async initializeCache() {
        try {
            // Create cache directory if it doesn't exist
            await fs.mkdir(this.cacheDir, { recursive: true });
            console.log('[CACHE] Response cache initialized at:', this.cacheDir);
        } catch (error) {
            console.error('[CACHE] Failed to initialize cache directory:', error);
        }
    }

    // Generate cache key from prompt
    generateCacheKey(prompt, model = 'default') {
        // Normalize prompt for better cache hits
        const normalizedPrompt = prompt
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/['"]/g, '')
            .trim();

        // Create hash
        const hash = crypto
            .createHash('sha256')
            .update(`${model}:${normalizedPrompt}`)
            .digest('hex')
            .substring(0, 16);

        return hash;
    }

    // Detect if prompt matches common patterns
    detectPattern(prompt) {
        for (const pattern of this.commonPatterns) {
            if (pattern.regex.test(prompt)) {
                return pattern.category;
            }
        }
        return null;
    }

    // Check if response exists in cache
    async get(prompt, model = 'default') {
        const key = this.generateCacheKey(prompt, model);

        // Check memory cache first
        if (this.memoryCache.has(key)) {
            const cached = this.memoryCache.get(key);
            if (Date.now() - cached.timestamp < this.ttl) {
                console.log('[CACHE] Memory hit for key:', key);
                cached.hits++;
                return {
                    response: cached.response,
                    fromCache: true,
                    cacheType: 'memory',
                    pattern: cached.pattern,
                    savedTokens: cached.savedTokens
                };
            }
        }

        // Check disk cache
        try {
            const filePath = path.join(this.cacheDir, `${key}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const cached = JSON.parse(data);

            if (Date.now() - cached.timestamp < this.ttl) {
                console.log('[CACHE] Disk hit for key:', key);

                // Promote to memory cache
                this.memoryCache.set(key, cached);
                this.enforceMemoryLimit();

                cached.hits++;
                await this.updateDiskCache(key, cached);

                return {
                    response: cached.response,
                    fromCache: true,
                    cacheType: 'disk',
                    pattern: cached.pattern,
                    savedTokens: cached.savedTokens
                };
            }
        } catch (error) {
            // Cache miss - this is normal
        }

        return null;
    }

    // Store response in cache
    async set(prompt, response, model = 'default', tokenCount = 0) {
        const key = this.generateCacheKey(prompt, model);
        const pattern = this.detectPattern(prompt);

        const cacheEntry = {
            prompt,
            response,
            model,
            pattern,
            timestamp: Date.now(),
            hits: 0,
            savedTokens: tokenCount
        };

        // Store in memory
        this.memoryCache.set(key, cacheEntry);
        this.enforceMemoryLimit();

        // Store on disk
        await this.saveToDisk(key, cacheEntry);

        console.log('[CACHE] Stored response for key:', key, 'Pattern:', pattern);
    }

    // Save cache entry to disk
    async saveToDisk(key, entry) {
        try {
            const filePath = path.join(this.cacheDir, `${key}.json`);
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
        } catch (error) {
            console.error('[CACHE] Failed to save to disk:', error);
        }
    }

    // Update disk cache with hit count
    async updateDiskCache(key, entry) {
        await this.saveToDisk(key, entry);
    }

    // Enforce memory cache size limit
    enforceMemoryLimit() {
        if (this.memoryCache.size > this.maxMemorySize) {
            // Remove oldest entries (FIFO)
            const toRemove = this.memoryCache.size - this.maxMemorySize;
            const keys = Array.from(this.memoryCache.keys());
            for (let i = 0; i < toRemove; i++) {
                this.memoryCache.delete(keys[i]);
            }
        }
    }

    // Get cache statistics
    async getStats() {
        const stats = {
            memoryEntries: this.memoryCache.size,
            diskEntries: 0,
            totalHits: 0,
            totalSavedTokens: 0,
            patternBreakdown: {}
        };

        // Count memory cache stats
        for (const entry of this.memoryCache.values()) {
            stats.totalHits += entry.hits;
            stats.totalSavedTokens += entry.savedTokens * entry.hits;

            if (entry.pattern) {
                if (!stats.patternBreakdown[entry.pattern]) {
                    stats.patternBreakdown[entry.pattern] = { count: 0, hits: 0 };
                }
                stats.patternBreakdown[entry.pattern].count++;
                stats.patternBreakdown[entry.pattern].hits += entry.hits;
            }
        }

        // Count disk entries
        try {
            const files = await fs.readdir(this.cacheDir);
            stats.diskEntries = files.filter(f => f.endsWith('.json')).length;
        } catch (error) {
            console.error('[CACHE] Failed to count disk entries:', error);
        }

        return stats;
    }

    // Clear old cache entries
    async cleanup() {
        const now = Date.now();

        // Clean memory cache
        for (const [key, entry] of this.memoryCache.entries()) {
            if (now - entry.timestamp > this.ttl) {
                this.memoryCache.delete(key);
            }
        }

        // Clean disk cache
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.cacheDir, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    const entry = JSON.parse(data);

                    if (now - entry.timestamp > this.ttl) {
                        await fs.unlink(filePath);
                        console.log('[CACHE] Cleaned up old entry:', file);
                    }
                }
            }
        } catch (error) {
            console.error('[CACHE] Cleanup error:', error);
        }
    }

    // Pre-populate cache with common responses
    async seedCommonResponses() {
        const commonResponses = [
            {
                prompt: "create a click detector script",
                response: `\`\`\`lua
local part = script.Parent
local clickDetector = part:FindFirstChild("ClickDetector") or Instance.new("ClickDetector", part)

clickDetector.MouseClick:Connect(function(player)
    print(player.Name .. " clicked the part!")
    -- Add your click action here
end)
\`\`\``,
                pattern: 'click-detection'
            },
            {
                prompt: "teleport player to another part",
                response: `\`\`\`lua
local teleportPart = script.Parent
local destination = workspace:WaitForChild("DestinationPart") -- Change this to your destination part name

teleportPart.Touched:Connect(function(hit)
    local humanoid = hit.Parent:FindFirstChild("Humanoid")
    if humanoid then
        local character = humanoid.Parent
        local rootPart = character:FindFirstChild("HumanoidRootPart")
        if rootPart then
            rootPart.CFrame = destination.CFrame + Vector3.new(0, 3, 0)
        end
    end
end)
\`\`\``,
                pattern: 'teleport'
            },
            {
                prompt: "create a GUI button",
                response: `\`\`\`lua
local player = game.Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

-- Create ScreenGui
local screenGui = Instance.new("ScreenGui")
screenGui.Name = "MyGui"
screenGui.Parent = playerGui

-- Create Frame
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 200, 0, 50)
frame.Position = UDim2.new(0.5, -100, 0.5, -25)
frame.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
frame.Parent = screenGui

-- Create Button
local button = Instance.new("TextButton")
button.Size = UDim2.new(1, 0, 1, 0)
button.Text = "Click Me!"
button.TextColor3 = Color3.new(1, 1, 1)
button.BackgroundColor3 = Color3.fromRGB(100, 100, 255)
button.Parent = frame

button.MouseButton1Click:Connect(function()
    print("Button clicked!")
    -- Add your button action here
end)
\`\`\``,
                pattern: 'gui'
            }
        ];

        for (const item of commonResponses) {
            await this.set(item.prompt, item.response, 'seed', 500);
        }

        console.log('[CACHE] Seeded', commonResponses.length, 'common responses');
    }
}

// Export singleton instance
export const responseCache = new ResponseCache();

// Initialize and seed cache
responseCache.seedCommonResponses().catch(console.error);

// Cleanup old entries every hour
setInterval(() => {
    responseCache.cleanup().catch(console.error);
}, 60 * 60 * 1000);

export default responseCache;