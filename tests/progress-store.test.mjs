import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createMemoryStorage, ProgressStore } from '../tools/runtime/progress-store.mjs';

describe('ProgressStore', () => {
  it('saves completed levels and resets progress', () => {
    const store = new ProgressStore(createMemoryStorage());

    store.markCompleted('Level1');
    assert.equal(store.isCompleted('Level1'), true);
    assert.equal(store.isCompleted('Level2'), false);

    store.reset();
    assert.equal(store.isCompleted('Level1'), false);
  });

  it('recovers from corrupt saved progress', () => {
    const storage = createMemoryStorage();
    storage.setItem('profilePerfectProgress', '{bad json');
    const store = new ProgressStore(storage);

    assert.deepEqual(store.getState(), { completed: [] });
    store.markCompleted('Level3');
    assert.equal(store.isCompleted('Level3'), true);
  });
});
