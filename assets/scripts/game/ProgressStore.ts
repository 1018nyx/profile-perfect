import { sys } from 'cc';

const STORAGE_KEY = 'profilePerfectProgress';

export interface ProgressState {
  completed: string[];
}

function emptyState(): ProgressState {
  return { completed: [] };
}

export class ProgressStore {
  getState(): ProgressState {
    const raw = sys.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.completed)) return emptyState();
      return { completed: [...new Set(parsed.completed.filter(Boolean))] };
    } catch {
      sys.localStorage.removeItem(STORAGE_KEY);
      return emptyState();
    }
  }

  markCompleted(levelId: string): void {
    const state = this.getState();
    if (!state.completed.includes(levelId)) {
      state.completed.push(levelId);
      sys.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  isCompleted(levelId: string): boolean {
    return this.getState().completed.includes(levelId);
  }

  reset(): void {
    sys.localStorage.removeItem(STORAGE_KEY);
  }
}
