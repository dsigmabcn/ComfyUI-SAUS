# Security

SAUS is served **by ComfyUI itself**, on ComfyUI's origin (`/saus/**`), so the SAUS
shell, every app and ComfyUI share one origin. That shapes what SAUS can defend.

## Cross-site requests

Every mutating route requires a JSON body (`Content-Type: application/json`), and
the multipart upload route requires the `X-SAUS-Request` header — both force a CORS
preflight, which this server never answers. Do **not** start ComfyUI with
`--enable-cors-header`: answering those preflights would remove that protection
from SAUS *and* from ComfyUI's own endpoints.

## Code inside the ComfyUI origin

Custom nodes and other extensions run inside the ComfyUI origin, so they can
already read and call SAUS — there is no boundary to enforce there. Apps are
trusted content, exactly like a custom node.

## Filesystem access

The file / upload / rename / delete API is confined to ComfyUI's `input`, `output`
and `models` folders: absolute, drive-letter, UNC and `..` paths are refused before
anything touches disk, then the path is resolved and checked against those roots.
The roots themselves are never renamed, deleted or moved — only their contents.
(`download-file` accepts the absolute paths ComfyUI's executor sends, so there the
UNC form alone is refused, checked as a *string* before anything resolves it.)

## Downloads

A model download only lands in a folder ComfyUI uses for models: `custom_nodes`
and `datasets` are never a destination, because a file written there could be
imported and run after a restart. A downloaded file name is reduced to a base name
and refused if it carries a script or native-library extension, exactly as an
upload is. Downloads only fetch http(s) URLs that resolve to public addresses, that
check is repeated on every redirect, and an API token is attached only for hosts on
the allow-list kept in `saus/data/allowed_download_hosts.json`. SAUS never stores
tokens.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisories](https://github.com/dsigmabcn/ComfyUI-SAUS/security/advisories/new)
rather than in a public issue. Reports are reviewed as time allows; if one is
accepted, a fix is released and the reporter is credited unless they prefer
otherwise.

Contributors: the concrete invariants every route must keep — and the checks that
enforce them — are documented in the developer skill at
`.clinerules/skills/saus-developer/references/security-invariants.md`.
