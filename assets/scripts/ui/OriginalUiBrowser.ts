import { Button, Color, Graphics, JsonAsset, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import { createPanel, createText, removeChildren } from './uiFactory';

interface OriginalRect {
  anchorMax?: number[];
  anchorMin?: number[];
  anchoredPosition?: number[];
  localScale?: number[];
  pivot?: number[];
  sizeDelta?: number[];
}

interface OriginalComponent {
  kind?: string;
  text?: string;
  fontSize?: number;
  color?: number[] | null;
  spritePathId?: string;
}

interface OriginalNode {
  id: string;
  name: string;
  active: boolean;
  rect?: OriginalRect;
  components?: OriginalComponent[];
  children?: string[];
}

interface OriginalBundle {
  bundle: string;
  rootIds: string[];
  nodes: Record<string, OriginalNode>;
}

interface OriginalHierarchy {
  bundles: OriginalBundle[];
}

interface OriginalPage {
  bundle: string;
  id: string;
  name: string;
  nodeCount: number;
  imageCount: number;
  textCount: number;
}

interface OriginalPageCatalog {
  pages: OriginalPage[];
}

interface SpriteManifest {
  sprites: Record<string, { assetKey: string }>;
}

interface Size {
  width: number;
  height: number;
}

interface ResolvedRect extends Size {
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

const STAGE_SIZE: Size = { width: 720, height: 1280 };

export class OriginalUiBrowser extends Node {
  private hierarchy: OriginalHierarchy | null = null;
  private catalog: OriginalPageCatalog | null = null;
  private spriteManifest: SpriteManifest | null = null;
  private pageIndex = 0;
  private pageHost!: Node;
  private titleNode!: Node;
  private metaNode!: Node;

  constructor(name = 'OriginalUiBrowser') {
    super(name);
  }

  async loadAndRender(pageIndex = 0): Promise<void> {
    this.addComponent(UITransform).setContentSize(STAGE_SIZE.width, STAGE_SIZE.height);
    await this.loadData();
    this.buildShell();
    this.renderPage(pageIndex);
  }

  private async loadData(): Promise<void> {
    const [hierarchy, catalog, spriteManifest] = await Promise.all([
      this.loadJson<OriginalHierarchy>('data/original-ui-hierarchy'),
      this.loadJson<OriginalPageCatalog>('data/original-ui-page-catalog'),
      this.loadJson<SpriteManifest>('data/sprite-manifest'),
    ]);
    this.hierarchy = hierarchy;
    this.catalog = catalog;
    this.spriteManifest = spriteManifest;
  }

  private buildShell(): void {
    removeChildren(this);
    createPanel(this, STAGE_SIZE.width, STAGE_SIZE.height, new Color(15, 18, 24, 255), 0);

    this.pageHost = new Node('OriginalPageHost');
    this.addChild(this.pageHost);
    this.pageHost.addComponent(UITransform).setContentSize(STAGE_SIZE.width, STAGE_SIZE.height);

    const controls = new Node('OriginalUiBrowserControls');
    this.addChild(controls);
    controls.setPosition(0, STAGE_SIZE.height / 2 - 43);
    controls.addComponent(UITransform).setContentSize(STAGE_SIZE.width, 86);
    createPanel(controls, STAGE_SIZE.width, 86, new Color(16, 21, 31, 215), 0);

    const previous = createText(controls, 'Prev', 18, new Color(255, 255, 255, 255));
    previous.setPosition(-295, 0);
    previous.on(Node.EventType.TOUCH_END, () => this.renderPage(this.pageIndex - 1));

    const next = createText(controls, 'Next', 18, new Color(255, 255, 255, 255));
    next.setPosition(295, 0);
    next.on(Node.EventType.TOUCH_END, () => this.renderPage(this.pageIndex + 1));

    this.titleNode = createText(controls, '', 18, new Color(255, 255, 255, 255));
    this.titleNode.getComponent(UITransform)?.setContentSize(450, 30);
    this.titleNode.setPosition(0, 13);

    this.metaNode = createText(controls, '', 12, new Color(182, 194, 214, 255));
    this.metaNode.getComponent(UITransform)?.setContentSize(520, 24);
    this.metaNode.setPosition(0, -15);
  }

  private renderPage(index: number): void {
    if (!this.hierarchy || !this.catalog || !this.spriteManifest || !this.catalog.pages.length) return;

    const pageCount = this.catalog.pages.length;
    this.pageIndex = ((index % pageCount) + pageCount) % pageCount;
    const page = this.catalog.pages[this.pageIndex];
    const match = this.findPageRoot(page);

    removeChildren(this.pageHost);
    if (!match) {
      this.updateControlText(page, pageCount, false);
      return;
    }

    this.renderOriginalNode(this.pageHost, match.root, match.bundle.nodes, STAGE_SIZE);
    this.updateControlText(page, pageCount, true);
  }

  private updateControlText(page: OriginalPage, pageCount: number, loaded: boolean): void {
    const title = this.titleNode.getComponent(Label);
    const meta = this.metaNode.getComponent(Label);
    if (title) {
      title.string = `${page.name}`;
      title.overflow = Label.Overflow.SHRINK;
    }
    if (meta) {
      const status = loaded ? '' : 'missing root · ';
      meta.string = `${status}${this.pageIndex + 1}/${pageCount} · ${page.bundle} · ${page.nodeCount} nodes`;
      meta.overflow = Label.Overflow.SHRINK;
    }
  }

  private findPageRoot(page: OriginalPage): { bundle: OriginalBundle; root: OriginalNode } | null {
    if (!this.hierarchy) return null;

    const bundle = this.hierarchy.bundles.find((candidate) => candidate.bundle === page.bundle);
    const root = bundle?.nodes[page.id];
    if (bundle && root) return { bundle, root };
    return null;
  }

  private renderOriginalNode(parent: Node, original: OriginalNode, nodes: Record<string, OriginalNode>, parentSize: Size): void {
    const node = new Node(original.name || original.id);
    parent.addChild(node);
    node.active = original.active;

    const layout = resolveRect(original.rect, parentSize);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(layout.width, layout.height);
    transform.setAnchorPoint(layout.pivotX, layout.pivotY);
    node.setPosition(layout.x, layout.y);
    node.setScale(layout.scaleX, layout.scaleY, layout.scaleZ);

    for (const component of original.components || []) {
      if (component.kind === 'Image') this.applyImage(node, component, layout);
      if (component.kind === 'Text') this.applyText(node, component, layout);
      if (component.kind === 'Button') this.applyButton(node);
    }

    const childSize = { width: layout.width, height: layout.height };
    for (const childId of original.children || []) {
      const child = nodes[childId];
      if (child) this.renderOriginalNode(node, child, nodes, childSize);
    }
  }

  private applyImage(node: Node, component: OriginalComponent, layout: ResolvedRect): void {
    const color = toColor(component.color, new Color(255, 255, 255, 255));
    const spriteEntry = component.spritePathId ? this.spriteManifest?.sprites?.[component.spritePathId] : null;

    if (!spriteEntry?.assetKey) {
      if (color.a > 0) fillRect(node, layout.width, layout.height, layout.pivotX, layout.pivotY, color);
      return;
    }

    const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = color;
    resources.load(`${spriteEntry.assetKey}/spriteFrame`, SpriteFrame, (error, spriteFrame) => {
      if (error || !spriteFrame || !node.isValid) return;
      sprite.spriteFrame = spriteFrame;
    });
  }

  private applyText(node: Node, component: OriginalComponent, layout: Size): void {
    const label = node.getComponent(Label) || node.addComponent(Label);
    label.string = component.text || '';
    label.fontSize = component.fontSize || 18;
    label.lineHeight = Math.round(label.fontSize * 1.15);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.color = toColor(component.color, new Color(47, 58, 78, 255));
    node.getComponent(UITransform)?.setContentSize(Math.max(1, layout.width), Math.max(1, layout.height));
  }

  private applyButton(node: Node): void {
    const button = node.getComponent(Button) || node.addComponent(Button);
    button.transition = Button.Transition.NONE;
  }

  private async loadJson<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      resources.load(path, JsonAsset, (error, asset) => {
        if (error || !asset) {
          reject(error || new Error(`Failed to load ${path}`));
          return;
        }
        resolve(asset.json as T);
      });
    });
  }
}

