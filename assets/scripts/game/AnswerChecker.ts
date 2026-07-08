import type { CheckResult, LevelData, SelectionMap } from '../data/LevelTypes';

export function makeSelectionKey(subject: string, trait: string): string {
  return `${subject}::${trait}`;
}

export function setSelection(selections: SelectionMap, subject: string, trait: string, values: string[]): SelectionMap {
  selections[makeSelectionKey(subject, trait)] = [...values];
  return selections;
}

export function getSelection(selections: SelectionMap, subject: string, trait: string): string[] {
  return selections[makeSelectionKey(subject, trait)] || [];
}

export function buildSolvedSelections(level: LevelData): SelectionMap {
  const selections: SelectionMap = {};
  for (const cell of level.cells) {
    setSelection(selections, cell.subject, cell.trait, level.answers[cell.subject][cell.trait]);
  }
  return selections;
}

export function checkSelections(level: LevelData, selections: SelectionMap): CheckResult {
  const errors = [];
  let correct = 0;
  let missing = 0;

  for (const cell of level.cells) {
    const expected = level.answers[cell.subject]?.[cell.trait] || [];
    const actual = getSelection(selections, cell.subject, cell.trait);

    if (!actual.length) {
      missing += 1;
      continue;
    }

    if (sameValues(expected, actual)) {
      correct += 1;
    } else {
      errors.push({ subject: cell.subject, trait: cell.trait, expected, actual });
    }
  }

  return {
    complete: correct === level.cells.length && missing === 0 && errors.length === 0,
    correct,
    missing,
    errors,
    total: level.cells.length,
  };
}

export function sameValues(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  return expectedSorted.every((value, index) => value === actualSorted[index]);
}
