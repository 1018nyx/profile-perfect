export function makeSelectionKey(subject, trait) {
  return `${subject}::${trait}`;
}

export function setSelection(selections, subject, trait, values) {
  selections[makeSelectionKey(subject, trait)] = [...values];
  return selections;
}

export function getSelection(selections, subject, trait) {
  return selections[makeSelectionKey(subject, trait)] || [];
}

export function buildSolvedSelections(level) {
  const selections = {};
  for (const cell of level.cells) {
    setSelection(selections, cell.subject, cell.trait, level.answers[cell.subject][cell.trait]);
  }
  return selections;
}

export function checkSelections(level, selections) {
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
      errors.push({
        subject: cell.subject,
        trait: cell.trait,
        expected,
        actual,
      });
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

export function sameValues(expected, actual) {
  if (expected.length !== actual.length) return false;
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  return expectedSorted.every((value, index) => value === actualSorted[index]);
}
