import type { LevelData, LevelValue } from '../data/LevelTypes';

export interface DisplayValue {
  text: string;
  sprite: LevelValue['sprite'];
}

export function getTraitValueOptions(level: LevelData, traitName: string): DisplayValue[] {
  const optionsByText = new Map<string, DisplayValue>();

  for (const cell of level.cells) {
    if (cell.trait !== traitName) continue;
    for (const value of cell.values) {
      if (value.text && !optionsByText.has(value.text)) {
        optionsByText.set(value.text, { text: value.text, sprite: value.sprite });
      }
    }
  }

  return [...optionsByText.values()].sort((a, b) => a.text.localeCompare(b.text));
}

export function resolveDisplayValues(level: LevelData, traitName: string, selectedTexts: string[]): DisplayValue[] {
  const optionsByText = new Map(getTraitValueOptions(level, traitName).map((option) => [option.text, option]));
  return selectedTexts.map((text) => optionsByText.get(text) || { text, sprite: null });
}
