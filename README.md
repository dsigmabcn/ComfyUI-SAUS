<a name="readme-top"></a>

<div align="center">

[![YouTube](https://img.shields.io/badge/YouTube-Subscribe-red?logo=youtube&logoColor=white&style=for-the-badge)](https://www.youtube.com/@koalanation/videos)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/koalanation)




  <img src="web/core/media/git/cover_SAUS.jpg">
  <h3 align="center"><strong>S</strong>imple <strong>A</strong>pp <strong>U</strong> <strong>S</strong>ee</h3>
    <p align="center">
    <strong>Cut the spaghetti. Cook it with <i>Saus</i></strong>
  </p> 
  <p>
    <a href="docs/USER_GUIDE.md"><strong>User Guide</strong></a>
    <br />
    <a href="https://github.com/dsigmabcn/ComfyUI-SAUS/issues">Report Bug</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-saus">About SAUS</a></li>
    <li><a href="#how-to-use-saus">How to use SAUS</a></li>
    <li><a href="#installation">Installation</a></li>
    <li><a href="#accessing-saus">Accessing SAUS</a></li>
    <li><a href="#runpod---pods">Runpod</a></li>
    <li><a href="#credits">Credits</a></li>
  </ol>
</details>

# About SAUS

SAUS is a streamlined interface for AI image and video generation that uses ComfyUI as its backend engine. 
"Spaghetti" node workflows converted into a clean, production-ready application environment.

## Why SAUS?
* **Simple:** Built for creators who need results without the node-induced headaches.
* **App:** A powerful wrapper that extends ComfyUI's capabilities into a standalone-app feel.
* **U See:** A clean, expansive "view" of your creative output—not just your backend.


<p align="right">(<a href="#readme-top">back to top</a>)</p>

## What is SAUS?

SAUS is a custom node for ComfyUI that works as a robust and simple user interface to run different workflows, without messing and tinkering with all the spaghetti, parameters and options.

ComfyUI is powerful for designing and understanding AI image and video generation. It lets you see 'inside' the process and tweak every parameter. However, this flexibility leads to complex and challenging workflows. **SAUS simplifies this by converting popular and powerful workflows into 'apps'**. These apps provide a clean user interface, allowing you to focus on creativity.

<img src="web/core/media/git/SAUS-app-example.png" width="800">


## How to use SAUS

For detailed instructions, check out the [User Guide](docs/USER_GUIDE.md).

<img src="web/core/media/ui/Saus quick start card.png" width="800">

<p align="right">(<a href="#readme-top">back to top</a>)</p>

# Installation

## Requirements - ComfyUI and ComfyUI-Manager
 - [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
 - [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager)

For detailed instructions on how to install ComfyUI and ComfyUI-Manager, please refer to [ComfyUI Installation Instructions](docs/ComfyUI_install_instructions.md).

### Recommended Custom nodes

SAUS itself needs **no extra custom nodes**. The installer scripts do fetch a few commonly-used node packs (ControlNet Aux, KJNodes, Essentials, RMBG, AnimateDiff Evolved, GGUF) so more of the shipped apps can run out of the box; if you install SAUS manually, add those through ComfyUI-Manager only if an app asks for them.

## From ComfyUI Manager

If you already have installed [ComfyUI](https://github.com/comfyanonymous/ComfyUI) and [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager), the easiest way is to do it via the Manager.

<img src="web/core/media/git/Manager button.png">
<img src="web/core/media/git/custom nodes manager.png">


Search for ComfyUI-SAUS and install it.

## Manual Install

It is required that you have git installed. 

1. Navigate to the `custom_nodes` folder inside your ComfyUI installation.
2. Open a terminal (or type `cmd` in the address bar on Windows).
3. Run the following command:

```bash
git clone https://github.com/dsigmabcn/ComfyUI-SAUS.git
```

## Automatic Install (scripts)

To simplify installation, we provide scripts for Windows and Linux that install SAUS and the recommended custom nodes automatically.

The SAUS installers consider you already have [ComfyUI and ComfyUI-Manager already installed](docs/ComfyUI_install_instructions.md).

### Windows (Portable Version)

1. Download the **[install-saus-windows.bat](install-saus-windows.bat)** script from this repository.
2. Place the file in your **ComfyUI_windows_portable** directory (the folder containing `run_nvidia_gpu.bat` and the `ComfyUI` folder).
3. Double-click `install-saus-windows.bat` to run it.

### Linux
Git needs to be installed in your system. If you do not have it

```bash
sudo apt install git-all
```

1. Download the **[install-saus-linux.sh](install-saus-linux.sh)** script from this repository.
2. Place the file in your **ComfyUI** root directory (the folder containing `custom_nodes`).
3. Open a terminal in that directory.
4. Make the script executable and run it:
   ```bash
   chmod +x install-saus-linux.sh
   ./install-saus-linux.sh
   ```

## Runpod - pods
Runpod offers GPU rental at a good price for running the latest image and video models, so you do not have to grind and optimise workflows yourself. After signing up, create a Network Disk (large enough for the models) and use the **ComfyUI SAUS template**.

<img src="web/core/media/git/RUNPOD-SAUS-template.png">

See the [Runpod guide](docs/RUNPOD.md) for the port to open and the first-run notes.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

# Accessing SAUS 

## 1. Direct Link

To run SAUS, simply navigate to this address in your web browser:

```
http://127.0.0.1:8188/saus
```

## 2. in ComfyUI

<table>
  <tr>
    <td valign="middle"><img src="web/core/media/git/Access-button-ComfyUI.png" width="61"></td>
    <td>Click the <b>Simple App</b> icon on ComfyUI's left toolbar &mdash; the flame on the icon rail at the left edge.</td>
  </tr>
</table>

## 3. in Runpod
After start (and installation) of a pod with the ComfyUI SAUS template, SAUS is accessible in port 7771. This is visible in the HTTP services in the Pod control panel, and can be accessed by clicking there.

<img src="web/core/media/git/port 7771.png">

Alternatively, open ComfyUI and click on the SAUS button as indicated in <a href="#2-in-comfyui">2. in ComfyUI</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

# Credits

* [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
* [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager)
* [distyFlow](https://github.com/disty0/distyFlow)