#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

import UnityPy


sys.setrecursionlimit(20000)

HIERARCHY_TYPES = {"GameObject", "Transform", "RectTransform"}
SCENE_RELATED_TYPES = {
    "GameObject",
    "Transform",
    "RectTransform",
    "Camera",
    "Light",
    "AudioListener",
    "Canvas",
    "CanvasRenderer",
    "SpriteRenderer",
    "MeshRenderer",
    "ParticleSystem",
    "ParticleSystemRenderer",
    "Animator",
    "RenderSettings",
    "LightmapSettings",
    "NavMeshSettings",
    "OcclusionCullingSettings",
}
SCENE_SETTING_TYPES = {
    "RenderSettings",
    "LightmapSettings",
    "NavMeshSettings",
    "OcclusionCullingSettings",
}
NAMED_ASSET_TYPES = {
    "Sprite",
    "Texture2D",
    "SpriteAtlas",
    "Material",
    "Shader",
    "Font",
    "AudioClip",
    "AnimationClip",
    "AnimatorController",
    "Mesh",
    "TextAsset",
    "Cubemap",
    "ComputeShader",
}
COMMON_COMPONENT_FIELDS = {
    "m_GameObject",
    "m_Script",
    "m_PrefabInstance",
    "m_PrefabAsset",
    "m_CorrespondingSourceObject",
}


def id_str(value):
    if value is None:
        return None
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return None
    if numeric == 0:
        return None
    return str(numeric)


def safe_slug(value):
    value = value.replace("\\", "/")
    value = re.sub(r"\.bundle$", "", value, flags=re.IGNORECASE)
    value = re.sub(r"[^A-Za-z0-9._/-]+", "_", value)
    value = value.replace("/", "__").strip("._-")
    return value or "scene"


def source_scene_id(source_path, original_root):
    try:
        relative = source_path.relative_to(original_root).as_posix()
    except ValueError:
        relative = source_path.name
    return safe_slug(relative)


def category_for_source(source_path):
    name = source_path.name.lower()
    if name.startswith("mainlevel_"):
        return "main-level"
    if name.startswith("portrait"):
        return "portrait"
    if name.startswith("dailychallenge"):
        return "daily-challenge"
    if name.startswith("ui_") or "_ui_" in name or name == "ui_assets_all.bundle":
        return "ui"
    if "tutorial" in name:
        return "tutorial"
    if "event" in name:
        return "event"
    if source_path.parent.name == "bin_Data":
        return "unity-data"
    return "prefab"


def kind_for_scene(category, has_nodes):
    if not has_nodes:
        return "unity-scene-settings"
    if category == "main-level":
        return "unity-mainlevel-hierarchy"
    if category == "ui":
        return "unity-ui-scene-hierarchy"
    if category == "unity-data":
        return "unity-data-scene-hierarchy"
    return "unity-prefab-scene-hierarchy"


def relpath(project_root, path):
    return path.relative_to(project_root).as_posix()


def iter_source_files(source_roots):
    for source_root in source_roots:
        if not source_root.exists():
            continue
        for source_path in sorted(path for path in source_root.rglob("*") if path.is_file()):
            if source_path.name.endswith(".meta"):
                continue
            yield source_path


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_pptr(value):
    return isinstance(value, dict) and "m_FileID" in value and "m_PathID" in value


def pptr_dict(value):
    if not isinstance(value, dict):
        file_id = getattr(value, "m_FileID", None)
        path_id = getattr(value, "m_PathID", None)
        if file_id is None and path_id is None:
            return None
        value = {"m_FileID": file_id, "m_PathID": path_id}

    if "m_FileID" not in value and "m_PathID" not in value:
        return None
    return {
        "fileId": int(value.get("m_FileID") or 0),
        "pathId": id_str(value.get("m_PathID")),
    }


def pptr_id(value):
    pointer = pptr_dict(value)
    return pointer["pathId"] if pointer else None


