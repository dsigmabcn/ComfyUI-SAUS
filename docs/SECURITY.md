# Security

SAUS runs **inside ComfyUI**, on the same address and port as it: that is what shapes what SAUS can
defend, and it is why the checks below are the ones that matter.

## Cross-site requests

Everything you do in the SAUS interface — uploads, renames, deletes, downloads — is sent in a way a
random web page cannot imitate, so a site you happen to have open in another tab cannot act on your
ComfyUI behind your back. Do **not** start ComfyUI with `--enable-cors-header`: that option removes this
protection, for SAUS *and* for ComfyUI itself.

## Custom nodes and extensions

Custom nodes and other extensions you install run inside ComfyUI itself, so they can already read and
call SAUS — there is no boundary to enforce there. Apps are trusted content, exactly like a custom node.

## Filesystem access

The File Manager (and everything SAUS does with files: uploading, renaming, deleting, moving) stays
inside ComfyUI's `input`, `output` and `models` folders. `..`, drive letters and network paths are
refused before anything touches the disk. Those three folders themselves are never renamed, deleted or
moved — only what is inside them.

## Downloads

A model download only ever lands in a folder ComfyUI uses for models — never in a folder ComfyUI loads
code from, where a file could be imported and run after a restart. A downloaded file name is reduced to
its base name and refused if it carries a script or native-library extension, exactly as an upload is.
Downloads only fetch public http(s) addresses, that check is repeated on every redirect, and a login
token is attached only for hosts on a shipped allow-list of trusted sources. SAUS never stores tokens.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[security advisories](https://github.com/dsigmabcn/ComfyUI-SAUS/security/advisories/new)
rather than in a public issue. Reports are reviewed as time allows; if one is
accepted, a fix is released and the reporter is credited unless they prefer
otherwise.
