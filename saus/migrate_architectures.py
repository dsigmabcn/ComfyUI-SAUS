"""Give each architecture a ``models`` group list + ``variants``.

An architecture is defined by the combination of models it needs. Each entry in
``models`` is a group named by its *model type*, listing the files of that type::

    "models": [
      { "id", "type", "need": "all" | "one" | "none",
        "node": {"nodeType","input"},          # derived from the type
        "files": [ {"file", "label"} ] }
    ],
    "variants": {
      "<ID>": { "label", "pick": {modelId: file}, "settings": {...}, "loras": [file] }
    }

The legacy keys (``components`` / ``base_settings`` / ``turbo_settings``) are
kept untouched. The old flat ``models`` filename list is replaced by the groups.

Usage (from the ComfyUI-SAUS folder)::

    python saus/migrate_architectures.py            # dry run
    python saus/migrate_architectures.py --apply    # write (+ backup)
"""

import argparse
import json
import re
import shutil
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "web" / "saus_browser" / "data"
ARCH_FILE = DATA_DIR / "architectures.json"
MODELS_DATA_FILE = DATA_DIR / "models_data.json"

# model type -> (loader node type, input key). Mirrors the LOADER_INPUTS table
# used by the builder's modelscan.js / model_scan.py. A model group's `type`
# determines which workflow node it binds to, so the node is derived, not edited.
TYPE_NODE = {
    "CHECKPOINT": ("CheckpointLoaderSimple", "ckpt_name"),
    "Diffusion model": ("UNETLoader", "unet_name"),
    "VAE": ("VAELoader", "vae_name"),
    "TEXT ENCODER": ("CLIPLoader", "clip_name"),
    "LORA": ("LoraLoader", "lora_name"),
    "MOTION_MODULE": ("ADE_LoadAnimateDiffModel", "model_name"),
    "Latent Upscaler": ("LatentUpscaleModelLoader", "model_name"),
    "Clipvision": ("CLIPVisionLoader", "clip_name"),
    "Style": ("StyleModelLoader", "style_model_name"),
    "CONTROLNET": ("ControlNetLoader", "control_net_name"),
}


def read_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path, data, backup_suffix=".pre-models.bak"):
    if path.exists():
        backup = path.with_name(path.name + backup_suffix)
        if not backup.exists():
            shutil.copy2(path, backup)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slug(text):
    return re.sub(r"[^A-Za-z0-9]+", "_", str(text or "")).strip("_")


def unique(base, used):
    cand = base or "model"
    if cand not in used:
        used.add(cand)
        return cand
    i = 2
    while f"{cand}{i}" in used:
        i += 1
    used.add(f"{cand}{i}")
    return f"{cand}{i}"


def model_ref(key, models_data):
    entry = models_data.get(key)
    if not isinstance(entry, dict) or not entry.get("id"):
        return None
    mtype = entry.get("type", "")
    node_type, inp = TYPE_NODE.get(mtype, ("", ""))
    return {
        "file": entry["id"],
        "label": entry.get("name") or entry["id"],
        "type": mtype,
        "node": {"nodeType": node_type, "input": inp} if node_type else None,
    }


def build_models(components, models_data):
    """One group per model *type* (the group's name)."""
    groups = []
    used = set()

    def add(mtype, need, refs):
        node = next((r["node"] for r in refs if r.get("node")), None)
        groups.append({
            "id": unique(slug(mtype) or "model", used),
            "type": mtype,
            "need": need,
            "node": node,
            "files": [{"file": r["file"], "label": r["label"]} for r in refs],
        })

    for category, need in (("compulsory", "all"), ("at_least_one", "one"), ("optional", "none")):
        by_type = {}
        order = []
        for key in components.get(category) or []:
            ref = model_ref(key, models_data)
            if not ref:
                continue
            mtype = ref["type"] or "model"
            if mtype not in by_type:
                by_type[mtype] = []
                order.append(mtype)
            by_type[mtype].append(ref)
        for mtype in order:
            add(mtype, need, by_type[mtype])
    return groups


