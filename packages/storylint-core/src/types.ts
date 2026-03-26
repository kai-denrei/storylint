// ── Core entity types for StoryLint ──

export type ChekhovStatus = 'unwritten' | 'planted' | 'armed' | 'fired' | 'subverted' | 'orphaned';
export type ChekhovIntent = 'plant' | 'arm' | 'fire' | 'subvert' | 'cut';
export type ChekhovType = 'object' | 'trait' | 'secret' | 'skill' | 'relationship' | 'motif' | 'rule';
export type Importance = 'major' | 'minor' | 'atmospheric';

export type CharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor';
export type ArcType = 'change' | 'flat' | 'fall' | 'rebirth';
export type SceneCharacterRole = 'primary' | 'secondary' | 'mentioned' | 'background';

export type ThreadStatus = 'active' | 'resolved' | 'dormant';
export type ThreadEnding = 'resolved' | 'dormant' | 'merged' | 'abandoned';
export type FishbonePosition = 'above' | 'below';

export type SceneLayout = 'full-page' | 'half' | 'strip' | 'inset' | 'spread';
export type SceneType = 'action' | 'reaction';

export type Severity = 'error' | 'warning' | 'info';

// ── Chekhov ──

export interface ChekhovArming {
  scene: string;
  how?: string;
}

export interface ChekhovLint {
  suppress?: string[];
  notes?: string;
}

export interface Chekhov {
  id: string;
  name: string;
  type?: ChekhovType;
  importance?: Importance;
  status: ChekhovStatus;
  description?: string;
  planted_in?: string;
  planted_how?: string;
  armed_in?: ChekhovArming[] | string[];
  fired_in?: string | null;
  fired_how?: string | null;
  tags?: string[];

  // Intent layer
  intent?: ChekhovIntent;
  intent_target?: string;
  intent_notes?: string;

  // Ingest metadata
  _generated?: boolean;
  _generated_from?: string;
  _reviewed?: boolean;

  // Lint control
  lint?: ChekhovLint;

  // Source file info (added by parser)
  _file?: string;
  _body?: string;
}

// ── Character ──

export interface CharacterArc {
  goal?: string;
  conflict?: string;
  transformation?: string;
  epiphany?: string;
  summary?: string;
  want?: string;
  need?: string;
  arc_type?: ArcType;
  planned_resolution?: string;
  resolution_notes?: string;
}

export interface CharacterVisual {
  palette?: string[];
  features?: string;
  expressions?: string[];
  refs?: string[];
}

export interface CharacterRelationship {
  target: string;
  type?: string;
  label?: string;
  direction?: 'symmetric' | 'asymmetric';
}

export interface Character {
  id: string;
  name: string;
  role?: CharacterRole;
  aliases?: string[];
  one_line?: string;
  arc?: CharacterArc;
  visual?: CharacterVisual;
  relationships?: CharacterRelationship[];
  tags?: string[];

  // Ingest metadata
  _generated?: boolean;
  _generated_from?: string;
  _reviewed?: boolean;

  // Source file info
  _file?: string;
  _body?: string;
}

// ── Scene ──

export interface SceneCharacter {
  id: string;
  role?: SceneCharacterRole;
  expression?: string;
}

export interface SceneTiming {
  story_time?: string;
  duration?: string;
}

export interface SceneAsset {
  path: string;
  type?: string;
  status?: string;
}

export interface Scene {
  id: string;
  rank: string;
  title?: string;
  characters?: (SceneCharacter | string)[];
  location?: string;
  threads?: string[];
  mood?: string[];
  layout?: SceneLayout;
  timing?: SceneTiming;
  visual_prompt?: string;
  assets?: (SceneAsset | string)[];

  // Chekhov cross-references
  chekhovs_planted?: string[];
  chekhovs_armed?: string[];
  chekhovs_fired?: string[];

  // Pacing / beat tagging
  beat?: string;
  tension?: number;
  scene_type?: SceneType;

  // Ingest metadata
  _generated?: boolean;
  _generated_from?: string;
  _reviewed?: boolean;

  // Source file info
  _file?: string;
  _body?: string;
}

// ── Thread ──

export interface ThreadPhase {
  name: string;
  description?: string;
  scene_range?: [string, string];
  scenes?: string[];
}

export interface Thread {
  id: string;
  name: string;
  description?: string;
  color?: string;
  status?: ThreadStatus;
  fishbone_position?: FishbonePosition;
  phases?: ThreadPhase[];
  linked_characters?: { id: string; importance?: string }[];

  // Intent layer
  planned_ending?: ThreadEnding;
  planned_ending_scene?: string;
  ending_notes?: string;

  // Ingest metadata
  _generated?: boolean;
  _generated_from?: string;
  _reviewed?: boolean;

  // Source file info
  _file?: string;
  _body?: string;
}

// ── World Article ──

export interface WorldArticle {
  id: string;
  name?: string;
  type?: string;
  tags?: string[];

  _generated?: boolean;
  _generated_from?: string;
  _reviewed?: boolean;

  _file?: string;
  _body?: string;
}

// ── Project Data (the full parsed vault) ──

export interface ProjectConfig {
  project?: {
    name?: string;
    author?: string;
    description?: string;
  };
  rules?: Record<string, { threshold?: number }>;
  disabled?: string[];
  overrides?: Record<string, Severity>;
  ai?: {
    provider?: string;
    model?: string;
    ingest_model?: string;
    api_key_env?: string;
    max_tokens?: number;
    temperature?: number;
  };
}

export interface ProjectData {
  root: string;
  config: ProjectConfig;
  scenes: Scene[];
  characters: Character[];
  chekhovs: Chekhov[];
  threads: Thread[];
  world: WorldArticle[];
  wikilinks: WikiLink[];
}

// ── Cross-references ──

export interface WikiLink {
  source: string;      // file path of the document containing the link
  target: string;      // the linked ID (from [[id]])
  context?: string;    // surrounding text
}

// ── Lint output ──

export interface LintWarning {
  rule: string;
  severity: Severity;
  file: string;
  entity_id: string;
  entity_type: 'scene' | 'character' | 'chekhov' | 'thread' | 'world' | 'project';
  message: string;
  details?: string;
}

export interface LintResult {
  warnings: LintWarning[];
  summary: LintSummary;
}

export interface LintSummary {
  errors: number;
  warnings: number;
  info: number;
  chekhovs: {
    unwritten: number;
    planted: number;
    armed: number;
    fired: number;
    subverted: number;
    orphaned: number;
    no_intent: number;
  };
  characters: {
    total: number;
    with_arc: number;
    with_resolution: number;
  };
  scenes: {
    total: number;
    unreviewed: number;
  };
}
