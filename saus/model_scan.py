"""Workflow model scanner.

Extracts the models a workflow needs, and -- for UI-format workflows -- the
download information (URL + target folder) that workflow authors embed in
``node.properties.models`` and in ``MarkdownNote`` text.

Two workflow shapes are supported:

* **API format** (what SAUS stores as ``wf.json``): ``{node_id: {class_type, inputs}}``.
  It only carries the concrete filenames (no URLs / notes).
* **UI format** (what ComfyUI saves / what ``app.graphToPrompt().workflow``
  returns): ``{nodes: [...]}`` with node ``properties`` and MarkdownNote text.
  Nodes may be nested inside ``definitions.subgraphs``.

The module has no ComfyUI imports so it can be unit-tested and reused by the
migration script.
"""

from __future__ import annotations

import re
from pathlib import PurePosixPath
from typing import Any, Dict, Iterable, Iterator, List
from urllib.parse import unquote, urlparse

# Extensions that identify a file as a downloadable model.
MODEL_EXTS = (
    ".safetensors", ".sft", ".ckpt", ".pt", ".pth", ".bin",
    ".gguf", ".onnx", ".pkl", ".npz",
)

# class_type -> [(input_name, model_type, base_dir), ...]
# base_dir is the ComfyUI models sub-folder (without slashes).
LOADER_INPUTS: Dict[str, List[tuple]] = {
    "CheckpointLoaderSimple": [("ckpt_name", "CHECKPOINT", "checkpoints")],
    "CheckpointLoader": [("ckpt_name", "CHECKPOINT", "checkpoints")],
    "unCLIPCheckpointLoader": [("ckpt_name", "CHECKPOINT", "checkpoints")],
    "ImageOnlyCheckpointLoader": [("ckpt_name", "CHECKPOINT", "checkpoints")],
    "UNETLoader": [("unet_name", "Diffusion model", "diffusion_models")],
    "UnetLoaderGGUF": [("unet_name", "Diffusion model", "diffusion_models")],
    "UnetLoaderGGUFAdvanced": [("unet_name", "Diffusion model", "diffusion_models")],
    "VAELoader": [("vae_name", "VAE", "vae")],
    "CLIPLoader": [("clip_name", "TEXT ENCODER", "text_encoders")],
    "DualCLIPLoader": [
        ("clip_name1", "TEXT ENCODER", "text_encoders"),
        ("clip_name2", "TEXT ENCODER", "text_encoders"),
    ],
    "TripleCLIPLoader": [
        ("clip_name1", "TEXT ENCODER", "text_encoders"),
        ("clip_name2", "TEXT ENCODER", "text_encoders"),
        ("clip_name3", "TEXT ENCODER", "text_encoders"),
    ],
    "QuadrupleCLIPLoader": [
        ("clip_name1", "TEXT ENCODER", "text_encoders"),
        ("clip_name2", "TEXT ENCODER", "text_encoders"),
        ("clip_name3", "TEXT ENCODER", "text_encoders"),
        ("clip_name4", "TEXT ENCODER", "text_encoders"),
    ],
    "CLIPVisionLoader": [("clip_name", "Clipvision", "clip_vision")],
    "LoraLoader": [("lora_name", "LORA", "loras")],
    "LoraLoaderModelOnly": [("lora_name", "LORA", "loras")],
    "ControlNetLoader": [("control_net_name", "CONTROLNET", "controlnet")],
    "DiffControlNetLoader": [("control_net_name", "CONTROLNET", "controlnet")],
    "StyleModelLoader": [("style_model_name", "Style", "style_models")],
    "UpscaleModelLoader": [("model_name", "Upscaler", "upscale_models")],
    "LatentUpscaleModelLoader": [("model_name", "Latent Upscaler", "latent_upscale_models")],
}

# MarkdownNote/Note node types whose text may carry model links.
NOTE_TYPES = {"MarkdownNote", "Note"}

_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
_TREE_PREFIX_RE = re.compile(r"^[\s\u2502\u251c\u2514\u2500`|]+")  # box-drawing glyphs
_FOLDER_EMOJI = "\U0001F4C2"
_FILE_RE = re.compile(
    r"([^\s/\\]+\.(?:" + "|".join(e.lstrip(".") for e in MODEL_EXTS) + r"))\b",
    re.IGNORECASE,
)


