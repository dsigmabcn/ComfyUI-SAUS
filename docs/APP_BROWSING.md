# App Browsing

[Return to User Guide](USER_GUIDE.md)

The browsing page has an **icon rail** on the far left and a **workspace** with tabs on the right. There is no header or footer: the SAUS logo sits at the top of the rail, and the project links plus the version live in the **Settings** tab.

<!-- TODO: refresh the screenshots after the explorer/tab redesign -->

## The rail

Reading from the top:

- **AI Image**, **AI Video**, **Other**: the three sections of apps. **Click** one and the panel opens on that section; **click the same icon again** to close it. While the panel is open, **hovering another icon switches** it to that section.
- **ComfyUI**: opens ComfyUI in a new window.
- **Files**: the [File Manager](FILE_MANAGER.md), as a tab in the workspace.
- **Guide**: this user guide, in a new window.
- **Console**: the ComfyUI console/log feed, as a tab in the workspace.
- **Settings**: the [Settings](SETTINGS.md), as a tab in the workspace. The bottom of that tab shows the installed SAUS version and the links to the project (ko-fi, GitHub, YouTube).

The panel is only open while you want it: nothing appears on hover alone, and **Esc** closes it too. Which section you had open, and which subcategories you unfolded, are remembered.

### The panel head

- **Search** — filters apps by name, description, category or tag.
- **Tags** — unfolds the tag chips (base / distilled-fast / quantized, FLUX / SDXL / QWEN / WAN, image-to-image / inpainting / (re-)styling...). The little number next to the button counts the active search + tag filters.
- **Favorites** — your favourite apps are listed right there, in the panel head between the search field and the section name. The list appears only while you have favourites.

Below them is the **section name** (AI Image / AI Video / Other) — what the tree below is listing. While a search or tag filter is active, that name disappears and the panel shows a flat **"N apps found"** list with the matches from every section.

## The tree

The panel only lists the section you picked:

1. **Subcategory** (text-to-image, image-to-image (editing), image-to-image (reference), text-to-video, image-to-video, video-to-video, tools...). The number next to it is how many apps it holds.
2. **Apps**: click a subcategory and its rows unfold right there.

Which subcategories are unfolded is remembered between visits.

## App rows

Each app is a row with a thumbnail and its **name**. Long names wrap onto a second line, so they are always fully visible.

- **Thumbnail**: from the app's media folder. Click the row to open the app.
- **Name**: the app title (hover for the full text when cut short).
- **Status dot**: <span style="color:green">green</span> = every variant of the app has all of its models, <span style="color:orange">orange</span> = at least one variant is complete but another is not, <span style="color:red">red</span> = no variant is complete, grey = still checking.
- **(i)**: the app information panel, where models can be [installed/uninstalled](MODELS.md).
- **☆**: marks the app as a favorite. Favorites are listed first inside their subcategory.

### Hovering a row

The tooltip is short — one of three states, plus a call to action:

- Everything installed: *"All models installed"* (green).
- Some variants still need models: *"Some variants still need models"* (orange).
- Nothing installed: *"No models installed"* (red).

In every case, click **(i)** to see the details and install the missing models.

## Opening apps: tabs

Clicking an app row opens it in the **workspace** as a tab, next to the ones you already have open. Each tab carries:

- the **app name** and its icon;
- **⤴ export the workflow to ComfyUI**: the app's `wf.json` (the graph the app itself runs) is saved as `<App name>.json` in ComfyUI's workflow list, and ComfyUI opens in a new window — pick it from the workflow list there. An app that ships a UI-format `ui_wf.json` instead is sent as-is;
- **⛶ enlarge**: that tab takes the whole browser area (the rail, the panel and the tab strip step aside). Click it again, or press **Esc**, to go back;
- **✕**: closes the tab (and frees the app).

Middle-clicking a tab also closes it. *Settings*, *Files* and *Console* are tabs as well, so they can stay open next to a running app. Open tabs come back if you reload the page.

### Apps

All Apps ship with SAUS and are freely available. You can also drop your own Apps directly into the `web/apps/` folder and they will appear here.

[Return to User Guide](USER_GUIDE.md)
