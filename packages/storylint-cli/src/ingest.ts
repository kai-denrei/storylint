import * as fs from 'node:fs';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { parseProject } from 'storylint-core';
import type { ProjectConfig } from 'storylint-core';
import { parse as parseYaml } from 'yaml';

const SYSTEM_PROMPT = `You are a narrative structure analyst. You will receive raw story text (prose, synopsis, screenplay, or outline) and must extract structured story data from it.

Extract the following entity types:

## Scenes
Identify discrete scenes or narrative beats. For each:
- id: slug (lowercase, hyphens)
- rank: assign LexoRank strings in order: "a0", "a1", "a2", ... "a9", "aA", "aB", etc.
- title: short descriptive title
- characters: list of {id, role: primary|secondary|mentioned}
- location: setting slug
- threads: which plot threads this scene belongs to (use thread IDs)
- mood: 1-3 mood tags (e.g., tense, warm, clinical, desperate, hopeful)
- visual_prompt: 1-2 sentence visual description
- tension: 1-10 tension level
- scene_type: action or reaction

## Characters
Identify named characters. For each:
- id: slug
- name: full name
- role: protagonist|antagonist|supporting|minor
- one_line: one-sentence description
- arc.goal, arc.conflict, arc.transformation (if discernible)
- arc.arc_type: change|flat|fall|rebirth (if discernible)
- relationships: [{target: other-char-id, type, label}]

## Threads
Identify major plot lines. For each:
- id: slug
- name: descriptive name
- description: one sentence
- status: active|resolved
- phases: [{name, description}] if the thread has clear phases

## Chekhovs
Identify objects, secrets, skills, traits, or details that are introduced and later referenced (or that look like setups). For each:
- id: slug
- name: descriptive name
- type: object|trait|secret|skill|relationship|motif|rule
- importance: major|minor|atmospheric
- status: planted|armed|fired (based on what's in the text)
- description: what it is
- planted_in: scene ID where first introduced
- planted_how: how it was introduced
- armed_in: [{scene, how}] if reinforced
- fired_in: scene ID if resolved (null otherwise)
- fired_how: how it was resolved (null otherwise)

## World
Identify named systems, organizations, locations, technologies, or concepts that warrant a wiki entry. For each:
- id: slug
- name: proper name
- type: system|organization|location|technology|concept|event
- description: 1-2 sentence description

## Output Format
Return a single JSON object with keys: scenes, characters, threads, chekhovs, world. Each is an array of objects matching the schemas above. Use the exact field names specified. Do NOT include intent fields — those are for the author to add.

Be thorough but conservative: only extract what's clearly in the text. Do not invent plot points or connections that aren't there.`;

interface IngestOptions {
  dryRun?: boolean;
  merge?: boolean;
  targetDir?: string;
}

interface IngestResult {
  scenes: Record<string, unknown>[];
  characters: Record<string, unknown>[];
  threads: Record<string, unknown>[];
  chekhovs: Record<string, unknown>[];
  world: Record<string, unknown>[];
}

function getApiKey(config: ProjectConfig): string {
  const envVar = config.ai?.api_key_env ?? 'ANTHROPIC_API_KEY';
  const key = process.env[envVar];
  if (!key) {
    throw new Error(`No API key found. Set ${envVar} environment variable.`);
  }
  return key;
}

function getModel(config: ProjectConfig): string {
  return config.ai?.ingest_model ?? config.ai?.model ?? 'claude-sonnet-4-6';
}

function entityToMarkdown(frontmatter: Record<string, unknown>, body?: string): string {
  // Build YAML frontmatter manually to control field order
  const lines = ['---'];
  const fm = { ...frontmatter, _generated: true, _reviewed: false };

  function writeValue(val: unknown, indent: number): string {
    const pad = ' '.repeat(indent);
    if (val === null || val === undefined) return '~';
    if (typeof val === 'string') {
      if (val.includes('\n') || val.includes(': ') || val.startsWith('"')) {
        return JSON.stringify(val);
      }
      return val;
    }
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      if (val.every(v => typeof v === 'string' || typeof v === 'number')) {
        return `[${val.map(v => typeof v === 'string' ? JSON.stringify(v) : String(v)).join(', ')}]`;
      }
      return '\n' + val.map(item => {
        if (typeof item === 'object' && item !== null) {
          const entries = Object.entries(item as Record<string, unknown>);
          const first = entries[0];
          const rest = entries.slice(1);
          let line = `${pad}- ${first[0]}: ${writeValue(first[1], indent + 4)}`;
          for (const [k, v] of rest) {
            line += `\n${pad}  ${k}: ${writeValue(v, indent + 4)}`;
          }
          return line;
        }
        return `${pad}- ${writeValue(item, indent + 2)}`;
      }).join('\n');
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val as Record<string, unknown>);
      return '\n' + entries.map(([k, v]) => `${pad}${k}: ${writeValue(v, indent + 2)}`).join('\n');
    }
    return String(val);
  }

  for (const [key, value] of Object.entries(fm)) {
    lines.push(`${key}: ${writeValue(value, 2)}`);
  }
  lines.push('---');
  if (body) {
    lines.push('', body);
  }
  return lines.join('\n') + '\n';
}

