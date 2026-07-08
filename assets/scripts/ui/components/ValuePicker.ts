import { Color, Label, Node, UITransform } from 'cc';
import type { DisplayValue } from '../../game/ValueDisplay';
import { createPanel, createSpriteIcon, createText, removeChildren } from '../uiFactory';

export class ValuePicker extends Node {
  private selected: string[] = [];

  render(subject: string, trait: string, options: DisplayValue[], current: string[], allowMultiple: boolean, onApply: (values: string[]) => void, onClose: () => void): void {
    removeChildren(this);
    this.selected = [...current];
    createPanel(this, 640, 430, new Color(255, 255, 255, 255));

    const heading = createText(this, `${subject} · ${trait}`, 24, new Color(43, 54, 73, 255));
    heading.setPosition(0, 160);
    const headingLabel = heading.getComponent(Label);
    if (headingLabel) headingLabel.overflow = Label.Overflow.SHRINK;

    options.forEach((option, index) => {
      const selected = this.selected.includes(option.text);
      const node = new Node(`Option-${option.text}`);
      this.addChild(node);
      node.addComponent(UITransform).setContentSize(520, 40);
      node.setPosition(0, 100 - index * 42);
      if (option.sprite?.assetKey) {
        const icon = createSpriteIcon(node, option.sprite.assetKey, 32);
        icon.setPosition(-130, 0);
      }
      const label = createText(node, option.text, 17, selected ? new Color(22, 126, 89, 255) : new Color(61, 73, 92, 255));
      label.setPosition(option.sprite?.assetKey ? 22 : 0, 0);
      node.on(Node.EventType.TOUCH_END, () => {
        if (this.selected.includes(option.text)) {
          this.selected = this.selected.filter((value) => value !== option.text);
        } else {
          this.selected = allowMultiple ? [...this.selected, option.text] : [option.text];
        }
        this.render(subject, trait, options, this.selected, allowMultiple, onApply, onClose);
      });
    });

    const apply = createText(this, 'Apply', 20, new Color(255, 255, 255, 255));
    apply.setPosition(0, -170);
    apply.on(Node.EventType.TOUCH_END, () => onApply([...this.selected]));

    const close = createText(this, 'Close', 15, new Color(87, 101, 122, 255));
    close.setPosition(250, 180);
    close.on(Node.EventType.TOUCH_END, onClose);
  }
}
