# 🎮 RoAssistant Roblox Studio Plugin

**Connect your RoAssistant website directly to Roblox Studio!**

Generate Luau scripts on your website and have them automatically appear in Roblox Studio in real-time.

---

## ✨ Features

- ⚡ **Real-time Communication** - Uses Server-Sent Events for instant script delivery
- 🔄 **Bidirectional** - Plugin sends status updates back to website
- 🎯 **Smart Detection** - Automatically detects Lua/Luau code
- 📍 **Auto-Placement** - Scripts go to the right location (ServerScriptService, etc.)
- 🔌 **Auto-Reconnect** - Handles connection drops gracefully
- 🎨 **Connection Status** - Live indicator in website header

---

## 🚀 Quick Setup

### Step 1: Install the Roblox Plugin

**For End Users (Download from Roblox Marketplace)**

1. Go to the **Roblox Marketplace**
2. Search for **"RoAssistant Studio Plugin"**
3. Click **Install**
4. Restart Roblox Studio if prompted

**For Local Development/Testing**

1. **Open Roblox Studio**
2. **Open the Plugins Folder**: Press `Alt + P` OR Click **Plugins** → **Folder**
3. **Copy Files**:
   - Copy `StudioPlugin.lua` to the plugins folder
   - Copy `Config.Development.lua` to the same folder
   - **Rename** `Config.Development.lua` to `Config.lua`
4. **Restart Roblox Studio**

**Note:** For testing with localhost, use `Config.Development.lua`. For production, use the regular `Config.lua` which points to www.roassistant.me

5. **Enable HTTP Requests**:
   - Home → **Game Settings**
   - Click **Security** tab
   - Enable "**Allow HTTP Requests**"
   - Click **Save**

6. **Check Plugin Loaded**:
   - Look for **RoAssistant** toolbar buttons
   - Check the Output window for the startup message

---

### Step 2: Visit RoAssistant Website

1. Go to **https://www.roassistant.me**
2. Sign in or create an account
3. You should see the connection status indicator in the header

---

### Step 3: Connect the Plugin

The plugin **auto-connects** to RoAssistant when it loads!

**Check Connection**:
1. Look at the **website header** - you should see a **green dot** next to "Roblox Studio ✓"
2. In Roblox Studio, click the **RoAssistant** toolbar button to view connection status
3. Check the Output window for "✅ Connected successfully!"

**Troubleshooting**:
- Make sure **HTTP Requests** are enabled (Game Settings → Security)
- Check your internet connection
- Try clicking "Connect" in the plugin status window

---

## 🎯 How to Use

### From Your Website

1. Go to **https://www.roassistant.me**

2. Ask the AI to generate a script:
   ```
   Create a script that makes parts rain from the sky
   ```

3. When the AI responds with Lua code, you'll see a **"Send to Roblox"** button

4. Click the button!

5. The script **instantly appears** in Roblox Studio! 🎉

---

## 📊 Features Explained

### Connection Status Indicator

- **Green dot** = Connected to Roblox Studio
- **Red dot** = Disconnected
- Click the status to manually refresh

### Auto-Detection

The system automatically detects Lua/Luau code by looking for:
- `lua` or `luau` language tags
- Keywords like `game:GetService`, `script.Parent`, `function...end`

### Script Placement

Scripts are placed in:
- **ServerScriptService** (default)
- **StarterPlayer.StarterCharacterScripts**
- **ReplicatedStorage**
- Or any custom location you specify!

---

## ⚙️ Configuration

Edit `Config.lua` to customize:

```lua
-- Your website URL
Config.WEBSITE_URL = "http://localhost:3000"

-- Auto-connect on plugin load
Config.AUTO_CONNECT = true

-- Reconnect settings
Config.RECONNECT_DELAY = 5  -- seconds
Config.MAX_RECONNECT_ATTEMPTS = 10
```

---

## 🔧 Troubleshooting

