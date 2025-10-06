#!/bin/bash

# Roblox MCP Installation Script for Unix/Mac
# This script automates the setup process

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 Roblox MCP Integration Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Node.js installation
echo "🔍 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Node.js version $NODE_VERSION detected"
    echo "   Please upgrade to Node.js 18 or higher"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Setup environment file
echo "⚙️  Setting up environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your API keys!"
    echo ""
    echo "   1. Get your API key from:"
    echo "      - Anthropic: https://console.anthropic.com/"
    echo "      - OpenAI: https://platform.openai.com/api-keys"
    echo ""
    echo "   2. Open .env and add your key:"
    echo "      nano .env"
    echo ""

    read -p "Would you like to edit .env now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
    fi
else
    echo "ℹ️  .env file already exists, skipping creation"
fi

echo ""

# Plugin installation instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 Roblox Studio Plugin Installation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To install the Roblox plugin:"
echo ""
echo "1. Open Roblox Studio"
echo "2. Click: Plugins → Folder (or press Alt+P)"
echo "3. Copy the file: $(pwd)/plugin/RobloxMCPPlugin.lua"
echo "4. Paste it into the opened folder"
echo "5. Restart Roblox Studio"
echo ""
echo "Alternative method (macOS):"
PLUGIN_DIR="$HOME/Documents/Roblox/Plugins"
if [ -d "$PLUGIN_DIR" ]; then
    echo "   cp plugin/RobloxMCPPlugin.lua \"$PLUGIN_DIR/\""
fi
echo ""

# Claude Code setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔌 Claude Code MCP Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To add this MCP server to Claude Code:"
echo ""
echo "   claude mcp add roblox --path $(pwd)/server.js"
echo ""
echo "Or manually add to your .claude/mcp_config.json"
echo ""

# Final instructions
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "1. Make sure you've added your API keys to .env"
echo ""
echo "2. Start the servers:"
echo "   npm run both"
echo ""
echo "   Or separately:"
echo "   npm run bridge    # Terminal 1"
echo "   npm start         # Terminal 2"
echo ""
echo "3. Install the Roblox plugin (see instructions above)"
echo ""
echo "4. In Roblox Studio, enable HTTP requests:"
echo "   Home → Game Settings → Security → Allow HTTP Requests"
echo ""
echo "5. Start creating with Claude AI! Example:"
echo "   'Create a script that makes parts rain from the sky'"
echo ""
echo "📚 For more info, see README.md"
echo ""
echo "Happy coding! 🚀"
echo ""
