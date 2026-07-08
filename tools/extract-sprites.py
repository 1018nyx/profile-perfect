#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE_DIR = PROJECT_ROOT.parent / "profile_perfect_xapk" / "base_apk" / "assets" / "aa" / "Android"
DEFAULT_LEVELS = PROJECT_ROOT / "assets" / "resources" / "data" / "levels.json"
DEFAULT_RESOURCES = PROJECT_ROOT / "assets" / "resources"
DEFAULT_MANIFEST = PROJECT_ROOT / "assets" / "resources" / "data" / "sprite-manifest.json"


def add_dependency_paths() -> None:
    for path in (PROJECT_ROOT / "tools" / ".python", Path("/tmp/profile-perfect-unitypy")):
        if path.exists():
            sys.path.insert(0, str(path))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract Unity Sprite PNGs used by converted Profile Perfect levels.")
    parser.add_argument("--bundle-dir", type=Path, default=DEFAULT_BUNDLE_DIR)
    parser.add_argument("--levels-json", type=Path, default=DEFAULT_LEVELS)
    parser.add_argument("--resources-dir", type=Path, default=DEFAULT_RESOURCES)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--mode", choices=["used", "all-sprites"], default="used")
    parser.add_argument("--limit", type=int, default=30, help="Number of ordered levels to inspect. Use 0 for all levels.")
    return parser.parse_args()


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return slug.strip("._") or "sprite"


def load_required_path_ids(levels_json: Path, limit: int) -> set[str]:
    data = json.loads(levels_json.read_text(encoding="utf8"))
    levels = data.get("levels", [])
    order = data.get("orderedLevelIds") or [level.get("id") for level in levels]
    allowed_ids = set(order[:limit]) if limit > 0 else {level.get("id") for level in levels}
    required: set[str] = set()

    for level in levels:
        if level.get("id") not in allowed_ids:
            continue
        for cell in level.get("cells", []):
            for value in cell.get("values", []):
                sprite = value.get("sprite") or {}
                path_id = str(sprite.get("pathId", "0"))
                if path_id != "0":
                    required.add(path_id)

    return required


def load_manifest(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text(encoding="utf8"))
    return {"sprites": {}}


def write_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf8")


def main() -> int:
    add_dependency_paths()
    try:
        import UnityPy
    except ImportError:
        print("UnityPy is required. Install it with:", file=sys.stderr)
        print("python3 -m pip install --target /tmp/profile-perfect-unitypy UnityPy", file=sys.stderr)
        return 2

    args = parse_args()
    required = load_required_path_ids(args.levels_json, args.limit) if args.mode == "used" else None
    manifest = load_manifest(args.manifest)
    sprites = manifest.setdefault("sprites", {})
    remaining = set(required) - set(sprites) if required is not None else None
    extracted = 0
    seen = 0

    if remaining is not None and not remaining:
        print(f"Sprite manifest already covers {len(required)} required sprite ids.")
        write_manifest(args.manifest, manifest)
        return 0

    bundles = sorted(args.bundle_dir.glob("*.bundle"))
    for bundle in bundles:
        if remaining is not None and not remaining:
            break

        try:
            env = UnityPy.load(str(bundle))
        except Exception as error:
            print(f"Skipped unreadable bundle {bundle.name}: {error}", file=sys.stderr)
            continue

        bundle_key = bundle.stem
        for obj in env.objects:
            if remaining is not None and not remaining:
                break
            if getattr(obj.type, "name", str(obj.type)) != "Sprite":
                continue

            path_id = str(obj.path_id)
            seen += 1
            if remaining is not None and path_id not in remaining:
                continue
            if remaining is None and path_id in sprites:
                continue

            try:
                data = obj.read()
                image = data.image
            except Exception as error:
                print(f"Skipped sprite {path_id} in {bundle.name}: {error}", file=sys.stderr)
                continue

            if image is None:
                continue

            name = safe_slug(getattr(data, "m_Name", "") or f"sprite_{path_id}")
            file_name = f"{name}_{path_id}.png"
            relative_png = Path("sprites") / bundle_key / file_name
            png_path = args.resources_dir / relative_png
            png_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(png_path)

            asset_key = str(relative_png.with_suffix("")).replace("\\", "/")
            sprites[path_id] = {
                "pathId": path_id,
                "name": getattr(data, "m_Name", name),
                "bundle": bundle.name,
                "assetKey": asset_key,
                "file": str(relative_png).replace("\\", "/"),
                "width": image.width,
                "height": image.height,
            }
            if remaining is not None:
                remaining.remove(path_id)
            extracted += 1

    manifest["source"] = {
        "bundleDir": str(args.bundle_dir),
        "levelsJson": str(args.levels_json),
        "mode": args.mode,
        "limit": args.limit,
        "requiredCount": len(required) if required is not None else seen,
        "extractedThisRun": extracted,
        "missingCount": len(remaining) if remaining is not None else 0,
    }
    manifest["missingPathIds"] = sorted(remaining) if remaining is not None else []
    write_manifest(args.manifest, manifest)

    print(f"Mode: {args.mode}")
    print(f"Required sprite ids: {len(required) if required is not None else seen}")
    print(f"Extracted this run: {extracted}")
    print(f"Manifest sprites: {len(sprites)}")
    print(f"Missing sprite ids: {len(remaining) if remaining is not None else 0}")
    print(f"Wrote {args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
