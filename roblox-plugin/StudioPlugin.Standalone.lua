--[[
	RoAssistant Studio Plugin - STANDALONE VERSION
	Place this file directly in your Roblox Plugins folder

	Version: 2.2.2 - Script Viewer Update

	NEW FEATURES:
	✅ Click scripts in Explorer to view their source code
	✅ Real-time Explorer hierarchy syncing with RoConsole
	✅ Automatic physical object creation (Parts, Models, Tools)
	✅ Creates Parts with scripts inside them automatically
	✅ Automatic UI element creation (ScreenGui, Frame, TextButton, etc.)
	✅ Automatic hierarchy creation (creates parent folders as needed)
	✅ Support for RemoteEvents, RemoteFunctions, and Folders
	✅ Smart placement for complete Roblox systems

	Examples:
	"make a part that kills players" →
	- Creates Part in Workspace
	- Adds Script inside the Part with touch logic

	"make me a shop ui" →
	- Creates ScreenGui in StarterGui
	- Add LocalScripts for UI logic
	- Creates ServerScripts in ServerScriptService
	- Adds RemoteEvents in ReplicatedStorage
]]

-- ========================================
-- CONFIGURATION (Edit these for your setup)
-- ========================================

local Config = {
	-- Website URLs
	WEBSITE_URL = "https://www.roassistant.me",
	SSE_ENDPOINT = "https://www.roassistant.me/roblox/stream",
	STATUS_ENDPOINT = "https://www.roassistant.me/roblox/status",

	-- For local development, uncomment these:
	-- WEBSITE_URL = "http://localhost:3000",
	-- SSE_ENDPOINT = "http://localhost:3000/roblox/stream",
	-- STATUS_ENDPOINT = "http://localhost:3000/roblox/status",

	-- Connection settings
	AUTO_CONNECT = true,
	RECONNECT_DELAY = 5,
	MAX_RECONNECT_ATTEMPTS = 10,
	HEARTBEAT_INTERVAL = 20,

	-- Script insertion
	DEFAULT_LOCATION = "ServerScriptService",
	SHOW_NOTIFICATIONS = true,
	DEBUG = true
}

