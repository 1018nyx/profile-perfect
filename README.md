# Profile Perfect Cocos Clone

This is a Cocos Creator 3.x TypeScript rebuild of the Profile Perfect mobile portrait gameplay loop, generated from the unpacked game data in:

`/Users/niuyaxue/Documents/Codex/2026-07-06/ni-z/outputs/profile_perfect_xapk`

## What Is Included

- Cocos Creator 3.x project scaffold based on the installed `empty-2d` template.
- Converted level database at `assets/resources/data/levels.json`.
- 407 playable extracted level records, ordered from the original Balancy level-order metadata.
- Core puzzle logic in TypeScript under `assets/scripts/game/`.
- Runtime data loader under `assets/scripts/data/`.
- Dynamic Cocos UI bootstrap under `assets/scripts/ui/GameBootstrap.ts`.
- Cocos level-map overlay under `assets/scripts/ui/components/LevelMapOverlay.ts`.
- Browser preview under `preview/` using the same `levels.json`, including a mobile level-map overlay.
- Extracted Sprite PNGs for all original Sprite objects under `assets/resources/sprites/`.
- Imported original Texture2D/atlas PNGs under `assets/resources/textures_all/`.
- Sprite manifest at `assets/resources/data/sprite-manifest.json`; matching values in `levels.json` include `sprite.assetKey`.
- Original Unity UI hierarchy export at `assets/resources/data/original-ui-hierarchy.json`.
- Original UI page catalog at `assets/resources/data/original-ui-page-catalog.json`.
- Generic Cocos original-UI renderer at `assets/scripts/ui/OriginalUiRenderer.ts`.
- Node logic tests for conversion, answer checking, and progress storage.
- A curated PNG subset under `assets/resources/textures/`.

## Open In Cocos Creator

The Creator executable found on this machine is:

`/Applications/Cocos/Creator/CocosCreator.app/Contents/MacOS/CocosCreator`

Open Cocos Dashboard, choose **Import**, and select:

`/Users/niuyaxue/Documents/Codex/2026-07-06/ni-z/outputs/profile_perfect_cocos_clone`

After opening:

1. Open `assets/main.scene`.
2. Wait for Creator to finish importing scripts and resources.
3. Press Preview.

`assets/main.scene` includes a portrait Canvas, Camera, and `GameBootstrap` component. `GameBootstrap` creates the portrait UI dynamically at runtime, including the level map, clue list, trait grid, value picker, progress, and extracted sprite icons.

## Browser Preview

Run:

```bash
cd /Users/niuyaxue/Documents/Codex/2026-07-06/ni-z/outputs/profile_perfect_cocos_clone
npm run preview-web
```

Open:

`http://127.0.0.1:4173/preview/`

The preview is a mobile portrait web shell mirroring the Cocos UI flow: open the level map, select a level in original order, tap grid cells, choose values, reveal clues, and check completion.

The browser preview displays extracted sprite images where `sprite.assetKey` is available, with text fallback for values that do not have an extracted image.

## Regenerate Level Data

Run:

```bash
npm run convert
```

This reads:

`../profile_perfect_xapk/unity_levels_all.json`

and writes:

- `assets/resources/data/levels.json`
- `assets/resources/data/conversion-report.json`

## Import Original Resources

Full resource import uses UnityPy. If it is not installed for this shell, run:

```bash
python3 -m pip install --target /tmp/profile-perfect-unitypy UnityPy
```

Then run:

```bash
npm run import-all-resources
```

This imports all extracted Texture2D PNGs, extracts all Unity Sprite PNGs, exports the original UI hierarchy, builds the UI page catalog, and converts level data again so matching sprite refs include Cocos resource keys.

For a faster gameplay-data-only refresh, run:

```bash
npm run build-data
```

## Verify Logic

Run:

```bash
npm test
```

Current tested behavior:

- `Level1` conversion shape and answer data.
- Unity 64-bit sprite path IDs are preserved without JavaScript precision loss.
- Sprite manifest entries are injected into converted value refs.
- Generated level ordering preserves the original Balancy order for playable levels.
- Level-map tile models expose original-order ids, captions, current state, and completed state.
- Correct, incomplete, and wrong answer checking.
- Progress save/load/reset and corrupt data recovery.

## First-Pass Limitations

- The browser preview is immediately runnable; Cocos native preview starts from `assets/main.scene`.
- The UI is close in structure and feel, but pixel-perfect parity requires screenshot-based tuning inside Creator.
- Browser preview and Cocos runtime both have value-sprite rendering paths for extracted original sprites.
- Full original Sprite resources are imported; all 7,194 level sprite references currently resolve to Cocos resource keys.
- The generic `OriginalUiRenderer` can render exported original UI roots by bundle/root name after Creator imports the project resources.
- Cocos native preview still needs Creator-side visual QA after the project is imported.
- Fully matching every original UI page is now an incremental reconstruction task using `original-ui-hierarchy.json` and `original-ui-page-catalog.json`; the resource and hierarchy foundations are in place.
- Ads, IAP, lives, shop, remote config, and mobile packaging are intentionally not part of this first build.
