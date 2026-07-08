import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { buildSolvedSelections, checkSelections, setSelection } from '../tools/runtime/answer-checker.mjs';

const levelsPath = new URL('../assets/resources/data/levels.json', import.meta.url);

async function loadLevel(id = 'Level1') {
  const data = JSON.parse(await readFile(levelsPath, 'utf8'));
  return data.levels.find((level) => level.id === id);
}

describe('answer checker', () => {
  it('marks a fully solved level complete', async () => {
    const level = await loadLevel();
    const solved = buildSolvedSelections(level);
    const result = checkSelections(level, solved);

    assert.equal(result.complete, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.correct, level.cells.length);
  });

  it('keeps an empty level incomplete', async () => {
    const level = await loadLevel();
    const result = checkSelections(level, {});

    assert.equal(result.complete, false);
    assert.equal(result.correct, 0);
    assert.equal(result.missing, level.cells.length);
  });

  it('reports an incorrect selected value', async () => {
    const level = await loadLevel();
    const wrong = buildSolvedSelections(level);
    setSelection(wrong, 'Joyce', 'Surname', ['Davis']);
    const result = checkSelections(level, wrong);

    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(result.errors[0], {
      subject: 'Joyce',
      trait: 'Surname',
      expected: ['Miller'],
      actual: ['Davis'],
    });
  });
});
