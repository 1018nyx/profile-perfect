export interface LevelValue {
  index: number;
  text: string;
  sprite: {
    fileId: number;
    pathId: string;
    name?: string;
    bundle?: string;
    assetKey?: string;
    file?: string;
    width?: number;
    height?: number;
  } | null;
  initial: boolean;
  hidden: boolean;
  l10nIgnorable: boolean;
}

export interface LevelSubject {
  id: string;
  name: string;
  index: number;
}

export interface LevelTrait {
  id: string;
  name: string;
  index: number;
  showLabel: boolean;
  l10nIgnorable: boolean;
}

export interface LevelCell {
  key: string;
  subject: string;
  trait: string;
  values: LevelValue[];
  initialLockCount: number;
}

export interface LevelClueRef {
  subject: string;
  trait: string;
  index: number;
}

export interface LevelClue {
  id: string;
  text: string;
  richText: string;
  answerRefs: LevelClueRef[];
  revealRefs: LevelClueRef[];
  initial: boolean;
}

export interface LevelData {
  id: string;
  title: string;
  source: {
    bundle: string;
    pathId: string;
    gameObjectName: string;
  };
  metadata: {
    difficultyCode: number;
    themeCode: number;
    levelName: string;
  };
  subjects: LevelSubject[];
  traits: LevelTrait[];
  cells: LevelCell[];
  answers: Record<string, Record<string, string[]>>;
  clues: LevelClue[];
}

export interface LevelOrderRow {
  id: string;
  difficulty: string;
  theme: string;
  section: string;
  available: boolean;
}

export interface LevelDatabase {
  levels: LevelData[];
  levelOrder?: LevelOrderRow[];
  orderedLevelIds?: string[];
}

export type SelectionMap = Record<string, string[]>;

export interface CheckError {
  subject: string;
  trait: string;
  expected: string[];
  actual: string[];
}

export interface CheckResult {
  complete: boolean;
  correct: number;
  missing: number;
  errors: CheckError[];
  total: number;
}
