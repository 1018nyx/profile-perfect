import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const scenePath = new URL('../assets/main.scene', import.meta.url);
const sceneMetaPath = new URL('../assets/main.scene.meta', import.meta.url);
const bootstrapMetaPath = new URL('../assets/scripts/ui/GameBootstrap.ts.meta', import.meta.url);

const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function scriptTypeId(uuid) {
  const hex = uuid.replace(/-/g, '').toLowerCase();
  let id = hex.slice(0, 5);

  for (let index = 5; index < 32; index += 3) {
    const a = Number.parseInt(hex[index], 16);
    const b = Number.parseInt(hex[index + 1], 16);
    const c = Number.parseInt(hex[index + 2], 16);
    id += BASE64_KEYS[(a << 2) | (b >> 2)];
    id += BASE64_KEYS[((b & 3) << 4) | c];
  }

  return id;
}

describe('Cocos Creator scene scaffold', () => {
  it('opens through a main scene with GameBootstrap attached', async () => {
    const scene = JSON.parse(await readFile(scenePath, 'utf8'));
    const sceneMeta = JSON.parse(await readFile(sceneMetaPath, 'utf8'));
    const bootstrapMeta = JSON.parse(await readFile(bootstrapMetaPath, 'utf8'));
    const expectedType = scriptTypeId(bootstrapMeta.uuid);

    assert.equal(sceneMeta.importer, 'scene');
    assert.equal(scene[0].__type__, 'cc.SceneAsset');
    assert.equal(scene[1].__type__, 'cc.Scene');
    assert.equal(scene[1]._id, sceneMeta.uuid);
    assert.equal(scene.some((entry) => entry.__type__ === 'cc.Canvas'), true);
    assert.equal(scene.some((entry) => entry.__type__ === expectedType), true);
  });
});
