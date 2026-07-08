import { checkSelections, getSelection, setSelection } from '../tools/runtime/answer-checker.mjs';

const els = {
  backButton: document.querySelector('#backButton'),
  levelSelect: document.querySelector('#levelSelect'),
  levelTitle: document.querySelector('#levelTitle'),
  themeLabel: document.querySelector('#themeLabel'),
  progressBadge: document.querySelector('#progressBadge'),
  subjects: document.querySelector('#subjects'),
  grid: document.querySelector('#grid'),
  clues: document.querySelector('#clues'),
  revealButton: document.querySelector('#revealButton'),
  checkButton: document.querySelector('#checkButton'),
  picker: document.querySelector('#picker'),
  pickerSubject: document.querySelector('#pickerSubject'),
  pickerTrait: document.querySelector('#pickerTrait'),
  pickerOptions: document.querySelector('#pickerOptions'),
  pickerApply: document.querySelector('#pickerApply'),
  pickerClose: document.querySelector('#pickerClose'),
  levelMap: document.querySelector('#levelMap'),
  levelMapClose: document.querySelector('#levelMapClose'),
  levelTiles: document.querySelector('#levelTiles'),
  toast: document.querySelector('#toast'),
};

const state = {
  levels: [],
  levelOrder: [],
  level: null,
  selections: {},
  visibleClues: new Set(),
  pickerCell: null,
  pickerValues: [],
  errors: new Set(),
};

main().catch((error) => {
  console.error(error);
  showToast('Preview failed to load level data.');
});

async function main() {
  const response = await fetch('../assets/resources/data/levels.json');
  const data = await response.json();
  const allLevels = Array.isArray(data.levels) ? data.levels : [];
  const levelsById = new Map(allLevels.map((level) => [level.id, level]));
  const orderedIds = Array.isArray(data.orderedLevelIds) && data.orderedLevelIds.length
    ? data.orderedLevelIds
    : allLevels.map((level) => level.id);

  state.levelOrder = Array.isArray(data.levelOrder) ? data.levelOrder : [];
  state.levels = orderedIds.map((id) => levelsById.get(id)).filter(Boolean);
  if (!state.levels.length) state.levels = allLevels.slice(0, 30);

  for (const level of state.levels) {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = level.id;
    els.levelSelect.append(option);
  }

  els.levelSelect.addEventListener('change', () => loadLevel(els.levelSelect.value));
  els.backButton.addEventListener('click', openLevelMap);
  els.levelMapClose.addEventListener('click', closeLevelMap);
  els.levelMap.addEventListener('click', (event) => {
    if (event.target === els.levelMap) closeLevelMap();
  });
  els.revealButton.addEventListener('click', revealNextClue);
  els.checkButton.addEventListener('click', checkCurrentLevel);
  els.pickerClose.addEventListener('click', closePicker);
  els.pickerApply.addEventListener('click', applyPicker);

  loadLevel('Level1');
}

function loadLevel(levelId) {
  state.level = state.levels.find((level) => level.id === levelId) || state.levels[0];
  state.selections = {};
  state.errors = new Set();
  state.visibleClues = new Set(state.level.clues.filter((clue) => clue.initial).map((clue) => clue.id));
  els.levelSelect.value = state.level.id;
  render();
}

function render() {
  const level = state.level;
  els.levelTitle.textContent = level.title;
  els.themeLabel.textContent = `CASE FILE · ${level.traits.length} TRAITS`;
  renderSubjects(level);
  renderGrid(level);
  renderClues(level);
  updateProgress();
  if (!els.levelMap.classList.contains('hidden')) renderLevelTiles();
}

function renderSubjects(level) {
  els.subjects.replaceChildren(...level.subjects.map((subject) => {
    const card = document.createElement('article');
    card.className = 'subject-card';
    card.innerHTML = `<div class="avatar">${escapeHtml(subject.name.slice(0, 1))}</div><span>${escapeHtml(subject.name)}</span>`;
    return card;
  }));
}

function renderGrid(level) {
  const table = document.createElement('div');
  table.className = 'grid-table';
  table.style.gridTemplateColumns = `minmax(92px, 0.95fr) repeat(${level.subjects.length}, minmax(84px, 1fr))`;

  table.append(makeGridCell('', 'header'));
  for (const subject of level.subjects) {
    table.append(makeGridCell(subject.name, 'header'));
  }

  for (const trait of level.traits) {
    table.append(makeGridCell(trait.name, 'trait'));
    for (const subject of level.subjects) {
      const cell = level.cells.find((candidate) => candidate.subject === subject.name && candidate.trait === trait.name);
      const selected = getSelection(state.selections, subject.name, trait.name);
      const content = selected.length ? selected.join(', ') : 'Tap';
      const node = makeGridCell(content, `pickable${selected.length ? ' filled' : ''}${state.errors.has(cell?.key) ? ' error' : ''}`);
      if (selected.length) {
        node.replaceChildren(...selected.map((value) => makeValueContent(value, findValueSprite(trait.name, value))));
      }
      node.addEventListener('click', () => openPicker(cell));
      table.append(node);
    }
  }

  els.grid.replaceChildren(table);
}

function renderClues(level) {
  els.clues.replaceChildren(...level.clues.map((clue, index) => {
    const visible = state.visibleClues.has(clue.id);
    const node = document.createElement('article');
    node.className = `clue${visible ? '' : ' locked'}`;
    node.textContent = visible ? clue.text : `Clue ${index + 1} locked`;
    return node;
  }));
}

