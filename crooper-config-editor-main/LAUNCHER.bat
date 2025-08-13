@echo off
REM Launch Crooper Config Editor (Electron app)
cd /d "%~dp0"
REM Install dependencies if node_modules does not exist
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
REM Start the Electron app
npx electron .
