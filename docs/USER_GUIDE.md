# SAUS UI User Guide

Welcome to the SAUS UI user guide.

## Detailed guides

This page is a quick tour. Each topic below has its own page with the full detail:

| Topic | What it covers |
| --- | --- |
| [Installation and Setup](INSTALLATION.md) | Installing SAUS |
| [Accessing SAUS](ACCESSING.md) | How to start SAUS |
| [General Navigation](NAVIGATION.md) | The icon rail, the explorer panel and the workspace/tabs. |
| [App Browsing](APP_BROWSING.md) | What can you see in the appc cards. |
| [Installing and Uninstalling Models](MODELS.md) | Installing/uninstalling models. |
| [Running an App](RUNNING_APPS.md) | Controls and image/video generation. |
| [The File Manager](FILE_MANAGER.md) | Browsing the results of your creations |
| [ComfyUI](COMFYUI.md) | Opening ComfyUI. |
| [Settings](SETTINGS.md) | Theme selection, the deprecated-apps switch, info and restarting the server. |
| [Runpod guide](RUNPOD.md) | How to run SAUS in rented GPUs |

Not installed yet? Start with [Installation and Setup](INSTALLATION.md).

## Accessing the Interface

To run SAUS:
<table>
  <tr>
    <td valign="middle"><img src="../web/core/media/git/Access-button-ComfyUI.png" width="61"></td>
    <td>Clicking the <b>Simple App</b> icon on ComfyUI's left toolbar.</td>
  </tr>
</table>

Or navigate to this address in your web browser:

```
http://127.0.0.1:8188/saus
```

If you are accessing via [Runpod](RUNPOD.md), open the pod panel and click over the SAUS port (7771)

**Full guide:** [Accessing SAUS](ACCESSING.md) — the Runpod walk-through is in the [Runpod guide](RUNPOD.md).

## Interface Overview

<img src="../web/core/media/git/SAUS-app-example.png>

Each area below links to its full guide. This is a summary overview:

### Rail and Explorer
- **Icon rail** (far left): App categories (AI Image, AI Video, Other) and the tools. **Click** on an app category to open and close the Explorer panel.
- **Explorer panel**: the tree that lists one section at a time — subcategory, then the apps themselves, all in the panel.

**Full guide:** [General Navigation](NAVIGATION.md)

### App Browsing
- **Subcategories (N)**: click on each subcategory (text-to-image, text-to-video, etc), to unfold and see the different apps that you can use.
- **Opening apps**: click over an app to open a **tab** in the workspace. Several apps can stay open at once. The apps can be **sent to ComfyUI** (⤴) for further inspection or advanced parameter handling.
- **Search & Tags**: both live in the panel head (the search box and the *Tags* button).
- **Tags**: filter Apps by specific characteristics (e.g., base/quantized, model, function).

**Full guide:** [App Browsing](APP_BROWSING.md)

### Installing and Uninstalling Models
The app cards provide information of the models necessary to run the app:

- **Model Status**: the dot on each app row shows whether the required models are installed.
- **Information Panel**: Click on the (i) button to access the information panel and install the required models for the App.

In the information panel you can manage the models:
- **Installing Models**: If a model is missing, it is indicated with a red 'Missing' badge. Click on the Install button below to install the model.
- **Uninstalling Models**: If a model is not used by any App, you can delete it by clicking on 'Uninstall'.

**Full guide:** [Installing and Uninstalling Models](MODELS.md)

## Running an App

**Open an App** by click on an app row in the explorer (or the 'Open App' button in the information panel). The app opens in a tab of the **workspace**.

1. **Configure Parameters - Basic**: Adjust the available settings (prompts, image size, seed, etc.) in the simplified interface.
2. **Configure Parameters - Advanced**: Some Apps allow you to tune other advanced settings (CFG, sampler, scheduler, etc.). They are hidden behind the **Show Advanced** fold at the bottom of the control panel.
3. **Configure Parameters - Masking**: Inpainting Apps have additional controls to draw a mask over the image you want to inpaint.
4. **Generate**: Click the **Run** button to start the generation process. Click the **✕** next to the progress bar to stop the generation.
5. **Live Preview**: Watch the progress and see the result in the preview window.
6. **Recent**: See the images you have generated earlier (in the same session) by clicking on the images in the Recent panel. The panel starts folded and opens by itself when the first image is generated.

**Full guide:** [Running an App](RUNNING_APPS.md)


## Tools (the rail)

The tools live at the bottom of the rail.

### File Manager
A simple File Manager to access and perform basic management of the files in your ComfyUI installation.
- **Folders**: Shortcut access to the 'Input' and 'Output' folders inside ComfyUI.
- **Upload File**: upload files from your computer into ComfyUI's input folder.
- **Folder Navigation**: Click on folders to navigate into them, and use 'Go Up' to move one level up in the directory structure.
- **Image Visualization**: Click on an image or video file to open a preview panel and view it. Use the **arrow keys** to walk the files (with the panel open they flip straight through the images), and deleting the shown image moves the panel on to the next one.
- **File Management**: Use the icons on each file to rename, download, or delete it.

**Full guide:** [The File Manager](FILE_MANAGER.md)

### ComfyUI
- **ComfyUI**: Opens ComfyUI in a separate window.

**Full guide:** [ComfyUI](COMFYUI.md)

### Settings
- **Theme**: choose **Night** (neutral dark grey/white, the default), **Day** (light) or **Fire** (the original orange and ice look). 
- **Show deprecated apps**: list the apps a newer model has superseded. They are hidden from the panel by default.
- **Version**: the installed SAUS version.
- **Social**: social media links.
- **Restart Server**: Restart the ComfyUI server directly from the UI if needed.

**Full guide:** [Settings](SETTINGS.md)