def looks_like_model(name: str) -> bool:
    return bool(name) and name.lower().endswith(MODEL_EXTS)


def split_name(value: str) -> tuple:
    """Split a loader value into (filename, subfolder).

    ``"FLUX/flux1-dev.safetensors"`` -> ``("flux1-dev.safetensors", "FLUX")``.
    """
    value = (value or "").replace("\\", "/").strip()
    if not value:
        return "", ""
    path = PurePosixPath(value)
    return path.name, ("" if str(path.parent) == "." else str(path.parent))


def target_dir(base_dir: str, subfolder: str) -> str:
    """SAUS download folder, e.g. ``"/diffusion_models/FLUX/"``."""
    parts = [p for p in (base_dir, subfolder) if p]
    return "/" + "/".join(parts) + "/" if parts else "/"


# --------------------------------------------------------------------------- #
# Candidate catalog (filename -> {url, directory})
# --------------------------------------------------------------------------- #
def _add_candidate(catalog: dict, name: str, url: str = "", directory: str = "") -> None:
    name = (name or "").strip()
    if not name:
        return
    entry = catalog.setdefault(name, {"name": name, "url": "", "directory": ""})
    if url and not entry["url"]:
        entry["url"] = url
    if directory and not entry["directory"]:
        entry["directory"] = directory


def _strip_tree(line: str) -> str:
    """Drop leading box-drawing glyphs and the folder emoji from a tree line."""
    line = _TREE_PREFIX_RE.sub("", line).replace(_FOLDER_EMOJI, "").strip()
    return line


def parse_model_links(text: str) -> Dict[str, dict]:
    """Extract ``{filename: {url, directory}}`` from MarkdownNote text.

    Handles markdown links ``[file](url)`` (URL basename = filename) and the
    "Model Storage Location" tree (a folder line, then indented filenames).
    """
    catalog: Dict[str, dict] = {}
    folder = ""

    for raw in (text or "").splitlines():
        cleaned = _strip_tree(raw)

        # Folder marker: a line that ends with "/" and has no filename.
        if cleaned.endswith("/") and not _FILE_RE.search(cleaned):
            folder = cleaned.rstrip("/").split("/")[-1].strip()
            continue

        for label, url in _LINK_RE.findall(raw):
            parsed = urlparse(url)
            fname = unquote(PurePosixPath(parsed.path).name)
            if looks_like_model(fname):
                directory = PurePosixPath(parsed.path).parent.name
                _add_candidate(catalog, fname, url, directory)
            elif looks_like_model(label.strip()):
                _add_candidate(catalog, label.strip(), url, folder)

        if folder:
            fm = _FILE_RE.search(cleaned)
            if fm:
                _add_candidate(catalog, fm.group(1), "", folder)

    return catalog


def _merge_candidates(*catalogs: Dict[str, dict]) -> Dict[str, dict]:
    merged: Dict[str, dict] = {}
    for catalog in catalogs:
        for name, entry in (catalog or {}).items():
            _add_candidate(merged, name, entry.get("url", ""), entry.get("directory", ""))
    return merged


# --------------------------------------------------------------------------- #
# Node iteration (handles subgraphs)
# --------------------------------------------------------------------------- #
def iter_ui_nodes(workflow: Any) -> Iterator[dict]:
    """Yield every node in a UI-format workflow, recursing into subgraphs."""
    seen_defs: set = set()

    def walk_nodes(nodes: Iterable[dict]) -> Iterator[dict]:
        for node in nodes or []:
            if not isinstance(node, dict):
                continue
            yield node
            defs = node.get("definitions") or {}
            for sub in defs.get("subgraphs", []) or []:
                yield from walk_def(sub)

    def walk_def(sub: dict) -> Iterator[dict]:
        sid = sub.get("id") or sub.get("name")
        if sid in seen_defs:
            return
        seen_defs.add(sid)
        yield from walk_nodes(sub.get("nodes"))

    if isinstance(workflow, dict):
        yield from walk_nodes(workflow.get("nodes"))
        for sub in (workflow.get("definitions") or {}).get("subgraphs", []) or []:
            yield from walk_def(sub)


