"""Find a model file in any of ComfyUI's model folders.

ComfyUI registers each *folder type* (``diffusion_models``, ``loras``, ...) with
one or more directories -- for example ``diffusion_models`` covers both
``models/unet`` and ``models/diffusion_models`` -- and lists their contents
(sub-folders included) through ``folder_paths.get_filename_list``.

SAUS therefore never hardcodes where a model lives: it asks ComfyUI. The
registry's ``directory`` field is only a *hint* (search priority and download
destination). A future Model Manager can drive the layout without the API
endpoints having to change.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .constants import SAUSMSG, logger
from .model_scan import candidate_folder_types, match_folder_names

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


def find_model(filename: str, model_type: str = "", hint_dir: str = "") -> Optional[dict]:
    """Locate ``filename`` anywhere ComfyUI looks for models.

    Both the folder *and* any sub-folder are ignored, so a diffusion model in
    ``unet/`` is found just like one in ``diffusion_models/``, and a LoRA in
    ``loras/my-style/`` like one in ``loras/``.

    Returns ``{"folder_type", "relative_name", "path", "directories"}`` for the
    first match, otherwise ``None``.
    """
    wanted = str(filename or "").strip()
    if not wanted:
        return None

    types = candidate_folder_types(model_type, hint_dir, known_folder_types())
    if folder_paths is not None:
        map_legacy = getattr(folder_paths, "map_legacy", None)
        if callable(map_legacy):
            try:
                # ComfyUI's own aliases: unet -> diffusion_models, clip -> text_encoders
                types = [map_legacy(t) for t in types]
            except Exception:
                pass

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

    Prefers the ComfyUI directory for the model's type (so ``--models-directory``
    and ``extra_model_paths.yaml`` are respected); the caller falls back to
    ``<ComfyUI>/models`` when nothing is registered.
    """
    for folder_type in candidate_folder_types(model_type, hint_dir, known_folder_types()):
        directories = _directories(folder_type)
        if directories:
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
