# 🤖 Roblox MCP Integration

**Connect Claude AI directly to Roblox Studio!** Generate Luau scripts using natural language and have them automatically appear in your Roblox projects.

---

## ✨ Features

- 🎯 **Natural Language to Luau** - Describe what you want, AI generates the code
- ⚡ **Real-time Integration** - Scripts appear in Roblox Studio within seconds
- 🔧 **Smart Placement** - Scripts automatically placed in the correct service
- 🎨 **Multiple Script Types** - Supports Server, Local, and Module scripts
- 📝 **High-Quality Code** - AI-generated scripts with comments and best practices
- 🔄 **Script History** - View and manage all generated scripts
- 🛡️ **Safe Integration** - Review scripts before they're inserted

---

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **Roblox Studio** (latest version)
- **Claude Code** or any MCP-compatible client
- **API Key** for Anthropic Claude or OpenAI GPT-4

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd roblox-mcp
npm install
```

### 2. Configure Environment

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_api_key_here
```

Get your API key:
- **Anthropic Claude**: https://console.anthropic.com/
- **OpenAI**: https://platform.openai.com/api-keys

### 3. Start the Servers

**Option A: Run both servers together (recommended)**

```bash
npm run both
```

**Option B: Run servers separately**

Terminal 1 - Bridge Server:
```bash
npm run bridge
```

Terminal 2 - MCP Server:
```bash
npm start
```

### 4. Install Roblox Plugin

1. Open Roblox Studio
2. Click on **Plugins** tab
3. Click **Folder** button (or press Alt+P)
4. Copy `plugin/RobloxMCPPlugin.lua` to the opened folder
5. Restart Roblox Studio
6. You should see **MCP Assistant** toolbar buttons

### 5. Configure Claude Code

**Add the MCP server to Claude Code:**

For **Claude Code CLI**:
```bash
claude mcp add roblox --path ./roblox-mcp/server.js
```

Or manually add to your `.claude/mcp_config.json`:

```json
{
  "mcpServers": {
    "roblox": {
      "command": "node",
      "args": ["server.js"],
      "cwd": "./roblox-mcp"
    }
  }
}
```

---

## 🎮 Usage

### Basic Example

In Claude Code, simply ask:

```
Create a script that makes parts fall from the sky randomly
```

Claude will:
1. Generate high-quality Luau code
2. Send it to the bridge server
3. The Roblox plugin will receive it
4. The script appears in ServerScriptService

### Advanced Examples

**Natural Disasters Script:**
```
Make a script that causes natural disasters:
- Random tornados that spin parts
- Earthquakes that shake the terrain
- Meteor showers with explosions
Place it in ServerScriptService
```

**Character Trails:**
```
Create a LocalScript that adds a rainbow trail effect behind the player's character
Place it in StarterPlayer.StarterCharacterScripts
```

**Module Script:**
```
Create a ModuleScript for player data management with:
- Save/load player stats
- Leaderboard integration
- DataStore best practices
Place it in ReplicatedStorage
```

---

## 🛠️ Available MCP Tools

### `generate_roblox_script`

Generate a Roblox Luau script from natural language.

**Parameters:**
- `description` (required): What the script should do
- `scriptType` (optional): "Server", "Local", or "Module" (default: "Server")
- `location` (optional): Where to place it (default: "ServerScriptService")
- `aiProvider` (optional): "anthropic" or "openai" (default: "anthropic")
- `sendToStudio` (optional): Auto-send to Studio (default: true)

**Example:**
```
Generate a script that creates a day/night cycle with realistic lighting changes
```

### `send_to_roblox_studio`

Send a custom Luau script to Roblox Studio.

**Parameters:**
- `code` (required): The Luau code
- `name` (required): Script name
- `location` (optional): Where to place it
- `scriptType` (optional): Script type

### `list_recent_scripts`

View recently generated scripts.

**Parameters:**
- `limit` (optional): Number of scripts to show (default: 10)

---

## 🎯 Script Placement Locations

Common locations you can use:

| Location | Description |
|----------|-------------|
| `ServerScriptService` | Server-side scripts (default) |
| `StarterPlayer.StarterCharacterScripts` | Scripts that run when character spawns |
| `StarterPlayer.StarterPlayerScripts` | Scripts that run when player joins |
| `ReplicatedStorage` | Module scripts accessible by client/server |
| `Workspace` | Scripts attached to workspace objects |

You can also use nested paths:
```
StarterPlayer.StarterCharacterScripts.Animations
```

---

