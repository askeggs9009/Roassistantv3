--[[
	RoAssistant Plugin Configuration - DEVELOPMENT VERSION

	This is for local development and testing.
	DO NOT use this version for marketplace upload!
]]

local Config = {}

-- ========================================
-- Website Configuration - LOCAL DEVELOPMENT
-- ========================================

-- Local development server
Config.WEBSITE_URL = "http://localhost:3000"

-- SSE endpoint for receiving commands
Config.SSE_ENDPOINT = "http://localhost:3000/roblox/stream"

-- Status endpoint for sending updates
Config.STATUS_ENDPOINT = "http://localhost:3000/roblox/status"

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

-- Enable debug logging (useful for development)
Config.DEBUG = true

return Config
