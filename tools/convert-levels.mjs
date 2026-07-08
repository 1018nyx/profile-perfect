import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = resolve(PROJECT_ROOT, '../profile_perfect_xapk/unity_levels_all.json');
const DEFAULT_LEVEL_ORDER = resolve(PROJECT_ROOT, '../profile_perfect_xapk/base_apk/assets/Balancy/77912c92-0d9c-11f1-93e0-1fec53a055ba_LevelOrderMetadata.json');
const DEFAULT_OUTPUT = resolve(PROJECT_ROOT, 'assets/resources/data/levels.json');
const DEFAULT_REPORT = resolve(PROJECT_ROOT, 'assets/resources/data/conversion-report.json');

const SUBJECTS_KEY = '<Subjects>k__BackingField';
const TRAITS_KEY = '<Traits>k__BackingField';
const CELLS_KEY = '<Cells>k__BackingField';
const CLUES_KEY = '<Clues>k__BackingField';

export function parseUnityJson(source) {
  const text = String(source)
    .replace(/("(?:m_PathID|path_id)"\s*:\s*)(-?\d{16,})/g, '$1"$2"');
  return JSON.parse(text);
}

export function convertExtractedLevels(rawLevels, options = {}) {
  const includeIds = options.includeIds ? new Set(options.includeIds) : null;
  const seen = new Set();
  const skipped = [];
  const levels = [];

  for (const record of rawLevels) {
    const baseId = record?.level_name || record?.gameobject_name || '';
    if (!baseId) {
      skipped.push({ reason: 'missing_id', source: record?.source });
      continue;
    }

    if (includeIds && !includeIds.has(baseId)) continue;
    if (!includeIds && !isDisplayLevelId(baseId)) {
      skipped.push({ id: baseId, reason: 'non_display_id' });
      continue;
    }
    if (seen.has(baseId) && !includeIds) {
      skipped.push({ id: baseId, reason: 'duplicate_id' });
      continue;
    }

    const converted = convertLevel(record, options);
    if (!converted) {
      skipped.push({ id: baseId, reason: 'unsupported_shape' });
      continue;
    }

    seen.add(baseId);
    levels.push(converted);
  }

  const sortedLevels = levels.sort(compareLevelIds);
  const { levelOrder, orderedLevelIds, missingOrderedLevelIds } = buildLevelOrder(options.levelOrderMetadata, sortedLevels);

  return {
    levels: sortedLevels,
    levelOrder,
    orderedLevelIds,
    report: {
      sourceCount: rawLevels.length,
      playableCount: levels.length,
      missingOrderedLevelIds,
      skipped,
    },
  };
}

function convertLevel(record, options = {}) {
  const data = record?.data || {};
  const subjects = asArray(data[SUBJECTS_KEY]).map((subject) => subject.Name).filter(Boolean);
  const traits = asArray(data[TRAITS_KEY])
    .map((trait) => ({
      name: trait.Name,
      showLabel: Boolean(trait.IsShowLabel),
      l10nIgnorable: Boolean(trait.IsL10NIgnorable),
    }))
    .filter((trait) => trait.name);
  const rawCells = asArray(data[CELLS_KEY]);
  const rawClues = asArray(data[CLUES_KEY]);

  if (!subjects.length || !traits.length || !rawCells.length || !rawClues.length) {
    return null;
  }

  const answers = {};
  const cells = rawCells
    .map((cell) => normalizeCell(cell, answers, options))
    .filter(Boolean);
  const clues = rawClues.map(normalizeClue).filter(Boolean);
  const id = record.level_name || record.gameobject_name;

  return {
    id,
    title: id,
    source: {
      bundle: record.bundle || '',
      pathId: String(record.path_id || ''),
      gameObjectName: record.gameobject_name || '',
    },
    metadata: normalizeMetadata(record.metadata),
    subjects: subjects.map((name, index) => ({ id: name, name, index })),
    traits: traits.map((trait, index) => ({ id: trait.name, index, ...trait })),
    cells,
    answers,
    clues,
  };
}

function normalizeMetadata(metadata = {}) {
  return {
    difficultyCode: metadata['<Difficulty>k__BackingField'] ?? 0,
    themeCode: metadata['<Theme>k__BackingField'] ?? 0,
    levelName: metadata['<LevelName>k__BackingField'] || '',
  };
}

