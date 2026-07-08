import type { CheckResult, LevelData, SelectionMap } from '../data/LevelTypes';
import { checkSelections, setSelection } from './AnswerChecker';

export class GameState {
  private level: LevelData;
  private selections: SelectionMap = {};
  private revealedClues = new Set<string>();

  constructor(level: LevelData) {
    this.level = level;
    for (const clue of level.clues) {
      if (clue.initial) this.revealedClues.add(clue.id);
    }
  }

  getLevel(): LevelData {
    return this.level;
  }

  getSelections(): SelectionMap {
    return this.selections;
  }

  chooseValue(subject: string, trait: string, values: string[]): CheckResult {
    setSelection(this.selections, subject, trait, values);
    return this.check();
  }

  check(): CheckResult {
    return checkSelections(this.level, this.selections);
  }

  isClueVisible(clueId: string): boolean {
    return this.revealedClues.has(clueId);
  }

  revealNextClue(): boolean {
    const next = this.level.clues.find((clue) => !this.revealedClues.has(clue.id));
    if (!next) return false;
    this.revealedClues.add(next.id);
    return true;
  }
}