function writeEntity(dir: string, id: string, frontmatter: Record<string, unknown>, body?: string, merge?: boolean): string {
  const filePath = path.join(dir, `${id}.md`);

  if (merge && fs.existsSync(filePath)) {
    // Don't overwrite — write as .new.md
    const newPath = path.join(dir, `${id}.new.md`);
    fs.writeFileSync(newPath, entityToMarkdown(frontmatter, body));
    return `  MERGE CONFLICT: ${newPath} (existing file preserved)`;
  }

  fs.writeFileSync(filePath, entityToMarkdown(frontmatter, body));
  return `  created: ${filePath}`;
}

export async function ingest(filePaths: string[], options: IngestOptions): Promise<void> {
  const targetDir = path.resolve(options.targetDir ?? '.');

  // Read config if it exists
  let config: ProjectConfig = {};
  const configPath = path.join(targetDir, '.storylint.yaml');
  if (fs.existsSync(configPath)) {
    config = parseYaml(fs.readFileSync(configPath, 'utf-8')) ?? {};
  }

  // Read all input files
  const texts: string[] = [];
  for (const fp of filePaths) {
    const resolved = path.resolve(fp);
    if (fs.statSync(resolved).isDirectory()) {
      const files = fs.readdirSync(resolved).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      for (const f of files) {
        texts.push(`--- File: ${f} ---\n` + fs.readFileSync(path.join(resolved, f), 'utf-8'));
      }
    } else {
      texts.push(`--- File: ${path.basename(resolved)} ---\n` + fs.readFileSync(resolved, 'utf-8'));
    }
  }

  const fullText = texts.join('\n\n');
  const wordCount = fullText.split(/\s+/).length;
  console.log(`  Reading ${filePaths.length} file(s), ${wordCount} words`);

  if (options.dryRun) {
    console.log(`  [DRY RUN] Would send to Claude ${getModel(config)} for extraction`);
    console.log(`  [DRY RUN] Output would be written to: ${targetDir}`);
    return;
  }

  // Call Claude API
  const apiKey = getApiKey(config);
  const client = new Anthropic({ apiKey });
  const model = getModel(config);

  console.log(`  Sending to ${model} for extraction...`);

  const response = await client.messages.create({
    model,
    max_tokens: config.ai?.max_tokens ?? 8192,
    temperature: config.ai?.temperature ?? 0.3,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Extract structured story data from the following text:\n\n${fullText}`,
    }],
  });

  // Extract JSON from response
  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  // Try to parse JSON (may be wrapped in ```json blocks)
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/) ?? responseText.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    console.error('  Failed to extract JSON from AI response');
    console.error('  Raw response:', responseText.slice(0, 500));
    return;
  }

  let result: IngestResult;
  try {
    result = JSON.parse(jsonMatch[1]);
  } catch (e) {
    console.error('  Failed to parse JSON:', (e as Error).message);
    return;
  }

  // Ensure directories exist
  for (const dir of ['scenes', 'characters', 'threads', 'chekhovs', 'world']) {
    fs.mkdirSync(path.join(targetDir, dir), { recursive: true });
  }

  // Add _generated_from to all entities
  const sourceFile = filePaths.map(f => path.basename(f)).join(', ');

  console.log(`\n  Extracted:`);
  console.log(`    ${result.scenes?.length ?? 0} scenes`);
  console.log(`    ${result.characters?.length ?? 0} characters`);
  console.log(`    ${result.threads?.length ?? 0} threads`);
  console.log(`    ${result.chekhovs?.length ?? 0} chekhovs`);
  console.log(`    ${result.world?.length ?? 0} world articles`);

  // Write files
  const logs: string[] = [];

  for (const scene of result.scenes ?? []) {
    const id = scene.id as string;
    logs.push(writeEntity(
      path.join(targetDir, 'scenes'), id,
      { ...scene, _generated_from: sourceFile },
      undefined, options.merge
    ));
  }

  for (const char of result.characters ?? []) {
    const id = char.id as string;
    logs.push(writeEntity(
      path.join(targetDir, 'characters'), id,
      { ...char, _generated_from: sourceFile },
      undefined, options.merge
    ));
  }

  for (const thread of result.threads ?? []) {
    const id = thread.id as string;
    logs.push(writeEntity(
      path.join(targetDir, 'threads'), id,
      { ...thread, _generated_from: sourceFile },
      undefined, options.merge
    ));
  }

  for (const chekhov of result.chekhovs ?? []) {
    const id = chekhov.id as string;
    logs.push(writeEntity(
      path.join(targetDir, 'chekhovs'), id,
      { ...chekhov, _generated_from: sourceFile },
      undefined, options.merge
    ));
  }

  for (const article of result.world ?? []) {
    const id = article.id as string;
    logs.push(writeEntity(
      path.join(targetDir, 'world'), id,
      { ...article, _generated_from: sourceFile },
      undefined, options.merge
    ));
  }

  console.log(`\n  Files written:`);
  for (const log of logs) {
    console.log(log);
  }

  console.log(`\n  Next steps:`);
  console.log(`    1. Review generated files (look for _reviewed: false)`);
  console.log(`    2. Add intent fields to Chekhovs (intent: fire|subvert|cut)`);
  console.log(`    3. Add planned_resolution to character arcs`);
  console.log(`    4. Run 'storylint check' to see the lint report`);
}
