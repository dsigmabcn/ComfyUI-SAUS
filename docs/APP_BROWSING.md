# App Browsing

[Return to User Guide](USER_GUIDE.md)

The browsing page has an **icon rail** on the far left and a **workspace** with tabs on the right. There is no header or footer: the SAUS logo sits at the top of the rail, and the project links plus the version live in the **Settings** tab.

<!-- TODO: refresh the screenshots after the explorer/tab redesign -->

## The rail

Reading from the top:

- **AI Image**, **AI Video**, **Other**: the three sections of apps. **Click** one and the panel opens on that section; **click the same icon again** to close it, or **click another icon** to move the panel to that section. Hovering only highlights the icon.
- **ComfyUI**: opens ComfyUI in a new window.
- **Files**: the [File Manager](FILE_MANAGER.md), as a tab in the workspace.
- **Guide**: this user guide, in a new window.
- **Console**: the ComfyUI console/log feed, as a tab in the workspace.
- **Settings**: the [Settings](SETTINGS.md), as a tab in the workspace. That tab holds the theme picker, the installed SAUS version (the *Version* section) and the project links (the *Social* section: ko-fi, GitHub, YouTube).

The panel is only open while you want it: nothing appears on hover alone, and **Esc** closes it too. Which section you had open, and which subcategories you unfolded, are remembered.

### The panel head

- **Search** — filters apps by name, description, category or tag.
- **Tags** — unfolds the tag chips (base / distilled-fast / quantized, FLUX / SDXL / QWEN / WAN, image-to-image / inpainting / (re-)styling...). The little number next to the button counts the active search + tag filters.
- **Favorites** — your favourite apps are listed right there, in the panel head between the search field and the section name. The list appears only while you have favourites, and it only shows the ones belonging to the section you are looking at (plus the active search / tag filter), so it never pins an app that is not in the tree below.

Below them is the **section name** (AI Image / AI Video / Other) — what the tree below is listing. While a search or tag filter is active, that name disappears and the panel shows a flat **"N apps found"** list with the matches from every section.

## The tree

The panel only lists the section you picked:

1. **Subcategory** (text-to-image, image-to-image (editing), image-to-image (reference), text-to-video, image-to-video, video-to-video, tools...). The number next to it is how many apps it holds.
2. **Apps**: click a subcategory and its rows unfold right there.

Which subcategories are unfolded is remembered between visits.

## App rows

Each app is a row with a thumbnail and its **name**. Long names wrap onto a second line, so they are always fully visible.

- **Thumbnail**: from the app's media folder — `thumbnail.jpg` by default, but `thumbnail.webp`, `.avif`, `.png` or `.gif` works too (the newest one wins when an app ships several). Click the row to open the app.
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

Clicking an app row opens it in the **workspace** as a tab, next to the ones you already have open. Opening an app also closes the explorer panel, so the app gets the room (the rail stays — one click brings the panel back). Each tab carries:

- the **app name**, its **icon** (the one of its section: AI Image, AI Video or Other) and, while you drag it, a faded look — **drag a tab onto another to re-order the strip** (the order is remembered for the session);
- **⤴ open the workflow in ComfyUI**: the graph the app is running **right now is loaded in a new workflow tab** of a new ComfyUI window — its settings and the variant you selected included, ready to run, next to whatever was already open on that canvas. The graph is also saved as `<App name> · <mode>.json` (`<mode>` being the app's **Custom / HD / Turbo** button, or the variant you picked) in ComfyUI's workflow list. An app that cannot be read (still starting, or one that ships only a base graph) falls back to its `wf.json`;
- **⛶ enlarge**: that tab takes the whole browser area (the rail, the panel and the tab strip step aside). Click it again, or press **Esc**, to go back;
- **✕**: closes the tab (and frees the app).

Middle-clicking a tab also closes it. *Settings* and *Files* are tabs as well, so they can stay open next to a running app; the *Console* instead docks over the bottom of the workspace (the rail's terminal icon toggles it, and its top edge can be dragged to resize it) and leaves the app at its full size. Open tabs come back if you reload the page.

### Apps

All Apps ship with SAUS and are freely available. You can also drop your own Apps directly into the `web/apps/` folder and they will appear here.

[Return to User Guide](USER_GUIDE.md)
