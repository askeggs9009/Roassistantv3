// Roblox Best Practices Library
// Working examples and patterns for common Roblox systems

/**
 * This library contains proven, working patterns for common Roblox systems.
 * These examples follow Roblox best practices and can be used as reference
 * when the AI needs to create similar systems.
 */

export const ROBLOX_PATTERNS = {
    // ==========================================
    // SHOP SYSTEM - Complete working example
    // ==========================================
    shop: {
        description: "A fully functional shop system with proper UI, client-server communication, and data validation",
        keywords: ["shop", "store", "buy", "purchase", "sell"],
        bestPractices: [
            "Use UIScale or UISizeConstraint for responsive UI",
            "Always validate purchases on the server",
            "Use RemoteEvents for client-server communication",
            "Check player resources before allowing purchase",
            "Provide visual feedback (success/error messages)",
            "Use proper UI hierarchy (ScreenGui > Frame > Elements)",
            "Position UI with AnchorPoint and Position for centering"
        ],
        commonMistakes: [
            "❌ Processing purchases on the client (exploitable)",
            "❌ Not checking if player has enough currency",
            "❌ Using absolute pixel positions (not responsive)",
            "❌ Missing debounce on buy buttons",
            "❌ Not providing feedback to the player",
            "❌ Forgetting to create RemoteEvent"
        ],
        example: `
-- SHOP SYSTEM STRUCTURE:
-- 1. StarterGui.ShopUI (ScreenGui)
-- 2. StarterGui.ShopUI.ShopFrame (Frame with UI elements)
-- 3. StarterGui.ShopUI.LocalScript (Client-side UI control)
-- 4. ReplicatedStorage.ShopRemotes (Folder)
-- 5. ReplicatedStorage.ShopRemotes.BuyItem (RemoteEvent)
-- 6. ServerScriptService.ShopServer (Server-side purchase handling)

-- CLIENT SCRIPT (LocalScript in ShopUI):
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local shopFrame = script.Parent:WaitForChild("ShopFrame")
local openButton = script.Parent:WaitForChild("OpenButton")
local closeButton = shopFrame:WaitForChild("CloseButton")
local buyButton = shopFrame:WaitForChild("BuyButton")

local buyRemote = ReplicatedStorage:WaitForChild("ShopRemotes"):WaitForChild("BuyItem")

-- Toggle shop visibility
openButton.MouseButton1Click:Connect(function()
    shopFrame.Visible = true
    print("[SHOP CLIENT] Shop opened")
end)

closeButton.MouseButton1Click:Connect(function()
    shopFrame.Visible = false
    print("[SHOP CLIENT] Shop closed")
end)

-- Handle purchase button (with debounce)
local debounce = false
buyButton.MouseButton1Click:Connect(function()
    if debounce then
        print("[SHOP CLIENT] Please wait before buying again")
        return
    end

    debounce = true
    print("[SHOP CLIENT] Requesting purchase...")

    -- Send purchase request to server
    buyRemote:FireServer("Sword", 100) -- itemName, price

    task.wait(1) -- Debounce time
    debounce = false
end)

-- Listen for purchase result
buyRemote.OnClientEvent:Connect(function(success, message)
    if success then
        print("[SHOP CLIENT] ✅ " .. message)
        -- Show success UI feedback here
    else
        print("[SHOP CLIENT] ❌ " .. message)
        -- Show error UI feedback here
    end
end)

-- SERVER SCRIPT (Script in ServerScriptService):
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local buyRemote = ReplicatedStorage:WaitForChild("ShopRemotes"):WaitForChild("BuyItem")

-- Item catalog (server-side only for security)
local SHOP_ITEMS = {
    ["Sword"] = {price = 100, giveItem = function(player)
        -- Give sword to player
        print("[SHOP SERVER] Giving Sword to", player.Name)
    end},
    ["Shield"] = {price = 150, giveItem = function(player)
        print("[SHOP SERVER] Giving Shield to", player.Name)
    end}
}

buyRemote.OnServerEvent:Connect(function(player, itemName, clientPrice)
    print("[SHOP SERVER] Purchase request from", player.Name, "for", itemName)

    -- VALIDATION: Check if item exists
    local item = SHOP_ITEMS[itemName]
    if not item then
        print("[SHOP SERVER] ❌ Invalid item:", itemName)
        buyRemote:FireClient(player, false, "Item does not exist!")
        return
    end

    -- VALIDATION: Verify price (client could send fake price)
    if clientPrice ~= item.price then
        print("[SHOP SERVER] ⚠️ Price mismatch! Expected:", item.price, "Got:", clientPrice)
        -- Use server price, not client price
    end

    -- VALIDATION: Check if player has enough money
    local leaderstats = player:FindFirstChild("leaderstats")
    local coins = leaderstats and leaderstats:FindFirstChild("Coins")

    if not coins then
        print("[SHOP SERVER] ❌ Player missing Coins value")
        buyRemote:FireClient(player, false, "Error: Missing currency!")
        return
    end

    if coins.Value < item.price then
        print("[SHOP SERVER] ❌ Insufficient funds. Has:", coins.Value, "Needs:", item.price)
        buyRemote:FireClient(player, false, "Not enough coins! Need " .. item.price)
        return
    end

    -- ALL CHECKS PASSED - Process purchase
    coins.Value = coins.Value - item.price
    item.giveItem(player)

    print("[SHOP SERVER] ✅ Purchase successful for", player.Name)
    buyRemote:FireClient(player, true, "Purchased " .. itemName .. " for " .. item.price .. " coins!")
end)
`
    },

    // ==========================================
    // UI BEST PRACTICES
    // ==========================================
    ui: {
        description: "Proper UI creation with responsive design and constraints",
        keywords: ["ui", "gui", "screengui", "frame", "button", "textlabel", "interface"],
        bestPractices: [
            "Use Scale (0-1) instead of Offset for responsive design",
            "Set AnchorPoint to {0.5, 0.5} and Position to {0.5, 0, 0.5, 0} for centering",
            "Use UIListLayout, UIGridLayout for automatic positioning",
            "Add UIPadding for spacing inside frames",
            "Use UICorner for rounded corners",
            "Set ZIndex properly for layering",
            "Use UIAspectRatioConstraint to maintain proportions",
            "Always parent UI to StarterGui (not PlayerGui directly)"
        ],
        commonMistakes: [
            "❌ Using absolute Offset values (breaks on different screen sizes)",
            "❌ Not setting AnchorPoint when centering",
            "❌ Forgetting to set BackgroundTransparency = 1 for invisible containers",
            "❌ Overlapping UI elements (check ZIndex)",
            "❌ Not testing on different screen sizes",
            "❌ Hardcoding positions instead of using Layout objects"
        ],
        example: `
-- PROPERLY CENTERED AND RESPONSIVE FRAME:

-- Frame properties:
{
    Name = "MainFrame",
    Parent = ScreenGui,
    AnchorPoint = Vector2.new(0.5, 0.5), -- Center anchor
    Position = UDim2.new(0.5, 0, 0.5, 0), -- Center position (50% X, 50% Y)
    Size = UDim2.new(0.3, 0, 0.4, 0), -- Scale-based size (30% width, 40% height)
    BackgroundColor3 = Color3.fromRGB(45, 45, 45),
    BorderSizePixel = 0
}

-- Add UICorner for rounded corners:
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 12)
corner.Parent = frame

-- Add UIPadding for internal spacing:
local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 10)
padding.PaddingBottom = UDim.new(0, 10)
padding.PaddingLeft = UDim.new(0, 10)
padding.PaddingRight = UDim.new(0, 10)
padding.Parent = frame

-- Add UIListLayout for automatic element stacking:
local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 5)
listLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = frame

-- PROPERLY STYLED BUTTON:
{
    Name = "BuyButton",
    Parent = frame,
    Size = UDim2.new(0.8, 0, 0, 40), -- 80% width, 40px height
    BackgroundColor3 = Color3.fromRGB(0, 170, 0),
    Text = "Buy Item",
    TextColor3 = Color3.fromRGB(255, 255, 255),
    Font = Enum.Font.GothamBold,
    TextSize = 18,
    BorderSizePixel = 0,
    AutoButtonColor = true -- Automatic click feedback
}
`
    },

    // ==========================================
    // REMOTE EVENTS (Client-Server Communication)
    // ==========================================
    remotes: {
        description: "Secure client-server communication with validation",
        keywords: ["remote", "event", "function", "client", "server", "communicate"],
        bestPractices: [
            "ALWAYS validate on the server, never trust the client",
            "Use RemoteEvent for one-way communication (Fire and forget)",
            "Use RemoteFunction for two-way communication (Request and response)",
            "Check player permissions before executing actions",
            "Rate limit/debounce to prevent spam",
            "Never send sensitive data to client",
            "Store RemoteEvents in ReplicatedStorage",
            "Use descriptive names (e.g., 'BuyItem', not 'Remote1')"
        ],
        commonMistakes: [
            "❌ Processing important logic on the client (exploitable)",
            "❌ Not validating player input on server",
            "❌ Trusting prices, amounts, or IDs sent from client",
            "❌ No rate limiting (exploiters can spam)",
            "❌ Revealing sensitive data in RemoteFunction returns",
            "❌ Using RemoteFunction for critical actions (can be spoofed)"
        ],
        example: `
-- SECURE REMOTE EVENT PATTERN:

-- SERVER (Script in ServerScriptService):
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local damageRemote = ReplicatedStorage:WaitForChild("CombatRemotes"):WaitForChild("DealDamage")

-- Rate limiting
local lastAction = {}

damageRemote.OnServerEvent:Connect(function(player, targetName, damage)
    print("[SERVER] Damage request from", player.Name, "to", targetName, "for", damage)

    -- RATE LIMITING
    local now = tick()
    if lastAction[player] and now - lastAction[player] < 1 then
        print("[SERVER] ⚠️ Rate limit exceeded by", player.Name)
        return
    end
    lastAction[player] = now

    -- VALIDATION: Check if player is alive
    local character = player.Character
    if not character or not character:FindFirstChild("Humanoid") or character.Humanoid.Health <= 0 then
        print("[SERVER] ❌ Player is dead, cannot attack")
        return
    end

    -- VALIDATION: Verify damage amount (don't trust client)
    local MAX_DAMAGE = 50
    if type(damage) ~= "number" or damage > MAX_DAMAGE or damage < 0 then
        print("[SERVER] ⚠️ Invalid damage amount:", damage)
        damage = 10 -- Use safe default
    end

    -- VALIDATION: Check if target exists and is alive
    local targetPlayer = Players:FindFirstChild(targetName)
    if not targetPlayer then
        print("[SERVER] ❌ Target player not found:", targetName)
        return
    end

    local targetChar = targetPlayer.Character
    if not targetChar or not targetChar:FindFirstChild("Humanoid") then
        print("[SERVER] ❌ Target has no character/humanoid")
        return
    end

    -- VALIDATION: Check distance (anti-cheat)
    local distance = (character.HumanoidRootPart.Position - targetChar.HumanoidRootPart.Position).Magnitude
    if distance > 15 then
        print("[SERVER] ⚠️ Player too far from target:", distance)
        return
    end

    -- ALL CHECKS PASSED - Apply damage
    targetChar.Humanoid:TakeDamage(damage)
    print("[SERVER] ✅ Damage applied:", damage, "to", targetName)
end)

-- CLIENT (LocalScript):
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local damageRemote = ReplicatedStorage:WaitForChild("CombatRemotes"):WaitForChild("DealDamage")

-- Request damage (server will validate)
damageRemote:FireServer("PlayerName", 25)
`
    },

    // ==========================================
    // DATASTORE BEST PRACTICES
    // ==========================================
    datastore: {
        description: "Safe and reliable data persistence",
        keywords: ["data", "save", "load", "datastore", "persistence"],
        bestPractices: [
            "Use pcall() to handle errors gracefully",
            "Implement auto-save on interval",
            "Save data when player leaves",
            "Use UpdateAsync for critical data",
            "Add retry logic for failed saves",
            "Validate loaded data structure",
            "Use default values for missing data",
            "Never save data on the client"
        ],
        commonMistakes: [
            "❌ Not using pcall() (crashes on DataStore errors)",
            "❌ No retry logic for failed saves",
            "❌ Not validating loaded data",
            "❌ Saving too frequently (rate limit issues)",
            "❌ Not providing default values",
            "❌ Saving when player joins instead of leaves"
        ],
        example: `
-- SAFE DATASTORE PATTERN:

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local playerDataStore = DataStoreService:GetDataStore("PlayerData")

-- Default data structure
local DEFAULT_DATA = {
    Coins = 0,
    Level = 1,
    Inventory = {}
}

-- Load player data with error handling
local function loadData(player)
    local userId = "Player_" .. player.UserId
    local success, data
    local attempts = 0

    -- Retry logic
    repeat
        attempts = attempts + 1
        success, data = pcall(function()
            return playerDataStore:GetAsync(userId)
        end)

        if not success then
            warn("[DATASTORE] Load attempt", attempts, "failed:", data)
            task.wait(1)
        end
    until success or attempts >= 3

    -- Validate and merge with defaults
    if success and data then
        print("[DATASTORE] ✅ Data loaded for", player.Name)
        -- Merge with defaults (in case new fields were added)
        for key, value in pairs(DEFAULT_DATA) do
            if data[key] == nil then
                data[key] = value
            end
        end
        return data
    else
        warn("[DATASTORE] ❌ Failed to load data, using defaults")
        return DEFAULT_DATA
    end
end

-- Save player data with error handling
local function saveData(player, data)
    local userId = "Player_" .. player.UserId
    local success, err
    local attempts = 0

    repeat
        attempts = attempts + 1
        success, err = pcall(function()
            playerDataStore:SetAsync(userId, data)
        end)

        if not success then
            warn("[DATASTORE] Save attempt", attempts, "failed:", err)
            task.wait(1)
        end
    until success or attempts >= 3

    if success then
        print("[DATASTORE] ✅ Data saved for", player.Name)
    else
        warn("[DATASTORE] ❌ Failed to save data after 3 attempts!")
    end

    return success
end

-- Setup player data on join
Players.PlayerAdded:Connect(function(player)
    local data = loadData(player)

    -- Create leaderstats
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"

    local coins = Instance.new("IntValue")
    coins.Name = "Coins"
    coins.Value = data.Coins
    coins.Parent = leaderstats

    leaderstats.Parent = player

    -- Store data reference
    player:SetAttribute("DataLoaded", true)
end)

-- Save data when player leaves
Players.PlayerRemoving:Connect(function(player)
    if not player:GetAttribute("DataLoaded") then return end

    local leaderstats = player:FindFirstChild("leaderstats")
    if leaderstats then
        local data = {
            Coins = leaderstats.Coins.Value,
            Level = 1,
            Inventory = {}
        }
        saveData(player, data)
    end
end)

-- Auto-save every 5 minutes (for long sessions)
while task.wait(300) do
    for _, player in pairs(Players:GetPlayers()) do
        if player:GetAttribute("DataLoaded") then
            print("[DATASTORE] Auto-saving for", player.Name)
            -- Save logic here
        end
    end
end
`
    }
};