function normalizeCell(cell, answers, options = {}) {
  const subject = cell.SubjectName;
  const trait = cell.TraitName;
  const values = asArray(cell.Values)
    .map((value, index) => ({
      index,
      text: value.Text || '',
      sprite: normalizeSpriteRef(value.Sprite, options.spriteManifest),
      initial: Boolean(value.IsInitial),
      hidden: Boolean(value.IsHidden),
      l10nIgnorable: Boolean(value.IsL10NIgnorable),
    }))
    .filter((value) => value.text || value.sprite);

  if (!subject || !trait || !values.length) return null;

  if (!answers[subject]) answers[subject] = {};
  answers[subject][trait] = values.map((value) => value.text);

  return {
    key: makeCellKey(subject, trait),
    subject,
    trait,
    values,
    initialLockCount: cell.InitialLockCount || 0,
  };
}

function normalizeSpriteRef(sprite, spriteManifest) {
  if (!sprite || typeof sprite !== 'object') return null;
  const fileId = sprite.m_FileID ?? 0;
  const pathId = sprite.m_PathID ?? 0;
  if (!fileId && !pathId) return null;
  const normalized = { fileId, pathId: String(pathId) };
  const manifestEntry = spriteManifest?.sprites?.[normalized.pathId];
  return manifestEntry ? { ...normalized, ...manifestEntry } : normalized;
}

function normalizeClue(clue, index) {
  if (!clue || typeof clue.Text !== 'string') return null;
  const answerRefs = asArray(clue.TraitValueAnswers).map(normalizeAnswerRef).filter(Boolean);
  const revealRefs = asArray(clue.RevealValues).map(normalizeAnswerRef).filter(Boolean);

  return {
    id: `clue-${index + 1}`,
    text: stripClueMarkup(clue.Text),
    richText: clue.Text,
    answerRefs,
    revealRefs,
    initial: Boolean(clue.IsInitial),
  };
}

function normalizeAnswerRef(ref) {
  if (!ref?.Subject || !ref?.Trait) return null;
  return {
    subject: ref.Subject,
    trait: ref.Trait,
    index: Number(ref.Index || 0),
  };
}

export function stripClueMarkup(text) {
  return text
    .replace(/<value\b[^>]*>(.*?)<\/value>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeCellKey(subject, trait) {
  return `${subject}::${trait}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compareLevelIds(a, b) {
  return naturalKey(a.id).localeCompare(naturalKey(b.id), undefined, { numeric: true });
}

export function buildLevelOrder(levelOrderMetadata, levels) {
  const availableIds = new Set(levels.map((level) => level.id));
  const rows = [];

  for (const order of asArray(levelOrderMetadata?.list)) {
    if (order.name !== 'Main FTUE Level' && order.name !== 'Main Repeat Level') continue;
    const section = order.name === 'Main FTUE Level' ? 'ftue' : 'repeat';
    for (const line of String(order.levelOrder || '').split('\n')) {
      const [id, difficulty = '', theme = ''] = line.split('\t');
      if (!id) continue;
      rows.push({
        id,
        difficulty,
        theme,
        section,
        available: availableIds.has(id),
      });
    }
  }

  const orderedLevelIds = rows.filter((row) => row.available).map((row) => row.id);
  const missingOrderedLevelIds = rows.filter((row) => !row.available).map((row) => row.id);

  return {
    levelOrder: rows,
    orderedLevelIds: orderedLevelIds.length ? orderedLevelIds : levels.map((level) => level.id),
    missingOrderedLevelIds,
  };
}

function naturalKey(value) {
  const match = /^(Level|Story)(\d+)(.*)$/.exec(value);
  if (!match) return value;
  return `${match[1]}-${match[2].padStart(5, '0')}${match[3]}`;
}

function isDisplayLevelId(value) {
  return /^(Level|Story)\d+/.test(value);
}

async function main() {
  const sourcePath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SOURCE;
  const outputPath = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_OUTPUT;
  const reportPath = process.argv[4] ? resolve(process.argv[4]) : DEFAULT_REPORT;
  const rawLevels = parseUnityJson(await readFile(sourcePath, 'utf8'));
  const levelOrderMetadata = JSON.parse(await readFile(DEFAULT_LEVEL_ORDER, 'utf8'));
  const spriteManifest = await readSpriteManifest();
  const result = convertExtractedLevels(rawLevels, { levelOrderMetadata, spriteManifest });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({
    levels: result.levels,
    levelOrder: result.levelOrder,
    orderedLevelIds: result.orderedLevelIds,
  }, null, 2), 'utf8');
  await writeFile(reportPath, JSON.stringify(result.report, null, 2), 'utf8');

  console.log(`Converted ${result.levels.length} playable levels from ${rawLevels.length} extracted records.`);
  console.log(`Wrote ${outputPath}`);
}

async function readSpriteManifest() {
  const manifestPath = resolve(PROJECT_ROOT, 'assets/resources/data/sprite-manifest.json');
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
