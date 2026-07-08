import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_HIERARCHY = resolve(PROJECT_ROOT, 'assets/resources/data/original-ui-hierarchy.json');
const DEFAULT_OUTPUT = resolve(PROJECT_ROOT, 'assets/resources/data/original-ui-page-catalog.json');

const PAGE_KEYWORDS = /popup|shop|daily|home|level|settings|setting|language|offer|revive|reward|chest|calendar|loading|intro|navbar|banner|win|lose|ticket|life|clue|story/i;

export function buildUiCatalog(hierarchy) {
  const pages = [];

  for (const bundle of hierarchy.bundles || []) {
    const nodes = bundle.nodes || {};
    for (const rootId of bundle.rootIds || []) {
      const root = nodes[rootId];
      if (!root) continue;

      const stats = collectStats(root, nodes);
      const pageLike = PAGE_KEYWORDS.test(root.name) || PAGE_KEYWORDS.test(bundle.bundle) || stats.nodeCount > 10;
      if (!pageLike) continue;

      pages.push({
        bundle: bundle.bundle,
        id: root.id,
        name: root.name,
        active: root.active,
        childCount: root.children?.length || 0,
        nodeCount: stats.nodeCount,
        imageCount: stats.imageCount,
        textCount: stats.textCount,
        buttonCount: stats.buttonCount,
        spritePathIds: [...stats.spritePathIds].sort(),
      });
    }
  }

  pages.sort((a, b) => a.bundle.localeCompare(b.bundle) || a.name.localeCompare(b.name));
  return {
    source: {
      hierarchyBundleCount: hierarchy.source?.bundleCount || 0,
      hierarchyNodeCount: hierarchy.source?.nodeCount || 0,
      pageCount: pages.length,
    },
    pages,
  };
}

function collectStats(root, nodes) {
  const stack = [root];
  const spritePathIds = new Set();
  let nodeCount = 0;
  let imageCount = 0;
  let textCount = 0;
  let buttonCount = 0;

  while (stack.length) {
    const node = stack.pop();
    nodeCount += 1;

    for (const component of node.components || []) {
      if (component.kind === 'Image') {
        imageCount += 1;
        if (component.spritePathId && component.spritePathId !== '0') spritePathIds.add(component.spritePathId);
      }
      if (component.kind === 'Text') textCount += 1;
      if (component.kind === 'Button') buttonCount += 1;
    }

    for (const childId of node.children || []) {
      const child = nodes[childId];
      if (child) stack.push(child);
    }
  }

  return { nodeCount, imageCount, textCount, buttonCount, spritePathIds };
}

async function main() {
  const hierarchyPath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_HIERARCHY;
  const outputPath = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_OUTPUT;
  const hierarchy = JSON.parse(await readFile(hierarchyPath, 'utf8'));
  const catalog = buildUiCatalog(hierarchy);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(catalog, null, 2), 'utf8');

  console.log(`Catalog pages: ${catalog.pages.length}`);
  console.log(`Wrote ${outputPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
