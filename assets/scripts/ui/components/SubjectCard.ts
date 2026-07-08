import { Color, Label, Node, UITransform } from 'cc';
import type { LevelSubject } from '../../data/LevelTypes';
import { createPanel, createText, removeChildren } from '../uiFactory';

export class SubjectCard extends Node {
  public subjectName = '';

  render(subject: LevelSubject, width: number, height: number): void {
    this.subjectName = subject.name;
    removeChildren(this);
    createPanel(this, width, height, new Color(255, 255, 255, 255));

    const avatar = createText(this, subject.name.slice(0, 1), 24, new Color(255, 255, 255, 255));
    avatar.name = 'Avatar';
    avatar.setPosition(0, 14);
    avatar.getComponent(UITransform)?.setContentSize(46, 38);

    const label = createText(this, subject.name, 15, new Color(47, 58, 78, 255));
    label.name = 'SubjectName';
    label.setPosition(0, -26);
    const labelComponent = label.getComponent(Label);
    if (labelComponent) labelComponent.overflow = Label.Overflow.SHRINK;
  }
}
