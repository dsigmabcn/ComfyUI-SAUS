@echo off

echo Checking git installation...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Git is not installed or not in the PATH. Please install Git.
    pause
    exit /b
)

if exist "python_embeded\python.exe" (
    echo Portable version detected.
) else (
    echo This script is intended for ComfyUI Portable version.
    echo Please put this script in the ComfyUI_windows_portable directory.
    pause
    exit /b
)

pushd ComfyUI\custom_nodes

if exist "ComfyUI-SAUS" (
    echo ComfyUI-SAUS already exists. Updating...
    cd ComfyUI-SAUS
    git pull
    cd ..
) else (
    echo Cloning ComfyUI-SAUS...
    git clone https://github.com/dsigmabcn/ComfyUI-SAUS.git
)

popd

echo.
echo Installation/Update finished.
pause
exit /b
