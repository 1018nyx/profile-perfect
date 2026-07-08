import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = path.join(projectRoot, 'assets');
const resourcesRoot = path.join(assetsRoot, 'resources');
const dataRoot = path.join(resourcesRoot, 'data');
const sceneAssetRoot = path.join(assetsRoot, 'original_scenes');
const sourceCatalogPath = path.join(dataRoot, 'original-scene-catalog.json');
const spriteManifestPath = path.join(dataRoot, 'sprite-manifest.json');
const outputCatalogPath = path.join(dataRoot, 'cocos-scene-catalog.json');

const UI_LAYER = 33554432;
const CAMERA_LAYER = 1073741824;
const CAMERA_VISIBILITY = 1108344832;
const STAGE_WIDTH = 720;
const STAGE_HEIGHT = 1280;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function projectRel(value) {
  return toPosix(path.relative(projectRoot, value));
}

function resourceLoadPath(outputPath) {
  return toPosix(path.relative(resourcesRoot, outputPath)).replace(/\.[^/.]+$/, '');
}

function stableUuid(seed) {
  const hex = createHash('sha1').update(seed).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readExistingUuid(metaPath, fallbackSeed) {
  const meta = await readJsonIfExists(metaPath);
  if (typeof meta?.uuid === 'string' && meta.uuid) return meta.uuid;
  return fallbackSeed ? stableUuid(fallbackSeed) : randomUUID();
}

async function writeDirectoryMeta(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
  const metaPath = `${dirPath}.meta`;
  const uuid = await readExistingUuid(metaPath, `dir:${projectRel(dirPath)}`);
  const meta = {
    ver: '1.2.0',
    importer: 'directory',
    imported: true,
    uuid,
    files: [],
    subMetas: {},
    userData: {},
  };
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

async function writeSceneMeta(scenePath, sceneUuid) {
  const metaPath = `${scenePath}.meta`;
  const uuid = await readExistingUuid(metaPath, `scene:${projectRel(scenePath)}`);
  const finalUuid = uuid || sceneUuid;
  const meta = {
    ver: '1.1.50',
    importer: 'scene',
    imported: true,
    uuid: finalUuid,
    files: [
      '.json',
    ],
    subMetas: {},
    userData: {},
  };
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return finalUuid;
}

async function writeJsonMeta(jsonPath) {
  const metaPath = `${jsonPath}.meta`;
  const uuid = await readExistingUuid(metaPath, `json:${projectRel(jsonPath)}`);
  const meta = {
    ver: '2.0.1',
    importer: 'json',
    imported: true,
    uuid,
    files: [
      '.json',
    ],
    subMetas: {},
    userData: {},
  };
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

function safeFileName(value) {
  return String(value || 'scene')
    .replaceAll('\\', '/')
    .split('/')
    .at(-1)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_ .-]+|[_ .-]+$/g, '')
    .slice(0, 140) || 'scene';
}

function categoryDir(category) {
  return safeFileName(category || 'uncategorized');
}

function idFor(seed, suffix = '') {
  return `${createHash('sha1').update(`${seed}:${suffix}`).digest('hex').slice(0, 22)}`;
}

function ref(index) {
  return { __id__: index };
}

function vec2(x = 0, y = 0) {
  return { __type__: 'cc.Vec2', x, y };
}

function vec3(x = 0, y = 0, z = 0) {
  return { __type__: 'cc.Vec3', x, y, z };
}

function vec4(x = 0, y = 0, z = 0, w = 0) {
  return { __type__: 'cc.Vec4', x, y, z, w };
}

function quat(x = 0, y = 0, z = 0, w = 1) {
  return { __type__: 'cc.Quat', x, y, z, w };
}

function size(width = 100, height = 100) {
  return { __type__: 'cc.Size', width, height };
}

function color(r = 0, g = 0, b = 0, a = 255) {
  return { __type__: 'cc.Color', r, g, b, a };
}

function rect(x = 0, y = 0, width = 1, height = 1) {
  return { __type__: 'cc.Rect', x, y, width, height };
}

function numberValue(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clampByte(value, fallback = 255) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const scaled = numeric <= 1 ? numeric * 255 : numeric;
  return Math.max(0, Math.min(255, Math.round(scaled)));
}

function unityColorToCocos(value, fallback = color(255, 255, 255, 255)) {
  if (!value || typeof value !== 'object') return fallback;
  if (Number.isFinite(value.r) || Number.isFinite(value.g) || Number.isFinite(value.b) || Number.isFinite(value.a)) {
    return color(
      clampByte(value.r, fallback.r),
      clampByte(value.g, fallback.g),
      clampByte(value.b, fallback.b),
      clampByte(value.a, fallback.a),
    );
  }
  return fallback;
}

function positiveSize(value, fallback = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.abs(numeric));
}