def component_id_from_pair(value):
    if isinstance(value, dict):
        return pptr_id(value.get("component") or value.get("m_Component") or value)
    return pptr_id(getattr(value, "component", None) or getattr(value, "m_Component", None) or value)


def vector(value, keys):
    if not isinstance(value, dict):
        return None
    result = {}
    for key in keys:
        if key in value:
            item = value[key]
            if isinstance(item, (int, float)):
                result[key] = item
    return result or None


def transform_payload(type_name, tree):
    payload = {
        "type": type_name,
        "localPosition": vector(tree.get("m_LocalPosition"), ("x", "y", "z")),
        "localRotation": vector(tree.get("m_LocalRotation"), ("x", "y", "z", "w")),
        "localScale": vector(tree.get("m_LocalScale"), ("x", "y", "z")),
    }
    if type_name == "RectTransform":
        payload.update({
            "anchorMin": vector(tree.get("m_AnchorMin"), ("x", "y")),
            "anchorMax": vector(tree.get("m_AnchorMax"), ("x", "y")),
            "anchoredPosition": vector(tree.get("m_AnchoredPosition"), ("x", "y")),
            "sizeDelta": vector(tree.get("m_SizeDelta"), ("x", "y")),
            "pivot": vector(tree.get("m_Pivot"), ("x", "y")),
        })
    return {key: value for key, value in payload.items() if value is not None}


def compact_value(value, depth=0):
    if depth > 6:
        return {"truncated": "max-depth"}
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value if len(value) <= 500 else value[:500] + "...[truncated]"
    if isinstance(value, bytes):
        return {
            "byteLength": len(value),
            "sha256": hashlib.sha256(value).hexdigest(),
        }
    if is_pptr(value):
        return pptr_dict(value)
    if isinstance(value, list):
        items = [compact_value(item, depth + 1) for item in value[:80]]
        if len(value) > 80:
            items.append({"truncatedItems": len(value) - 80})
        return items
    if isinstance(value, dict):
        output = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= 140:
                output["_truncatedKeys"] = len(value) - 140
                break
            output[key] = compact_value(item, depth + 1)
        return output
    return str(value)


def collect_references(value, field_path="", refs=None):
    if refs is None:
        refs = []
    if len(refs) >= 120:
        return refs
    if is_pptr(value):
        pointer = pptr_dict(value)
        if pointer and pointer["pathId"]:
            refs.append({
                "field": field_path or "$",
                "fileId": pointer["fileId"],
                "pathId": pointer["pathId"],
            })
        return refs
    if isinstance(value, list):
        for index, item in enumerate(value[:120]):
            collect_references(item, f"{field_path}[{index}]" if field_path else f"[{index}]", refs)
            if len(refs) >= 120:
                break
        return refs
    if isinstance(value, dict):
        for key, item in value.items():
            next_path = f"{field_path}.{key}" if field_path else key
            collect_references(item, next_path, refs)
            if len(refs) >= 120:
                break
    return refs


def read_tree(obj):
    try:
        return obj.read_typetree(), None
    except Exception as exc:
        return None, {
            "pathId": id_str(getattr(obj, "path_id", None)),
            "type": obj.type.name,
            "error": type(exc).__name__,
            "message": str(exc)[:300],
        }


def peek_name(obj):
    try:
        value = obj.peek_name()
    except Exception:
        return ""
    return value or ""


