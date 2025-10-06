// Simple Response Cache
// Caches common Roblox script requests to save API calls

import crypto from 'crypto';

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 100; // Keep last 100 responses
        this.ttl = 7 * 24 * 60 * 60 * 1000; // 7 days

        // Pre-seed with common requests
        this.seedCommonResponses();
    }

    // Generate cache key from prompt
    generateKey(prompt) {
        const normalized = prompt.toLowerCase().trim().replace(/\s+/g, ' ');
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    // Check if we have a cached response
    get(prompt) {
        const key = this.generateKey(prompt);
        const cached = this.cache.get(key);

        if (!cached) return null;

        // Check if expired
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        cached.hits++;
        console.log(`[CACHE HIT] Saved API call for: "${prompt.substring(0, 50)}..."`);
        return cached.response;
    }

    // Store a response
    set(prompt, response) {
        const key = this.generateKey(prompt);

        this.cache.set(key, {
            response,
            timestamp: Date.now(),
            hits: 0
        });

        // Enforce size limit
        if (this.cache.size > this.maxSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        console.log(`[CACHE STORED] "${prompt.substring(0, 50)}..."`);
    }

    // Pre-seed common Roblox requests
    seedCommonResponses() {
        const commonRequests = {
            'create a click detector': '```lua\nlocal part = script.Parent\nlocal clickDetector = Instance.new("ClickDetector", part)\n\nclickDetector.MouseClick:Connect(function(player)\n    print(player.Name .. " clicked!")\n    -- Add your code here\nend)\n```',

            'make a click detector script': '```lua\nlocal part = script.Parent\nlocal clickDetector = Instance.new("ClickDetector", part)\n\nclickDetector.MouseClick:Connect(function(player)\n    print(player.Name .. " clicked!")\n    -- Add your code here\nend)\n```',

            'teleport player script': '```lua\nlocal teleportPart = script.Parent\nlocal destination = workspace.DestinationPart -- Change this\n\nteleportPart.Touched:Connect(function(hit)\n    local humanoid = hit.Parent:FindFirstChild("Humanoid")\n    if humanoid then\n        local character = humanoid.Parent\n        local rootPart = character:FindFirstChild("HumanoidRootPart")\n        if rootPart then\n            rootPart.CFrame = destination.CFrame + Vector3.new(0, 3, 0)\n        end\n    end\nend)\n```',

            'create leaderstats': '```lua\ngame.Players.PlayerAdded:Connect(function(player)\n    local leaderstats = Instance.new("Folder")\n    leaderstats.Name = "leaderstats"\n    leaderstats.Parent = player\n\n    local coins = Instance.new("IntValue")\n    coins.Name = "Coins"\n    coins.Value = 0\n    coins.Parent = leaderstats\nend)\n```',

            'make a gui button': '```lua\n-- LocalScript in StarterPlayer > StarterPlayerScripts\nlocal player = game.Players.LocalPlayer\nlocal playerGui = player:WaitForChild("PlayerGui")\n\nlocal screenGui = Instance.new("ScreenGui")\nscreenGui.Parent = playerGui\n\nlocal button = Instance.new("TextButton")\nbutton.Size = UDim2.new(0, 200, 0, 50)\nbutton.Position = UDim2.new(0.5, -100, 0.5, -25)\nbutton.Text = "Click Me"\nbutton.Parent = screenGui\n\nbutton.MouseButton1Click:Connect(function()\n    print("Button clicked!")\nend)\n```'
        };

        for (const [prompt, response] of Object.entries(commonRequests)) {
            this.set(prompt, response);
        }

        console.log(`[CACHE] Pre-seeded ${Object.keys(commonRequests).length} common responses`);
    }

    // Get cache stats
    getStats() {
        let totalHits = 0;
        for (const entry of this.cache.values()) {
            totalHits += entry.hits;
        }

        return {
            size: this.cache.size,
            totalHits,
            hitRate: totalHits > 0 ? (totalHits / (totalHits + this.cache.size)) * 100 : 0
        };
    }
}

// Export singleton
export const simpleCache = new SimpleCache();
export default simpleCache;