def group_for_file(models, filename):
    """Id of the group whose files include ``filename`` (prefer a "one" group)."""
    fallback = None
    for group in models:
        for f in group["files"]:
            if f["file"] == filename:
                if group["need"] == "one":
                    return group["id"]
                fallback = fallback or group["id"]
    return fallback


def build_variant(settings, models, models_data, variant_id, used):
    if not isinstance(settings, dict):
        return None
    name = settings.get("name") or variant_id
    pick = {}
    for key in settings.get("model") or []:
        ref = model_ref(key, models_data)
        if not ref:
            continue
        gid = group_for_file(models, ref["file"])
        if gid:
            pick[gid] = ref["file"]
    numeric = {k: v for k, v in settings.items() if k not in ("name", "model", "lora")}
    loras = []
    for key in settings.get("lora") or []:
        ref = model_ref(key, models_data)
        if ref and ref["file"] not in loras:
            loras.append(ref["file"])
    vid = unique(slug(name).upper() or variant_id, used)
    return vid, {"label": name, "pick": pick, "settings": numeric, "loras": loras}


def models_from_flat(filenames, file_types):
    """Build model-type groups from a flat filename list (no ``components``)."""
    groups = []
    used = set()
    by_type = {}
    order = []
    for fn in filenames:
        if not isinstance(fn, str):
            continue
        mtype = file_types.get(fn, "")
        if mtype not in by_type:
            by_type[mtype] = []
            order.append(mtype)
        by_type[mtype].append(fn)
    for mtype in order:
        node_type, inp = TYPE_NODE.get(mtype, ("", ""))
        groups.append({
            "id": unique(slug(mtype) or "model", used),
            "type": mtype,
            "need": "all",
            "node": {"nodeType": node_type, "input": inp} if node_type else None,
            "files": [{"file": f} for f in by_type[mtype]],
        })
    return groups


def migrate(architectures, models_data, file_types=None):
    if file_types is None:
        file_types = {
            v["id"]: v.get("type", "")
            for v in models_data.values()
            if isinstance(v, dict) and v.get("id")
        }
    changed = 0
    for arch in architectures.values():
        if not isinstance(arch, dict):
            continue
        models = build_models(arch.get("components") or {}, models_data)
        if not models and isinstance(arch.get("models"), list) and arch["models"] and isinstance(arch["models"][0], str):
            models = models_from_flat(arch["models"], file_types)

        variants = {}
        used = set()
        for legacy_key, fallback in (("base_settings", "BASE"), ("turbo_settings", "TURBO")):
            variant = build_variant(arch.get(legacy_key), models, models_data, fallback, used)
            if variant:
                vid, body = variant
                variants[vid] = body

        if models and arch.get("models") != models:
            arch["models"] = models
            changed += 1
        if variants and arch.get("variants") != variants:
            arch["variants"] = variants
            changed += 1
        if arch.pop("slots", None) is not None:
            changed += 1
    return architectures, changed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    args = parser.parse_args(argv)

    architectures = read_json(ARCH_FILE, {})
    models_data = read_json(MODELS_DATA_FILE, {})
    registry = read_json(DATA_DIR / "models.json", {})
    registry = registry.get("models", registry) if isinstance(registry, dict) else {}
    file_types = {
        fn: (entry.get("type") or "")
        for fn, entry in (registry or {}).items()
        if isinstance(entry, dict)
    }
    for v in models_data.values():
        if isinstance(v, dict) and v.get("id"):
            file_types.setdefault(v["id"], v.get("type", ""))
    architectures, changed = migrate(architectures, models_data, file_types)

    print(f"[arch-migrate] mode={'APPLY' if args.apply else 'DRY-RUN'} "
          f"architectures={len(architectures)} changed={changed}")

    if not args.apply:
        for name, arch in architectures.items():
            models = arch.get("models") or []
            variants = list((arch.get("variants") or {}).keys())
            if models:
                spec = ", ".join(f"{g.get('type') or g.get('id')}:{g.get('need')}" for g in models)
                print(f"  {name}: models=[{spec}] variants={variants}")

    if args.apply:
        write_json(ARCH_FILE, architectures)
        print(f"[arch-migrate] wrote {ARCH_FILE} (backup: {ARCH_FILE.name}.pre-models.bak)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