def build_scene(project_root, original_root, source_path, env):
    object_counts = Counter(obj.type.name for obj in env.objects)
    object_by_id = {id_str(obj.path_id): obj for obj in env.objects if id_str(obj.path_id)}
    game_objects = {}
    transforms = {}
    component_type_by_id = {}
    extraction_errors = []

    for obj_id, obj in object_by_id.items():
        component_type_by_id[obj_id] = obj.type.name
        if obj.type.name == "GameObject":
            tree, error = read_tree(obj)
            if error:
                extraction_errors.append(error)
                continue
            component_ids = [
                component_id
                for component_id in (component_id_from_pair(item) for item in tree.get("m_Component", []))
                if component_id
            ]
            game_objects[obj_id] = {
                "id": obj_id,
                "name": tree.get("m_Name") or peek_name(obj) or f"GameObject_{obj_id}",
                "active": bool(tree.get("m_IsActive", True)),
                "layer": tree.get("m_Layer"),
                "tag": tree.get("m_Tag"),
                "componentIds": component_ids,
            }
        elif obj.type.name in {"Transform", "RectTransform"}:
            tree, error = read_tree(obj)
            if error:
                extraction_errors.append(error)
                continue
            transforms[obj_id] = {
                "id": obj_id,
                "type": obj.type.name,
                "gameObject": pptr_id(tree.get("m_GameObject")),
                "parentTransform": pptr_id(tree.get("m_Father")),
                "childrenTransforms": [
                    child_id for child_id in (pptr_id(item) for item in tree.get("m_Children", [])) if child_id
                ],
                "payload": transform_payload(obj.type.name, tree),
            }

    transform_by_game_object = {
        transform["gameObject"]: transform_id
        for transform_id, transform in transforms.items()
        if transform.get("gameObject")
    }
    game_object_by_transform = {
        transform_id: transform["gameObject"]
        for transform_id, transform in transforms.items()
        if transform.get("gameObject")
    }

    nodes = {}
    for go_id, game_object in game_objects.items():
        transform_id = transform_by_game_object.get(go_id)
        transform = transforms.get(transform_id, {})
        parent_go_id = game_object_by_transform.get(transform.get("parentTransform"))
        child_go_ids = [
            child_go_id
            for child_go_id in (game_object_by_transform.get(child_transform) for child_transform in transform.get("childrenTransforms", []))
            if child_go_id
        ]
        node_component_ids = [
            component_id
            for component_id in game_object["componentIds"]
            if component_type_by_id.get(component_id) not in {"Transform", "RectTransform"}
        ]
        nodes[go_id] = {
            "id": go_id,
            "name": game_object["name"],
            "active": game_object["active"],
            "layer": game_object["layer"],
            "tag": game_object["tag"],
            "parent": parent_go_id if parent_go_id in game_objects else None,
            "children": child_go_ids,
            "transformId": transform_id,
            "transform": transform.get("payload"),
            "componentIds": node_component_ids,
            "componentTypes": [component_type_by_id.get(component_id, "Missing") for component_id in node_component_ids],
        }

    for node_id, node in nodes.items():
        for child_id in list(node["children"]):
            if child_id in nodes:
                nodes[child_id]["parent"] = node_id

    root_ids = [node_id for node_id, node in nodes.items() if not node.get("parent") or node["parent"] not in nodes]
    root_ids.sort(key=lambda item: nodes[item]["name"].lower())

    def assign_paths(node_id, prefix, seen):
        if node_id in seen or node_id not in nodes:
            return
        seen.add(node_id)
        node = nodes[node_id]
        safe_name = node["name"].replace("/", "_") or node_id
        node["path"] = f"{prefix}/{safe_name}" if prefix else safe_name
        for child_id in node.get("children", []):
            assign_paths(child_id, node["path"], seen)

    seen_paths = set()
    for root_id in root_ids:
        assign_paths(root_id, "", seen_paths)
    for node_id in nodes:
        if node_id not in seen_paths:
            assign_paths(node_id, "[orphan]", seen_paths)

    components = {}
    reference_ids = set()
    component_type_counts = Counter()
    for node in nodes.values():
        for component_id in node.get("componentIds", []):
            obj = object_by_id.get(component_id)
            if not obj:
                components[component_id] = {
                    "id": component_id,
                    "type": "Missing",
                    "error": "Component object was not present in the source file.",
                }
                component_type_counts["Missing"] += 1
                continue
            component_type = obj.type.name
            component_type_counts[component_type] += 1
            tree, error = read_tree(obj)
            if error:
                extraction_errors.append(error)
                components[component_id] = {
                    "id": component_id,
                    "type": component_type,
                    "error": error,
                }
                continue

            refs = collect_references(tree)
            for ref in refs:
                if ref["fileId"] == 0:
                    reference_ids.add(ref["pathId"])

            properties = {}
            for key, value in tree.items():
                if key in COMMON_COMPONENT_FIELDS:
                    continue
                if key == "m_Name" and not value:
                    continue
                if key == "m_Enabled":
                    continue
                properties[key] = compact_value(value)

            script = pptr_dict(tree.get("m_Script")) if "m_Script" in tree else None
            components[component_id] = {
                "id": component_id,
                "type": component_type,
                "name": tree.get("m_Name") or peek_name(obj) or "",
                "enabled": tree.get("m_Enabled"),
                "gameObject": pptr_id(tree.get("m_GameObject")),
                "script": script,
                "references": refs,
                "properties": properties,
            }

    scene_settings = []
    for obj_id, obj in object_by_id.items():
        if obj.type.name not in SCENE_SETTING_TYPES:
            continue
        tree, error = read_tree(obj)
        if error:
            extraction_errors.append(error)
            continue
        scene_settings.append({
            "id": obj_id,
            "type": obj.type.name,
            "name": tree.get("m_Name") or peek_name(obj) or "",
            "references": collect_references(tree),
            "properties": compact_value(tree),
        })

    referenced_assets = []
    for ref_id in sorted(reference_ids, key=lambda value: int(value)):
        obj = object_by_id.get(ref_id)
        if not obj or obj.type.name in HIERARCHY_TYPES:
            continue
        if obj.type.name not in NAMED_ASSET_TYPES and obj.type.name not in SCENE_RELATED_TYPES:
            continue
        referenced_assets.append({
            "id": ref_id,
            "type": obj.type.name,
            "name": peek_name(obj),
        })

    category = category_for_source(source_path)
    scene_id = source_scene_id(source_path, original_root)
    scene_name = re.sub(r"_assets_all$", "", source_path.stem, flags=re.IGNORECASE)

    slim_nodes = {
        node_id: {
            "id": node["id"],
            "name": node["name"],
            "active": node["active"],
            "layer": node["layer"],
            "tag": node["tag"],
            "parent": node["parent"],
            "children": node["children"],
            "path": node.get("path"),
            "transformId": node.get("transformId"),
            "transform": node.get("transform"),
            "componentTypes": node.get("componentTypes", []),
        }
        for node_id, node in nodes.items()
    }

    scene = {
        "version": 1,
        "id": scene_id,
        "name": scene_name,
        "category": category,
        "sourcePath": relpath(project_root, source_path),
        "objectCounts": dict(sorted(object_counts.items())),
        "rootIds": root_ids,
        "nodeCount": len(nodes),
        "componentCount": sum(component_type_counts.values()),
        "componentTypeCounts": dict(sorted(component_type_counts.items())),
        "referencedAssetCount": len(referenced_assets),
        "sceneSettingCount": len(scene_settings),
        "nodes": slim_nodes,
        "components": components,
        "referencedAssets": referenced_assets,
        "sceneSettings": scene_settings,
        "extractionErrors": extraction_errors,
    }
    return scene


