"""Find a model file in any of ComfyUI's model folders.

SAUS never hardcodes where a model lives: it asks ComfyUI for the directories of a
folder *type* (``diffusion_models`` covers ``models/unet`` *and*
``models/diffusion_models``) and reads the registry's ``directory`` as a hint for
search order and download destination only, so a future Model Manager can rearrange
the layout without the API changing.

Only weight folders are ever consulted (``MODEL_FOLDER_TYPES``): ``custom_nodes``
and ``datasets`` sit in the same ComfyUI table but hold code and data.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .constants import SAUSMSG, logger
from .model_scan import (
    candidate_folder_types,
    match_folder_names,
    normalise_folder_name,
    MODEL_FOLDER_TYPES,
)

try:  # ComfyUI is always present at runtime; stay importable without it.
    import folder_paths
except Exception:  # pragma: no cover - only outside ComfyUI
    folder_paths = None


def known_folder_types() -> List[str]:
    """Every folder type ComfyUI knows about (core + custom nodes + extras)."""
    if folder_paths is None:
        return []
    try:
        return list(getattr(folder_paths, "folder_names_and_paths", {}) or {})
    except Exception:
        return []


def _listing(folder_type: str) -> List[str]:
    """ComfyUI's own (cached, sub-folder aware) listing for a folder type."""
    if folder_paths is None:
        return []
    try:
        return list(folder_paths.get_filename_list(folder_type) or [])
    except Exception:
        return []


def _directories(folder_type: str) -> List[Path]:
    if folder_paths is None:
        return []
    try:
        return [Path(p) for p in (folder_paths.get_folder_paths(folder_type) or [])]
    except Exception:
        return []


def model_folder_candidates(model_type: str = "", hint_dir: str = "") -> List[str]:
    """ComfyUI *model* folder types to search, most likely first. Weight folders only:
    a ``custom_nodes`` destination plus the restart route is code execution and a
    delete there is sabotage, so the filter is the whole point here.
    """
    types = candidate_folder_types(model_type, hint_dir, known_folder_types())
    if folder_paths is not None:
        map_legacy = getattr(folder_paths, "map_legacy", None)
        if callable(map_legacy):
            try:
                # ComfyUI's own aliases: unet -> diffusion_models, clip -> text_encoders
                types = [map_legacy(t) for t in types]
            except Exception:
                pass

    # The mapping can collide with a type that is already listed (``unet`` ->
    # ``diffusion_models`` when that is the model's own folder type), and a
    # duplicate would make destination_for() weigh the same folder twice.
    allowed: List[str] = []
    for name in types:
        if name in MODEL_FOLDER_TYPES and name not in allowed:
            allowed.append(name)
    return allowed


def model_folder_directories() -> List[Path]:
    """Every directory ComfyUI registered for a model folder type.

    The allowed roots for a download: a target has to sit inside one of these (or
    the models root), never in a folder ComfyUI registered for something else.
    """
    directories: List[Path] = []
    for folder_type in known_folder_types():
        if folder_type in MODEL_FOLDER_TYPES:
            directories.extend(_directories(folder_type))
    return directories


def find_model(filename: str, model_type: str = "", hint_dir: str = "") -> Optional[dict]:
    """Locate ``filename`` anywhere ComfyUI looks for models: the folder *and* any
    sub-folder are ignored, so a diffusion model in ``unet/`` is found like one in
    ``diffusion_models/`` and a LoRA in ``loras/my-style/`` like one in ``loras/``.
    Returns ``{"folder_type", "relative_name", "path", "directories"}`` for the first
    match, else ``None``.
    """
    wanted = str(filename or "").strip()
    if not wanted:
        return None

    types = model_folder_candidates(model_type, hint_dir)

    seen = set()
    for folder_type in types:
        if folder_type in seen:
            continue
        seen.add(folder_type)

        relative = match_folder_names(_listing(folder_type), wanted)
        if not relative:
            continue

        directories = _directories(folder_type)
        for directory in directories:
            candidate = directory / relative
            if candidate.is_file():
                return {
                    "folder_type": folder_type,
                    "relative_name": relative,
                    "path": candidate,
                    "directories": directories,
                }

        # ComfyUI listed it but the on-disk check did not confirm: still report,
        # so a permission quirk cannot make a model look "missing".
        if directories:
            return {
                "folder_type": folder_type,
                "relative_name": relative,
                "path": directories[0] / relative,
                "directories": directories,
            }

    logger.debug(f"{SAUSMSG}: '{wanted}' was not found in any ComfyUI model folder")
    return None


def destination_for(model_type: str = "", hint_dir: str = "") -> Optional[Path]:
    """Directory a new download should go into, or ``None``.

    Prefers the ComfyUI directory registered for the model's type (so
    ``--models-directory`` and ``extra_model_paths.yaml`` are respected), and the
    caller falls back to ``<ComfyUI>/models``. A hint picks *which* registered
    directory, never the path: ``diffusion_models`` covers both ``models/unet`` and
    ``models/diffusion_models``, and always taking the first is how a catalog saying
    ``diffusion_models`` used to end up in ``unet/``.
    """
    hint = normalise_folder_name(hint_dir)
    for folder_type in model_folder_candidates(model_type, hint_dir):
        directories = _directories(folder_type)
        if not directories:
            continue
        if hint:
            for directory in directories:
                if directory.name.strip().lower() == hint:
                    return directory
        return directories[0]
    return None


def resolves_inside(path: Path, directories) -> bool:
    """True when ``path`` (resolved) is inside one of ``directories``.

    Used before deleting a file: the allowed roots are the ones ComfyUI itself
    registered for that folder type, never a request-supplied path.
    """
    try:
        target = Path(path).resolve()
    except Exception:
        return False
    for directory in directories or []:
        try:
            root = Path(directory).resolve()
        except Exception:
            continue
        if target == root or root in target.parents:
            return True
    return False
