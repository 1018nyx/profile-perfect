import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { convertExtractedLevels, parseUnityJson } from '../tools/convert-levels.mjs';

const sourcePath = new URL('../../profile_perfect_xapk/unity_levels_all.json', import.meta.url);
const levelOrderPath = new URL('../../profile_perfect_xapk/base_apk/assets/Balancy/77912c92-0d9c-11f1-93e0-1fec53a055ba_LevelOrderMetadata.json', import.meta.url);

describe('convertExtractedLevels', () => {
  it('parses Unity sprite path IDs without losing 64-bit precision', async () => {
    const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
    const { levels } = convertExtractedLevels(rawLevels, { includeIds: ['Level1'] });
    const level = levels[0];
    const nationalityValues = level.cells
      .filter((cell) => cell.trait === 'Nationality')
      .flatMap((cell) => cell.values);

    assert.equal(nationalityValues[0].sprite.pathId, '2133040987287764596');
    assert.equal(nationalityValues[1].sprite.pathId, '8065233079255164563');
  });

  it('adds asset keys to sprite references from a generated sprite manifest', async () => {
    const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
    const spriteManifest = {
      sprites: {
        '2133040987287764596': {
          name: 'flag_american',
          assetKey: 'sprites/icon_commoncountry_assets_all/flag_american_2133040987287764596',
          width: 128,
          height: 128,
        },
      },
    };
    const { levels } = convertExtractedLevels(rawLevels, { includeIds: ['Level1'], spriteManifest });
    const level = levels[0];
    const american = level.cells
      .flatMap((cell) => cell.values)
      .find((value) => value.text === 'American');

    assert.equal(american.sprite.assetKey, 'sprites/icon_commoncountry_assets_all/flag_american_2133040987287764596');
    assert.equal(american.sprite.name, 'flag_american');
    assert.equal(american.sprite.width, 128);
  });

  it('normalizes Level1 into a playable Cocos data shape', async () => {
    const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
    const { levels } = convertExtractedLevels(rawLevels, { includeIds: ['Level1'] });
    const level = levels[0];

    assert.equal(level.id, 'Level1');
    assert.equal(level.subjects.length, 2);
    assert.equal(level.traits.length, 2);
    assert.equal(level.cells.length, 4);
    assert.equal(level.clues.length, 4);
    assert.equal(level.answers.Joyce.Surname[0], 'Miller');
  });

  it('orders generated gameplay levels from Level1 and keeps Level1 through Level10', async () => {
    const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
    const { levels } = convertExtractedLevels(rawLevels);
    const ids = levels.map((level) => level.id);

    assert.equal(ids[0], 'Level1');
    for (const id of ['Level1', 'Level2', 'Level3', 'Level4', 'Level5', 'Level6', 'Level7', 'Level8', 'Level9', 'Level10']) {
      assert.equal(ids.includes(id), true, `${id} should be included`);
    }
  });

  it('preserves the original Balancy main level order for playable levels', async () => {
    const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
    const levelOrderMetadata = JSON.parse(await readFile(levelOrderPath, 'utf8'));
    const { orderedLevelIds, levelOrder, report } = convertExtractedLevels(rawLevels, { levelOrderMetadata });

    assert.deepEqual(orderedLevelIds.slice(0, 6), ['Level1', 'Level2', 'Level3', 'Level9_1', 'Level48_1', 'Level6_2']);
    assert.equal(levelOrder[0].difficulty, 'Onboarding');
    assert.equal(levelOrder[3].theme, 'Home');
    assert.equal(report.missingOrderedLevelIds.includes('Level115'), true);
  });
});