def main():
    parser = argparse.ArgumentParser(description="Extract Unity scene-like hierarchies as Cocos-loadable JSON resources.")
    parser.add_argument("--project", default=".", help="Cocos project root")
    parser.add_argument("--manifest", required=True, help="JSON manifest output path")
    args = parser.parse_args()

    project_root = Path(args.project).resolve()
    original_root = project_root / "assets" / "original_unity"
    output_root = project_root / "assets" / "resources" / "converted" / "scenes"
    data_root = project_root / "assets" / "resources" / "data"
    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = project_root / manifest_path

    output_root.mkdir(parents=True, exist_ok=True)
    data_root.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    source_roots = [
        original_root / "unity_bundles",
        original_root / "unity_data",
    ]
    entries = []
    catalog_scenes = []
    hierarchy_scenes = []
    errors = []
    scanned_files = 0
    skipped_files = 0
    total_nodes = 0

    for source_path in iter_source_files(source_roots):
        scanned_files += 1
        try:
            env = UnityPy.load(str(source_path))
        except Exception as exc:
            errors.append({
                "sourcePath": relpath(project_root, source_path),
                "error": type(exc).__name__,
                "message": str(exc)[:300],
            })
            continue

        type_names = {obj.type.name for obj in env.objects}
        if not type_names.intersection(SCENE_RELATED_TYPES):
            skipped_files += 1
            continue

        try:
            scene = build_scene(project_root, original_root, source_path, env)
        except Exception as exc:
            errors.append({
                "sourcePath": relpath(project_root, source_path),
                "error": type(exc).__name__,
                "message": str(exc)[:500],
            })
            continue

        output_path = output_root / f"{scene['id']}.json"
        output_path.write_text(json.dumps(scene, indent=2) + "\n", encoding="utf-8")
        digest = file_sha256(output_path)
        stat = output_path.stat()
        total_nodes += scene["nodeCount"]

        kind = kind_for_scene(scene["category"], scene["nodeCount"] > 0)
        entry = {
            "id": scene["id"],
            "kind": kind,
            "name": scene["name"],
            "category": scene["category"],
            "sourcePath": scene["sourcePath"],
            "outputPath": relpath(project_root, output_path),
            "resourceLoadPath": re.sub(r"\.[^/.]+$", "", output_path.relative_to(project_root / "assets" / "resources").as_posix()),
            "bytes": stat.st_size,
            "sha256": digest,
            "nodeCount": scene["nodeCount"],
            "rootCount": len(scene["rootIds"]),
            "componentCount": scene["componentCount"],
            "referencedAssetCount": scene["referencedAssetCount"],
            "sceneSettingCount": scene["sceneSettingCount"],
            "objectCounts": scene["objectCounts"],
        }
        entries.append(entry)
        catalog_scenes.append(entry)
        hierarchy_scenes.append({
            "id": scene["id"],
            "name": scene["name"],
            "category": scene["category"],
            "sourcePath": scene["sourcePath"],
            "rootIds": scene["rootIds"],
            "nodeCount": scene["nodeCount"],
            "componentCount": scene["componentCount"],
            "nodes": scene["nodes"],
        })

    catalog_path = data_root / "original-scene-catalog.json"
    hierarchy_path = data_root / "original-scene-hierarchy.json"
    catalog = {
        "version": 1,
        "sourceRoots": [relpath(project_root, root) for root in source_roots],
        "outputRoot": relpath(project_root, output_root),
        "scannedFiles": scanned_files,
        "skippedFiles": skipped_files,
        "sceneSourceCount": len(entries),
        "totalNodes": total_nodes,
        "errors": errors,
        "scenes": sorted(catalog_scenes, key=lambda item: (item["category"], item["name"], item["sourcePath"])),
    }
    hierarchy = {
        "version": 1,
        "sourceRoots": [relpath(project_root, root) for root in source_roots],
        "sceneSourceCount": len(entries),
        "totalNodes": total_nodes,
        "scenes": sorted(hierarchy_scenes, key=lambda item: (item["category"], item["name"], item["sourcePath"])),
    }
    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    hierarchy_path.write_text(json.dumps(hierarchy, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "version": 1,
        "sourceRoots": [relpath(project_root, root) for root in source_roots],
        "outputRoot": relpath(project_root, output_root),
        "catalogPath": relpath(project_root, catalog_path),
        "hierarchyPath": relpath(project_root, hierarchy_path),
        "scannedFiles": scanned_files,
        "skippedFiles": skipped_files,
        "sceneSourceCount": len(entries),
        "totalNodes": total_nodes,
        "errors": errors,
        "entries": sorted(entries, key=lambda item: item["outputPath"]),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "scannedFiles": scanned_files,
        "sceneSourceCount": len(entries),
        "totalNodes": total_nodes,
        "errors": len(errors),
        "catalog": relpath(project_root, catalog_path),
        "hierarchy": relpath(project_root, hierarchy_path),
        "manifest": relpath(project_root, manifest_path),
    }, indent=2))


if __name__ == "__main__":
    main()
