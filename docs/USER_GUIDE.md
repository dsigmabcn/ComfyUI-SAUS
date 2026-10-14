# SAUS UI User Guide

Welcome to the SAUS UI user guide. This page gives a quick explanation of the main features and the interface; more detail is in the pages linked below.

## Detailed guide

This page is a quick tour. Each topic below has its own page with the full detail:

| Topic | What it covers |
| --- | --- |
| [Installation and Setup](INSTALLATION.md) | Installing SAUS (ComfyUI-Manager, manual, or the helper scripts) and updating it. |
| [Accessing SAUS](ACCESSING.md) | The `/saus` address, the icon in ComfyUI, and the Runpod port. |
| [General Navigation](NAVIGATION.md) | The icon rail, the explorer panel and the workspace/tabs. |
| [App Browsing](APP_BROWSING.md) | Sections, sub-categories, search, tags, favorites, status dots and app tabs. |
| [Installing and Uninstalling Models](MODELS.md) | Where models live, the status dot, and installing/removing models. |
| [Running an App](RUNNING_APPS.md) | Basic and advanced controls, LoRAs, masking, generating and the results panel. |
| [The File Manager](FILE_MANAGER.md) | Browsing, uploading/downloading, renaming/deleting and previewing files. |
| [ComfyUI](COMFYUI.md) | Opening ComfyUI, and sending an app's workflow to it. |
| [Settings](SETTINGS.md) | Themes, the installed version, social links and restarting the server. |
| [Runpod guide](RUNPOD.md) | Renting a pod, the template, and the port to open. |
| [Security](SECURITY.md) | What SAUS protects against and how to report an issue. |

Not installed yet? Start with [Installation and Setup](INSTALLATION.md). Below is a quick reference.

## Accessing the Interface

To run SAUS, simply navigate to this address in your web browser:

```
http://127.0.0.1:8188/saus
```

<table>
  <tr>
    <td valign="middle"><img src="../web/core/media/git/Access-button-ComfyUI.png" width="61"></td>
    <td>or by clicking the <b>Simple App</b> icon on ComfyUI's left toolbar.</td>
  </tr>
</table>


If you are accessing via [Runpod](RUNPOD.md), open the pod panel and click over the SAUS port (7771)
<img src="../web/core/media/git/port 7771.png">

**Full guide:** [Accessing SAUS](ACCESSING.md) — the Runpod walk-through is in the [Runpod guide](RUNPOD.md).

## Interface Overview

Each area below links to its full guide. This is a summary overview:

### Rail & Explorer
- **Icon rail** (far left): the SAUS logo, the three sections (AI Image, AI Video, Other) and the tools. **Click** a section to open the panel on it (click it again to close it); **hover** another one to switch the open panel.
- **Explorer panel**: the tree that lists one section at a time — subcategory, then the apps themselves, all in the panel. **Esc** closes it.
- **Project links**: there is no header or footer — the logo is at the top of the rail, and the ko-fi / GitHub / YouTube links plus the installed version are in the **Settings** tab.

**Full guide:** [General Navigation](NAVIGATION.md)

### App Browsing
- **Explorer**: hover a section (AI Image / AI Video / Other), then click a subcategory, and its apps appear as compact rows.
- **Opening apps**: click a row and the app opens as a **tab** in the workspace, so several apps can stay open at once. Each tab can be **enlarged** (⛶), **sent to ComfyUI** (⤴) or closed (✕).
- **Search & Tags**: both live in the panel head (the search box and the *Tags* button).
- **Tags**: filter Apps by specific characteristics (e.g., base/quantized, model, function).

**Full guide:** [App Browsing](APP_BROWSING.md)

### Installing/Uninstalling Models
- **Model Status**: the dot on each app row shows whether the required models are installed: green when every variant of the app has all of its models, orange when only some variants are complete, red when none is. Hover the row for the details, including which variant is missing what.
- **Information Panel**: Click on the (i) button to access the information panel and install the required models for the App.
- **Installing Models**: If a model is missing, it is indicated with a red 'Missing' badge. Click on the Install button below to install the model.
- **Uninstalling Models**: If a model is not used by any App, you can delete it by clicking on 'Uninstall'.

**Full guide:** [Installing and Uninstalling Models](MODELS.md)

## Running an App

1. **Open an App**: Click on an app row in the explorer (or the 'Open App' button in the information panel). The app opens in a tab of the workspace; use ✕ to close it or ⛶ to give it the whole browser area.
2. **Configure Parameters - Basic**: Adjust the available settings (prompts, image size, seed, etc.) in the simplified interface.
3. **Configure Parameters - Advanced**: Some Apps allow you to tune other advanced settings (CFG, sampler, scheduler, etc.). They are hidden behind the **Show Advanced** fold at the bottom of the control panel.
4. **Configure Parameters - Masking**: Inpainting Apps have additional controls to draw a mask over the image you want to inpaint.
5. **Generate**: Click the **Run** button to start the generation process. Click the **✕** next to the progress bar to stop the generation.
6. **Live Preview**: Watch the progress and see the result in the preview window.
7. **Recent**: See the images you have generated earlier (in the same session) by clicking on the images in the Recent panel. The panel starts folded and opens by itself when the first image is generated.

**Full guide:** [Running an App](RUNNING_APPS.md)


## Tools (the rail)

The tools live at the bottom of the rail (the File Manager and Settings open as tabs in the workspace, the Console docks over the bottom of the workspace; ComfyUI and the Guide open in a new window).

### File Manager
A simple File Manager to access and perform basic management of the files in your ComfyUI installation.
- **Favorite Folders**: Shortcut access to the 'Input', 'Output', and 'Models' folders inside ComfyUI.
- **Upload File**: Upload files and models to your local machine/ComfyUI installation.
- **Download from URL**: Download using a link. For gated CivitAI / Hugging Face models you can paste an API token for that single download (tokens are never stored).
- **Folder Navigation**: Click on folders to navigate into them, and use 'Go Up' to move one level up in the directory structure. Access is limited to the Input, Output and Models folders.
- **Image Visualization**: Click on an image or video file to open a preview panel and view it.
- **File Management**: Use the icons on each file to rename, download, or delete it.

**Full guide:** [The File Manager](FILE_MANAGER.md)

### ComfyUI
- **ComfyUI**: Open ComfyUI in a separate window (the *ComfyUI* icon at the bottom of the rail).

**Full guide:** [ComfyUI](COMFYUI.md)

### Settings
- **Settings**: the *Settings* icon at the bottom of the rail opens them as a tab.
- **Theme**: choose **Night** (neutral dark grey/white, the default), **Day** (light) or **Fire** (the original orange and ice look). Status colours (red/green/amber) stay coloured in every theme. It applies to the whole UI — the browser, the apps and the File Manager — and is remembered by your browser.
- **Version**: the installed SAUS version.
- **Social**: the ko-fi / GitHub / YouTube links.
- **Restart Server**: Restart the ComfyUI server directly from the UI if needed (e.g., after installing new custom nodes or updates).

**Full guide:** [Settings](SETTINGS.md)