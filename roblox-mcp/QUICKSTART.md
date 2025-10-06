# 🚀 Quick Start Guide

Get up and running with Roblox MCP in 5 minutes!

---

## Step 1: Install (2 minutes)

### Windows:
```bash
cd roblox-mcp
install.bat
```

### Mac/Linux:
```bash
cd roblox-mcp
chmod +x install.sh
./install.sh
```

---

## Step 2: Configure API Key (1 minute)

1. Open `.env` file
2. Add your API key:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

Get your key: https://console.anthropic.com/

---

## Step 3: Start Servers (30 seconds)

```bash
npm run both
```

You should see:
```
🌉 Roblox MCP Bridge Server
✅ Server running on port 3001

🚀 Starting Roblox MCP Server...
✅ AI Provider configured: Anthropic
📡 MCP Server ready!
```

---

## Step 4: Install Roblox Plugin (1 minute)

1. Open Roblox Studio
2. Press `Alt + P` (or Plugins → Folder)
3. Copy `plugin/RobloxMCPPlugin.lua` to the opened folder
4. Restart Roblox Studio
5. Enable HTTP Requests:
   - Home → Game Settings
   - Security tab
   - ✅ Allow HTTP Requests
   - Save

---

## Step 5: Configure Claude Code (30 seconds)

Run this command:

```bash
claude mcp add roblox --path ./roblox-mcp/server.js
```

Or manually edit `.claude/mcp_config.json`:

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

## ✅ Test It!

In Claude Code, type:

```
Create a simple script that prints "Hello from Claude!" every 3 seconds
```

Within seconds, the script should appear in Roblox Studio's ServerScriptService!

---

## 🎯 What You Can Do Now

Try these examples:

### Example 1: Particle Effects
```
Create a script that spawns colorful particle effects around the player's character
```

### Example 2: Random Obstacles
```
Make a script that creates random obstacles that fall from the sky every 5 seconds
```

### Example 3: GUI System
```
Create a LocalScript that shows a custom GUI with player stats (health, coins, level)
Place it in StarterPlayer.StarterPlayerScripts
```

### Example 4: Data Module
```
Create a ModuleScript for managing player inventory with save/load functions
Place it in ReplicatedStorage
```

---

## 🔧 Common Issues

### "Failed to connect to bridge server"
- Make sure `npm run both` is running
- Check that port 3001 is not blocked

### "HttpService is not allowed"
- Enable HTTP requests in Game Settings → Security

### "No AI provider configured"
- Add your API key to `.env` file
- Restart the servers

---

## 📚 Next Steps

- Read the full [README.md](README.md) for advanced features
- Experiment with different script types (Local, Server, Module)
- Try complex multi-feature scripts
- Check out the script history feature

---

**Happy coding! 🎮**
