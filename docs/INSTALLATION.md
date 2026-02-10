# Installation

[Return to User Guide](USER_GUIDE.md)

## Requirements - ComfyUI and ComfyUI-Manager
 - [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
 - [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager)

For detailed instructions on how to install ComfyUI and ComfyUI-Manager, please refer to [ComfyUI Installation Instructions](ComfyUI_install_instructions.md).

### Recommended Custom nodes

I have tried to ensure that most apps work with native nodes only, but some require custom nodes. It is recommended to add the following custom nodes:
- [comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux): to generate controlnet preprocessed video
- [KJ Nodes](https://github.com/kijai/ComfyUI-KJNodes): quality-of-life nodes by kijai
- [ComfyUI_essentials](https://github.com/cubiq/ComfyUI_essentials): quality of life nodes by cubiq (Matteo), currently in maintenance mode
- [ComfyUI-RMBG](https://github.com/1038lab/ComfyUI-RMBG): To remove background from images
- [ComfyUI-AnimateDiffEvolve](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved): if you plan to use AnimateDiff
- [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF): To use quantized models

## From ComfyUI Manager

If you already have installed [ComfyUI](https://github.com/comfyanonymous/ComfyUI) and [ComfyUI-Manager](https://github.com/ltdrdata/), the easiest way is to do it via the Manager.

<img src="web/core/media/git/Manager button.png">
<img src="web/core/media/git/custom nodes manager.png">

Search for ComfyUI-SAUS, and install it together with the recommended custom nodes indicated above

## Manual Install

It is required that you have git installed. 

1. Navigate to the `custom_nodes` folder inside your ComfyUI installation.
2. Open a terminal (or type `cmd` in the address bar on Windows).
3. Run the following command:

```bash
git clone https://github.com/dsigmabcn/ComfyUI-SAUS.git
```
Make also sure the custom nodes indicated in requirements (and their dependencies in requirements.txt) are installed.

## Automatic Install (scripts)

To simplify installation, we provide scripts for Windows and Linux that install SAUS and the recommended custom nodes automatically.

The SAUS installers consider you already have ComfyUI and ComfyUI-Manager already installed.

### Windows (Portable Version)

1. Download the **install-saus-windows.bat** script from this repository.
2. Place the file in your **ComfyUI_windows_portable** directory (the folder containing `run_nvidia_gpu.bat` and the `ComfyUI` folder).
3. Double-click `install-saus-windows.bat` to run it.

### Linux
Git needs to be installed in your system. If you do not have it

```bash
sudo apt install git-all
```

1. Download the **install-saus-linux.sh** script from this repository.
2. Place the file in your **ComfyUI** root directory (the folder containing `custom_nodes`).
3. Open a terminal in that directory.
4. Make the script executable and run it:
   ```bash
   chmod +x install-saus-linux.sh
   ./install-saus-linux.sh
   ```

## Runpod - pods
Runpod offers rental of GPU's at a good price that can be used to run the latest image and video models. This is convenient as you do not need to keep grinding and optimizing workflows to get a sub-optimal quality in your results.

After signing up in Runpod, create a Network Disk (with enough capacity to run the models) and use the ComfyUI SAUS template.

<img src="../web/core/media/git/RUNPOD-SAUS-template.png">

> [!NOTE]
> The template uses pytorch 2.8, the pod should have CUDA 12.8 or higher

> [!WARNING]
> If you already have ComfyUI in a Network Drive installed, the template will not install the custom node. Install it first via the manager, then later you can use the template to access the right ports.

[Return to User Guide](USER_GUIDE.md)