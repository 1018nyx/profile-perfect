import { JsonAsset, resources } from 'cc';
import type { LevelData, LevelDatabase, LevelOrderRow } from './LevelTypes';

export class LevelRepository {
  private levels: LevelData[] = [];
  private levelOrder: LevelOrderRow[] = [];
  private orderedLevelIds: string[] = [];

  async load(): Promise<LevelData[]> {
    if (this.levels.length) return this.levels;

    const asset = await new Promise<JsonAsset>((resolve, reject) => {
      resources.load('data/levels', JsonAsset, (error, jsonAsset) => {
        if (error || !jsonAsset) {
          reject(error || new Error('Failed to load levels data'));
          return;
        }
        resolve(jsonAsset);
      });
    });

    const database = asset.json as LevelDatabase;
    this.levels = database.levels || [];
    this.levelOrder = database.levelOrder || [];
    this.orderedLevelIds = database.orderedLevelIds || [];
    return this.levels;
  }

  getLevels(): LevelData[] {
    return this.levels;
  }

  getLevel(id: string): LevelData | undefined {
    return this.levels.find((level) => level.id === id);
  }

  getOrderedLevels(): LevelData[] {
    if (!this.orderedLevelIds.length) return this.levels;

    const levelsById = new Map(this.levels.map((level) => [level.id, level]));
    return this.orderedLevelIds.map((id) => levelsById.get(id)).filter((level): level is LevelData => Boolean(level));
  }

  getLevelOrder(): LevelOrderRow[] {
    return this.levelOrder;
  }
}
