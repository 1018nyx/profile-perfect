import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = path.join(projectRoot, 'assets');
const resourcesRoot = path.join(assetsRoot, 'resources');
const dataRoot = path.join(resourcesRoot, 'data');
const originalRoot = path.join(assetsRoot, 'original_unity');
const convertedRoot = path.join(resourcesRoot, 'converted');

const groups = {
  unityBundles: {
    label: 'Unity Addressables bundles',
    source: 'assets/original_unity/unity_bundles',
    outputSubdir: 'unity-bundles',
    importType: 'BufferAsset',
  },
  balancy: {
    label: 'Balancy configs',
    source: 'assets/original_unity/balancy',
    outputSubdir: 'balancy',
    importType: 'JsonAsset/TextAsset',
  },
  unityData: {
    label: 'Unity Data split files',
    source: 'assets/original_unity/unity_data',
    outputSubdir: 'unity-data',
    importType: 'BufferAsset',
  },
  scenes: {
    label: 'Extracted Unity scene and prefab hierarchies',
    source: 'assets/original_unity/unity_bundles + assets/original_unity/unity_data',
    outputSubdir: 'scenes',
    importType: 'JsonAsset',
  },
  audio: {
    label: 'Extracted Unity AudioClip samples',
    source: 'assets/original_unity/unity_bundles + assets/original_unity/unity_data',
    outputSubdir: 'audio',
    importType: 'AudioClip',
  },
  configs: {
    label: 'Unity service and Balancy zip configs',
    source: 'assets/original_unity',
    outputSubdir: 'configs',
    importType: 'JsonAsset/TextAsset/BufferAsset',
  },
  archives: {
    label: 'Original archive payloads',
    source: 'assets/original_unity',
    outputSubdir: 'archives',
    importType: 'BufferAsset',
  },
};

const entries = [];
const warnings = [];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function projectRel(value) {
  return toPosix(path.relative(projectRoot, value));
}

function stripLoadExtension(value) {
  return value.replace(/\.[^/.]+$/, '');
}

function resourceLoadPath(outputPath) {
  return stripLoadExtension(toPosix(path.relative(resourcesRoot, outputPath)));
}

function isIgnoredRelative(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  const parts = normalized.split('/');
  const basename = parts.at(-1) || '';
  return (
    normalized.endsWith('/') ||
    parts.includes('__MACOSX') ||
    basename === '.DS_Store' ||
    basename.startsWith('._') ||
    basename.endsWith('.meta')
  );
}

function safeRelativePath(relativePath) {
  return relativePath
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replace(/[^A-Za-z0-9._-]/g, '_'))
    .join('/');
}