function transformPosition(transform) {
  const local = transform?.localPosition || {};
  const anchored = transform?.anchoredPosition;
  return vec3(
    numberValue(anchored?.x, numberValue(local.x)),
    numberValue(anchored?.y, numberValue(local.y)),
    numberValue(local.z),
  );
}

function transformRotation(transform) {
  const rotation = transform?.localRotation || {};
  return quat(
    numberValue(rotation.x),
    numberValue(rotation.y),
    numberValue(rotation.z),
    numberValue(rotation.w, 1),
  );
}

function transformScale(transform) {
  const scale = transform?.localScale || {};
  return vec3(
    numberValue(scale.x, 1),
    numberValue(scale.y, 1),
    numberValue(scale.z, 1),
  );
}

function transformSize(transform) {
  const sizeDelta = transform?.sizeDelta || {};
  return size(
    positiveSize(sizeDelta.x),
    positiveSize(sizeDelta.y),
  );
}

function transformAnchor(transform) {
  const pivot = transform?.pivot || {};
  return vec2(
    numberValue(pivot.x, 0.5),
    numberValue(pivot.y, 0.5),
  );
}

function createNode({ name, parentIndex, active = true, childIndexes = [], componentIndexes = [], position, rotation, scale, layer = UI_LAYER, idSeed }) {
  return {
    __type__: 'cc.Node',
    _name: String(name || 'Node').slice(0, 220),
    _objFlags: 0,
    _parent: parentIndex == null ? null : ref(parentIndex),
    _children: childIndexes.map(ref),
    _active: Boolean(active),
    _components: componentIndexes.map(ref),
    _prefab: null,
    _lpos: position || vec3(),
    _lrot: rotation || quat(),
    _lscale: scale || vec3(1, 1, 1),
    _layer: layer,
    _euler: vec3(),
    _id: idFor(idSeed || name || 'node', 'node'),
  };
}

function createUiTransform({ nodeIndex, contentSize, anchorPoint, idSeed }) {
  return {
    __type__: 'cc.UITransform',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    _contentSize: contentSize || size(),
    _anchorPoint: anchorPoint || vec2(0.5, 0.5),
    _id: idFor(idSeed || `ui-${nodeIndex}`, 'ui-transform'),
  };
}

function createCanvas(nodeIndex, cameraIndex, idSeed) {
  return {
    __type__: 'cc.Canvas',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    _cameraComponent: ref(cameraIndex),
    _alignCanvasWithScreen: true,
    _id: idFor(idSeed, 'canvas'),
  };
}

function createWidget(nodeIndex, idSeed) {
  return {
    __type__: 'cc.Widget',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    _alignFlags: 45,
    _target: null,
    _left: 0,
    _right: 0,
    _top: 0,
    _bottom: 0,
    _horizontalCenter: 0,
    _verticalCenter: 0,
    _isAbsLeft: true,
    _isAbsRight: true,
    _isAbsTop: true,
    _isAbsBottom: true,
    _isAbsHorizontalCenter: true,
    _isAbsVerticalCenter: true,
    _originalWidth: 0,
    _originalHeight: 0,
    _alignMode: 2,
    _lockFlags: 0,
    _id: idFor(idSeed, 'widget'),
  };
}

function createCamera(nodeIndex, idSeed) {
  return {
    __type__: 'cc.Camera',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: true,
    __prefab: null,
    _projection: 0,
    _priority: 0,
    _fov: 45,
    _fovAxis: 0,
    _orthoHeight: 10,
    _near: 0,
    _far: 2000,
    _color: color(0, 0, 0, 255),
    _depth: 1,
    _stencil: 0,
    _clearFlags: 7,
    _rect: rect(),
    _aperture: 19,
    _shutter: 7,
    _iso: 0,
    _screenScale: 1,
    _visibility: CAMERA_VISIBILITY,
    _targetTexture: null,
    _id: idFor(idSeed, 'camera'),
  };
}

