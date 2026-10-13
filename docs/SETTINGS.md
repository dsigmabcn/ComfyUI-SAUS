# Settings

[Return to User Guide](USER_GUIDE.md)

## Theme

Pick the look of the whole UI here: the app browser, the apps it opens and the File Manager all
follow it.

| Theme | What it is |
| --- | --- |
| **Night** | Neutral dark: greys and white, no colour accent. **The default.** |
| **Day** | Light: a pale blue-grey canvas and panels, with **white** cards, modals and inputs so they still stand out. Dark text. |
| **Fire** | The original SAUS look: orange and ice on midnight blue. |

Only the *interactive* accents are neutral in Night and Day. Colours that carry a meaning keep
their hue in all three themes: red for errors and destructive actions, green for ready/installed,
amber for warnings, blue for information.

The choice is remembered per browser (it lives in this browser's local storage, not in the app
folders), so it applies to every SAUS page from then on. All three palettes are defined in one
file, `web/core/css/themes.css`, and every component reads colours from `var(--…)`, so a theme can
be changed without touching anything else.

## Version

The installed SAUS version (the same number the update check compares against the latest release).

## Social

Links to the project, as icons: **ko-fi** (support), **GitHub** (code, issues, releases) and
**YouTube** (videos).

## Restart Server
- Restart the ComfyUI server directly from the UI (e.g. after updating custom nodes with ComfyUI-Manager).

API tokens are **no longer stored** by SAUS. When a gated model needs one, paste it in the File
Manager's *Download from URL* dialog; it is used for that download only and is sent only to the
hosts listed in `saus/data/allowed_download_hosts.json`.

[Return to User Guide](USER_GUIDE.md)