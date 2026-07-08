import { Color, Label, Node } from 'cc';
import type { LevelClue } from '../../data/LevelTypes';
import { createPanel, createText, removeChildren } from '../uiFactory';

export class ClueList extends Node {
  render(clues: LevelClue[], visibleClues: Set<string>, width: number, height: number): void {
    removeChildren(this);
    createPanel(this, width, height, new Color(255, 255, 255, 255));

    const title = createText(this, 'Clues', 19, new Color(47, 58, 78, 255));
    title.setPosition(-width / 2 + 52, height / 2 - 28);

    const top = height / 2 - 70;
    for (let index = 0; index < clues.length; index += 1) {
      const clue = clues[index];
      const visible = visibleClues.has(clue.id);
      const node = createText(this, visible ? clue.text : `Clue ${index + 1} locked`, 12, visible ? new Color(60, 72, 90, 255) : new Color(145, 156, 171, 255));
      node.setPosition(0, top - index * 44);
      const label = node.getComponent(Label);
      if (label) {
        label.overflow = Label.Overflow.SHRINK;
        label.horizontalAlign = Label.HorizontalAlign.LEFT;
      }
    }
  }
}
