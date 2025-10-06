--[[
	Roblox MCP Plugin
	Connects Roblox Studio to Claude AI via Model Context Protocol

	This plugin polls the bridge server for new scripts and automatically
	inserts them into Roblox Studio.

	Author: Roblox MCP Integration
	Version: 1.0.0
]]

-- Configuration
local BRIDGE_URL = "http://localhost:3001"
local POLL_INTERVAL = 3 -- seconds
local AUTO_INSERT_ENABLED = true

-- Services
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayer = game:GetService("StarterPlayer")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

-- Plugin GUI
local toolbar = plugin:CreateToolbar("MCP Assistant")
local toggleButton = toolbar:CreateButton(
	"Toggle Auto-Insert",
	"Enable/disable automatic script insertion from Claude AI",
	"rbxasset://textures/ui/TopBar/inventoryOn.png"
)

local statusButton = toolbar:CreateButton(
	"Connection Status",
	"View connection status and pending scripts",
	"rbxasset://textures/ui/TopBar/friendsOn.png"
)

-- State
local isEnabled = AUTO_INSERT_ENABLED
local isPolling = false
local lastCheckTime = 0
local totalScriptsReceived = 0
local connectionStatus = "Disconnected"

-- Update button state
local function updateButtonState()
	if isEnabled then
		toggleButton:SetActive(true)
		connectionStatus = "Active"
	else
		toggleButton:SetActive(false)
		connectionStatus = "Paused"
	end
end

-- Get the appropriate parent for a script based on location
local function getScriptParent(location)
	location = location or "ServerScriptService"

	-- Handle nested paths
	local parts = string.split(location, ".")
	local parent = nil

	-- Try to resolve the path
	if parts[1] == "ServerScriptService" then
		parent = ServerScriptService
	elseif parts[1] == "StarterPlayer" then
		parent = StarterPlayer
	elseif parts[1] == "ReplicatedStorage" then
		parent = ReplicatedStorage
	elseif parts[1] == "Workspace" or parts[1] == "workspace" then
		parent = workspace
	else
		-- Default to ServerScriptService
		parent = ServerScriptService
	end

	-- Navigate nested path
	for i = 2, #parts do
		local child = parent:FindFirstChild(parts[i])
		if child then
			parent = child
		else
			warn("Could not find path:", location, "- using", parent:GetFullName())
			break
		end
	end

	return parent
end

-- Create a script instance
local function createScriptInstance(scriptData)
	local scriptType = scriptData.scriptType or "Server"
	local scriptInstance

	if scriptType == "Local" or scriptType == "LocalScript" then
		scriptInstance = Instance.new("LocalScript")
	elseif scriptType == "Module" or scriptType == "ModuleScript" then
		scriptInstance = Instance.new("ModuleScript")
	else
		scriptInstance = Instance.new("Script")
	end

	scriptInstance.Name = scriptData.name
	scriptInstance.Source = scriptData.code

	return scriptInstance
end

-- Insert a script into the game
local function insertScript(scriptData)
	local success, result = pcall(function()
		-- Create the script instance
		local scriptInstance = createScriptInstance(scriptData)

		-- Get the parent location
		local parent = getScriptParent(scriptData.location)

		-- Set the parent
		scriptInstance.Parent = parent

		-- Record undo history
		ChangeHistoryService:SetWaypoint("Insert MCP Script: " .. scriptData.name)

		return scriptInstance
	end)

	if success then
		print("✅ [MCP] Inserted script:", scriptData.name)
		print("   Location:", scriptData.location)
		print("   Type:", scriptData.scriptType)
		totalScriptsReceived = totalScriptsReceived + 1
		return true, result
	else
		warn("❌ [MCP] Failed to insert script:", result)
		return false, result
	end
end

-- Mark a script as delivered on the bridge server
local function markScriptDelivered(scriptId)
	local url = BRIDGE_URL .. "/api/scripts/" .. scriptId .. "/delivered"

	local success, response = pcall(function()
		return HttpService:PostAsync(url, "", Enum.HttpContentType.ApplicationJson)
	end)

	if success then
		local data = HttpService:JSONDecode(response)
		if data.success then
			print("📤 [MCP] Marked script as delivered:", scriptId)
		end
	else
		warn("⚠️  [MCP] Failed to mark script as delivered:", response)
	end
end

-- Fetch pending scripts from bridge server
local function fetchPendingScripts()
	local url = BRIDGE_URL .. "/api/scripts/pending"

	local success, response = pcall(function()
		return HttpService:GetAsync(url)
	end)

	if not success then
		if connectionStatus ~= "Error" then
			warn("❌ [MCP] Failed to connect to bridge server")
			warn("   Make sure the bridge server is running at:", BRIDGE_URL)
			connectionStatus = "Error"
		end
		return {}
	end

	connectionStatus = "Connected"

	local data = HttpService:JSONDecode(response)

	if data.success then
		return data.scripts or {}
	else
		warn("⚠️  [MCP] Bridge server returned error:", data.error)
		return {}
	end
end