### "Failed to connect to website"

**Solutions**:
1. Make sure your website server is running (`npm start`)
2. Check that it's on `http://localhost:3000`
3. Update `Config.lua` if using a different port
4. Check the Output window for errors

### "HttpService is not allowed"

**Solution**:
1. Home → Game Settings
2. Security tab
3. ✅ Enable "Allow HTTP Requests"
4. Save

### "Plugin not showing up"

**Solutions**:
1. Make sure both `StudioPlugin.lua` AND `Config.lua` are in the plugins folder
2. Restart Roblox Studio
3. Check the Output window for errors

### "Connection keeps dropping"

**Solutions**:
1. Check your firewall isn't blocking localhost connections
2. Make sure the server is stable and running
3. Increase `RECONNECT_DELAY` in Config.lua

---

## 📡 How It Works

```
┌──────────────┐
│   Website    │ User asks AI for script
│              │
│ "Create a    │───────┐
│  script..."  │       │
└──────────────┘       │
                       ▼
                 AI generates code
                       │
                       ▼
           ┌──────────────────────┐
           │  Express Server      │
           │  (auth-server.js)    │
           │                      │
           │  SSE Endpoint:       │
           │  /roblox/stream      │
           └──────────┬───────────┘
                      │ Server-Sent Event
                      ▼
           ┌──────────────────────┐
           │  Roblox Plugin       │
           │  (WebStreamClient)   │
           │                      │
           │  Receives command    │
           │  Creates script      │
           │  Inserts in Studio   │
           └──────────┬───────────┘
                      │ Status update
                      ▼
           ┌──────────────────────┐
           │  Express Server      │
           │  POST /roblox/status │
           └──────────────────────┘
```

---

## 🎨 Customization

### Change Default Script Location

Edit `Config.lua`:
```lua
Config.DEFAULT_LOCATION = "ReplicatedStorage"
```

### Disable Auto-Connect

Edit `Config.lua`:
```lua
Config.AUTO_CONNECT = false
```

Then manually click "Connect" when you want to use it.

### Change Website URL/Port

If your website runs on a different port:

Edit `Config.lua`:
```lua
Config.WEBSITE_URL = "http://localhost:5000"
Config.SSE_ENDPOINT = "http://localhost:5000/roblox/stream"
Config.STATUS_ENDPOINT = "http://localhost:5000/roblox/status"
```

---

## 🔐 Security Notes

- The plugin only connects to `localhost` by default
- Only works with your local development server
- HttpService must be manually enabled in each game
- Review all scripts before running in production

---

## 🐛 Known Limitations

1. **Studio Only** - SSE only works in Studio, not published games
2. **Localhost Only** - Designed for local development
3. **HTTP Only** - No HTTPS support for localhost
4. **Manual HTTP Enable** - Must enable HttpService for each game

---

## 💡 Tips

1. **Keep Output Window Open** - See connection status and script insertions
2. **Check Connection** - Click the toolbar button to view connection status
3. **Review Scripts** - Always review AI-generated code before using
4. **Name Your Scripts** - Mention script names in your prompts for better naming

---

## 📝 Example Prompts

Try these on your website:

```
Create a script that makes the player jump higher
```

```
Make a LocalScript that adds a rainbow trail to the character
Place it in StarterPlayer.StarterCharacterScripts
```

```
Create a ModuleScript for player data management
Place it in ReplicatedStorage
```

---

## 🔄 Updates

### Version 1.0.0
- Initial release
- Server-Sent Events integration
- Auto-reconnection
- Connection status indicator
- Smart Lua detection

---

## 📞 Support

Having issues? Check:
1. Output window in Roblox Studio
2. Browser console (F12) on website
3. Server logs in terminal

---

## 📄 License

MIT License - Use freely in your projects!

---

**Made with ❤️ for Roblox developers**

Enjoy creating with RoAssistant! 🚀
