# Profile Perfect Cocos

Cocos Creator 3.8.7 mobile portrait project.

## Cocos

Import this folder in Cocos Dashboard:

`/Users/niuyaxue/Desktop/profile-perfect`

Open:

`assets/main.scene`

## Browser Preview

This is a lightweight browser gameplay preview, separate from the Cocos scene.

```bash
cd /Users/niuyaxue/Desktop/profile-perfect
npm run preview-web
```

Open:

`http://127.0.0.1:4173/preview/`

## Original XAPK

Unpacked copy:

`/Users/niuyaxue/Desktop/ProfilePerfect_xapk_unpacked`

Complete original Unity APK assets preserved in the Cocos project:

`assets/original_unity/ProfilePerfect_apk_assets.zip`

Safe expanded imports:

- `assets/original_unity/unity_bundles`: all 540 Unity Addressables bundles.
- `assets/original_unity/balancy`: original Balancy JSON configs.
- `assets/original_unity/unity_data`: original Unity data splits.

Import summary:

`assets/resources/data/original-resource-manifest.json`

Converted Cocos-loadable resources:

```bash
npm run convert-original
```

- `assets/resources/converted/unity-bundles`: all 540 Unity bundles as `BufferAsset` `.bin` files.
- `assets/resources/converted/balancy`: Balancy JSON/TextAsset configs.
- `assets/resources/converted/unity-data`: Unity Data split files as `BufferAsset` `.bin` files.
- `assets/resources/converted/audio`: extracted Unity `AudioClip` samples as Cocos audio assets.
- `assets/resources/converted/configs`: Unity services config plus extracted Balancy zip entries.
- `assets/resources/converted/archives`: original APK assets zip as a loadable binary archive.
- `assets/resources/data/cocos-converted-resource-manifest.json`: master runtime manifest.

Cocos runtime helper:

`assets/scripts/data/ConvertedOriginalResources.ts`

## Original UI

`assets/main.scene` now starts with an original UI page browser powered by:

`assets/scripts/ui/OriginalUiBrowser.ts`

It renders the extracted Unity UI hierarchy from:

`assets/resources/data/original-ui-hierarchy.json`

and can switch through the 907 extracted original UI page roots.

## Kept

- `assets/`: scene, scripts, original resources, audio, and runtime data.
- `settings/` and `.creator/`: Cocos project settings.
- `preview/`: browser preview.
- `tools/preview-server.mjs` and `tools/runtime/answer-checker.mjs`: minimal preview support.
