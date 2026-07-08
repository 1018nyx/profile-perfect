import { Color, Component, Label, Node, UITransform, _decorator } from 'cc';
import type { LevelData, SelectionMap } from '../data/LevelTypes';
import { LevelRepository } from '../data/LevelRepository';
import { checkSelections, getSelection, setSelection } from '../game/AnswerChecker';
import { buildLevelTiles } from '../game/LevelMapModel';
import { ProgressStore } from '../game/ProgressStore';
import { getTraitValueOptions } from '../game/ValueDisplay';
import { ClueList } from './components/ClueList';
import { LevelMapOverlay } from './components/LevelMapOverlay';
import { SubjectCard } from './components/SubjectCard';
import { TraitGrid } from './components/TraitGrid';
import { ValuePicker } from './components/ValuePicker';
import { createPanel, createText, removeChildren } from './uiFactory';

const { ccclass } = _decorator;

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private repository = new LevelRepository();
  private progress = new ProgressStore();
  private levels: LevelData[] = [];
  private levelIndex = 0;
  private level: LevelData | null = null;
  private selections: SelectionMap = {};
  private visibleClues = new Set<string>();
  private stage!: Node;
  private subjectsNode!: Node;
  private gridNode!: TraitGrid;
  private cluesNode!: ClueList;
  private pickerNode!: ValuePicker;
  private levelMapNode!: LevelMapOverlay;
  private statusText!: Node;
  private progressText!: Node;

  async start(): Promise<void> {
    await this.repository.load();
    this.levels = this.repository.getOrderedLevels().slice(0, 30);
    if (!this.levels.length) this.levels = this.repository.getLevels().slice(0, 30);

    this.buildShell();
    this.loadLevel(0);
  }

  private buildShell(): void {
    removeChildren(this.node);
    (this.node.getComponent(UITransform) || this.node.addComponent(UITransform)).setContentSize(720, 1280);
    createPanel(this.node, 720, 1280, new Color(238, 243, 249, 255), 0);

    this.stage = new Node('PortraitStage');
    this.node.addChild(this.stage);
    this.stage.addComponent(UITransform).setContentSize(720, 1280);

    const header = new Node('Header');
    this.stage.addChild(header);
    header.setPosition(0, 570);
    createPanel(header, 660, 90, new Color(255, 239, 204, 255), 22);

    const levels = createText(header, 'Levels', 18, new Color(57, 73, 97, 255));
    levels.setPosition(-270, 0);
    levels.on(Node.EventType.TOUCH_END, () => this.openLevelMap());

    this.statusText = createText(header, 'Level1', 26, new Color(37, 48, 68, 255));
    this.statusText.setPosition(0, 14);

    this.progressText = createText(header, '0/0', 18, new Color(122, 82, 22, 255));
    this.progressText.setPosition(0, -22);

    const next = createText(header, 'Next', 18, new Color(57, 73, 97, 255));
    next.setPosition(270, 0);
    next.on(Node.EventType.TOUCH_END, () => this.loadLevel(Math.min(this.levels.length - 1, this.levelIndex + 1)));

    this.subjectsNode = new Node('Subjects');
    this.stage.addChild(this.subjectsNode);
    this.subjectsNode.setPosition(0, 455);

    this.gridNode = new TraitGrid('TraitGrid');
    this.stage.addChild(this.gridNode);
    this.gridNode.setPosition(0, 110);

    this.cluesNode = new ClueList('ClueList');
    this.stage.addChild(this.cluesNode);
    this.cluesNode.setPosition(0, -405);

    const check = createText(this.stage, 'CHECK', 20, new Color(255, 255, 255, 255));
    check.setPosition(0, -585);
    check.on(Node.EventType.TOUCH_END, () => this.checkLevel());

    this.pickerNode = new ValuePicker('ValuePicker');
    this.stage.addChild(this.pickerNode);
    this.pickerNode.active = false;

    this.levelMapNode = new LevelMapOverlay('LevelMapOverlay');
    this.stage.addChild(this.levelMapNode);
    this.levelMapNode.setPosition(0, 0);
    this.levelMapNode.active = false;
  }

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = this.levels[this.levelIndex];
    this.selections = {};
    this.visibleClues = new Set(this.level.clues.filter((clue) => clue.initial).map((clue) => clue.id));
    this.render();
  }

  private loadLevelById(levelId: string): void {
    const index = this.levels.findIndex((level) => level.id === levelId);
    if (index >= 0) this.loadLevel(index);
  }

  private render(): void {
    if (!this.level) return;
    removeChildren(this.subjectsNode);
    const width = Math.min(160, 620 / this.level.subjects.length);
    this.level.subjects.forEach((subject, index) => {
      const card = new SubjectCard(`Subject-${subject.name}`);
      this.subjectsNode.addChild(card);
      card.setPosition((index - (this.level!.subjects.length - 1) / 2) * (width + 12), 0);
      card.render(subject, width, 88);
    });

    this.gridNode.render(this.level, this.selections, (subject, trait) => this.openPicker(subject, trait));
    this.cluesNode.render(this.level.clues, this.visibleClues, 660, 330);
    this.updateHeader();
  }

  private updateHeader(): void {
    if (!this.level) return;
    const result = checkSelections(this.level, this.selections);
    const statusLabel = this.statusText.getComponent(Label);
    const progressLabel = this.progressText.getComponent(Label);
    if (statusLabel) statusLabel.string = `${this.level.id}`;
    if (progressLabel) progressLabel.string = `${result.correct}/${result.total}`;
  }

  private openPicker(subject: string, trait: string): void {
    if (!this.level) return;
    const cell = this.level.cells.find((item) => item.subject === subject && item.trait === trait);
    if (!cell) return;
    const options = this.getTraitOptions(trait);
    const current = getSelection(this.selections, subject, trait);
    this.pickerNode.active = true;
    this.pickerNode.setPosition(0, 0);
    this.pickerNode.render(
      subject,
      trait,
      options,
      current,
      cell.values.length > 1,
      (values) => {
        setSelection(this.selections, subject, trait, values);
        this.pickerNode.active = false;
        this.render();
      },
      () => {
        this.pickerNode.active = false;
      },
    );
  }

  private getTraitOptions(trait: string) {
    if (!this.level) return [];
    return getTraitValueOptions(this.level, trait);
  }

  private openLevelMap(): void {
    if (!this.level) return;
    const tiles = buildLevelTiles(
      this.levels,
      this.repository.getLevelOrder(),
      this.progress.getState().completed,
      this.level.id,
      30,
    );
    this.levelMapNode.render(
      tiles,
      (levelId) => {
        this.levelMapNode.close();
        this.loadLevelById(levelId);
      },
      () => this.levelMapNode.close(),
    );
  }

  private checkLevel(): void {
    if (!this.level) return;
    const result = checkSelections(this.level, this.selections);
    if (result.complete) {
      this.progress.markCompleted(this.level.id);
      this.visibleClues = new Set(this.level.clues.map((clue) => clue.id));
    } else {
      const next = this.level.clues.find((clue) => !this.visibleClues.has(clue.id));
      if (next) this.visibleClues.add(next.id);
    }
    this.render();
  }
}