## ⚙️ Configuration

### Bridge Server Settings

Edit `.env` to customize the bridge server:

```env
BRIDGE_PORT=3001              # Port for bridge server
BRIDGE_URL=http://localhost:3001  # Bridge URL
```

### Roblox Plugin Settings

Edit `plugin/RobloxMCPPlugin.lua` to customize:

```lua
local BRIDGE_URL = "http://localhost:3001"  -- Bridge server URL
local POLL_INTERVAL = 3  -- How often to check for new scripts (seconds)
local AUTO_INSERT_ENABLED = true  -- Auto-insert scripts on startup
```

### AI Model Selection

Choose different AI models by editing `.env`:

```env
# For Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929

# For OpenAI
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4
```

---

## 🔧 Troubleshooting

### "Failed to connect to bridge server"

**Solution:**
1. Make sure the bridge server is running: `npm run bridge`
2. Check the bridge URL in Roblox plugin matches your `.env` file
3. Ensure port 3001 is not blocked by firewall

### "No AI provider configured"

**Solution:**
1. Check your `.env` file has a valid API key
2. Make sure the API key is correct (test it with curl)
3. Restart the MCP server after changing `.env`

### "Script not appearing in Roblox Studio"

**Solution:**
1. Check the plugin is loaded (see toolbar buttons)
2. Enable auto-insert by clicking the toolbar button
3. Check the Output window for errors
4. Verify the bridge server has the script: `curl http://localhost:3001/api/scripts/pending`

### "HttpService is not allowed"

**Solution:**
1. In Roblox Studio, go to Home → Game Settings
2. Click on Security
3. Enable "Allow HTTP Requests"
4. Click Save

---

## 📊 API Reference

### Bridge Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scripts` | POST | Receive script from MCP |
| `/api/scripts/pending` | GET | Get all pending scripts |
| `/api/scripts/:id/delivered` | POST | Mark script as delivered |
| `/api/scripts/:id` | DELETE | Delete pending script |
| `/api/scripts/history` | GET | Get delivery history |
| `/api/scripts/clear` | POST | Clear all pending scripts |
| `/api/stats` | GET | Get server statistics |
| `/api/health` | GET | Health check |

---

## 🔐 Security Notes

1. **Local Development Only**: The bridge server runs on localhost by default
2. **API Keys**: Never commit your `.env` file to version control
3. **HttpService**: Only enable when using the plugin
4. **Code Review**: Always review generated scripts before running in production

---

## 🤝 Contributing

Found a bug or want to contribute? Here's how:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📝 Examples

### Example 1: Basic Script Generation

**Prompt:**
```
Create a script that prints "Hello World" every 5 seconds
```

**Result:**
```lua
-- Script Type: Server
-- Prints "Hello World" every 5 seconds

while true do
	print("Hello World")
	task.wait(5)
end
```

### Example 2: Complex Game Mechanic

**Prompt:**
```
Create a coin collection system with:
- Coins spawn randomly in the workspace
- Players collect coins by touching them
- Show coin count on leaderboard
- Coins respawn after 30 seconds
```

**Result:**
A complete, production-ready script with:
- Leaderboard integration
- Coin spawning logic
- Touch detection
- Respawn system
- Proper error handling

### Example 3: Module Script

**Prompt:**
```
Create a ModuleScript for player data that includes:
- Save player coins and level
- Load data when player joins
- Auto-save every 60 seconds
- Handle DataStore errors gracefully
```

**Result:**
A robust DataStore module with all the features and best practices.

---

## 📚 Resources

- [Roblox Luau Documentation](https://create.roblox.com/docs/luau)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude AI Documentation](https://docs.anthropic.com/)
- [Roblox Creator Hub](https://create.roblox.com/)

---

## 📄 License

MIT License - Feel free to use this in your projects!

---

## 💡 Tips

- **Be Specific**: The more detailed your description, the better the generated code
- **Mention Location**: Always specify where the script should go
- **Script Type**: Specify if you need Local, Server, or Module scripts
- **Code Style**: Ask for specific patterns (e.g., "use modern Luau syntax")
- **Error Handling**: Request error handling for production scripts

---

## 🎉 What's Next?

- 🔄 Real-time collaboration features
- 📦 Script templates library
- 🎨 Custom script styles/patterns
- 🔍 Code analysis and optimization suggestions
- 🌐 Remote bridge server support
- 📱 Mobile plugin support

---

**Made with ❤️ for the Roblox developer community**

Star ⭐ this project if you find it useful!