function createSprite({ nodeIndex, component, spriteUuid, idSeed }) {
  const properties = component.properties || {};
  const fillMethod = Number(properties.m_FillMethod || 0);
  const fillAmount = Number.isFinite(properties.m_FillAmount) ? properties.m_FillAmount : 1;
  const fillClockwise = properties.m_FillClockwise !== 0;
  const spriteType = Number.isFinite(properties.m_Type) ? Math.max(0, Math.min(3, properties.m_Type)) : 0;
  return {
    __type__: 'cc.Sprite',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: component.enabled !== 0,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: unityColorToCocos(properties.m_Color, color(255, 255, 255, 255)),
    _sharedMaterial: null,
    _spriteFrame: spriteUuid ? { __uuid__: spriteUuid, __expectedType__: 'cc.SpriteFrame' } : null,
    _type: spriteType,
    _fillType: fillMethod <= 1 ? fillMethod : 2,
    _sizeMode: 0,
    _fillCenter: vec2(0, 0),
    _fillStart: Number.isFinite(properties.m_FillOrigin) ? properties.m_FillOrigin : 0,
    _fillRange: fillClockwise ? fillAmount : -fillAmount,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: idFor(idSeed, `sprite-${component.id}`),
  };
}

function createLabel({ nodeIndex, component, idSeed }) {
  const properties = component.properties || {};
  const fontSize = Math.max(1, Math.round(Number(properties.m_fontSize || properties.m_fontSizeBase || 20)));
  const style = Number(properties.m_fontStyle || 0);
  return {
    __type__: 'cc.Label',
    _name: '',
    _objFlags: 0,
    node: ref(nodeIndex),
    _enabled: component.enabled !== 0,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: unityColorToCocos(properties.m_fontColor || properties.m_Color, color(255, 255, 255, 255)),
    _sharedMaterial: null,
    _useOriginalSize: false,
    _string: String(properties.m_text ?? ''),
    _horizontalAlign: mapTextHorizontalAlign(properties.m_HorizontalAlignment ?? properties.m_textAlignment),
    _verticalAlign: mapTextVerticalAlign(properties.m_VerticalAlignment ?? properties.m_textAlignment),
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: 'Arial',
    _lineHeight: Math.max(fontSize, Math.round(fontSize * 1.18 + Number(properties.m_lineSpacing || 0))),
    _overflow: properties.m_enableAutoSizing ? 2 : 1,
    _enableWrapText: properties.m_TextWrappingMode !== 0,
    _font: null,
    _isSystemFontUsed: true,
    _spacingX: Number(properties.m_characterSpacing || 0),
    _isItalic: Boolean(style & 2),
    _isBold: Boolean(style & 1),
    _isUnderline: Boolean(style & 4),
    _underlineHeight: 2,
    _cacheMode: 0,
    _enableOutline: false,
    _outlineColor: color(0, 0, 0, 255),
    _outlineWidth: 2,
    _enableShadow: false,
    _shadowColor: color(0, 0, 0, 255),
    _shadowOffset: vec2(2, -2),
    _shadowBlur: 2,
    _id: idFor(idSeed, `label-${component.id}`),
  };
}

function mapTextHorizontalAlign(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  if (numeric === 4 || numeric === 8 || numeric === 16 || numeric === 1028 || numeric === 2052 || numeric === 4100) return 2;
  if (numeric === 2 || numeric === 258 || numeric === 514 || numeric === 1026) return 1;
  return 0;
}

function mapTextVerticalAlign(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  if (numeric >= 1024) return 2;
  if (numeric >= 512) return 1;
  if (numeric >= 256) return 0;
  return 1;
}

function isImageComponent(component) {
  const properties = component.properties || {};
  return Boolean(properties.m_Sprite) && component.type !== 'SpriteRenderer';
}

function isSpriteRendererComponent(component) {
  return component.type === 'SpriteRenderer';
}

function isTextComponent(component) {
  return typeof component.properties?.m_text === 'string';
}

function spritePathId(component) {
  const sprite = component.properties?.m_Sprite || component.properties?.m_SpriteFrame;
  return sprite?.pathId || null;
}

function buildComponentsByGameObject(components) {
  const result = new Map();
  for (const component of Object.values(components || {})) {
    if (!component.gameObject) continue;
    if (!result.has(component.gameObject)) result.set(component.gameObject, []);
    result.get(component.gameObject).push(component);
  }
  return result;
}

