#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE_DIR = PROJECT_ROOT.parent / "profile_perfect_xapk" / "base_apk" / "assets" / "aa" / "Android"
DEFAULT_OUTPUT = PROJECT_ROOT / "assets" / "resources" / "data" / "original-ui-hierarchy.json"


def add_dependency_paths() -> None:
    for path in (PROJECT_ROOT / "tools" / ".python", Path("/tmp/profile-perfect-unitypy")):
        if path.exists():
            sys.path.insert(0, str(path))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract original Unity UI/GameObject hierarchy metadata.")
    parser.add_argument("--bundle-dir", type=Path, default=DEFAULT_BUNDLE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--bundle-filter",
        default="",
        help="Comma-separated bundle name fragments. Empty processes bundles with GameObjects.",
    )
    return parser.parse_args()


def ptr_id(ptr) -> str:
    return str(getattr(ptr, "path_id", getattr(ptr, "m_PathID", 0)) or 0)


def vector2(value) -> list[float]:
    return [float(getattr(value, "x", 0.0)), float(getattr(value, "y", 0.0))]


def vector3(value) -> list[float]:
    return [float(getattr(value, "x", 0.0)), float(getattr(value, "y", 0.0)), float(getattr(value, "z", 0.0))]


def color(value) -> list[float] | None:
    if value is None:
        return None
    return [
        float(getattr(value, "r", 0.0)),
        float(getattr(value, "g", 0.0)),
        float(getattr(value, "b", 0.0)),
        float(getattr(value, "a", 0.0)),
    ]


def compact_component(data, component_type: str) -> dict:
    result = {"type": component_type}
    if hasattr(data, "m_text"):
        result["kind"] = "Text"
        result["text"] = getattr(data, "m_text", "")
        result["fontSize"] = getattr(data, "m_fontSize", None)
        result["color"] = color(getattr(data, "m_fontColor", None) or getattr(data, "m_Color", None))
    elif hasattr(data, "m_Sprite"):
        result["kind"] = "Image"
        result["spritePathId"] = ptr_id(getattr(data, "m_Sprite", None))
        result["color"] = color(getattr(data, "m_Color", None))
    elif hasattr(data, "m_OnClick"):
        result["kind"] = "Button"
    return result


def extract_bundle(UnityPy, bundle: Path) -> dict | None:
    try:
        env = UnityPy.load(str(bundle))
    except Exception as error:
        return {"bundle": bundle.name, "error": str(error)}

    objects = {obj.path_id: obj for obj in env.objects}
    game_objects: dict[str, dict] = {}
    transform_to_go: dict[str, str] = {}
    parent_by_transform: dict[str, str] = {}
    children_by_transform: dict[str, list[str]] = {}

    for obj in env.objects:
        if getattr(obj.type, "name", str(obj.type)) != "GameObject":
            continue
        data = obj.read()
        components = []
        transform_id = "0"
        for pair in getattr(data, "m_Component", []):
            component_id = ptr_id(pair.component)
            component_obj = objects.get(int(component_id)) if component_id not in ("", "0") else None
            if not component_obj:
                continue
            component_type = getattr(component_obj.type, "name", str(component_obj.type))
            components.append(component_type)
            if component_type in ("RectTransform", "Transform"):
                transform_id = component_id
        game_objects[str(obj.path_id)] = {
            "id": str(obj.path_id),
            "name": getattr(data, "m_Name", ""),
            "active": bool(getattr(data, "m_IsActive", True)),
            "transformId": transform_id,
            "componentTypes": components,
            "components": [],
            "children": [],
        }
        if transform_id != "0":
            transform_to_go[transform_id] = str(obj.path_id)

    for obj in env.objects:
        component_type = getattr(obj.type, "name", str(obj.type))
        if component_type not in ("RectTransform", "Transform", "MonoBehaviour", "Canvas", "CanvasRenderer"):
            continue
        try:
            data = obj.read()
        except Exception:
            continue

        game_object_id = ptr_id(getattr(data, "m_GameObject", None))
        node = game_objects.get(game_object_id)
        if not node:
            continue

        if component_type in ("RectTransform", "Transform"):
            transform_id = str(obj.path_id)
            father_id = ptr_id(getattr(data, "m_Father", None))
            parent_by_transform[transform_id] = father_id
            children_by_transform[transform_id] = [ptr_id(child) for child in getattr(data, "m_Children", [])]
            rect = {
                "type": component_type,
                "anchorMin": vector2(getattr(data, "m_AnchorMin", None)),
                "anchorMax": vector2(getattr(data, "m_AnchorMax", None)),
                "anchoredPosition": vector2(getattr(data, "m_AnchoredPosition", None)),
                "sizeDelta": vector2(getattr(data, "m_SizeDelta", None)),
                "pivot": vector2(getattr(data, "m_Pivot", None)),
                "localPosition": vector3(getattr(data, "m_LocalPosition", None)),
                "localScale": vector3(getattr(data, "m_LocalScale", None)),
            }
            node["rect"] = rect
        else:
            node["components"].append(compact_component(data, component_type))

    roots = []
    for transform_id, game_object_id in transform_to_go.items():
        parent_transform = parent_by_transform.get(transform_id, "0")
        parent_go = transform_to_go.get(parent_transform)
        if parent_go and parent_go in game_objects:
            game_objects[parent_go]["children"].append(game_object_id)
        else:
            roots.append(game_object_id)

    return {
        "bundle": bundle.name,
        "rootIds": roots,
        "nodeCount": len(game_objects),
        "nodes": game_objects,
    } if game_objects else None


def main() -> int:
    add_dependency_paths()
    try:
        import UnityPy
    except ImportError:
        print("UnityPy is required. Install it with:", file=sys.stderr)
        print("python3 -m pip install --target /tmp/profile-perfect-unitypy UnityPy", file=sys.stderr)
        return 2

    args = parse_args()
    filters = [item.strip().lower() for item in args.bundle_filter.split(",") if item.strip()]
    bundles = sorted(args.bundle_dir.glob("*.bundle"))
    if filters:
        bundles = [bundle for bundle in bundles if any(fragment in bundle.name.lower() for fragment in filters)]

    extracted = []
    for bundle in bundles:
        result = extract_bundle(UnityPy, bundle)
        if result:
            extracted.append(result)

    payload = {
        "source": {
            "bundleDir": str(args.bundle_dir),
            "bundleFilter": filters,
            "bundleCount": len(extracted),
            "nodeCount": sum(item.get("nodeCount", 0) for item in extracted),
        },
        "bundles": extracted,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf8")

    print(f"Bundles with hierarchy: {payload['source']['bundleCount']}")
    print(f"Nodes exported: {payload['source']['nodeCount']}")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
