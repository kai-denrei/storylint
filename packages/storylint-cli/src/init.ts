import * as fs from 'node:fs';
import * as path from 'node:path';

const DIRS = ['scenes', 'characters', 'threads', 'chekhovs', 'world', 'assets/illustrations', 'assets/sketches', 'assets/references', 'assets/mood', 'assets/_meta', 'storyboard'];

const CONFIG = `# StoryLint project configuration
project:
  name: "My Story"
  author: ""
  description: ""

# Rule configuration (uncomment to override defaults)
# rules:
#   ABSENT_TOO_LONG:
#     threshold: 8
#   LATE_ARMING:
#     threshold: 10
#   PACING_CLUSTER:
#     threshold: 3
#   THREAD_DOMINANCE:
#     threshold: 0.70

# Disable specific rules
# disabled:
#   - SCENE_LENGTH_MISMATCH

# Severity overrides
# overrides:
#   TALKING_HEADS: info

# AI configuration (for ingest + analyze commands)
# ai:
#   provider: anthropic
#   model: claude-sonnet-4-6
#   ingest_model: claude-sonnet-4-6
#   api_key_env: ANTHROPIC_API_KEY
#   max_tokens: 4096
#   temperature: 0.3
`;

const EXAMPLE_CHARACTER = `---
id: example-character
name: "Example Character"
role: protagonist
aliases: []
one_line: "A brief description of this character"
arc:
  goal: "What do they want?"
  conflict: "What stands in their way?"
  transformation: "How do they change?"
  want: "Conscious desire"
  need: "Unconscious truth"
  arc_type: change
  planned_resolution: ~
  resolution_notes: ""
visual:
  palette: []
  features: ""
  expressions: [neutral]
  refs: []
relationships: []
tags: []
---

Extended character notes go here. Use [[wikilinks]] to reference other entities.
`;

const EXAMPLE_SCENE = `---
id: example-scene
rank: "a0"
title: "Opening Scene"
characters:
  - id: example-character
    role: primary
    expression: neutral
location: ""
threads: []
mood: []
layout: full-page
tension: 5
scene_type: action
visual_prompt: >
  Describe the visual composition here.
chekhovs_planted: []
chekhovs_armed: []
chekhovs_fired: []
---

Scene narrative goes here.
`;

const EXAMPLE_CHEKHOV = `---
id: example-chekhov
name: "Example Setup"
type: object
importance: minor
status: planted
description: "Something introduced that should pay off later"
planted_in: example-scene
planted_how: "How it was introduced"
armed_in: []
fired_in: ~
fired_how: ~
intent: fire
intent_target: ~
intent_notes: "Where and how you plan to pay this off"
tags: []
---

Extended notes about this Chekhov's narrative purpose.
`;

export function initProject(targetDir: string): void {
  const root = path.resolve(targetDir);

  if (fs.existsSync(path.join(root, '.storylint.yaml'))) {
    console.log(`  Project already initialized at ${root}`);
    return;
  }

  // Create directories
  for (const dir of DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  // Write config
  fs.writeFileSync(path.join(root, '.storylint.yaml'), CONFIG);

  // Write examples
  fs.writeFileSync(path.join(root, 'characters', 'example-character.md'), EXAMPLE_CHARACTER);
  fs.writeFileSync(path.join(root, 'scenes', 'example-scene.md'), EXAMPLE_SCENE);
  fs.writeFileSync(path.join(root, 'chekhovs', 'example-chekhov.md'), EXAMPLE_CHEKHOV);

  // Write .gitignore for the story project
  fs.writeFileSync(path.join(root, '.gitignore'), `.obsidian/workspace.json
.obsidian/workspace-mobile.json
.DS_Store
`);

  console.log(`  Initialized StoryLint project at ${root}`);
  console.log(`  Created: .storylint.yaml, example files in scenes/, characters/, chekhovs/`);
  console.log(`  Next: edit .storylint.yaml, then run 'storylint check' or 'storylint ingest <file>'`);
}
