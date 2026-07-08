#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_ROOT = PROJECT_ROOT.parent / "profile_perfect_xapk"
DEFAULT_INDEX = DEFAULT_SOURCE_ROOT / "unity_textures_png_index.csv"
DEFAULT_RESOURCES = PROJECT_ROOT / "assets" / "resources"
DEFAULT_MANIFEST = PROJECT_ROOT / "assets" / "resources" / "data" / "texture-manifest.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import extracted Unity Texture2D PNGs into Cocos resources.")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--resources-dir", type=Path, default=DEFAULT_RESOURCES)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    textures: dict[str, dict] = {}
    copied = 0

    with args.index.open(newline="", encoding="utf8") as file:
        for row in csv.DictReader(file):
            source = args.source_root / row["file"]
            if not source.exists():
                continue

            relative = Path("textures_all") / Path(row["file"]).relative_to("unity_textures_png")
            destination = args.resources_dir / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists() or source.stat().st_size != destination.stat().st_size:
                shutil.copy2(source, destination)
                copied += 1

            asset_key = str(relative.with_suffix("")).replace("\\", "/")
            textures[str(row["path_id"])] = {
                "pathId": str(row["path_id"]),
                "name": row["name"],
                "bundle": row["bundle"],
                "assetKey": asset_key,
                "file": str(relative).replace("\\", "/"),
                "width": int(row["width"] or 0),
                "height": int(row["height"] or 0),
            }

    manifest = {
        "source": {
            "index": str(args.index),
            "sourceRoot": str(args.source_root),
            "textureCount": len(textures),
            "copiedThisRun": copied,
        },
        "textures": textures,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf8")

    print(f"Textures imported: {len(textures)}")
    print(f"Copied this run: {copied}")
    print(f"Wrote {args.manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
