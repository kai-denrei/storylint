#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseProject, lint, generateFishboneCanvas, generateFishboneHTML } from 'storylint-core';
import {
  formatWarnings, formatSummary, formatChekhovLedger,
  formatCharacterReport, formatPacingReport, formatJson
} from './format.js';
import { initProject } from './init.js';
import { ingest } from './ingest.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const VERSION = '0.1.0';

function usage(): void {
  console.log(`
${BOLD}storylint${RESET} v${VERSION} — narrative intelligence toolkit

${BOLD}Usage:${RESET}
  storylint <command> [options] [path]

${BOLD}Commands:${RESET}
  ${BOLD}init${RESET} [path]                    Scaffold a new StoryLint project (vault)
  ${BOLD}check${RESET} [path]                   Run all lint rules
  ${BOLD}chekhovs${RESET} [path]                Show Chekhov ledger (active/planned/attention)
  ${BOLD}characters${RESET} [path]              Character screen time + arc report
  ${BOLD}pacing${RESET} [path]                  Pacing density + thread coverage
  ${BOLD}summary${RESET} [path]                 Project health dashboard
  ${BOLD}fishbone${RESET} [path]               Generate fishbone timeline as Obsidian .canvas
  ${BOLD}ingest${RESET} <file...> [--into dir]  AI ingest: raw text → structured project
  ${BOLD}analyze${RESET} [path]                 AI analysis (coming soon)

${BOLD}Options:${RESET}
  --format json          Output as JSON (check command only)
  --format html          Output fishbone as standalone HTML instead of .canvas
  --dry-run              Show what ingest would create without writing
  --merge                Ingest into existing project, flag duplicates
  --into <dir>           Write ingest output to specific directory

${BOLD}Examples:${RESET}
  storylint init ./my-story
  storylint check ./my-story
  storylint chekhovs ./my-story
  storylint ingest ./draft.md --into ./my-story
  storylint check --format json
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0];
  const jsonFormat = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
  const dryRun = args.includes('--dry-run');
  const merge = args.includes('--merge');

  // Find the path argument (first non-flag arg after command)
  const flagArgs = new Set(['--format', '--into', '--dry-run', '--merge']);
  const positionalArgs: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (flagArgs.has(args[i])) {
      if (args[i] === '--format' || args[i] === '--into') i++; // skip value
      continue;
    }
    if (args[i].startsWith('--')) continue;
    positionalArgs.push(args[i]);
  }

  switch (command) {
    case 'init': {
      const target = positionalArgs[0] ?? '.';
      initProject(target);
      break;
    }

    case 'check': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      const result = lint(data);

      if (jsonFormat) {
        console.log(formatJson(result));
      } else {
        console.log(formatWarnings(result));
        console.log(formatSummary(result));
      }

      process.exit(result.summary.errors > 0 ? 1 : 0);
    }

    case 'chekhovs': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      console.log(formatChekhovLedger(data));
      break;
    }

    case 'characters': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      console.log(formatCharacterReport(data));
      break;
    }

    case 'pacing': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      console.log(formatPacingReport(data));
      break;
    }

    case 'summary': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      const result = lint(data);
      console.log(formatSummary(result));
      console.log(formatChekhovLedger(data));
      console.log(formatCharacterReport(data));
      console.log(formatPacingReport(data));
      break;
    }

    case 'fishbone': {
      const projectDir = path.resolve(positionalArgs[0] ?? '.');
      const data = parseProject(projectDir);
      const htmlFormat = args.includes('--format') && args[args.indexOf('--format') + 1] === 'html';

      if (jsonFormat) {
        // Raw canvas JSON to stdout
        console.log(generateFishboneCanvas(data));
      } else if (htmlFormat) {
        // Standalone HTML file
        const html = generateFishboneHTML(data);
        const outPath = path.join(projectDir, 'fishbone-timeline.html');
        fs.writeFileSync(outPath, html);
        console.log(`  Fishbone timeline written to: ${outPath}`);
        console.log(`  Open in a browser to view. Hover scenes for details.`);
        console.log(`  ${data.scenes.length} scenes, ${data.threads.length} threads, ${data.chekhovs.length} Chekhovs mapped.`);
      } else {
        // Default: Obsidian .canvas file
        const canvasJson = generateFishboneCanvas(data);
        const outPath = path.join(projectDir, 'fishbone-timeline.canvas');
        fs.writeFileSync(outPath, canvasJson);
        console.log(`  Fishbone timeline written to: ${outPath}`);
        console.log(`  Open it in Obsidian (Canvas view) to see the visualization.`);
        console.log(`  ${data.scenes.length} scenes, ${data.threads.length} threads, ${data.chekhovs.length} Chekhovs mapped.`);
        console.log(`  Tip: use --format html for a standalone browser version.`);
      }
      break;
    }

    case 'ingest': {
      if (positionalArgs.length === 0) {
        console.error('  Error: storylint ingest requires at least one file argument');
        process.exit(1);
      }

      const intoIdx = args.indexOf('--into');
      const targetDir = intoIdx >= 0 ? args[intoIdx + 1] : '.';

      await ingest(positionalArgs, { dryRun, merge, targetDir });
      break;
    }

    case 'analyze': {
      console.log(`${DIM}  AI analysis not yet implemented. Coming in Phase 3.${RESET}`);
      break;
    }

    default:
      console.error(`  Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
