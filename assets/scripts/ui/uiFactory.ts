import { Color, Graphics, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';

export function removeChildren(node: Node): void {
  [...node.children].forEach((child) => child.destroy());
}

export function createPanel(parent: Node, width: number, height: number, color: Color, radius = 18): Node {
  const node = new Node('Panel');
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(width, height);
  const graphics = node.addComponent(Graphics);
  graphics.fillColor = color;
  graphics.roundRect(-width / 2, -height / 2, width, height, radius);
  graphics.fill();
  return node;
}

export function createText(parent: Node, text: string, fontSize: number, color: Color): Node {
  const node = new Node('Text');
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(320, Math.max(32, fontSize * 1.4));
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.2);
  label.color = color;
  label.horizontalAlign = Label.HorizontalAlign.CENTER;
  label.verticalAlign = Label.VerticalAlign.CENTER;
  return node;
}

export function createSpriteIcon(parent: Node, assetKey: string, size: number): Node {
  const node = new Node('SpriteIcon');
  parent.addChild(node);
  node.addComponent(UITransform).setContentSize(size, size);
  applySpriteFrame(node, assetKey);
  return node;
}

export function applySpriteFrame(node: Node, assetKey: string): void {
  const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;

  resources.load(`${assetKey}/spriteFrame`, SpriteFrame, (error, spriteFrame) => {
    if (error || !spriteFrame || !node.isValid) {
      node.active = false;
      return;
    }
    sprite.spriteFrame = spriteFrame;
  });
}