function resolveRect(rect: OriginalRect | undefined, parentSize: Size): ResolvedRect {
  const anchorMin = rect?.anchorMin || [0.5, 0.5];
  const anchorMax = rect?.anchorMax || [0.5, 0.5];
  const anchoredPosition = rect?.anchoredPosition || [0, 0];
  const sizeDelta = rect?.sizeDelta || [80, 32];
  const pivot = rect?.pivot || [0.5, 0.5];
  const localScale = rect?.localScale || [1, 1, 1];

  const anchorWidth = Math.abs((anchorMax[0] || 0) - (anchorMin[0] || 0));
  const anchorHeight = Math.abs((anchorMax[1] || 0) - (anchorMin[1] || 0));
  const width = Math.max(1, parentSize.width * anchorWidth + (sizeDelta[0] || 0));
  const height = Math.max(1, parentSize.height * anchorHeight + (sizeDelta[1] || 0));
  const anchorCenterX = (((anchorMin[0] || 0) + (anchorMax[0] || 0)) / 2 - 0.5) * parentSize.width;
  const anchorCenterY = (((anchorMin[1] || 0) + (anchorMax[1] || 0)) / 2 - 0.5) * parentSize.height;

  return {
    width,
    height,
    x: anchorCenterX + (anchoredPosition[0] || 0),
    y: anchorCenterY + (anchoredPosition[1] || 0),
    pivotX: pivot[0] ?? 0.5,
    pivotY: pivot[1] ?? 0.5,
    scaleX: localScale[0] || 1,
    scaleY: localScale[1] || 1,
    scaleZ: localScale[2] || 1,
  };
}

function fillRect(node: Node, width: number, height: number, pivotX: number, pivotY: number, color: Color): void {
  const graphics = node.getComponent(Graphics) || node.addComponent(Graphics);
  graphics.clear();
  graphics.fillColor = color;
  graphics.rect(-width * pivotX, -height * pivotY, width, height);
  graphics.fill();
}

function toColor(value: number[] | null | undefined, fallback: Color): Color {
  if (!value) return fallback;
  const scale = value.some((item) => item > 1) ? 1 : 255;
  return new Color(
    Math.round((value[0] || 0) * scale),
    Math.round((value[1] || 0) * scale),
    Math.round((value[2] || 0) * scale),
    Math.round((value[3] ?? 1) * scale),
  );
}
