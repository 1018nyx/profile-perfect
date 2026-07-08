import { Color, Node, UITransform } from 'cc';
import type { LevelData, SelectionMap } from '../../data/LevelTypes';
import { getSelection } from '../../game/AnswerChecker';
import { resolveDisplayValues } from '../../game/ValueDisplay';
import { createPanel, createSpriteIcon, createText, removeChildren } from '../uiFactory';

export class TraitGrid extends Node {
  render(level: LevelData, selections: SelectionMap, onCellTap: (subject: string, trait: string) => void): void {
    removeChildren(this);
    const cellWidth = 108;
    const cellHeight = 52;
    const traitWidth = 118;
    const totalWidth = traitWidth + cellWidth * level.subjects.length;
    const totalHeight = cellHeight * (level.traits.length + 1);

    createPanel(this, totalWidth, totalHeight, new Color(222, 231, 241, 255));

    for (let c = 0; c < level.subjects.length; c += 1) {
      const subject = level.subjects[c];
      const header = createText(this, subject.name, 13, new Color(91, 105, 123, 255));
      header.setPosition(-totalWidth / 2 + traitWidth + c * cellWidth + cellWidth / 2, totalHeight / 2 - cellHeight / 2);
    }

    for (let r = 0; r < level.traits.length; r += 1) {
      const trait = level.traits[r];
      const y = totalHeight / 2 - cellHeight * (r + 1.5);
      const traitLabel = createText(this, trait.name, 13, new Color(74, 88, 108, 255));
      traitLabel.setPosition(-totalWidth / 2 + traitWidth / 2, y);

      for (let c = 0; c < level.subjects.length; c += 1) {
        const subject = level.subjects[c];
        const values = getSelection(selections, subject.name, trait.name);
        const text = values.length ? values.join(', ') : 'Tap';
        const displayValues = resolveDisplayValues(level, trait.name, values);
        const node = new Node(`${subject.name}-${trait.name}`);
        this.addChild(node);
        node.addComponent(UITransform).setContentSize(cellWidth, cellHeight);
        node.name = `${subject.name}-${trait.name}`;
        node.setPosition(-totalWidth / 2 + traitWidth + c * cellWidth + cellWidth / 2, y);
        if (displayValues.length === 1 && displayValues[0].sprite?.assetKey) {
          const icon = createSpriteIcon(node, displayValues[0].sprite.assetKey, 24);
          icon.setPosition(0, 12);
          const label = createText(node, text, 11, new Color(29, 126, 102, 255));
          label.setPosition(0, -13);
        } else {
          createText(node, text, 12, values.length ? new Color(29, 126, 102, 255) : new Color(151, 163, 179, 255));
        }
        node.on(Node.EventType.TOUCH_END, () => onCellTap(subject.name, trait.name));
      }
    }
  }
}
