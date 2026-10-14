# ComfyUI

[Return to User Guide](USER_GUIDE.md)

The **ComfyUI** button in the navigation bar opens the standard ComfyUI interface in a separate window, allowing you to access the underlying node graph if needed.

The **⤴** button of an app tab hands a workflow to ComfyUI through the
`?saus_workflow=` URL parameter, read by a SAUS-owned ComfyUI extension
(`web/core/js/common/scripts/saus_open_workflow.js`). That extension only reads
the two shapes the feature produces — a copy in your ComfyUI workflow folder
(`/api/userdata/**`) or a workflow an app ships (`/saus/**`) — only when it is
served as JSON, only up to a workflow-sized document, and it never overwrites a
workflow you already have.

## Security

For how SAUS handles cross-site requests, filesystem access and downloads, see
[Security](SECURITY.md).

[Return to User Guide](USER_GUIDE.md)