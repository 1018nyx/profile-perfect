import { Color, Component, JsonAsset, Label, Node, resources, UITransform, _decorator } from 'cc';
import { applySpriteFrame, removeChildren } from './uiFactory';

const { ccclass, property } = _decorator;

interface OriginalNode {
  id: string;
  name: string;
  active: boolean;
  rect?: {
    anchoredPosition?: number[];
    sizeDelta?: number[];
    localScale?: number[];
  };
  components?: Array<{
    kind?: string;
    text?: string;
    fontSize?: number;
    color?: number[] | null;
    spritePathId?: string;
  }>;
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

interface SpriteManifest {
  sprites: Record<string, { assetKey: string }>;
}

@ccclass('OriginalUiRenderer')
export class OriginalUiRenderer extends Component {
  @property
  bundleName = '';

  @property
  rootName = 'BalancyOfferPopup';

  @property
  scale = 1;

  async start(): Promise<void> {
    const [hierarchy, spriteManifest] = await Promise.all([
      this.loadJson<OriginalHierarchy>('data/original-ui-hierarchy'),
      this.loadJson<SpriteManifest>('data/sprite-manifest'),
    ]);
    this.renderOriginalPage(hierarchy, spriteManifest);
  }

  private renderOriginalPage(hierarchy: OriginalHierarchy, spriteManifest: SpriteManifest): void {
    removeChildren(this.node);
    const match = this.findRoot(hierarchy);
    if (!match) return;

    const root = new Node(`Original-${match.root.name}`);
    this.node.addChild(root);
    root.setScale(this.scale, this.scale);
    this.renderNode(root, match.root, match.bundle.nodes, spriteManifest);
  }

  private findRoot(hierarchy: OriginalHierarchy): { bundle: OriginalBundle; root: OriginalNode } | null {
    for (const bundle of hierarchy.bundles) {
      if (this.bundleName && bundle.bundle !== this.bundleName) continue;
      for (const rootId of bundle.rootIds || []) {
        const root = bundle.nodes[rootId];
        if (!root) continue;
        if (!this.rootName || root.name === this.rootName) return { bundle, root };
      }
    }
    return null;
  }

  private renderNode(parent: Node, original: OriginalNode, nodes: Record<string, OriginalNode>, spriteManifest: SpriteManifest): void {
    const node = new Node(original.name || original.id);
    parent.addChild(node);
    node.active = original.active;

    const width = Math.max(1, Math.abs(original.rect?.sizeDelta?.[0] || 80));
    const height = Math.max(1, Math.abs(original.rect?.sizeDelta?.[1] || 32));
    node.addComponent(UITransform).setContentSize(width, height);
    node.setPosition(original.rect?.anchoredPosition?.[0] || 0, original.rect?.anchoredPosition?.[1] || 0);

    const scale = original.rect?.localScale;
    if (scale) node.setScale(scale[0] || 1, scale[1] || 1, scale[2] || 1);

    for (const component of original.components || []) {
      if (component.kind === 'Image' && component.spritePathId) {
        const assetKey = spriteManifest.sprites?.[component.spritePathId]?.assetKey;
        if (assetKey) applySpriteFrame(node, assetKey);
      }
      if (component.kind === 'Text') {
        const label = node.getComponent(Label) || node.addComponent(Label);
        label.string = component.text || '';
        label.fontSize = component.fontSize || 18;
        label.lineHeight = Math.round(label.fontSize * 1.15);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.color = toColor(component.color);
      }
    }

    for (const childId of original.children || []) {
      const child = nodes[childId];
      if (child) this.renderNode(node, child, nodes, spriteManifest);
    }
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

function toColor(value?: number[] | null): Color {
  if (!value) return new Color(47, 58, 78, 255);
  const scale = value.some((item) => item > 1) ? 1 : 255;
  return new Color(
    Math.round((value[0] || 0) * scale),
    Math.round((value[1] || 0) * scale),
    Math.round((value[2] || 0) * scale),
    Math.round((value[3] ?? 1) * scale),
  );
}