-- ========================================
-- PLUGIN CODE (Don't edit below this line)
-- ========================================

-- Services
local HttpService = game:GetService("HttpService")
local ServerScriptService = game:GetService("ServerScriptService")
local StarterPlayer = game:GetService("StarterPlayer")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

-- Plugin state
local isConnected = false
local sseClient = nil
local messageConnection = nil
local closedConnection = nil
local reconnectAttempt = 0
local lastHeartbeat = 0
local explorerChangeConnection = nil
local lastExplorerUpdate = 0

-- Create toolbar and buttons
local toolbar = plugin:CreateToolbar("RoAssistant")
local connectionButton = toolbar:CreateButton(
	"Connection",
	"View RoAssistant connection status",
	"rbxasset://textures/ui/TopBar/inventoryOn.png"
)

local statusWidget = nil

--[[
	Send status update to website
]]
local function sendStatus(status, message, scriptName)
	local success, result = pcall(function()
		local payload = {
			status = status,
			message = message,
			scriptName = scriptName or "",
			timestamp = DateTime.now():ToIsoDate()
		}

		return HttpService:PostAsync(
			Config.STATUS_ENDPOINT,
			HttpService:JSONEncode(payload),
			Enum.HttpContentType.ApplicationJson
		)
	end)

	if not success then
		warn("[RoAssistant] Failed to send status:", result)
	end
end

--[[
	Serialize an instance and its children for Explorer view
	Returns a table with name, className, and children
]]
local function serializeInstance(instance, depth, maxDepth)
	depth = depth or 0
	maxDepth = maxDepth or 5 -- Limit depth to prevent huge payloads

	if depth > maxDepth then
		return nil
	end

	local data = {
		name = instance.Name,
		className = instance.ClassName,
		children = {}
	}

	-- Include script source code for Script, LocalScript, and ModuleScript
	if instance:IsA("LuaSourceContainer") then
		local success, source = pcall(function()
			return instance.Source
		end)
		if success and source then
			data.source = source
		end
	end

	-- Get children
	local children = instance:GetChildren()
	for _, child in ipairs(children) do
		-- Skip certain instances to reduce payload size
		local skipClasses = {
			"Camera", "Terrain", "Lighting", "SoundService",
			"UserInputService", "RunService", "Players"
		}

		local shouldSkip = false
		for _, skipClass in ipairs(skipClasses) do
			if child.ClassName == skipClass then
				shouldSkip = true
				break
			end
		end

		if not shouldSkip then
			local childData = serializeInstance(child, depth + 1, maxDepth)
			if childData then
				table.insert(data.children, childData)
			end
		end
	end

	return data
end

--[[
	Build Explorer hierarchy from game tree
]]
local function buildExplorerHierarchy()
	local hierarchy = {}

	-- Key services to include in Explorer
	local services = {
		game:GetService("Workspace"),
		game:GetService("Players"),
		game:GetService("Lighting"),
		game:GetService("ReplicatedFirst"),
		game:GetService("ReplicatedStorage"),
		game:GetService("ServerScriptService"),
		game:GetService("ServerStorage"),
		game:GetService("StarterGui"),
		game:GetService("StarterPack"),
		game:GetService("StarterPlayer"),
		game:GetService("SoundService")
	}

	for _, service in ipairs(services) do
		local serviceData = serializeInstance(service, 0, 2) -- Reduced to depth 2 to minimize payload
		if serviceData then
			table.insert(hierarchy, serviceData)
		end
	end

	return hierarchy
end

--[[
	Send Explorer hierarchy to website
]]
local function sendExplorerData()
	-- Rate limit: only send once per second
	local now = tick()
	if now - lastExplorerUpdate < 1 then
		return
	end
	lastExplorerUpdate = now

	local success, result = pcall(function()
		local hierarchy = buildExplorerHierarchy()

		local payload = {
			hierarchy = hierarchy,
			timestamp = DateTime.now():ToIsoDate()
		}

		local explorerEndpoint = Config.WEBSITE_URL .. "/roblox/explorer"

		return HttpService:PostAsync(
			explorerEndpoint,
			HttpService:JSONEncode(payload),
			Enum.HttpContentType.ApplicationJson
		)
	end)

	if success then
		if Config.DEBUG then
			print("[RoAssistant] 📂 Explorer data sent")
		end
	else
		warn("[RoAssistant] Failed to send Explorer data:", result)
	end
end

--[[
	Get the appropriate parent for a script based on location
]]
local function getScriptParent(location)
	location = location or "ServerScriptService"

	-- Handle nested paths (e.g., "StarterPlayer.StarterCharacterScripts")
	local parts = string.split(location, ".")
	local parent = nil

	-- Resolve the root service
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
			warn("[RoAssistant] Could not find path:", location, "- using", parent:GetFullName())
			break
		end
	end

	return parent
end

--[[
	Apply custom properties to an instance
]]
local function applyProperties(instance, properties)
	if not properties then
		return
	end

	for propertyName, propertyValue in pairs(properties) do
		local success, error = pcall(function()
			-- Handle special property types that need conversion
			if propertyName == "Size" and typeof(propertyValue) == "table" then
				-- Convert {X, Y, Z} to Vector3
				instance.Size = Vector3.new(propertyValue.X or propertyValue[1], propertyValue.Y or propertyValue[2], propertyValue.Z or propertyValue[3])
			elseif propertyName == "Position" and typeof(propertyValue) == "table" then
				-- Convert {X, Y, Z} to Vector3
				instance.Position = Vector3.new(propertyValue.X or propertyValue[1], propertyValue.Y or propertyValue[2], propertyValue.Z or propertyValue[3])
			elseif propertyName == "Color" or propertyName == "BackgroundColor3" and typeof(propertyValue) == "table" then
				-- Convert {R, G, B} to Color3
				instance[propertyName] = Color3.fromRGB(propertyValue.R or propertyValue[1], propertyValue.G or propertyValue[2], propertyValue.B or propertyValue[3])
			elseif propertyName == "BrickColor" and type(propertyValue) == "string" then
				-- Convert string to BrickColor
				instance.BrickColor = BrickColor.new(propertyValue)
			elseif propertyName == "Material" and type(propertyValue) == "string" then
				-- Convert string to Enum.Material
				instance.Material = Enum.Material[propertyValue]
			else
				-- Direct assignment for simple properties
				instance[propertyName] = propertyValue
			end
		end)

		if not success then
			warn("[RoAssistant] Failed to set property", propertyName, "on", instance.Name, ":", error)
		else
			print("[RoAssistant] ✅ Set property:", propertyName, "=", propertyValue)
		end
	end
end

--[[
	Create a script instance based on type
]]
local function createScriptInstance(scriptData)
	local scriptType = scriptData.scriptType or "Script"
	local instanceType = scriptData.instanceType or scriptType
	local scriptInstance

	-- Check if this is a non-script instance (UI elements, folders, etc.)
	if scriptType == "Instance" then
		-- Create non-script instances (ScreenGui, Frame, RemoteEvent, etc.)
		local success, result = pcall(function()
			return Instance.new(instanceType)
		end)

		if success then
			scriptInstance = result
			scriptInstance.Name = scriptData.name or instanceType

			-- Set default properties based on instance type (only if custom properties not provided)
			if not scriptData.properties then
				if instanceType == "ScreenGui" then
					scriptInstance.ResetOnSpawn = false
				elseif instanceType == "Frame" then
					scriptInstance.Size = UDim2.new(0.5, 0, 0.5, 0)
					scriptInstance.Position = UDim2.new(0.25, 0, 0.25, 0)
					scriptInstance.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
				elseif instanceType == "TextButton" then
					scriptInstance.Size = UDim2.new(0.3, 0, 0.1, 0)
					scriptInstance.Position = UDim2.new(0.35, 0, 0.45, 0)
					scriptInstance.Text = scriptData.name or "Button"
					scriptInstance.TextScaled = true
				elseif instanceType == "TextLabel" then
					scriptInstance.Size = UDim2.new(0.8, 0, 0.1, 0)
					scriptInstance.Position = UDim2.new(0.1, 0, 0.1, 0)
					scriptInstance.Text = scriptData.name or "Label"
					scriptInstance.TextScaled = true
					scriptInstance.BackgroundTransparency = 1
				elseif instanceType == "Part" then
					-- Default Part properties
					scriptInstance.Size = Vector3.new(4, 1, 4)
					scriptInstance.Position = Vector3.new(0, 5, 0)
					scriptInstance.Anchored = true
					scriptInstance.BrickColor = BrickColor.new("Bright red")
					scriptInstance.Material = Enum.Material.SmoothPlastic
				elseif instanceType == "Model" then
					-- Models don't need default properties
				elseif instanceType == "Tool" then
					scriptInstance.CanBeDropped = true
					scriptInstance.RequiresHandle = true
				end
			end

			-- Apply custom properties if provided (overrides defaults)
			applyProperties(scriptInstance, scriptData.properties)
		else
			warn("[RoAssistant] Failed to create instance type:", instanceType)
			-- Fallback to Folder
			scriptInstance = Instance.new("Folder")
			scriptInstance.Name = scriptData.name or "GeneratedInstance"
		end

		return scriptInstance
	end

	-- Regular script instances
	if scriptType == "LocalScript" then
		scriptInstance = Instance.new("LocalScript")
	elseif scriptType == "ModuleScript" then
		scriptInstance = Instance.new("ModuleScript")
	else
		scriptInstance = Instance.new("Script")
	end

	scriptInstance.Name = scriptData.name or "GeneratedScript"
	scriptInstance.Source = scriptData.code or ""

	return scriptInstance
end

--[[
	Create parent hierarchy if it doesn't exist
	Example: "StarterGui.ShopUI.Frame" creates ShopUI (ScreenGui) if it doesn't exist
]]
local function ensureParentHierarchy(location)
	local parts = string.split(location, ".")
	if #parts <= 1 then
		-- No hierarchy needed, just get the service
		return getScriptParent(location)
	end

	-- Start with the root service
	local currentParent = getScriptParent(parts[1])

	-- Navigate/create nested structure
	for i = 2, #parts do
		local childName = parts[i]
		local child = currentParent:FindFirstChild(childName)

		if not child then
			-- Create a container (Folder or ScreenGui for StarterGui)
			if currentParent == game:GetService("StarterGui") and i == 2 then
				-- First level in StarterGui should be ScreenGui
				child = Instance.new("ScreenGui")
				child.Name = childName
				child.ResetOnSpawn = false
			else
				-- Everything else is a Folder
				child = Instance.new("Folder")
				child.Name = childName
			end
			child.Parent = currentParent
			print("[RoAssistant] 📁 Created hierarchy:", childName, "in", currentParent:GetFullName())
		end

		currentParent = child
	end

	return currentParent
end

--[[
	Find an existing instance by path
	Example: "Workspace.KillPart" or "ServerScriptService.MyScript"
]]
local function findInstanceByPath(path)
	local parts = string.split(path, ".")
	local current = nil

	-- Start with the root service
	if parts[1] == "Workspace" or parts[1] == "workspace" then
		current = workspace
	elseif parts[1] == "ServerScriptService" then
		current = game:GetService("ServerScriptService")
	elseif parts[1] == "StarterPlayer" then
		current = game:GetService("StarterPlayer")
	elseif parts[1] == "StarterGui" then
		current = game:GetService("StarterGui")
	elseif parts[1] == "ReplicatedStorage" then
		current = game:GetService("ReplicatedStorage")
	elseif parts[1] == "ServerStorage" then
		current = game:GetService("ServerStorage")
	elseif parts[1] == "StarterPack" then
		current = game:GetService("StarterPack")
	else
		return nil
	end

	-- Navigate the path
	for i = 2, #parts do
		local child = current:FindFirstChild(parts[i])
		if not child then
			return nil
		end
		current = child
	end

	return current
end

--[[
	Edit an existing instance (properties or script source)
]]
local function editInstance(editData)
	local success, result = pcall(function()
		local target = editData.target or editData.location
		if not target then
			error("No target specified for edit")
		end

		-- Find the instance
		local instance = findInstanceByPath(target)
		if not instance then
			error("Could not find instance at path: " .. target)
		end

		print("[RoAssistant] 📝 Editing:", instance:GetFullName())

		-- Update script source if provided
		if editData.code and instance:IsA("LuaSourceContainer") then
			instance.Source = editData.code
			print("[RoAssistant] ✅ Updated script source")
		end

		-- Apply properties if provided
		if editData.properties then
			applyProperties(instance, editData.properties)
		end

		-- Record undo history
		ChangeHistoryService:SetWaypoint("Edit RoAssistant Object: " .. instance.Name)

		return instance
	end)

	if success then
		sendStatus("success", "Object edited successfully", editData.target)
		print("[RoAssistant] ✅ Edit complete:", editData.target)
		return true, result
	else
		warn("[RoAssistant] ❌ Failed to edit object:", result)
		sendStatus("error", "Failed to edit object: " .. tostring(result), editData.target)
		return false, result
	end
end

--[[
	Insert a script into Roblox Studio
]]
local function insertScript(scriptData)
	local success, result = pcall(function()
		-- Create the script instance
		local scriptInstance = createScriptInstance(scriptData)

		-- Ensure parent hierarchy exists (creates containers if needed)
		local parent = ensureParentHierarchy(scriptData.location)

		-- Set the parent
		scriptInstance.Parent = parent

		-- Record undo history
		local actionName = scriptData.scriptType == "Instance"
			and "Insert RoAssistant Instance: " .. scriptInstance.Name
			or "Insert RoAssistant Script: " .. scriptInstance.Name

		ChangeHistoryService:SetWaypoint(actionName)

		print("[RoAssistant] ✅ Inserted:", scriptInstance.Name, "(" .. scriptInstance.ClassName .. ")")
		print("              Location:", parent:GetFullName())

		return scriptInstance
	end)

	if success then
		sendStatus("success", "Component inserted successfully", scriptData.name)
		return true, result
	else
		warn("[RoAssistant] ❌ Failed to insert component:", result)
		sendStatus("error", "Failed to insert component: " .. tostring(result), scriptData.name)
		return false, result
	end
end

--[[
	Handle incoming SSE messages
]]
local function handleMessage(message)
	print("[RoAssistant] 📥 Received message:", message)

	-- SSE messages come with "data: " prefix, strip it
	local jsonString = message
	if string.sub(message, 1, 6) == "data: " then
		jsonString = string.sub(message, 7) -- Remove "data: " prefix
	end

	-- Parse the JSON
	local success, data = pcall(function()
		return HttpService:JSONDecode(jsonString)
	end)

	if not success then
		warn("[RoAssistant] Failed to parse message:", message)
		return
	end

	-- Handle different message types
	if data.type == "script" then
		-- Insert the script or instance
		insertScript({
			name = data.name,
			code = data.code,
			scriptType = data.scriptType,
			location = data.location,
			instanceType = data.instanceType, -- Support for non-script instances
			properties = data.properties -- Custom properties support
		})
	elseif data.type == "edit" then
		-- Edit an existing object
		editInstance({
			target = data.target,
			code = data.code,
			properties = data.properties
		})
	elseif data.type == "ping" then
		-- Respond to ping
		sendStatus("pong", "Plugin is alive")
		lastHeartbeat = tick()
	elseif data.type == "disconnect" then
		-- Server requested disconnect
		print("[RoAssistant] Server requested disconnect")
		if sseClient then
			sseClient:Close()
		end
	else
		warn("[RoAssistant] Unknown message type:", data.type)
	end
end

--[[
	Connect to the website via SSE
]]
local function connect()
	if isConnected then
		print("[RoAssistant] Already connected")
		return
	end

	print("[RoAssistant] 🔄 Connecting to", Config.SSE_ENDPOINT)

	-- Clean up existing connection
	if messageConnection then
		messageConnection:Disconnect()
		messageConnection = nil
	end
	if closedConnection then
		closedConnection:Disconnect()
		closedConnection = nil
	end
	if sseClient then
		sseClient:Close()
		sseClient = nil
	end

	-- Create SSE client
	local success, result = pcall(function()
		sseClient = HttpService:CreateWebStreamClient(
			Enum.WebStreamClientType.SSE,
			{
				Url = Config.SSE_ENDPOINT,
				Method = "GET"
			}
		)

		-- Handle messages
		messageConnection = sseClient.MessageReceived:Connect(handleMessage)

		-- Handle disconnection
		closedConnection = sseClient.Closed:Connect(function()
			print("[RoAssistant] ⚠️ Connection closed")
			isConnected = false
			updateConnectionStatus()

			-- Auto-reconnect after delay
			task.wait(Config.RECONNECT_DELAY)
			reconnectAttempt = reconnectAttempt + 1

			if reconnectAttempt <= Config.MAX_RECONNECT_ATTEMPTS then
				print("[RoAssistant] 🔄 Reconnecting... Attempt", reconnectAttempt)
				connect()
			else
				warn("[RoAssistant] ❌ Max reconnect attempts reached")
				sendStatus("error", "Failed to connect after " .. Config.MAX_RECONNECT_ATTEMPTS .. " attempts")
			end
		end)

		isConnected = true
		reconnectAttempt = 0
		lastHeartbeat = tick()

		print("[RoAssistant] ✅ Connected successfully!")
		sendStatus("connected", "Plugin connected to RoAssistant")
		updateConnectionStatus()

		-- Send initial Explorer data in a separate task to avoid blocking
		task.spawn(function()
			task.wait(1) -- Wait 1 second for connection to stabilize
			print("[RoAssistant] 📂 Attempting to send Explorer data...")

			local explorerSuccess, explorerError = pcall(sendExplorerData)
			if not explorerSuccess then
				warn("[RoAssistant] ❌ Failed to send initial Explorer data:", explorerError)
			else
				print("[RoAssistant] ✅ Initial Explorer data sent")
			end
		end)

		-- Watch for Explorer changes
		if not explorerChangeConnection then
			explorerChangeConnection = game.DescendantAdded:Connect(function()
				sendExplorerData()
			end)

			game.DescendantRemoving:Connect(function()
				sendExplorerData()
			end)
		end
	end)

	if not success then
		warn("[RoAssistant] ❌ Connection failed:", result)
		isConnected = false
		updateConnectionStatus()
		sendStatus("error", "Connection failed: " .. tostring(result))

		-- Retry connection
		task.wait(Config.RECONNECT_DELAY)
		reconnectAttempt = reconnectAttempt + 1
		if reconnectAttempt <= Config.MAX_RECONNECT_ATTEMPTS then
			connect()
		end
	end
end

--[[
	Disconnect from the website
]]
local function disconnect()
	if not isConnected then
		return
	end

	print("[RoAssistant] 🔌 Disconnecting...")

	if messageConnection then
		messageConnection:Disconnect()
		messageConnection = nil
	end
	if closedConnection then
		closedConnection:Disconnect()
		closedConnection = nil
	end
	if sseClient then
		sseClient:Close()
		sseClient = nil
	end

	isConnected = false
	updateConnectionStatus()
	sendStatus("disconnected", "Plugin disconnected")
end

--[[
	Update the connection status UI
]]
function updateConnectionStatus()
	if statusWidget and statusWidget.Enabled then
		local statusText = statusWidget:FindFirstChild("Frame"):FindFirstChild("StatusText")
		if statusText then
			if isConnected then
				statusText.Text = "🟢 Connected to RoAssistant"
				statusText.TextColor3 = Color3.fromRGB(87, 242, 135)
			else
				statusText.Text = "🔴 Disconnected"
				statusText.TextColor3 = Color3.fromRGB(242, 87, 87)
			end
		end
	end
end

--[[
	Create status widget UI
]]
local function createStatusWidget()
	local widgetInfo = DockWidgetPluginGuiInfo.new(
		Enum.InitialDockState.Float,
		false, -- Initially disabled
		false, -- Override enabled state
		400, -- Width
		300, -- Height
		350, -- Min width
		250  -- Min height
	)

	statusWidget = plugin:CreateDockWidgetPluginGui("RoAssistantStatus", widgetInfo)
	statusWidget.Title = "RoAssistant Connection"

	-- Create main frame
	local frame = Instance.new("Frame")
	frame.Size = UDim2.new(1, 0, 1, 0)
	frame.BackgroundColor3 = Color3.fromRGB(30, 33, 36)
	frame.BorderSizePixel = 0
	frame.Parent = statusWidget

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 20)
	padding.PaddingRight = UDim.new(0, 20)
	padding.PaddingTop = UDim.new(0, 20)
	padding.PaddingBottom = UDim.new(0, 20)
	padding.Parent = frame

	-- Title
	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.Size = UDim2.new(1, 0, 0, 40)
	title.Position = UDim2.new(0, 0, 0, 0)
	title.BackgroundTransparency = 1
	title.Text = "🤖 RoAssistant Studio Plugin"
	title.TextColor3 = Color3.fromRGB(255, 255, 255)
	title.Font = Enum.Font.SourceSansBold
	title.TextSize = 20
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = frame

	-- Status text
	local statusText = Instance.new("TextLabel")
	statusText.Name = "StatusText"
	statusText.Size = UDim2.new(1, 0, 0, 30)
	statusText.Position = UDim2.new(0, 0, 0, 50)
	statusText.BackgroundTransparency = 1
	statusText.Text = "🔴 Disconnected"
	statusText.TextColor3 = Color3.fromRGB(242, 87, 87)
	statusText.Font = Enum.Font.SourceSansSemibold
	statusText.TextSize = 16
	statusText.TextXAlignment = Enum.TextXAlignment.Left
	statusText.Parent = frame

	-- Info text
	local infoText = Instance.new("TextLabel")
	infoText.Name = "InfoText"
	infoText.Size = UDim2.new(1, 0, 0, 100)
	infoText.Position = UDim2.new(0, 0, 0, 90)
	infoText.BackgroundTransparency = 1
	infoText.Text = string.format(
		"Website: %s\n\nThis plugin connects your Roblox Studio to RoAssistant.\n\nGenerate scripts on the website and they'll appear here automatically!",
		Config.WEBSITE_URL
	)
	infoText.TextColor3 = Color3.fromRGB(180, 180, 180)
	infoText.Font = Enum.Font.SourceSans
	infoText.TextSize = 14
	infoText.TextXAlignment = Enum.TextXAlignment.Left
	infoText.TextYAlignment = Enum.TextYAlignment.Top
	infoText.TextWrapped = true
	infoText.Parent = frame

	-- Connect button
	local connectBtn = Instance.new("TextButton")
	connectBtn.Name = "ConnectButton"
	connectBtn.Size = UDim2.new(0, 150, 0, 40)
	connectBtn.Position = UDim2.new(0, 0, 1, -50)
	connectBtn.BackgroundColor3 = Color3.fromRGB(88, 166, 255)
	connectBtn.BorderSizePixel = 0
	connectBtn.Text = "Connect"
	connectBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
	connectBtn.Font = Enum.Font.SourceSansBold
	connectBtn.TextSize = 16
	connectBtn.Parent = frame

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = connectBtn

	connectBtn.MouseButton1Click:Connect(function()
		if isConnected then
			disconnect()
			connectBtn.Text = "Connect"
		else
			connect()
			connectBtn.Text = "Disconnect"
		end
	end)
end

-- Create status widget
createStatusWidget()

-- Connection button handler
connectionButton.Click:Connect(function()
	if statusWidget then
		statusWidget.Enabled = not statusWidget.Enabled
		if statusWidget.Enabled then
			updateConnectionStatus()
		end
	end
end)

-- Auto-connect on startup
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("🤖 RoAssistant Studio Plugin Loaded!")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("📡 Website:", Config.WEBSITE_URL)
print("🔗 SSE Endpoint:", Config.SSE_ENDPOINT)
print("")

if Config.AUTO_CONNECT then
	print("🔄 Auto-connecting...")
	task.wait(1) -- Give Studio time to initialize
	connect()
else
	print("⏸️  Auto-connect disabled. Click the toolbar button to connect.")
end

print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
