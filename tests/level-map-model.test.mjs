import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildLevelTiles } from '../tools/runtime/level-map-model.mjs';

const levelsPath = new URL('../assets/resources/data/levels.json', import.meta.url);

async function loadDatabase() {
  return JSON.parse(await readFile(levelsPath, 'utf8'));
}

describe('level map model', () => {
  it('builds original-order level tiles with current and completed state', async () => {
    const database = await loadDatabase();
    const tiles = buildLevelTiles(database.levels, database.levelOrder, ['Level2'], 'Level1', 6);

    assert.deepEqual(tiles.map((tile) => tile.id), ['Level1', 'Level2', 'Level3', 'Level9_1', 'Level48_1', 'Level6_2']);
    assert.equal(tiles[0].current, true);
    assert.equal(tiles[1].completed, true);
    assert.equal(tiles[3].caption, 'Home · Easy');
  });
});