def _ui_widget_value(node: dict, inputs: List[tuple]) -> Dict[str, Any]:
    """Map input names to values from a UI node (named or positional)."""
    named = node.get("widgets_values_named")
    if isinstance(named, dict):
        return {name: named.get(name) for name, _t, _d in inputs}

    values = node.get("widgets_values")
    if not isinstance(values, list):
        return {}
    out: Dict[str, Any] = {}
    for idx, (name, _t, _d) in enumerate(inputs):
        if idx < len(values):
            out[name] = values[idx]
    return out


def _required_from_node(node: dict, named: Dict[str, Any]) -> List[dict]:
    ctype = node.get("type") or node.get("class_type") or ""
    specs = LOADER_INPUTS.get(ctype)
    if not specs:
        return []
    out = []
    for name, model_type, base_dir in specs:
        value = named.get(name)
        if not isinstance(value, str):
            continue
        fname, subfolder = split_name(value)
        if not looks_like_model(fname):
            continue
        out.append({
            "filename": fname,
            "type": model_type,
            "base_dir": base_dir,
            "subfolder": subfolder,
            "loader": ctype,
            "input": name,
            "target": target_dir(base_dir, subfolder),
        })
    return out


# --------------------------------------------------------------------------- #
# Public scanners
# --------------------------------------------------------------------------- #
def scan_ui_workflow(workflow: dict) -> dict:
    """Scan a UI-format workflow.

    Returns ``{"required": [...], "catalog": {filename: {url, directory}},
    "notes": {node_id: text}}``.
    """
    required: List[dict] = []
    property_models: Dict[str, dict] = {}
    notes: Dict[str, str] = {}

    for node in iter_ui_nodes(workflow):
        ctype = node.get("type") or node.get("class_type") or ""

        if ctype in NOTE_TYPES:
            values = node.get("widgets_values")
            if isinstance(values, list) and values and isinstance(values[0], str):
                text = values[0]
                notes[str(node.get("id"))] = text
                for name, entry in parse_model_links(text).items():
                    _add_candidate(property_models, name, entry.get("url", ""), entry.get("directory", ""))
            continue

        specs = LOADER_INPUTS.get(ctype)
        if specs:
            named = _ui_widget_value(node, specs)
            required.extend(_required_from_node(node, named))

        props = node.get("properties")
        if isinstance(props, dict):
            for entry in props.get("models", []) or []:
                if isinstance(entry, dict):
                    _add_candidate(
                        property_models,
                        entry.get("name", ""),
                        entry.get("url", ""),
                        entry.get("directory", ""),
                    )

    return {"required": required, "catalog": _merge_candidates(property_models), "notes": notes}


def scan_api_workflow(workflow: dict) -> dict:
    """Scan an API-format workflow (``wf.json``) -> required models only."""
    required: List[dict] = []
    for _node_id, node in (workflow or {}).items():
        if not isinstance(node, dict):
            continue
        ctype = node.get("class_type") or node.get("type") or ""
        specs = LOADER_INPUTS.get(ctype)
        if not specs:
            continue
        inputs = node.get("inputs") or {}
        required.extend(_required_from_node({"class_type": ctype}, inputs))
    return {"required": required, "catalog": {}, "notes": {}}


def resolve(required: List[dict], catalog: Dict[str, dict]) -> List[dict]:
    """Join required models with the candidate catalog (by filename)."""
    out = []
    for item in required:
        entry = (catalog or {}).get(item["filename"], {})
        out.append({
            "filename": item["filename"],
            "type": item["type"],
            "base_dir": item["base_dir"],
            "subfolder": item["subfolder"],
            "target": item["target"],
            "url": entry.get("url", ""),
            "directory": entry.get("directory", "") or item["base_dir"],
            "loader": item.get("loader", ""),
            "input": item.get("input", ""),
        })
    return out


def scan(workflow: Any, api: bool = False) -> dict:
    """Convenience: scan + resolve in one call."""
    result = scan_api_workflow(workflow) if api else scan_ui_workflow(workflow)
    return {
        "required": result["required"],
        "catalog": result["catalog"],
        "models": resolve(result["required"], result["catalog"]),
    }
