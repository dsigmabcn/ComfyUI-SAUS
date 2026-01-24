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

call :install_node https://github.com/Fannovel16/comfyui_controlnet_aux.git comfyui_controlnet_aux
call :install_node https://github.com/kijai/ComfyUI-KJNodes.git ComfyUI-KJNodes
call :install_node https://github.com/cubiq/ComfyUI_essentials.git ComfyUI_essentials
call :install_node https://github.com/1038lab/ComfyUI-RMBG.git ComfyUI-RMBG
call :install_node https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git ComfyUI-AnimateDiff-Evolved
call :install_node https://github.com/city96/ComfyUI-GGUF.git ComfyUI-GGUF

popd

echo Installing requirements...
.\python_embeded\python.exe -m pip install -r .\ComfyUI\custom_nodes\ComfyUI-SAUS\requirements.txt

echo.
echo Installation/Update finished.
pause
exit /b

:install_node
set REPO_URL=%1
set DIR_NAME=%2
if exist "%DIR_NAME%" (
    echo %DIR_NAME% already exists. Updating...
    cd %DIR_NAME%
    git pull
    cd ..
) else (
    echo Cloning %DIR_NAME%...
    git clone %REPO_URL%
)
if exist "%DIR_NAME%\requirements.txt" (
    echo Installing requirements for %DIR_NAME%...
    ..\..\python_embeded\python.exe -m pip install -r %DIR_NAME%\requirements.txt
) else (
    echo No requirements.txt found for %DIR_NAME%. Skipping.
)
exit /b