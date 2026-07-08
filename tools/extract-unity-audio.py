#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

import UnityPy


def safe_name(value: str) -> str:
    value = value.replace("\\", "/").split("/")[-1]
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return value or "audio"


def resource_load_path(project_root: Path, output_path: Path) -> str:
    resources = project_root / "assets" / "resources"
    relative = output_path.relative_to(resources).as_posix()
    return re.sub(r"\.[^/.]+$", "", relative)


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def iter_source_files(source_roots):
    for source_root in source_roots:
        if not source_root.exists():
            continue
        for source_path in sorted(path for path in source_root.rglob("*") if path.is_file()):
            if source_path.name.endswith(".meta"):
                continue
            yield source_path


def main():
    parser = argparse.ArgumentParser(description="Extract Unity AudioClip samples as Cocos-importable audio files.")
    parser.add_argument("--project", default=".", help="Cocos project root")
    parser.add_argument("--manifest", required=True, help="JSON manifest output path")
    args = parser.parse_args()

    project_root = Path(args.project).resolve()
    original_root = project_root / "assets" / "original_unity"
    output_root = project_root / "assets" / "resources" / "converted" / "audio"
    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = project_root / manifest_path

    shutil.rmtree(output_root, ignore_errors=True)
    output_root.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    source_roots = [
        original_root / "unity_bundles",
        original_root / "unity_data",
    ]

    by_key = {}
    errors = []
    scanned_files = 0
    seen_objects = 0

    for source_path in iter_source_files(source_roots):
        scanned_files += 1
        try:
            env = UnityPy.load(str(source_path))
        except Exception as exc:
            errors.append({
                "sourcePath": source_path.relative_to(project_root).as_posix(),
                "error": type(exc).__name__,
                "message": str(exc)[:300],
            })
            continue

        for obj in env.objects:
            if obj.type.name != "AudioClip":
                continue
            seen_objects += 1
            try:
                clip = obj.read()
                samples = clip.samples
            except Exception as exc:
                errors.append({
                    "sourcePath": source_path.relative_to(project_root).as_posix(),
                    "pathId": str(getattr(obj, "path_id", "")),
                    "error": type(exc).__name__,
                    "message": str(exc)[:300],
                })
                continue

            for sample_name, sample_bytes in sorted(samples.items()):
                digest = file_sha256(sample_bytes)
                clip_name = safe_name(getattr(clip, "m_Name", "") or Path(sample_name).stem)
                sample_file_name = safe_name(sample_name)
                suffix = Path(sample_file_name).suffix.lower()
                if suffix not in {".wav", ".mp3", ".ogg", ".m4a", ".aac"}:
                    suffix = ".wav"
                base_name = safe_name(Path(sample_file_name).stem or clip_name)
                key = (base_name.lower(), digest)
                source_rel = source_path.relative_to(project_root).as_posix()

                if key in by_key:
                    by_key[key]["sources"].append(source_rel)
                    continue

                output_name = f"{base_name}{suffix}"
                output_path = output_root / output_name
                if output_path.exists():
                    output_name = f"{base_name}_{digest[:8]}{suffix}"
                    output_path = output_root / output_name

                output_path.write_bytes(sample_bytes)
                by_key[key] = {
                    "name": base_name,
                    "clipName": clip_name,
                    "fileName": output_name,
                    "sourcePath": source_rel,
                    "sources": [source_rel],
                    "outputPath": output_path.relative_to(project_root).as_posix(),
                    "resourceLoadPath": resource_load_path(project_root, output_path),
                    "bytes": len(sample_bytes),
                    "sha256": digest,
                    "originalExtension": suffix,
                    "cocosExtension": suffix,
                    "importType": "AudioClip",
                    "channels": getattr(clip, "m_Channels", None),
                    "frequency": getattr(clip, "m_Frequency", None),
                    "bitsPerSample": getattr(clip, "m_BitsPerSample", None),
                    "lengthSeconds": getattr(clip, "m_Length", None),
                    "loadType": getattr(clip, "m_LoadType", None),
                    "compressionFormat": getattr(clip, "m_CompressionFormat", None),
                }

    entries = sorted(by_key.values(), key=lambda item: item["fileName"].lower())
    manifest = {
        "version": 1,
        "sourceRoots": [root.relative_to(project_root).as_posix() for root in source_roots],
        "outputRoot": output_root.relative_to(project_root).as_posix(),
        "scannedFiles": scanned_files,
        "audioClipObjects": seen_objects,
        "uniqueAudioFiles": len(entries),
        "duplicateObjects": max(0, seen_objects - len(entries)),
        "errors": errors,
        "entries": entries,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "scannedFiles": scanned_files,
        "audioClipObjects": seen_objects,
        "uniqueAudioFiles": len(entries),
        "errors": len(errors),
        "manifest": manifest_path.relative_to(project_root).as_posix(),
    }, indent=2))


if __name__ == "__main__":
    main()
