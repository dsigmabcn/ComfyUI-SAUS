# ComfyUI and ComfyUI-Manager Installation

[Return to User Guide](USER_GUIDE.md)

This quick guide is based on the official information provided by ComfyUI in 
- [Installing ComfyUI](https://github.com/Comfy-Org/ComfyUI?tab=readme-ov-file#installing) 
- [Installing ComfyUI-Manager](https://github.com/Comfy-Org/ComfyUI?tab=readme-ov-file#installing). 

This guide is a brief summary focusing on Windows portable and debian based linux. However, the links and commands to install may change, so please always check the official documentation.

## Windows Portable
Follow the instructions to install [ComfyUI Windows Portable](https://github.com/Comfy-Org/ComfyUI?tab=readme-ov-file#windows-portable) and in [ComfyUI-Manager Method 2](https://github.com/Comfy-Org/ComfyUI-Manager?tab=readme-ov-file#installationmethod2-installation-for-portable-comfyui-version-comfyui-manager-only)

- **[ComfyUI windows portable installer](https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z)**: download and unzip the file where you want it to be installed.
- **[Download git](https://git-scm.com/download/win)**, the standalone installer for windows, and install it.
- **[Download the ComfyUI-Manager script for Windows](https://github.com/ltdrdata/ComfyUI-Manager/raw/main/scripts/install-manager-for-portable-version.bat)** into **ComfyUI_windows_portable** folder and run it (double click on it)

## Linux:

Follow the instructions as indicated in the [ComfyUI-Manager Method 4](https://github.com/Comfy-Org/ComfyUI-Manager?tab=readme-ov-file#installationmethod4-installation-for-linuxvenv-comfyui--comfyui-manager):
- **prerequisites: python-is-python3, python3-venv**
- **Git**:
```bash
sudo apt install git-all
```
- Download the [ComfyUI and ComfyUI-Manager installation script](https://github.com/ltdrdata/ComfyUI-Manager/raw/main/scripts/install-comfyui-venv-linux.sh) and place it in the folder where ComfyUI will be installed
- Execute the command
```bash
chmod +x install-comfyui-venv-linux.sh
./install-comfyui-venv-linux.sh
```


When you have ComfyUI and ComfyUI-Manager installed, you can follow the instructions to install ComfyUI-SAUS.

[Return to User Guide](USER_GUIDE.md)