--[[
	RoAssistant Plugin Configuration

	Change these settings to match your setup
]]

local Config = {}

-- ========================================
-- Website Configuration
-- ========================================

-- RoAssistant Production Website
Config.WEBSITE_URL = "https://www.roassistant.me"

-- SSE endpoint for receiving commands from RoAssistant
Config.SSE_ENDPOINT = "https://www.roassistant.me/roblox/stream"

-- Status endpoint for sending updates to RoAssistant
Config.STATUS_ENDPOINT = "https://www.roassistant.me/roblox/status"

-- For local development, uncomment these lines:
-- Config.WEBSITE_URL = "http://localhost:3000"
-- Config.SSE_ENDPOINT = "http://localhost:3000/roblox/stream"
-- Config.STATUS_ENDPOINT = "http://localhost:3000/roblox/status"

-- ========================================
-- Connection Settings
-- ========================================

-- Auto-connect on plugin load
Config.AUTO_CONNECT = true

-- Reconnection settings
Config.RECONNECT_DELAY = 5  -- seconds
Config.MAX_RECONNECT_ATTEMPTS = 10

-- Heartbeat interval (for keeping connection alive)
Config.HEARTBEAT_INTERVAL = 20  -- seconds

-- ========================================
-- Script Insertion Settings
-- ========================================

-- Default script location if not specified
Config.DEFAULT_LOCATION = "ServerScriptService"

-- Show notifications when scripts are inserted
Config.SHOW_NOTIFICATIONS = true

-- ========================================
-- Debug Settings
-- ========================================

-- Enable debug logging
Config.DEBUG = true

return Config