function sceneGlobals(firstIndex) {
  return [
    {
      __type__: 'cc.SceneGlobals',
      ambient: ref(firstIndex + 1),
      shadows: ref(firstIndex + 2),
      _skybox: ref(firstIndex + 3),
      fog: ref(firstIndex + 4),
      octree: ref(firstIndex + 5),
      skin: ref(firstIndex + 6),
    },
    {
      __type__: 'cc.AmbientInfo',
      _skyColorHDR: vec4(0, 0, 0, 0.520833125),
      _skyColor: vec4(0, 0, 0, 0.520833125),
      _skyIllumHDR: 20000,
      _skyIllum: 20000,
      _groundAlbedoHDR: vec4(),
      _groundAlbedo: vec4(),
      _skyColorLDR: vec4(0.2, 0.5, 0.8, 1),
      _skyIllumLDR: 20000,
      _groundAlbedoLDR: vec4(0.2, 0.2, 0.2, 1),
    },
    {
      __type__: 'cc.ShadowsInfo',
      _enabled: false,
      _type: 0,
      _normal: vec3(0, 1, 0),
      _distance: 0,
      _shadowColor: color(76, 76, 76, 255),
      _maxReceived: 4,
      _size: vec2(512, 512),
    },
    {
      __type__: 'cc.SkyboxInfo',
      _envLightingType: 0,
      _envmapHDR: null,
      _envmap: null,
      _envmapLDR: null,
      _diffuseMapHDR: null,
      _diffuseMapLDR: null,
      _enabled: false,
      _useHDR: true,
    },
    {
      __type__: 'cc.FogInfo',
      _type: 0,
      _fogColor: color(200, 200, 200, 255),
      _enabled: false,
      _fogDensity: 0.3,
      _fogStart: 0.5,
      _fogEnd: 300,
      _fogAtten: 5,
      _fogTop: 1.5,
      _fogRange: 1.2,
      _accurate: false,
    },
    {
      __type__: 'cc.OctreeInfo',
      _enabled: false,
      _minPos: vec3(-1024, -1024, -1024),
      _maxPos: vec3(1024, 1024, 1024),
      _depth: 8,
    },
    {
      __type__: 'cc.SkinInfo',
      _enabled: false,
      _scale: 5,
    },
  ];
}

