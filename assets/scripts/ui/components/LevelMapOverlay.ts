import { Color, Label, Node, UITransform } from 'cc';
import type { LevelTileModel } from '../../game/LevelMapModel';
import { createPanel, createText, removeChildren } from '../uiFactory';

export class LevelMapOverlay extends Node {
  render(tiles: LevelTileModel[], onSelect: (levelId: string) => void, onClose: () => void): void {
    removeChildren(this);
    this.active = true;
    this.addComponent(UITransform).setContentSize(720, 1280);
    createPanel(this, 720, 1280, new Color(20, 26, 37, 150), 0);

    const card = new Node('LevelMapCard');
    this.addChild(card);
    card.setPosition(0, -44);
    card.addComponent(UITransform).setContentSize(650, 980);
    createPanel(card, 650, 980, new Color(255, 255, 255, 255), 30);

    const kicker = createText(card, 'CASE ARCHIVE', 16, new Color(139, 151, 168, 255));
    kicker.setPosition(-218, 420);
    const kickerLabel = kicker.getComponent(Label);
    if (kickerLabel) kickerLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    const title = createText(card, 'Levels', 34, new Color(38, 47, 66, 255));
    title.setPosition(-224, 382);
    const titleLabel = title.getComponent(Label);
    if (titleLabel) titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;

    const close = createText(card, '×', 36, new Color(57, 73, 97, 255));
    close.setPosition(260, 392);
    close.on(Node.EventType.TOUCH_END, onClose);

    const columns = 3;
    const tileWidth = 185;
    const tileHeight = 74;
    const gapX = 20;
    const gapY = 13;
    const startX = -((columns - 1) * (tileWidth + gapX)) / 2;
    const startY = 290;

    tiles.forEach((tile, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const node = new Node(`LevelTile-${tile.id}`);
      card.addChild(node);
      node.addComponent(UITransform).setContentSize(tileWidth, tileHeight);
      node.setPosition(startX + column * (tileWidth + gapX), startY - row * (tileHeight + gapY));

      const color = tile.current
        ? new Color(232, 255, 247, 255)
        : tile.completed
          ? new Color(242, 247, 255, 255)
          : new Color(248, 251, 253, 255);
      createPanel(node, tileWidth, tileHeight, color, 16);

      const label = createText(node, tile.id, 18, tile.current ? new Color(23, 110, 87, 255) : new Color(47, 58, 78, 255));
      label.setPosition(0, 12);

      const caption = createText(node, tile.completed ? 'Done' : tile.caption, 11, new Color(139, 151, 168, 255));
      caption.setPosition(0, -17);
      const captionLabel = caption.getComponent(Label);
      if (captionLabel) captionLabel.overflow = Label.Overflow.SHRINK;

      node.on(Node.EventType.TOUCH_END, () => onSelect(tile.id));
    });
  }

  close(): void {
    this.active = false;
  }
}