async function walkFiles(root) {
  const result = [];
  async function visit(dir) {
    let items = [];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    for (const item of items) {
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) {
        await visit(absolute);
      } else if (item.isFile()) {
        result.push(absolute);
      }
    }
  }
  await visit(root);
  return result.sort((a, b) => a.localeCompare(b));
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function ensureParent(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function addEntry(entry) {
  const stat = await fs.stat(entry.outputPath);
  entries.push({
    id: `${entry.group}:${entries.length + 1}`,
    group: entry.group,
    kind: entry.kind,
    name: entry.name,
    originalExtension: entry.originalExtension,
    cocosExtension: path.extname(entry.outputPath),
    importType: entry.importType,
    sourcePath: entry.sourcePath,
    outputPath: projectRel(entry.outputPath),
    resourceLoadPath: resourceLoadPath(entry.outputPath),
    bytes: stat.size,
    sha256: entry.sha256 || await hashFile(entry.outputPath),
    ...entry.extra,
  });
}

async function copyBinaryAsset({ sourcePath, outputPath, group, kind, name, extra = {} }) {
  await ensureParent(outputPath);
  await fs.copyFile(sourcePath, outputPath);
  await addEntry({
    group,
    kind,
    name,
    sourcePath: projectRel(sourcePath),
    outputPath,
    importType: 'BufferAsset',
    originalExtension: path.extname(sourcePath),
    extra,
  });
}

async function writeBufferAsset({ buffer, sourcePath, outputPath, group, kind, name, originalExtension, extra = {} }) {
  await ensureParent(outputPath);
  await fs.writeFile(outputPath, buffer);
  await addEntry({
    group,
    kind,
    name,
    sourcePath,
    outputPath,
    importType: 'BufferAsset',
    originalExtension,
    sha256: hashBuffer(buffer),
    extra,
  });
}

async function writeTextAsset({ text, sourcePath, outputPath, group, kind, name, importType, originalExtension, extra = {} }) {
  const normalizedText = text.endsWith('\n') ? text : `${text}\n`;
  await ensureParent(outputPath);
  await fs.writeFile(outputPath, normalizedText, 'utf8');
  await addEntry({
    group,
    kind,
    name,
    sourcePath,
    outputPath,
    importType,
    originalExtension,
    sha256: hashBuffer(Buffer.from(normalizedText, 'utf8')),
    extra,
  });
}

async function convertJsonOrTextFile({ sourcePath, sourceRoot, outputRoot, group, kind }) {
  const relative = safeRelativePath(path.relative(sourceRoot, sourcePath));
  if (!relative || isIgnoredRelative(relative)) return;

  const sourceText = await fs.readFile(sourcePath, 'utf8');
  const extension = path.extname(sourcePath).toLowerCase();
  const sourcePathRel = projectRel(sourcePath);

  if (extension === '.json') {
    try {
      const parsed = JSON.parse(sourceText);
      await writeTextAsset({
        text: JSON.stringify(parsed, null, 2),
        sourcePath: sourcePathRel,
        outputPath: path.join(outputRoot, relative),
        group,
        kind,
        name: path.basename(sourcePath),
        importType: 'JsonAsset',
        originalExtension: extension,
      });
      return;
    } catch (error) {
      const fallbackRelative = `${relative}.txt`;
      warnings.push(`${sourcePathRel} is not valid JSON; wrote it as ${fallbackRelative}`);
      await writeTextAsset({
        text: sourceText,
        sourcePath: sourcePathRel,
        outputPath: path.join(outputRoot, fallbackRelative),
        group,
        kind,
        name: path.basename(sourcePath),
        importType: 'TextAsset',
        originalExtension: extension,
        extra: { jsonParseError: String(error.message || error) },
      });
      return;
    }
  }

  const outputRelative = extension === '.txt' ? relative : `${relative}.txt`;
  await writeTextAsset({
    text: sourceText,
    sourcePath: sourcePathRel,
    outputPath: path.join(outputRoot, outputRelative),
    group,
    kind,
    name: path.basename(sourcePath),
    importType: 'TextAsset',
    originalExtension: extension,
  });
}

async function convertUnityBundles() {
  const sourceDir = path.join(originalRoot, 'unity_bundles');
  const outputDir = path.join(convertedRoot, groups.unityBundles.outputSubdir);
  const files = (await walkFiles(sourceDir)).filter((file) => path.extname(file) === '.bundle');
  for (const file of files) {
    const relative = safeRelativePath(path.relative(sourceDir, file));
    await copyBinaryAsset({
      sourcePath: file,
      outputPath: path.join(outputDir, `${relative}.bin`),
      group: 'unityBundles',
      kind: 'unity-bundle-binary',
      name: path.basename(file),
    });
  }
}

async function convertBalancyConfigs() {
  const sourceDir = path.join(originalRoot, 'balancy');
  const outputDir = path.join(convertedRoot, groups.balancy.outputSubdir);
  const files = await walkFiles(sourceDir);
  for (const file of files) {
    const relative = path.relative(sourceDir, file);
    if (isIgnoredRelative(relative)) continue;
    await convertJsonOrTextFile({
      sourcePath: file,
      sourceRoot: sourceDir,
      outputRoot: outputDir,
      group: 'balancy',
      kind: 'balancy-config',
    });
  }
}

async function convertUnityData() {
  const sourceDir = path.join(originalRoot, 'unity_data');
  const outputDir = path.join(convertedRoot, groups.unityData.outputSubdir);
  const files = await walkFiles(sourceDir);
  for (const file of files) {
    const relative = safeRelativePath(path.relative(sourceDir, file));
    if (!relative || isIgnoredRelative(relative)) continue;
    await copyBinaryAsset({
      sourcePath: file,
      outputPath: path.join(outputDir, `${relative}.bin`),
      group: 'unityData',
      kind: 'unity-data-binary',
      name: relative,
    });
  }
}

function pythonExecutable() {
  const bundled = '/Users/niuyaxue/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
  return process.env.PYTHON || bundled;
}

async function convertUnityAudio() {
  const manifestPath = path.join(projectRoot, 'temp', 'original-audio-extract.json');
  const scriptPath = path.join(projectRoot, 'tools', 'extract-unity-audio.py');
  const output = execFileSync(pythonExecutable(), [
    scriptPath,
    '--project',
    projectRoot,
    '--manifest',
    manifestPath,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (output.trim()) console.log(output.trim());

  const audioManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const audioEntry of audioManifest.entries || []) {
    await writeAudioMeta(audioEntry);
    await addEntry({
      group: 'audio',
      kind: 'unity-audio-clip',
      name: audioEntry.name,
      sourcePath: audioEntry.sourcePath,
      outputPath: path.join(projectRoot, audioEntry.outputPath),
      importType: 'AudioClip',
      originalExtension: audioEntry.originalExtension,
      sha256: audioEntry.sha256,
      extra: {
        clipName: audioEntry.clipName,
        fileName: audioEntry.fileName,
        sources: audioEntry.sources,
        sourceCount: audioEntry.sources?.length || 1,
        channels: audioEntry.channels,
        frequency: audioEntry.frequency,
        bitsPerSample: audioEntry.bitsPerSample,
        lengthSeconds: audioEntry.lengthSeconds,
        loadType: audioEntry.loadType,
        compressionFormat: audioEntry.compressionFormat,
      },
    });
  }

  if (audioManifest.errors?.length) {
    warnings.push(`Audio extraction reported ${audioManifest.errors.length} read errors; see ${projectRel(manifestPath)}`);
  }
}

async function convertUnityScenes() {
  const manifestPath = path.join(projectRoot, 'temp', 'original-scene-extract.json');
  const scriptPath = path.join(projectRoot, 'tools', 'extract-unity-scenes.py');
  const output = execFileSync(pythonExecutable(), [
    scriptPath,
    '--project',
    projectRoot,
    '--manifest',
    manifestPath,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (output.trim()) console.log(output.trim());

  const sceneManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const sceneEntry of sceneManifest.entries || []) {
    await addEntry({
      group: 'scenes',
      kind: sceneEntry.kind,
      name: sceneEntry.name,
      sourcePath: sceneEntry.sourcePath,
      outputPath: path.join(projectRoot, sceneEntry.outputPath),
      importType: 'JsonAsset',
      originalExtension: path.extname(sceneEntry.sourcePath) || '.unity-data',
      sha256: sceneEntry.sha256,
      extra: {
        sceneId: sceneEntry.id,
        category: sceneEntry.category,
        rootCount: sceneEntry.rootCount,
        nodeCount: sceneEntry.nodeCount,
        componentCount: sceneEntry.componentCount,
        referencedAssetCount: sceneEntry.referencedAssetCount,
        sceneSettingCount: sceneEntry.sceneSettingCount,
        objectCounts: sceneEntry.objectCounts,
      },
    });
  }

  if (sceneManifest.errors?.length) {
    warnings.push(`Scene extraction reported ${sceneManifest.errors.length} read errors; see ${projectRel(manifestPath)}`);
  }
}

async function generateCocosScenes() {
  const scriptPath = path.join(projectRoot, 'tools', 'generate-cocos-scenes.mjs');
  const output = execFileSync(process.execPath, [
    scriptPath,
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (output.trim()) console.log(output.trim());
}

async function writeAudioMeta(audioEntry) {
  const outputPath = path.join(projectRoot, audioEntry.outputPath);
  const extension = path.extname(outputPath);
  const metaPath = `${outputPath}.meta`;
  const meta = {
    ver: '1.0.0',
    importer: 'audio-clip',
    imported: true,
    uuid: await readExistingUuid(metaPath),
    files: [
      extension,
      '.json',
    ],
    subMetas: {},
    userData: {
      downloadMode: 0,
    },
  };
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

async function readExistingUuid(metaPath) {
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    if (typeof meta.uuid === 'string' && meta.uuid) return meta.uuid;
  } catch {
    // Missing or malformed generated metadata is recreated below.
  }
  return randomUUID();
}

function listZipEntries(zipPath) {
  const output = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return output.split(/\r?\n/).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function readZipEntry(zipPath, entryName) {
  return execFileSync('unzip', ['-p', zipPath, entryName], { maxBuffer: 128 * 1024 * 1024 });
}

async function convertZipContents({ zipPath, outputRoot, group, kind }) {
  const entriesInZip = listZipEntries(zipPath);
  for (const entryName of entriesInZip) {
    if (isIgnoredRelative(entryName)) continue;
    const safeEntry = safeRelativePath(entryName);
    if (!safeEntry) continue;

    const buffer = readZipEntry(zipPath, entryName);
    const extension = path.extname(entryName).toLowerCase();
    const sourcePath = `${projectRel(zipPath)}::${entryName}`;

    if (extension === '.json') {
      const text = buffer.toString('utf8');
      try {
        const parsed = JSON.parse(text);
        await writeTextAsset({
          text: JSON.stringify(parsed, null, 2),
          sourcePath,
          outputPath: path.join(outputRoot, safeEntry),
          group,
          kind,
          name: path.basename(entryName),
          importType: 'JsonAsset',
          originalExtension: extension,
          extra: { container: projectRel(zipPath), zipEntry: entryName },
        });
        continue;
      } catch (error) {
        warnings.push(`${sourcePath} is not valid JSON; wrote it as text`);
        await writeTextAsset({
          text,
          sourcePath,
          outputPath: path.join(outputRoot, `${safeEntry}.txt`),
          group,
          kind,
          name: path.basename(entryName),
          importType: 'TextAsset',
          originalExtension: extension,
          extra: { container: projectRel(zipPath), zipEntry: entryName, jsonParseError: String(error.message || error) },
        });
        continue;
      }
    }

    if (extension === '.txt' || extension === '.md' || extension === '.csv') {
      await writeTextAsset({
        text: buffer.toString('utf8'),
        sourcePath,
        outputPath: path.join(outputRoot, extension === '.txt' ? safeEntry : `${safeEntry}.txt`),
        group,
        kind,
        name: path.basename(entryName),
        importType: 'TextAsset',
        originalExtension: extension,
        extra: { container: projectRel(zipPath), zipEntry: entryName },
      });
      continue;
    }

    await writeBufferAsset({
      buffer,
      sourcePath,
      outputPath: path.join(outputRoot, `${safeEntry}.bin`),
      group,
      kind,
      name: path.basename(entryName),
      originalExtension: extension,
      extra: { container: projectRel(zipPath), zipEntry: entryName },
    });
  }
}

async function convertConfigsAndArchives() {
  const configsDir = path.join(convertedRoot, groups.configs.outputSubdir);
  const unityServices = path.join(originalRoot, 'UnityServicesProjectConfiguration.json');
  await convertJsonOrTextFile({
    sourcePath: unityServices,
    sourceRoot: originalRoot,
    outputRoot: configsDir,
    group: 'configs',
    kind: 'unity-services-config',
  });

  const balancyZip = path.join(originalRoot, 'StreamingAssetsBalancy.zip');
  await copyBinaryAsset({
    sourcePath: balancyZip,
    outputPath: path.join(configsDir, 'StreamingAssetsBalancy.zip.bin'),
    group: 'configs',
    kind: 'config-zip-binary',
    name: 'StreamingAssetsBalancy.zip',
  });
  await convertZipContents({
    zipPath: balancyZip,
    outputRoot: path.join(configsDir, 'StreamingAssetsBalancy'),
    group: 'configs',
    kind: 'config-zip-entry',
  });

  const apkAssetsZip = path.join(originalRoot, 'ProfilePerfect_apk_assets.zip');
  await copyBinaryAsset({
    sourcePath: apkAssetsZip,
    outputPath: path.join(convertedRoot, groups.archives.outputSubdir, 'ProfilePerfect_apk_assets.zip.bin'),
    group: 'archives',
    kind: 'original-apk-assets-zip',
    name: 'ProfilePerfect_apk_assets.zip',
    extra: { note: 'Raw original APK assets archive kept loadable as a Cocos BufferAsset.' },
  });
}

async function readJsonIfExists(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

async function existingExtractedAssetsSummary() {
  const spriteManifest = await readJsonIfExists('assets/resources/data/sprite-manifest.json');
  const textureManifest = await readJsonIfExists('assets/resources/data/texture-manifest.json');
  const pageCatalog = await readJsonIfExists('assets/resources/data/original-ui-page-catalog.json');
  const hierarchy = await readJsonIfExists('assets/resources/data/original-ui-hierarchy.json');
  const sceneCatalog = await readJsonIfExists('assets/resources/data/original-scene-catalog.json');
  const sceneHierarchy = await readJsonIfExists('assets/resources/data/original-scene-hierarchy.json');
  const cocosSceneCatalog = await readJsonIfExists('assets/resources/data/cocos-scene-catalog.json');
  const originalResourceManifest = await readJsonIfExists('assets/resources/data/original-resource-manifest.json');

  return {
    sprites: spriteManifest?.sprites ? Object.keys(spriteManifest.sprites).length : 0,
    spriteMissingPathIds: spriteManifest?.missingPathIds?.length || 0,
    textures: Array.isArray(textureManifest?.textures)
      ? textureManifest.textures.length
      : Object.keys(textureManifest?.textures || {}).length,
    uiPages: Array.isArray(pageCatalog?.pages) ? pageCatalog.pages.length : 0,
    uiBundles: Array.isArray(hierarchy?.bundles) ? hierarchy.bundles.length : 0,
    uiNodes: Array.isArray(hierarchy?.bundles)
      ? hierarchy.bundles.reduce((sum, bundle) => sum + (bundle.nodeCount || Object.keys(bundle.nodes || {}).length), 0)
      : 0,
    sceneSources: Array.isArray(sceneCatalog?.scenes) ? sceneCatalog.scenes.length : 0,
    sceneNodes: sceneHierarchy?.totalNodes || sceneCatalog?.totalNodes || 0,
    cocosSceneAssets: Array.isArray(cocosSceneCatalog?.scenes) ? cocosSceneCatalog.scenes.length : 0,
    cocosSceneSprites: cocosSceneCatalog?.visualTotals?.sprites || 0,
    cocosSceneLabels: cocosSceneCatalog?.visualTotals?.labels || 0,
    cocosSceneSpriteRenderers: cocosSceneCatalog?.visualTotals?.spriteRenderers || 0,
    cocosSceneMissingSpriteFrames: cocosSceneCatalog?.visualTotals?.missingSpriteFrames || 0,
    originalImportManifest: originalResourceManifest?.importedOriginalAssets || null,
  };
}

function summarizeGroups() {
  const summary = {};
  for (const [key, group] of Object.entries(groups)) {
    const groupEntries = entries.filter((entry) => entry.group === key);
    summary[key] = {
      label: group.label,
      source: group.source,
      output: `assets/resources/converted/${group.outputSubdir}`,
      importType: group.importType,
      count: groupEntries.length,
      bytes: groupEntries.reduce((sum, entry) => sum + entry.bytes, 0),
      kinds: [...new Set(groupEntries.map((entry) => entry.kind))].sort(),
    };
  }
  return summary;
}

async function writeIndexFiles(manifestBase) {
  const indexes = {};
  for (const [key, group] of Object.entries(groups)) {
    const groupEntries = entries.filter((entry) => entry.group === key);
    const outputPath = path.join(convertedRoot, group.outputSubdir, 'index.json');
    const index = {
      version: 1,
      generatedAt: manifestBase.generatedAt,
      group: key,
      label: group.label,
      count: groupEntries.length,
      bytes: groupEntries.reduce((sum, entry) => sum + entry.bytes, 0),
      entries: groupEntries,
    };
    await ensureParent(outputPath);
    await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    indexes[key] = {
      outputPath: projectRel(outputPath),
      resourceLoadPath: resourceLoadPath(outputPath),
      count: groupEntries.length,
    };
  }
  return indexes;
}

async function writeManifest() {
  const packageJson = await readJsonIfExists('package.json');
  const generatedAt = new Date().toISOString();
  const base = {
    version: 1,
    generatedAt,
    cocosCreatorVersion: packageJson?.creator?.version || '3.8.7',
    source: {
      xapk: '/Users/niuyaxue/Downloads/Profile+Perfect_0.9.1_APKPure.xapk',
      unpacked: '/Users/niuyaxue/Desktop/ProfilePerfect_xapk_unpacked',
      originalAssetsRoot: 'assets/original_unity',
    },
    resources: {
      root: 'assets/resources',
      convertedRoot: 'assets/resources/converted',
      masterManifestPath: 'assets/resources/data/cocos-converted-resource-manifest.json',
      masterManifestLoadPath: 'data/cocos-converted-resource-manifest',
    },
    loadExamples: {
      json: "resources.load('converted/balancy/<file-name>', JsonAsset, callback)",
      text: "resources.load('converted/balancy/balancy_files_manifest', TextAsset, callback)",
      binary: "resources.load('converted/unity-bundles/ui_assets_all.bundle', BufferAsset, callback)",
      scene: "resources.load('converted/scenes/unity_bundles__mainlevel_airport_assets_all', JsonAsset, callback)",
      audio: "resources.load('converted/audio/ButtonClick1', AudioClip, callback)",
    },
    existingExtractedCocosAssets: await existingExtractedAssetsSummary(),
    totals: {
      entries: entries.length,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    groups: summarizeGroups(),
    warnings,
  };

  const indexes = await writeIndexFiles(base);
  const manifest = { ...base, indexes, entries };
  const manifestPath = path.join(dataRoot, 'cocos-converted-resource-manifest.json');
  await ensureParent(manifestPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const convertedIndexPath = path.join(convertedRoot, 'index.json');
  await fs.writeFile(convertedIndexPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  await fs.mkdir(convertedRoot, { recursive: true });

  await convertUnityBundles();
  await convertBalancyConfigs();
  await convertUnityData();
  await convertUnityScenes();
  await generateCocosScenes();
  await convertUnityAudio();
  await convertConfigsAndArchives();
  await writeManifest();

  const summary = summarizeGroups();
  console.log('Converted original Unity assets for Cocos Creator resources.');
  for (const [key, group] of Object.entries(summary)) {
    console.log(`${key}: ${group.count} files, ${group.bytes} bytes`);
  }
  console.log('manifest: assets/resources/data/cocos-converted-resource-manifest.json');
  if (warnings.length) {
    console.log(`warnings: ${warnings.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