function createCocosScene(scene, sceneUuid, spriteFrameByPathId) {
  const objects = [];
  const push = (object) => {
    objects.push(object);
    return objects.length - 1;
  };
  const visualStats = {
    sprites: 0,
    labels: 0,
    spriteRenderers: 0,
    missingSpriteFrames: 0,
  };

  const sceneAssetIndex = push({
    __type__: 'cc.SceneAsset',
    _name: scene.name,
    _objFlags: 0,
    _native: '',
    scene: ref(1),
  });
  void sceneAssetIndex;

  const sceneIndex = push({
    __type__: 'cc.Scene',
    _name: scene.name,
    _objFlags: 0,
    _parent: null,
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    autoReleaseAssets: false,
    _globals: null,
    _id: sceneUuid,
  });

  const canvasIndex = push(createNode({
    name: 'Canvas',
    parentIndex: sceneIndex,
    position: vec3(STAGE_WIDTH / 2, STAGE_HEIGHT / 2, 0),
    idSeed: `${scene.id}:canvas-node`,
  }));
  objects[sceneIndex]._children = [ref(canvasIndex)];

  const cameraIndex = push(createNode({
    name: 'Camera',
    parentIndex: canvasIndex,
    layer: CAMERA_LAYER,
    idSeed: `${scene.id}:camera-node`,
  }));
  const cameraComponentIndex = push(createCamera(cameraIndex, `${scene.id}:camera-component`));
  objects[cameraIndex]._components = [ref(cameraComponentIndex)];

  const canvasTransformIndex = push(createUiTransform({
    nodeIndex: canvasIndex,
    contentSize: size(STAGE_WIDTH, STAGE_HEIGHT),
    anchorPoint: vec2(0.5, 0.5),
    idSeed: `${scene.id}:canvas-ui`,
  }));
  const canvasComponentIndex = push(createCanvas(canvasIndex, cameraComponentIndex, `${scene.id}:canvas-component`));
  const canvasWidgetIndex = push(createWidget(canvasIndex, `${scene.id}:canvas-widget`));
  objects[canvasIndex]._components = [ref(canvasTransformIndex), ref(canvasComponentIndex), ref(canvasWidgetIndex)];

  const globalsIndex = objects.length;
  for (const globalObject of sceneGlobals(globalsIndex)) push(globalObject);
  objects[sceneIndex]._globals = ref(globalsIndex);

  const originalRootIndex = push(createNode({
    name: `UnityScene_${scene.name}`,
    parentIndex: canvasIndex,
    position: vec3(),
    idSeed: `${scene.id}:unity-root-node`,
  }));
  const originalRootTransformIndex = push(createUiTransform({
    nodeIndex: originalRootIndex,
    contentSize: size(STAGE_WIDTH, STAGE_HEIGHT),
    anchorPoint: vec2(0.5, 0.5),
    idSeed: `${scene.id}:unity-root-ui`,
  }));
  objects[originalRootIndex]._components = [ref(originalRootTransformIndex)];
  objects[canvasIndex]._children = [ref(cameraIndex), ref(originalRootIndex)];

  const nodeIndexByOriginalId = new Map();
  const nodes = scene.nodes || {};
  const componentsByGameObject = buildComponentsByGameObject(scene.components || {});
  const originalIds = Object.keys(nodes).sort((a, b) => {
    const left = nodes[a]?.path || nodes[a]?.name || a;
    const right = nodes[b]?.path || nodes[b]?.name || b;
    return left.localeCompare(right);
  });

  for (const originalId of originalIds) {
    const original = nodes[originalId];
    const transform = original.transform || {};
    const nodeIndex = push(createNode({
      name: original.name || originalId,
      parentIndex: originalRootIndex,
      active: original.active !== false,
      position: transformPosition(transform),
      rotation: transformRotation(transform),
      scale: transformScale(transform),
      idSeed: `${scene.id}:${originalId}`,
    }));
    const uiIndex = push(createUiTransform({
      nodeIndex,
      contentSize: transformSize(transform),
      anchorPoint: transformAnchor(transform),
      idSeed: `${scene.id}:${originalId}`,
    }));
    const componentIndexes = [uiIndex];
    for (const component of componentsByGameObject.get(originalId) || []) {
      if (isTextComponent(component)) {
        const labelIndex = push(createLabel({
          nodeIndex,
          component,
          idSeed: `${scene.id}:${originalId}`,
        }));
        componentIndexes.push(labelIndex);
        visualStats.labels += 1;
        continue;
      }

      if (isImageComponent(component) || isSpriteRendererComponent(component)) {
        const pathId = spritePathId(component);
        const spriteUuid = pathId ? spriteFrameByPathId[pathId] : null;
        if (pathId && !spriteUuid) visualStats.missingSpriteFrames += 1;
        const spriteIndex = push(createSprite({
          nodeIndex,
          component,
          spriteUuid,
          idSeed: `${scene.id}:${originalId}`,
        }));
        componentIndexes.push(spriteIndex);
        visualStats.sprites += 1;
        if (isSpriteRendererComponent(component)) visualStats.spriteRenderers += 1;
      }
    }
    objects[nodeIndex]._components = componentIndexes.map(ref);
    nodeIndexByOriginalId.set(originalId, nodeIndex);
  }

  const originalRootChildren = [];
  for (const originalId of originalIds) {
    const original = nodes[originalId];
    const nodeIndex = nodeIndexByOriginalId.get(originalId);
    const parentIndex = original.parent && nodeIndexByOriginalId.has(original.parent)
      ? nodeIndexByOriginalId.get(original.parent)
      : originalRootIndex;
    objects[nodeIndex]._parent = ref(parentIndex);
    const childIndexes = (original.children || [])
      .map((childId) => nodeIndexByOriginalId.get(childId))
      .filter((childIndex) => childIndex != null);
    objects[nodeIndex]._children = childIndexes.map(ref);
    if (parentIndex === originalRootIndex) originalRootChildren.push(nodeIndex);
  }
  objects[originalRootIndex]._children = originalRootChildren.map(ref);

  return { objects, visualStats };
}

