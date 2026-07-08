export function buildLevelTiles(levels, levelOrder, completedIds = [], currentId = '', limit = 30) {
  const completed = new Set(completedIds);
  const availableIds = new Set((levels || []).map((level) => level.id));
  const metaById = new Map((levelOrder || []).map((row) => [row.id, row]));
  const ids = (levelOrder || [])
    .filter((row) => availableIds.has(row.id))
    .map((row) => row.id)
    .slice(0, limit);

  return ids.map((id, index) => {
    const meta = metaById.get(id);
    const details = [meta?.theme, meta?.difficulty].filter(Boolean).join(' · ');
    return {
      id,
      index,
      caption: details || '',
      current: id === currentId,
      completed: completed.has(id),
    };
  });
}
