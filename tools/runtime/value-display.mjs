export function getTraitValueOptions(level, traitName) {
  const optionsByText = new Map();

  for (const cell of level?.cells || []) {
    if (cell.trait !== traitName) continue;
    for (const value of cell.values || []) {
      if (value.text && !optionsByText.has(value.text)) {
        optionsByText.set(value.text, toDisplayValue(value));
      }
    }
  }

  return [...optionsByText.values()].sort((a, b) => a.text.localeCompare(b.text));
}

export function resolveDisplayValues(level, traitName, selectedTexts) {
  const optionsByText = new Map(getTraitValueOptions(level, traitName).map((option) => [option.text, option]));
  return selectedTexts.map((text) => optionsByText.get(text) || { text, sprite: null });
}

function toDisplayValue(value) {
  return {
    text: value.text,
    sprite: value.sprite || null,
  };
}