async function writeScene(sceneEntry, usedOutputPaths, spriteFrameByPathId) {
  const sceneJsonPath = path.join(projectRoot, sceneEntry.outputPath);
  const scene = JSON.parse(await fs.readFile(sceneJsonPath, 'utf8'));
  const dir = path.join(sceneAssetRoot, categoryDir(sceneEntry.category));
  await writeDirectoryMeta(dir);

  let baseName = safeFileName(scene.name);
  if (!baseName || baseName === 'scene') baseName = safeFileName(scene.id);
  let scenePath = path.join(dir, `${baseName}.scene`);
  if (usedOutputPaths.has(scenePath)) {
    scenePath = path.join(dir, `${baseName}__${safeFileName(scene.id)}.scene`);
  }
  usedOutputPaths.add(scenePath);

  const initialUuid = await readExistingUuid(`${scenePath}.meta`, `scene:${projectRel(scenePath)}`);
  const { objects, visualStats } = createCocosScene(scene, initialUuid, spriteFrameByPathId);
  await fs.writeFile(scenePath, `${JSON.stringify(objects, null, 2)}\n`, 'utf8');
  const sceneUuid = await writeSceneMeta(scenePath, initialUuid);

  return {
    sceneId: scene.id,
    name: scene.name,
    category: scene.category,
    sourcePath: scene.sourcePath,
    originalJsonPath: projectRel(sceneJsonPath),
    originalJsonResourceLoadPath: resourceLoadPath(sceneJsonPath),
    scenePath: projectRel(scenePath),
    sceneUuid,
    rootCount: scene.rootIds?.length || 0,
    nodeCount: scene.nodeCount || 0,
    componentCount: scene.componentCount || 0,
    visualStats,
    note: 'Cocos scene generated from extracted Unity GameObject/Transform data. Unity Image and SpriteRenderer components are mapped to cc.Sprite where possible; Unity Text/TMP components are mapped to cc.Label. Original Unity component payloads remain in the paired JSON resource.',
  };
}

async function loadSpriteFrameMap() {
  const manifest = await readJsonIfExists(spriteManifestPath);
  const sprites = manifest?.sprites || {};
  const result = {};
  let withMeta = 0;
  let missingMeta = 0;

  for (const [pathId, sprite] of Object.entries(sprites)) {
    if (!sprite?.file) continue;
    const metaPath = path.join(resourcesRoot, `${sprite.file}.meta`);
    const meta = await readJsonIfExists(metaPath);
    const spriteFrame = Object.values(meta?.subMetas || {}).find((item) => item?.importer === 'sprite-frame');
    if (spriteFrame?.uuid) {
      result[pathId] = spriteFrame.uuid;
      withMeta += 1;
    } else {
      missingMeta += 1;
    }
  }

  return {
    byPathId: result,
    totalSprites: Object.keys(sprites).length,
    spriteFrames: withMeta,
    missingMeta,
  };
}

async function main() {
  const sourceCatalog = JSON.parse(await fs.readFile(sourceCatalogPath, 'utf8'));
  const spriteFrameMap = await loadSpriteFrameMap();
  await writeDirectoryMeta(sceneAssetRoot);

  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;
  const sceneEntries = limit > 0 ? sourceCatalog.scenes.slice(0, limit) : sourceCatalog.scenes;
  const usedOutputPaths = new Set();
  const scenes = [];

  for (const sceneEntry of sceneEntries) {
    scenes.push(await writeScene(sceneEntry, usedOutputPaths, spriteFrameMap.byPathId));
  }

  const catalog = {
    version: 1,
    sourceCatalogPath: projectRel(sourceCatalogPath),
    outputRoot: projectRel(sceneAssetRoot),
    spriteFrameMap: {
      source: projectRel(spriteManifestPath),
      sprites: spriteFrameMap.totalSprites,
      spriteFrames: spriteFrameMap.spriteFrames,
      missingMeta: spriteFrameMap.missingMeta,
    },
    generatedSceneCount: scenes.length,
    totalNodes: scenes.reduce((sum, scene) => sum + scene.nodeCount, 0),
    visualTotals: scenes.reduce((totals, scene) => {
      totals.sprites += scene.visualStats.sprites;
      totals.labels += scene.visualStats.labels;
      totals.spriteRenderers += scene.visualStats.spriteRenderers;
      totals.missingSpriteFrames += scene.visualStats.missingSpriteFrames;
      return totals;
    }, { sprites: 0, labels: 0, spriteRenderers: 0, missingSpriteFrames: 0 }),
    scenes,
  };
  await fs.writeFile(outputCatalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeJsonMeta(outputCatalogPath);

  console.log(JSON.stringify({
    generatedSceneCount: scenes.length,
    totalNodes: catalog.totalNodes,
    visualTotals: catalog.visualTotals,
    spriteFrames: spriteFrameMap.spriteFrames,
    outputRoot: projectRel(sceneAssetRoot),
    catalog: projectRel(outputCatalogPath),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
