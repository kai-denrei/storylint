import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  ProjectData, ProjectConfig, Scene, Character, Chekhov,
  Thread, WorldArticle, WikiLink
} from './types.js';

// ── Frontmatter extraction ──

interface ParsedFile {
  frontmatter: Record<string, unknown>;
  body: string;
  file: string;
}

function parseFrontmatter(content: string, filePath: string): ParsedFile {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content.trim(), file: filePath };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = parseYaml(match[1]) ?? {};
  } catch {
    // Invalid YAML — treat as no frontmatter
  }
  return { frontmatter, body: match[2].trim(), file: filePath };
}

// ── Wikilink extraction ──

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function extractWikilinks(body: string, sourceFile: string): WikiLink[] {
  const links: WikiLink[] = [];
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    links.push({
      source: sourceFile,
      target: match[1].trim(),
    });
  }
  return links;
}

// ── Directory reader ──

function readMdFiles(dir: string): ParsedFile[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const filePath = path.join(dir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseFrontmatter(content, filePath);
  });
}

// ── Entity parsers ──

function parseScene(parsed: ParsedFile): Scene {
  const fm = parsed.frontmatter;
  return {
    id: (fm.id as string) ?? path.basename(parsed.file, '.md'),
    rank: (fm.rank as string) ?? '',
    title: fm.title as string | undefined,
    characters: fm.characters as Scene['characters'],
    location: fm.location as string | undefined,
    threads: fm.threads as string[] | undefined,
    mood: fm.mood as string[] | undefined,
    layout: fm.layout as Scene['layout'],
    timing: fm.timing as Scene['timing'],
    visual_prompt: fm.visual_prompt as string | undefined,
    assets: fm.assets as Scene['assets'],
    chekhovs_planted: fm.chekhovs_planted as string[] | undefined,
    chekhovs_armed: fm.chekhovs_armed as string[] | undefined,
    chekhovs_fired: fm.chekhovs_fired as string[] | undefined,
    beat: fm.beat as string | undefined,
    tension: fm.tension as number | undefined,
    scene_type: fm.scene_type as Scene['scene_type'],
    _generated: fm._generated as boolean | undefined,
    _generated_from: fm._generated_from as string | undefined,
    _reviewed: fm._reviewed as boolean | undefined,
    _file: parsed.file,
    _body: parsed.body,
  };
}

function parseCharacter(parsed: ParsedFile): Character {
  const fm = parsed.frontmatter;
  return {
    id: (fm.id as string) ?? path.basename(parsed.file, '.md'),
    name: (fm.name as string) ?? path.basename(parsed.file, '.md'),
    role: fm.role as Character['role'],
    aliases: fm.aliases as string[] | undefined,
    one_line: fm.one_line as string | undefined,
    arc: fm.arc as Character['arc'],
    visual: fm.visual as Character['visual'],
    relationships: fm.relationships as Character['relationships'],
    tags: fm.tags as string[] | undefined,
    _generated: fm._generated as boolean | undefined,
    _generated_from: fm._generated_from as string | undefined,
    _reviewed: fm._reviewed as boolean | undefined,
    _file: parsed.file,
    _body: parsed.body,
  };
}

function parseChekhov(parsed: ParsedFile): Chekhov {
  const fm = parsed.frontmatter;
  return {
    id: (fm.id as string) ?? path.basename(parsed.file, '.md'),
    name: (fm.name as string) ?? path.basename(parsed.file, '.md'),
    type: fm.type as Chekhov['type'],
    importance: fm.importance as Chekhov['importance'],
    status: (fm.status as Chekhov['status']) ?? 'planted',
    description: fm.description as string | undefined,
    planted_in: fm.planted_in as string | undefined,
    planted_how: fm.planted_how as string | undefined,
    armed_in: fm.armed_in as Chekhov['armed_in'],
    fired_in: fm.fired_in as string | null | undefined,
    fired_how: fm.fired_how as string | null | undefined,
    tags: fm.tags as string[] | undefined,
    intent: fm.intent as Chekhov['intent'],
    intent_target: fm.intent_target as string | undefined,
    intent_notes: fm.intent_notes as string | undefined,
    lint: fm.lint as Chekhov['lint'],
    _generated: fm._generated as boolean | undefined,
    _generated_from: fm._generated_from as string | undefined,
    _reviewed: fm._reviewed as boolean | undefined,
    _file: parsed.file,
    _body: parsed.body,
  };
}

function parseThread(parsed: ParsedFile): Thread {
  const fm = parsed.frontmatter;
  return {
    id: (fm.id as string) ?? path.basename(parsed.file, '.md'),
    name: (fm.name as string) ?? path.basename(parsed.file, '.md'),
    description: fm.description as string | undefined,
    color: fm.color as string | undefined,
    status: fm.status as Thread['status'],
    fishbone_position: fm.fishbone_position as Thread['fishbone_position'],
    phases: fm.phases as Thread['phases'],
    linked_characters: fm.linked_characters as Thread['linked_characters'],
    planned_ending: fm.planned_ending as Thread['planned_ending'],
    planned_ending_scene: fm.planned_ending_scene as string | undefined,
    ending_notes: fm.ending_notes as string | undefined,
    _generated: fm._generated as boolean | undefined,
    _generated_from: fm._generated_from as string | undefined,
    _reviewed: fm._reviewed as boolean | undefined,
    _file: parsed.file,
    _body: parsed.body,
  };
}

function parseWorldArticle(parsed: ParsedFile): WorldArticle {
  const fm = parsed.frontmatter;
  return {
    id: (fm.id as string) ?? path.basename(parsed.file, '.md'),
    name: fm.name as string | undefined,
    type: fm.type as string | undefined,
    tags: fm.tags as string[] | undefined,
    _generated: fm._generated as boolean | undefined,
    _generated_from: fm._generated_from as string | undefined,
    _reviewed: fm._reviewed as boolean | undefined,
    _file: parsed.file,
    _body: parsed.body,
  };
}

// ── Config reader ──

function readConfig(root: string): ProjectConfig {
  const configPath = path.join(root, '.storylint.yaml');
  if (!fs.existsSync(configPath)) return {};
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseYaml(content) ?? {};
  } catch {
    return {};
  }
}

// ── Main parser ──

export function parseProject(root: string): ProjectData {
  const config = readConfig(root);

  const sceneParsed = readMdFiles(path.join(root, 'scenes'));
  const characterParsed = readMdFiles(path.join(root, 'characters'));
  const chekhovParsed = readMdFiles(path.join(root, 'chekhovs'));
  const threadParsed = readMdFiles(path.join(root, 'threads'));
  const worldParsed = readMdFiles(path.join(root, 'world'));

  const scenes = sceneParsed.map(parseScene);
  // Sort scenes by rank
  scenes.sort((a, b) => a.rank.localeCompare(b.rank));

  const characters = characterParsed.map(parseCharacter);
  const chekhovs = chekhovParsed.map(parseChekhov);
  const threads = threadParsed.map(parseThread);
  const world = worldParsed.map(parseWorldArticle);

  // Extract wikilinks from all bodies
  const allParsed = [...sceneParsed, ...characterParsed, ...chekhovParsed, ...threadParsed, ...worldParsed];
  const wikilinks: WikiLink[] = [];
  for (const p of allParsed) {
    wikilinks.push(...extractWikilinks(p.body, p.file));
  }

  return { root, config, scenes, characters, chekhovs, threads, world, wikilinks };
}