/**
 * Get relevant patterns based on user prompt keywords
 */
export function getRelevantPatterns(prompt) {
    const promptLower = prompt.toLowerCase();
    const relevantPatterns = [];

    for (const [patternName, pattern] of Object.entries(ROBLOX_PATTERNS)) {
        // Check if any keywords match
        const hasKeyword = pattern.keywords.some(keyword =>
            promptLower.includes(keyword)
        );

        if (hasKeyword) {
            relevantPatterns.push({
                name: patternName,
                ...pattern
            });
        }
    }

    return relevantPatterns;
}

/**
 * Format patterns for injection into AI context
 */
export function formatPatternsForContext(patterns) {
    if (!patterns || patterns.length === 0) {
        return '';
    }

    let context = '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += '📚 ROBLOX BEST PRACTICES REFERENCE\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += 'Use these proven patterns as reference for your implementation.\n\n';

    for (const pattern of patterns) {
        context += `\n### ${pattern.name.toUpperCase()} PATTERN\n`;
        context += `${pattern.description}\n\n`;

        if (pattern.bestPractices && pattern.bestPractices.length > 0) {
            context += '✅ BEST PRACTICES:\n';
            pattern.bestPractices.forEach(practice => {
                context += `  • ${practice}\n`;
            });
            context += '\n';
        }

        if (pattern.commonMistakes && pattern.commonMistakes.length > 0) {
            context += '⚠️ COMMON MISTAKES TO AVOID:\n';
            pattern.commonMistakes.forEach(mistake => {
                context += `  ${mistake}\n`;
            });
            context += '\n';
        }

        if (pattern.example) {
            context += `📝 WORKING EXAMPLE:\n\`\`\`lua${pattern.example}\`\`\`\n`;
        }

        context += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    }

    return context;
}

export default {
    ROBLOX_PATTERNS,
    getRelevantPatterns,
    formatPatternsForContext
};
