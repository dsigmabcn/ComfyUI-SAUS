# File Manager

[Return to User Guide](USER_GUIDE.md#file-manager)

A simple manager for files in your ComfyUI installation. Open it by clicking **Files** on the SAUS rail (it opens as a tab in the workspace).

In a local installation you will probably handle your files more easily in your own file explorer. The File Manager is especially useful on Runpod (or any other rented/VM system), where you do not want to open a separate tool (terminal, JupyterLab, etc.) just to look at the images you generate, upload or download files — you can do all of it from SAUS.

<img src= "../web/core/media/git/file_manager/navigation file manager.png"> 

## Layout

The manager is split into **two side-by-side panels**:

- **Input** (left) — the files you feed into apps.
- **Output** (right) — the images/videos the apps generate.

## Selecting files

- **Click** a file to select it.
- **Ctrl / ⌘ + click** adds or removes a file from the selection.
- **Shift + click** selects a whole range.
- **Double-click** a folder to open it, or a file to preview it.
- **F2** renames the selected file.
- **Del** deletes the selected files — it asks first, exactly like the panel's **Delete** button.
- **Drag and drop** a selection onto another folder, onto the other pane, or onto the pane's background to **move** it; hold **Ctrl / ⌘** while dropping to **copy** instead.

The **New folder / Rename / Download / Delete** buttons sit at the right of each panel's title. **New folder** creates a folder in the panel's *current* folder — it needs no selection — while the other three act on the **selected** file(s).

## Views and sorting

- The **List** view shows **Name**, **Size** and **Last Modified** columns. Click a column header to sort by it (an arrow shows the direction); click again to reverse it.
- The **medium icons** and **large icons** buttons switch to a grid; images show a compressed thumbnail. They are recognised by their extension — `jpg`, `jpeg`, `png`, `gif`, `webp`, `avif` and `bmp` — and everything else (videos included) simply has no thumbnail.

## The preview panel

Double-click an image or video and it opens in the panel on the right. Use **‹ ›** to move to the previous/next file and the **✕** to close it.

<img src="../web/core/media/git/file_manager/file manager with preview.png">

Generated videos can also be previewed in the panel.

## Uploading files

- **Upload**: upload files (images, videos) from your local computer to the (remote) ComfyUI input folder by clicking the **Upload** button.

[Return to User Guide](USER_GUIDE.md#file-manager)