function makeGridCell(text, className) {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `grid-cell ${className}`;
  node.textContent = text;
  return node;
}

function openPicker(cell) {
  if (!cell) return;
  state.pickerCell = cell;
  state.pickerValues = [...getSelection(state.selections, cell.subject, cell.trait)];
  els.pickerSubject.textContent = cell.subject;
  els.pickerTrait.textContent = cell.trait;
  renderPickerOptions(cell);
  els.picker.classList.remove('hidden');
  els.picker.setAttribute('aria-hidden', 'false');
}

function renderPickerOptions(cell) {
  const options = getTraitOptions(cell.trait);
  els.pickerOptions.replaceChildren(...options.map((value) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `option${state.pickerValues.includes(value.text) ? ' selected' : ''}`;
    option.append(makeValueContent(value.text || '(empty)', value.sprite));
    option.addEventListener('click', () => {
      if (state.pickerValues.includes(value.text)) {
        state.pickerValues = state.pickerValues.filter((item) => item !== value.text);
      } else {
        const answerWidth = state.pickerCell.values.length;
        state.pickerValues = answerWidth > 1 ? [...state.pickerValues, value.text] : [value.text];
      }
      renderPickerOptions(cell);
    });
    return option;
  }));
}

function getTraitOptions(traitName) {
  const values = new Map();
  for (const cell of state.level.cells) {
    if (cell.trait === traitName) {
      for (const value of cell.values) {
        if (value.text && !values.has(value.text)) values.set(value.text, value);
      }
    }
  }
  return [...values.values()].sort((a, b) => a.text.localeCompare(b.text));
}

function applyPicker() {
  const cell = state.pickerCell;
  if (!cell) return;
  setSelection(state.selections, cell.subject, cell.trait, state.pickerValues);
  state.errors.delete(cell.key);
  closePicker();
  renderGrid(state.level);
  updateProgress();
}

function closePicker() {
  state.pickerCell = null;
  state.pickerValues = [];
  els.picker.classList.add('hidden');
  els.picker.setAttribute('aria-hidden', 'true');
}

function openLevelMap() {
  renderLevelTiles();
  els.levelMap.classList.remove('hidden');
  els.levelMap.setAttribute('aria-hidden', 'false');
}

function closeLevelMap() {
  els.levelMap.classList.add('hidden');
  els.levelMap.setAttribute('aria-hidden', 'true');
}

function renderLevelTiles() {
  const completed = getCompletedLevels();
  const tiles = state.levels.map((level) => {
    const tile = document.createElement('button');
    const meta = getLevelMeta(level.id);
    const completedPrefix = completed.has(level.id) ? 'Done · ' : '';
    const details = [meta?.theme, meta?.difficulty].filter(Boolean).join(' · ') || `${level.traits.length} traits`;
    tile.type = 'button';
    tile.className = `level-tile${level.id === state.level?.id ? ' current' : ''}`;
    tile.append(document.createTextNode(level.id));

    const caption = document.createElement('small');
    caption.textContent = `${completedPrefix}${details}`;
    tile.append(caption);

    tile.addEventListener('click', () => {
      loadLevel(level.id);
      closeLevelMap();
    });
    return tile;
  });
  els.levelTiles.replaceChildren(...tiles);
}

function revealNextClue() {
  const next = state.level.clues.find((clue) => !state.visibleClues.has(clue.id));
  if (!next) {
    showToast('All clues are visible.');
    return;
  }
  state.visibleClues.add(next.id);
  renderClues(state.level);
}

function checkCurrentLevel() {
  const result = checkSelections(state.level, state.selections);
  state.errors = new Set(result.errors.map((error) => `${error.subject}::${error.trait}`));
  renderGrid(state.level);
  updateProgress(result);

  if (result.complete) {
    markCompleted(state.level.id);
    showToast(`${state.level.id} complete.`);
  } else if (result.errors.length) {
    showToast(`${result.errors.length} incorrect match${result.errors.length > 1 ? 'es' : ''}.`);
  } else {
    showToast(`${result.missing} matches left.`);
  }
}

function updateProgress(result = checkSelections(state.level, state.selections)) {
  els.progressBadge.textContent = `${result.correct}/${result.total}`;
}

function markCompleted(levelId) {
  const completed = getCompletedLevels();
  completed.add(levelId);
  localStorage.setItem('profilePerfectPreviewCompleted', JSON.stringify([...completed]));
}

function getCompletedLevels() {
  return new Set(JSON.parse(localStorage.getItem('profilePerfectPreviewCompleted') || '[]'));
}

function getLevelMeta(levelId) {
  return state.levelOrder.find((row) => row.id === levelId);
}

function findValueSprite(traitName, text) {
  for (const cell of state.level.cells) {
    if (cell.trait !== traitName) continue;
    const value = cell.values.find((candidate) => candidate.text === text);
    if (value?.sprite?.assetKey) return value.sprite;
  }
  return null;
}

function makeValueContent(text, sprite) {
  const wrapper = document.createElement('span');
  wrapper.className = 'value-content';

  const url = getSpriteUrl(sprite);
  if (url) {
    const image = document.createElement('img');
    image.className = 'value-thumb';
    image.src = url;
    image.alt = '';
    image.loading = 'lazy';
    wrapper.append(image);
  }

  const label = document.createElement('span');
  label.className = 'value-label';
  label.textContent = text;
  wrapper.append(label);
  return wrapper;
}

function getSpriteUrl(sprite) {
  return sprite?.assetKey ? `../assets/resources/${sprite.assetKey}.png` : '';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 1800);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}
