--[[
	RoAssistant Studio Plugin
	Connects Roblox Studio to your RoAssistant website

	Features:
	- Real-time connection via Server-Sent Events
	- Automatic script insertion
	- Status updates to website
	- Connection status UI

	Version: 1.0.0
]]

-- Import configuration
local Config = require(script.Config)

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

			-- For UI elements, set some default properties
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
			end
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
			instanceType = data.instanceType -- Support for non-script instances
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