-- Process pending scripts
local function processPendingScripts()
	if not isEnabled then
		return
	end

	local scripts = fetchPendingScripts()

	if #scripts > 0 then
		print("📥 [MCP] Received", #scripts, "pending script(s)")

		for _, scriptData in ipairs(scripts) do
			-- Insert the script
			local success, scriptInstance = insertScript(scriptData)

			if success then
				-- Mark as delivered
				markScriptDelivered(scriptData.id)

				-- Show notification
				local message = string.format(
					"✨ New script from Claude AI:\n%s\nInserted into: %s",
					scriptData.name,
					scriptData.location
				)

				plugin:CreateDockWidgetPluginGui(
					"MCPNotification_" .. scriptData.id,
					DockWidgetPluginGuiInfo.new(
						Enum.InitialDockState.Float,
						false, -- Initially disabled
						false, -- Override enabled state
						300, -- Width
						150, -- Height
						300, -- Min width
						150  -- Min height
					)
				)
			end
		end
	end
end

-- Polling loop
local function startPolling()
	if isPolling then
		return
	end

	isPolling = true
	print("🚀 [MCP] Started polling bridge server")
	print("   Bridge URL:", BRIDGE_URL)
	print("   Poll interval:", POLL_INTERVAL, "seconds")

	task.spawn(function()
		while true do
			task.wait(POLL_INTERVAL)

			if isEnabled then
				local currentTime = tick()
				if currentTime - lastCheckTime >= POLL_INTERVAL then
					processPendingScripts()
					lastCheckTime = currentTime
				end
			end
		end
	end)
end

-- Show status widget
local function showStatus()
	local widgetInfo = DockWidgetPluginGuiInfo.new(
		Enum.InitialDockState.Float,
		true, -- Initially enabled
		false, -- Override enabled state
		350, -- Width
		250, -- Height
		300, -- Min width
		200  -- Min height
	)

	local widget = plugin:CreateDockWidgetPluginGui("MCPStatus", widgetInfo)
	widget.Title = "MCP Assistant Status"

	-- Create UI
	local frame = Instance.new("Frame")
	frame.Size = UDim2.new(1, 0, 1, 0)
	frame.BackgroundColor3 = Color3.fromRGB(46, 46, 46)
	frame.BorderSizePixel = 0
	frame.Parent = widget

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 10)
	padding.PaddingRight = UDim.new(0, 10)
	padding.PaddingTop = UDim.new(0, 10)
	padding.PaddingBottom = UDim.new(0, 10)
	padding.Parent = frame

	-- Title
	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0, 30)
	title.Position = UDim2.new(0, 0, 0, 0)
	title.BackgroundTransparency = 1
	title.Text = "🤖 MCP Assistant"
	title.TextColor3 = Color3.fromRGB(255, 255, 255)
	title.Font = Enum.Font.SourceSansBold
	title.TextSize = 20
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = frame

	-- Status text
	local statusText = Instance.new("TextLabel")
	statusText.Size = UDim2.new(1, 0, 0, 120)
	statusText.Position = UDim2.new(0, 0, 0, 40)
	statusText.BackgroundTransparency = 1
	statusText.TextColor3 = Color3.fromRGB(200, 200, 200)
	statusText.Font = Enum.Font.SourceSans
	statusText.TextSize = 16
	statusText.TextXAlignment = Enum.TextXAlignment.Left
	statusText.TextYAlignment = Enum.TextYAlignment.Top
	statusText.Parent = frame

	-- Update status
	local function updateStatus()
		local status = string.format(
			"Status: %s\n" ..
			"Auto-Insert: %s\n" ..
			"Bridge URL: %s\n" ..
			"Scripts Received: %d\n" ..
			"Poll Interval: %d seconds",
			connectionStatus,
			isEnabled and "Enabled" or "Disabled",
			BRIDGE_URL,
			totalScriptsReceived,
			POLL_INTERVAL
		)
		statusText.Text = status
	end

	updateStatus()

	-- Update every second
	task.spawn(function()
		while widget.Enabled do
			task.wait(1)
			updateStatus()
		end
	end)

	-- Info text
	local info = Instance.new("TextLabel")
	info.Size = UDim2.new(1, 0, 0, 60)
	info.Position = UDim2.new(0, 0, 1, -60)
	info.BackgroundTransparency = 1
	info.Text = "Use Claude AI to generate scripts!\n\nExample: 'Create a script that causes natural disasters'"
	info.TextColor3 = Color3.fromRGB(150, 150, 150)
	info.Font = Enum.Font.SourceSansItalic
	info.TextSize = 14
	info.TextXAlignment = Enum.TextXAlignment.Left
	info.TextYAlignment = Enum.TextYAlignment.Top
	info.TextWrapped = true
	info.Parent = frame
end

-- Button handlers
toggleButton.Click:Connect(function()
	isEnabled = not isEnabled
	updateButtonState()

	if isEnabled then
		print("✅ [MCP] Auto-insert enabled")
	else
		print("⏸️  [MCP] Auto-insert paused")
	end
end)

statusButton.Click:Connect(function()
	showStatus()
end)

-- Initialize
updateButtonState()
startPolling()

-- Startup message
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("🤖 Roblox MCP Plugin Loaded!")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("✅ Ready to receive scripts from Claude AI")
print("🔗 Bridge server:", BRIDGE_URL)
print("⚙️  Auto-insert:", isEnabled and "Enabled" or "Disabled")
print("")
print("💡 Ask Claude AI to create Roblox scripts!")
print("   Example: 'Make a script that causes natural disasters'")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
