# 🏗️ Architecture Overview

This document explains how the Roblox MCP integration works under the hood.

---

## 📊 System Architecture

```
┌─────────────────┐
│   User          │
│                 │
│ "Create a       │
│  script that    │
│  does X"        │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│          Claude Code (MCP Client)           │
│                                             │
│  - Receives user input                      │
│  - Communicates with MCP servers            │
└────────┬────────────────────────────────────┘
         │ stdio
         │ (Model Context Protocol)
         ▼
┌─────────────────────────────────────────────┐
│         MCP Server (server.js)              │
│                                             │
│  Tools:                                     │
│  • generate_roblox_script                   │
│  • send_to_roblox_studio                    │
│  • list_recent_scripts                      │
│                                             │
│  - Generates Luau code using AI             │
│  - Manages script history                   │
└────────┬────────────────────────────────────┘
         │ HTTP POST
         │ /api/scripts
         ▼
┌─────────────────────────────────────────────┐
│      Bridge Server (bridge-server.js)       │
│                                             │
│  - HTTP REST API                            │
│  - Stores pending scripts in memory         │
│  - Tracks delivered scripts                 │
│  - Provides script queue                    │
└────────┬────────────────────────────────────┘
         │ HTTP GET
         │ /api/scripts/pending
         │ (Polling every 3 seconds)
         ▼
┌─────────────────────────────────────────────┐
│   Roblox Studio Plugin (.lua)               │
│                                             │
│  - Polls bridge server for new scripts      │
│  - Creates script instances                 │
│  - Places scripts in correct locations      │
│  - Marks scripts as delivered               │
│  - Shows UI notifications                   │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│         Roblox Studio / Game                │
│                                             │
│  Script appears in:                         │
│  • ServerScriptService                      │
│  • StarterPlayer                            │
│  • ReplicatedStorage                        │
│  • etc.                                     │
└─────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Script Generation Flow

1. **User Request**
   - User asks Claude: *"Create a script that spawns coins"*

2. **MCP Tool Call**
   - Claude Code calls `generate_roblox_script` tool
   - Parameters: `{ description, scriptType, location }`

3. **AI Generation**
   - MCP server sends prompt to AI (Claude/GPT-4)
   - AI generates high-quality Luau code
   - Code is cleaned and formatted

4. **Bridge Delivery**
   - MCP server sends script to bridge via HTTP POST
   - Bridge stores in pending queue with metadata:
     ```json
     {
       "id": "script_1234567890_abc",
       "name": "CoinSpawner",
       "code": "-- Script code here",
       "scriptType": "Server",
       "location": "ServerScriptService",
       "timestamp": "2025-01-06T12:00:00Z"
     }
     ```

5. **Roblox Plugin Polling**
   - Plugin polls `/api/scripts/pending` every 3 seconds
   - Receives array of pending scripts

6. **Script Insertion**
   - Plugin creates appropriate script instance (Script/LocalScript/ModuleScript)
   - Sets the source code
   - Places in correct parent location
   - Records undo waypoint

7. **Delivery Confirmation**
   - Plugin sends POST to `/api/scripts/:id/delivered`
   - Bridge moves script from pending to delivered queue

---

## 🧩 Component Details

### MCP Server (server.js)

**Responsibilities:**
- Implement MCP protocol (stdio transport)
- Expose tools to Claude Code
- Generate Luau code using AI
- Send scripts to bridge server
- Maintain script history

**Key Technologies:**
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@anthropic-ai/sdk` - Claude AI integration
- `openai` - GPT-4 integration
- `dotenv` - Environment configuration

**API Surface:**
```javascript
// MCP Tools
- generate_roblox_script(description, scriptType, location, aiProvider)
- send_to_roblox_studio(code, name, location, scriptType)
- list_recent_scripts(limit)
```

---

### Bridge Server (bridge-server.js)

**Responsibilities:**
- Receive scripts from MCP server
- Store pending scripts in memory
- Serve scripts to Roblox plugin
- Track delivery status
- Provide statistics and history

**Key Technologies:**
- `express` - HTTP server framework
- `cors` - Enable cross-origin requests
- In-memory storage (upgradeable to Redis/Database)

**API Endpoints:**
```javascript
POST   /api/scripts              // Receive from MCP
GET    /api/scripts/pending      // Poll by plugin
POST   /api/scripts/:id/delivered // Mark delivered
DELETE /api/scripts/:id          // Delete pending
GET    /api/scripts/history      // View history
GET    /api/stats                // Server stats
GET    /api/health               // Health check
POST   /api/scripts/clear        // Clear queue
```

**Data Structures:**
```javascript
// Pending Scripts Queue
pendingScripts = [
  {
    id: "script_xxx",
    name: "ScriptName",
    code: "-- Luau code",
    scriptType: "Server",
    location: "ServerScriptService",
    timestamp: "ISO 8601",
    status: "pending"
  }
]

// Delivered Scripts History
deliveredScripts = [
  {
    ...scriptData,
    status: "delivered",
    deliveredAt: "ISO 8601"
  }
]
```

