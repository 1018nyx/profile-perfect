const DEFAULT_KEY = 'profilePerfectProgress';

function emptyState() {
  return { completed: [] };
}

export class ProgressStore {
  constructor(storage, key = DEFAULT_KEY) {
    this.storage = storage;
    this.key = key;
  }

  getState() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return emptyState();

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.completed)) return emptyState();
      return { completed: [...new Set(parsed.completed.filter(Boolean))] };
    } catch {
      this.storage.removeItem(this.key);
      return emptyState();
    }
  }

  saveState(state) {
    this.storage.setItem(this.key, JSON.stringify({
      completed: [...new Set(state.completed || [])],
    }));
  }

  markCompleted(levelId) {
    const state = this.getState();
    if (!state.completed.includes(levelId)) {
      state.completed.push(levelId);
      this.saveState(state);
    }
  }

  isCompleted(levelId) {
    return this.getState().completed.includes(levelId);
  }

  reset() {
    this.storage.removeItem(this.key);
  }
}

export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}
