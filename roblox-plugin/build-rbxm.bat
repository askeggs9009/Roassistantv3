@echo off
REM Build RoAssistant Plugin to .rbxm using Rojo
REM Make sure Rojo is installed: https://github.com/rojo-rbx/rojo

echo ============================================
echo   Building RoAssistant Plugin to .rbxm
echo ============================================
echo.

REM Check if Rojo is installed
where rojo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Rojo is not installed!
    echo.
    echo Install Rojo from: https://github.com/rojo-rbx/rojo/releases
    echo Or use Aftman: aftman add rojo-rbx/rojo
    echo.
    echo Alternatively, follow the manual steps in CONVERT-TO-RBXM.md
    pause
    exit /b 1
)

echo [OK] Rojo is installed
echo.

REM Build the plugin
echo Building plugin...
rojo build -o RoAssistantPlugin.rbxm

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================
    echo   Build Successful!
    echo ============================================
    echo.
    echo File created: RoAssistantPlugin.rbxm
    echo.
    echo Next steps:
    echo 1. Test the plugin by copying it to your Roblox plugins folder
    echo 2. Restart Roblox Studio
    echo 3. Test the connection and functionality
    echo 4. Upload to Roblox marketplace when ready
    echo.
    echo See CONVERT-TO-RBXM.md for upload instructions
    echo.
) else (
    echo.
    echo [ERROR] Build failed!
    echo Check the error messages above
    echo.
)

pause
