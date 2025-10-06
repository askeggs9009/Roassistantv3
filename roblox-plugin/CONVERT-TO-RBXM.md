# 📦 Convert Plugin to .rbxm for Marketplace Upload

Follow these steps to convert your `.lua` files into an `.rbxm` plugin file that can be uploaded to the Roblox marketplace.

---

## 🎯 Method 1: Using Roblox Studio (Recommended)

### Step 1: Open Roblox Studio

1. Open **Roblox Studio**
2. Create a new **Baseplate** project (or open any project)

### Step 2: Create Plugin Folder Structure

1. In the **Explorer** window, find **ServerStorage**
2. Right-click **ServerStorage** → **Insert Object** → **Folder**
3. Rename the Folder to: **RoAssistantPlugin**

### Step 3: Add the Main Script

1. Right-click **RoAssistantPlugin** folder → **Insert Object** → **Script**
2. Rename the Script to: **StudioPlugin**
3. **Double-click** the script to open it
4. **Delete** all the default code
5. **Copy and paste** the ENTIRE contents from `StudioPlugin.lua`
6. Save (Ctrl+S)

### Step 4: Add the Config ModuleScript

1. Right-click **RoAssistantPlugin** folder → **Insert Object** → **ModuleScript**
2. Rename it to: **Config**
3. **Double-click** to open it
4. **Delete** all the default code
5. **Copy and paste** the ENTIRE contents from `Config.lua`
6. Save (Ctrl+S)

### Step 5: Publish as Plugin

**Option A: Publish Directly to Marketplace (Recommended)**

1. In Explorer, **select** the **RoAssistantPlugin** folder (click it once)
2. In the top menu, click **Plugins** → **Publish as Plugin...**
3. A dialog will appear - fill in:
   - **Name**: RoAssistant Studio Plugin
   - **Description**: (see suggested description below)
   - **Creator**: Your username or group
   - **Comments Enabled**: Yes (recommended)
4. Click **Submit**

**Option B: Save as .rbxm File First**

1. In Explorer, **right-click** on **RoAssistantPlugin** folder
2. Select **Save to File...**
3. Choose location and name: `RoAssistantPlugin.rbxm`
4. Click **Save**

**Done! ✅** You now have your plugin ready!

---

## 🎯 Method 2: Using Rojo (Advanced)

If you want to use Rojo for automated builds:

### Step 1: Install Rojo

```bash
# Install via Aftman (recommended)
aftman add rojo-rbx/rojo

# Or download from https://github.com/rojo-rbx/rojo/releases
```

### Step 2: Create default.project.json

I've created this file for you in the roblox-plugin folder.

### Step 3: Build

```bash
cd roblox-plugin
rojo build -o RoAssistantPlugin.rbxm
```

**Done! ✅** You now have `RoAssistantPlugin.rbxm`

---

## 📤 Upload to Roblox Marketplace

### Step 1: Install the Plugin Locally First

1. Copy `RoAssistantPlugin.rbxm` to your plugins folder
2. Restart Roblox Studio
3. **Test it thoroughly!**

### Step 2: Publish to Marketplace

1. Open Roblox Studio
2. Click **Plugins** → **Plugins Folder** to open your plugins directory
3. Find `RoAssistantPlugin.rbxm`
4. In Studio, go to **View** → **Toolbox**
5. In Toolbox, click **Inventory** tab
6. Click the **⋮** (three dots) on your plugin
7. Select **Edit Plugin**
8. Fill in the details:
   - **Name**: RoAssistant Studio Plugin
   - **Description**: Connect RoAssistant website to Roblox Studio for instant script generation
   - **Icon**: Upload an icon image (optional)
   - **Version**: 1.0.0
9. Click **Submit** or **Save & Publish**

### Step 3: Set Pricing (Optional)

1. Go to **Create** page on Roblox website
2. Click **Catalog** → **My Plugins**
3. Find your plugin
4. Set as **Free** or set a **Robux price**
5. Click **Save**

---

## 🎨 Plugin Icon (Optional)

Create a 512x512 PNG icon for your plugin. Suggested design:
- RoAssistant logo
- Roblox Studio icon
- Connection/link symbol

---

## ✅ Pre-Upload Checklist

Before uploading to marketplace:

- [ ] Test plugin in Roblox Studio
- [ ] Verify connection to website works
- [ ] Test script insertion works
- [ ] Test auto-reconnection works
- [ ] Check all error messages are user-friendly
- [ ] Remove any debug print statements (optional)
- [ ] Update version number in Config.lua
- [ ] Test on different games/projects
- [ ] Get feedback from test users

---

## 🔧 Updating Your Plugin

When you make changes:

1. Update version number in `Config.lua`
2. Re-export to `.rbxm` (follow steps above)
3. Test locally
4. Re-upload to marketplace (it will update the existing plugin)

---

## 📝 Plugin Metadata Suggestions

When publishing to marketplace:

**Name:**
```
RoAssistant Studio Plugin
```

**Description:**
```
Connect your RoAssistant website to Roblox Studio for instant AI-powered script generation!

Features:
🔄 Real-time connection via Server-Sent Events
⚡ Instant script insertion from your website
🎯 Smart Lua/Luau code detection
📍 Auto-placement in correct locations
🔌 Auto-reconnection on disconnect
✨ Connection status indicator

Setup:
1. Install plugin
2. Enable HTTP Requests in Game Settings
3. Run your RoAssistant website (localhost:3000)
4. Plugin auto-connects!

Generate Luau scripts on your website and click "Send to Roblox" - they appear in Studio instantly!

Perfect for: AI-assisted development, rapid prototyping, script generation
```

**Tags:**
- Development
- Tools
- Scripting
- AI
- Productivity

---

## 🐛 Common Issues

### "Plugin doesn't appear in Studio"

**Solutions:**
1. Make sure you published the **Folder** containing all scripts, not just individual scripts
2. The plugin must be in `.rbxm` format
3. Restart Roblox Studio after installing
4. Check that the main Script is named correctly

### "Config not found error"

**Solution:**
Make sure **Config** is a **ModuleScript** (not a Script) and is inside the same folder as the main StudioPlugin script.

### "Cannot require Config"

**Solution:**
The require path should be: `require(script.Parent.Config)` - make sure Config is in the same parent folder as StudioPlugin.

---

## 💡 Tips

1. **Version your plugin** - Update version number in Config.lua for each release
2. **Test extensively** - Test on multiple games before publishing
3. **Respond to feedback** - Monitor comments and update based on user feedback
4. **Keep it updated** - Update when Roblox API changes
5. **Document well** - Include clear setup instructions

---

**Ready to publish!** 🚀
