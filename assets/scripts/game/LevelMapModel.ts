import type { LevelData, LevelOrderRow } from '../data/LevelTypes';

export interface LevelTileModel {
  id: string;
  index: number;
  caption: string;
  current: boolean;
  completed: boolean;
}

export function buildLevelTiles(
  levels: LevelData[],
  levelOrder: LevelOrderRow[],
  completedIds: string[],
  currentId: string,
  limit = 30,
): LevelTileModel[] {
  const completed = new Set(completedIds);
  const availableIds = new Set(levels.map((level) => level.id));
  const metaById = new Map(levelOrder.map((row) => [row.id, row]));

  return levelOrder
    .filter((row) => availableIds.has(row.id))
    .slice(0, limit)
    .map((row, index) => {
      const meta = metaById.get(row.id);
      const caption = [meta?.theme, meta?.difficulty].filter(Boolean).join(' · ');
      return {
        id: row.id,
        index,
        caption,
        current: row.id === currentId,
        completed: completed.has(row.id),
      };
    });
}
