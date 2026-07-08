import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { getTraitValueOptions, resolveDisplayValues } from '../tools/runtime/value-display.mjs';

const levelsPath = new URL('../assets/resources/data/levels.json', import.meta.url);

async function loadLevel(id) {
  const database = JSON.parse(await readFile(levelsPath, 'utf8'));
  return database.levels.find((level) => level.id === id);
}

describe('value display helpers', () => {
  it('keeps sprite metadata on unique trait options', async () => {
    const level = await loadLevel('Level1');
    const options = getTraitValueOptions(level, 'Nationality');

    assert.deepEqual(options.map((option) => option.text), ['American', 'British']);
    assert.equal(options[0].sprite.assetKey, 'sprites/icon_commoncountry_assets_all/icon_common_country_1_2133040987287764596');
    assert.equal(options[1].sprite.assetKey, 'sprites/icon_commoncountry_assets_all/icon_common_country_2_8065233079255164563');
  });

  it('resolves selected strings to display values', async () => {
    const level = await loadLevel('Level1');
    const values = resolveDisplayValues(level, 'Nationality', ['American', 'Unknown']);

    assert.equal(values[0].text, 'American');
    assert.equal(values[0].sprite.assetKey, 'sprites/icon_commoncountry_assets_all/icon_common_country_1_2133040987287764596');
    assert.equal(values[1].text, 'Unknown');
    assert.equal(values[1].sprite, null);
  });
});
