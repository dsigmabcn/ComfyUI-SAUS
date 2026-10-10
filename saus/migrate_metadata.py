"""One-off migration for the SAUS metadata refactor.

Folds ``web/saus_browser/data/app_list.json`` into each app's
``appConfig.json`` (a new ``metadata`` block) and builds a filename-keyed model
registry (``models.json``).

Non-destructive: existing files are backed up to ``*.bak`` and the old files
(``app_list.json`` / ``models_data.json`` / ``architectures.json``) are left in
place so nothing breaks until the readers are switched over.

Usage (from the ComfyUI-SAUS folder)::

    python saus/migrate_metadata.py            # dry run: print what would change
    python saus/migrate_metadata.py --apply    # write changes (+ backups)
    python saus/migrate_metadata.py --apply --force   # also re-write existing metadata
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

SAUS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SAUS_DIR))

from saus import model_scan as ms  # noqa: E402

DATA_DIR = SAUS_DIR / "web" / "saus_browser" / "data"
APPS_DIR = SAUS_DIR / "web" / "apps"
SCHEMA_VERSION = 1


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}")


def write_json(path: Path, data) -> None:
    if path.exists():
        backup = path.with_name(path.name + ".bak")
        if not backup.exists():
            shutil.copy2(path, backup)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def as_list(value):
    if isinstance(value, list):
        return value
    return [value] if value else []


def normalize_tags(row) -> dict:
    tags = (row or {}).get("tags") or {}
    if isinstance(tags, list):  # very old shape
        return {"type": [], "base_models": [], "other": list(tags)}
    return {
        "type": as_list(tags.get("type")),
        "base_models": as_list(tags.get("base_models")),
        "other": as_list(tags.get("other")),
    }


def build_registry(models_data: dict):
    """models_data.json (keyed by arbitrary KEY) -> {filename: entry}."""
    registry = {}
    conflicts = []
    for key, value in (models_data or {}).items():
        if not isinstance(value, dict):
            continue
        filename = value.get("id")
        if not filename:
            continue
        entry = {
            "name": value.get("name", "") or filename,
            "type": value.get("type", ""),
            "url": value.get("url_model", ""),
            "directory": value.get("model_path", "") or "",
            "thumbnail": value.get("thumbnail_path", ""),
            "source": "migrated",
        }
        if filename in registry and registry[filename].get("url") != entry["url"]:
            conflicts.append({"filename": filename, "kept": registry[filename].get("url"), "dropped": entry["url"]})
            continue
        registry.setdefault(filename, entry)
    return registry, conflicts


def collect_app_models(configs):
    """Derive required models per app from each app's ``wf.json``."""
    app_models = {}
    for conf_path in configs:
        wf_path = conf_path.parent / "wf.json"
        wf = read_json(wf_path, None) if wf_path.exists() else None
        app_models[conf_path] = ms.scan(wf, api=True)["models"] if wf else []
    return app_models


def add_derived(registry: dict, app_models: dict) -> list:
    """Add filenames that apps need but the registry doesn't know yet."""
    derived = []
    for models in app_models.values():
        for model in models:
            filename = model["filename"]
            if filename in registry:
                continue
            registry[filename] = {
                "name": filename,
                "type": model["type"],
                "url": "",
                "directory": model["target"],
                "thumbnail": "",
                "source": "derived",
            }
            derived.append(filename)
    return derived


def migrate_architectures(architectures: dict, models_data: dict):
    """Add a filename-based ``models`` set to each architecture.

    Old ``components.compulsory`` lists referenced ``models_data`` keys; they are
    translated to concrete filenames here. The old fields are left in place so
    the current runtime/browser keep working until they are switched over.
    """
    key_to_file = {
        key: value.get("id")
        for key, value in (models_data or {}).items()
        if isinstance(value, dict) and value.get("id")
    }
    changed = 0
    for arch in (architectures or {}).values():
        if not isinstance(arch, dict):
            continue
        compulsory = (arch.get("components") or {}).get("compulsory") or []
        files = []
        for key in compulsory:
            filename = key_to_file.get(key)
            if filename and filename not in files:
                files.append(filename)
        if files and arch.get("models") != files:
            arch["models"] = files
            changed += 1
    return architectures, changed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry run)")
    parser.add_argument("--force", action="store_true", help="overwrite existing metadata blocks")
    args = parser.parse_args(argv)

    app_list = read_json(DATA_DIR / "app_list.json", [])
    models_data = read_json(DATA_DIR / "models_data.json", {})
    architectures = read_json(DATA_DIR / "architectures.json", {})
    by_id = {row.get("id"): row for row in app_list if isinstance(row, dict)}

    registry, conflicts = build_registry(models_data)
    configs = sorted(APPS_DIR.rglob("appConfig.json"))
    app_models = collect_app_models(configs)
    derived = add_derived(registry, app_models)
    architectures, arch_changed = migrate_architectures(architectures, models_data)

    report = {
        "applied": args.apply,
        "schemaVersion": SCHEMA_VERSION,
        "apps": [],
        "registrySize": len(registry),
        "conflicts": conflicts,
        "derivedModels": derived,
        "architecturesUpdated": arch_changed,
    }

    for conf_path in configs:
        conf = read_json(conf_path, {})
        url = conf.get("url") or conf_path.parent.name
        row = by_id.get(conf.get("id"))
        models = app_models.get(conf_path, [])
        filenames = [m["filename"] for m in models]
        unmatched = [n for n in filenames if not registry.get(n, {}).get("url")]

        if "metadata" in conf and not args.force:
            report["apps"].append({"url": url, "status": "skipped (has metadata)"})
            continue

        metadata = {
            "schemaVersion": SCHEMA_VERSION,
            "category": (row or {}).get("category") or "other",
            "tags": normalize_tags(row),
            "architecture": (row or {}).get("architecture") or None,
            "models": filenames,
        }
        if args.apply:
            conf["metadata"] = metadata
            write_json(conf_path, conf)
        report["apps"].append({
            "url": url,
            "status": "written" if args.apply else "would write",
            "category": metadata["category"],
            "architecture": metadata["architecture"],
            "models": len(filenames),
            "modelsMissingUrl": unmatched,
        })

    if args.apply:
        write_json(DATA_DIR / "models.json", {"schemaVersion": SCHEMA_VERSION, "models": registry})
        write_json(DATA_DIR / "architectures.json", architectures)
        write_json(DATA_DIR / "migration_report.json", report)

    written = sum(1 for a in report["apps"] if a["status"].startswith("written") or a["status"] == "would write")
    print(f"[migrate] mode={'APPLY' if args.apply else 'DRY-RUN'} apps={len(configs)} updated={written} "
          f"registry={len(registry)} derived={len(derived)} conflicts={len(conflicts)} archs+={arch_changed}")
    for app in report["apps"]:
        if app.get("modelsMissingUrl"):
            print(f"[migrate]   {app['url']}: {len(app['modelsMissingUrl'])} model(s) without URL -> {app['modelsMissingUrl']}")
    if conflicts:
        print(f"[migrate]   filename conflicts (kept first URL): {conflicts}")
    if not args.apply:
        print("[migrate] dry run only; re-run with --apply to write.")


if __name__ == "__main__":
    main()

