@echo off
REM Roblox MCP Installation Script for Windows
REM This script automates the setup process

echo ============================================
echo    Roblox MCP Integration Setup
echo ============================================
echo.

REM Check Node.js installation
echo Checking prerequisites...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js detected
node --version
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Setup environment file
echo Setting up environment configuration...
if not exist .env (
    copy .env.example .env >nul
    echo [OK] Created .env file
    echo.
    echo [IMPORTANT] Edit .env and add your API keys!
    echo.
    echo 1. Get your API key from:
    echo    - Anthropic: https://console.anthropic.com/
    echo    - OpenAI: https://platform.openai.com/api-keys
    echo.
    echo 2. Open .env and add your key
    echo.

    set /p EDIT="Would you like to edit .env now? (y/n): "
    if /i "%EDIT%"=="y" (
        if exist "%USERPROFILE%\AppData\Local\Programs\Microsoft VS Code\Code.exe" (
            start "" "%USERPROFILE%\AppData\Local\Programs\Microsoft VS Code\Code.exe" .env
        ) else (
            notepad .env
        )
    )
) else (
    echo [INFO] .env file already exists, skipping creation
)
echo.

REM Plugin installation instructions
echo ============================================
echo    Roblox Studio Plugin Installation
echo ============================================
echo.
echo To install the Roblox plugin:
echo.
echo 1. Open Roblox Studio
echo 2. Click: Plugins -^> Folder (or press Alt+P)
echo 3. Copy the file: %CD%\plugin\RobloxMCPPlugin.lua
echo 4. Paste it into the opened folder
echo 5. Restart Roblox Studio
echo.
echo Alternative method (Windows):
echo    copy plugin\RobloxMCPPlugin.lua "%LOCALAPPDATA%\Roblox\Plugins\"
echo.

REM Claude Code setup
echo ============================================
echo    Claude Code MCP Configuration
echo ============================================
echo.
echo To add this MCP server to Claude Code:
echo.
echo    claude mcp add roblox --path %CD%\server.js
echo.
echo Or manually add to your .claude\mcp_config.json
echo.

REM Final instructions
echo ============================================
echo    Setup Complete!
echo ============================================
echo.
echo Next steps:
echo.
echo 1. Make sure you've added your API keys to .env
echo.
echo 2. Start the servers:
echo    npm run both
echo.
echo    Or separately (2 terminals):
echo    npm run bridge    # Terminal 1
echo    npm start         # Terminal 2
echo.
echo 3. Install the Roblox plugin (see instructions above)
echo.
echo 4. In Roblox Studio, enable HTTP requests:
echo    Home -^> Game Settings -^> Security -^> Allow HTTP Requests
echo.
echo 5. Start creating with Claude AI! Example:
echo    'Create a script that makes parts rain from the sky'
echo.
echo For more info, see README.md
echo.
echo Happy coding!
echo.
pause