---

### Roblox Plugin (RobloxMCPPlugin.lua)

**Responsibilities:**
- Poll bridge server for new scripts
- Create Roblox script instances
- Navigate to correct parent locations
- Handle different script types
- Provide user interface
- Show notifications

**Key Roblox Services:**
- `HttpService` - HTTP requests to bridge
- `ServerScriptService` - Default script location
- `ChangeHistoryService` - Undo/redo support
- `Plugin API` - Toolbar and UI

**State Machine:**
```
┌─────────────┐
│   Polling   │ ──────────┐
└──────┬──────┘           │
       │ Every 3s         │ No scripts
       ▼                  │
┌─────────────┐           │
│   Fetch     │ ──────────┘
│   Pending   │
└──────┬──────┘
       │ Scripts found
       ▼
┌─────────────┐
│   Create    │
│   Instance  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Insert    │
│   to Studio │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    Mark     │
│  Delivered  │
└─────────────┘
```

---

## 🔒 Security Considerations

### 1. Local-Only Communication
- Bridge server runs on `localhost:3001`
- No external network exposure by default
- Plugin can only connect to local bridge

### 2. API Key Protection
- Keys stored in `.env` file
- Never committed to version control
- Used only by MCP server (Node.js)

### 3. Code Review
- All generated code is visible before insertion
- User can disable auto-insert
- Undo support via ChangeHistoryService

### 4. HttpService Security
- Only enabled when needed
- Can be disabled in Roblox settings
- Limited to specified endpoints

---

## 📈 Scalability

### Current Implementation
- **In-memory storage**: Fast but not persistent
- **Single server**: One bridge server instance
- **Local only**: No remote access

### Scaling Options

**1. Database Backend**
```javascript
// Replace in-memory arrays with:
- MongoDB for script storage
- Redis for pending queue
- PostgreSQL for history
```

**2. Remote Bridge Server**
```javascript
// Deploy bridge to cloud:
- Heroku, Railway, or similar
- Update BRIDGE_URL in .env
- Update plugin URL
- Add authentication
```

**3. Multiple Users**
```javascript
// Add user identification:
- User tokens
- Separate queues per user
- User-specific history
```

**4. WebSocket Transport**
```javascript
// Replace polling with WebSockets:
- Real-time push notifications
- Bidirectional communication
- Lower latency
```

---

## 🎯 Design Decisions

### Why HTTP Bridge Instead of Direct Connection?

**Problem**: Roblox Studio plugins can't act as HTTP servers or receive connections.

**Solution**: Bridge server acts as intermediary:
- ✅ MCP server can POST to bridge (HTTP client)
- ✅ Plugin can GET from bridge (HTTP client)
- ✅ No firewall issues
- ✅ Simple architecture

**Alternatives Considered**:
1. **File-based** - Requires file system access, platform-specific
2. **Database-direct** - Requires DB on user machine
3. **Cloud service** - Requires internet, privacy concerns

### Why Polling Instead of WebSockets?

**Reasons**:
- Roblox HttpService doesn't support WebSockets
- Polling is simple and reliable
- 3-second interval is acceptable latency
- No persistent connection needed

### Why Separate MCP and Bridge Servers?

**Separation of Concerns**:
- MCP server: AI logic, protocol implementation
- Bridge server: Simple HTTP API, script queue

**Benefits**:
- Can run bridge remotely in future
- Can test components independently
- Clear responsibilities
- Easy to debug

---

## 🧪 Testing

### Unit Testing
```bash
# Test MCP server tools
npm test

# Test bridge API endpoints
curl http://localhost:3001/api/health
```

### Integration Testing
```bash
# 1. Start servers
npm run both

# 2. Test script generation
curl -X POST http://localhost:3001/api/scripts \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","code":"print(\"test\")","scriptType":"Server"}'

# 3. Check pending
curl http://localhost:3001/api/scripts/pending

# 4. Test plugin (in Roblox Studio)
# - Enable plugin
# - Check Output for polling logs
# - Verify script appears
```

---

## 🚀 Future Enhancements

### Planned Features
- [ ] Script templates library
- [ ] Code analysis and suggestions
- [ ] Multi-user collaboration
- [ ] Remote bridge server option
- [ ] Script versioning
- [ ] Custom AI prompts/styles
- [ ] Batch script generation
- [ ] Script dependencies resolution

### Potential Improvements
- WebSocket support (when Roblox adds it)
- Persistent storage option
- GUI for bridge server
- Browser-based control panel
- Integration with Roblox Cloud API
- Script marketplace/sharing

---

## 📝 Contributing

When modifying the architecture:

1. Update this document
2. Update README.md if user-facing
3. Test all components
4. Document breaking changes
5. Update version numbers

---

**Questions?** Check the [README.md](README.md) or open an issue!
