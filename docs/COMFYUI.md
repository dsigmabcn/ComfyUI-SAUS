# ComfyUI

The **ComfyUI** button in the navigation bar opens the standard ComfyUI interface in a separate window, allowing you to access the underlying node graph if needed.

## Security notes

SAUS is served **by ComfyUI itself**, on ComfyUI's origin (`/saus/**`), so the SAUS
shell, every app and ComfyUI share one origin. That shapes what SAUS can defend:

- **Cross-site requests** are the boundary SAUS enforces. Every mutating route
  requires a JSON body (`Content-Type: application/json`), and the multipart
  upload route requires the `X-SAUS-Request` header — both force a CORS
  preflight, which this server never answers. Do **not** start ComfyUI with
  `--enable-cors-header`: answering those preflights would remove that
  protection from SAUS *and* from ComfyUI's own endpoints.
- **Code running inside the ComfyUI origin** (custom nodes, other extensions)
  can already read and call SAUS — there is no boundary to enforce there. Apps
  are trusted content, exactly like a custom node.
- **Filesystem access** from the file / upload / rename / delete API is confined
  to ComfyUI's `input`, `output` and `models` folders: absolute, drive-letter,
  UNC and `..` paths are refused before anything touches disk, then the path is
  resolved and checked against those roots.
- **Downloads** only fetch http(s) URLs that resolve to public addresses, that
  check is repeated on every redirect, and the API token typed in the File
  Manager is attached only for the hosts listed in
  `saus/data/allowed_download_hosts.json`. SAUS never stores tokens.

The **⤴** button of an app tab hands a workflow to ComfyUI through the
`?saus_workflow=` URL parameter, read by a SAUS-owned ComfyUI extension
(`web/core/js/common/scripts/saus_open_workflow.js`). That extension only reads
the two shapes the feature produces — a copy in your ComfyUI workflow folder
(`/api/userdata/**`) or a workflow an app ships (`/saus/**`) — only when it is
served as JSON, only up to a workflow-sized document, and it never overwrites a
workflow you already have.

[Return to User Guide](USER_GUIDE.md)