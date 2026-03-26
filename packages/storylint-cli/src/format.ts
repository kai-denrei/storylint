import type { LintResult, LintWarning, Severity, ProjectData } from 'storylint-core';

// ── ANSI colors ──

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';

function severityColor(s: Severity): string {
  switch (s) {
    case 'error': return RED;
    case 'warning': return YELLOW;
    case 'info': return BLUE;
  }
}

function severityIcon(s: Severity): string {
  switch (s) {
    case 'error': return '\u2717';   // ✗
    case 'warning': return '\u26A0';  // ⚠
    case 'info': return '\u2139';     // ℹ
  }
}

// ── Format warnings ──

export function formatWarnings(result: LintResult): string {
  if (result.warnings.length === 0) {
    return `${GREEN}${BOLD}No issues found.${RESET}\n`;
  }

  // Group by file
  const byFile = new Map<string, LintWarning[]>();
  for (const w of result.warnings) {
    const list = byFile.get(w.file) ?? [];
    list.push(w);
    byFile.set(w.file, list);
  }

  const lines: string[] = [];
  for (const [file, warnings] of byFile) {
    // Show relative path
    const relFile = file.replace(process.cwd() + '/', '');
    lines.push(`\n  ${BOLD}${WHITE}${relFile}${RESET}`);
    for (const w of warnings) {
      const color = severityColor(w.severity);
      const icon = severityIcon(w.severity);
      lines.push(`    ${color}${icon} ${BOLD}${w.rule}${RESET}  ${w.message}`);
      if (w.details) {
        lines.push(`      ${DIM}${w.details}${RESET}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ── Format summary ──

export function formatSummary(result: LintResult): string {
  const s = result.summary;
  const lines: string[] = [];

  lines.push(`\n  ${BOLD}project summary${RESET}`);

  // Error/warning/info counts
  const counts: string[] = [];
  if (s.errors > 0) counts.push(`${RED}${s.errors} error${s.errors > 1 ? 's' : ''}${RESET}`);
  if (s.warnings > 0) counts.push(`${YELLOW}${s.warnings} warning${s.warnings > 1 ? 's' : ''}${RESET}`);
  if (s.info > 0) counts.push(`${BLUE}${s.info} info${RESET}`);
  if (counts.length === 0) counts.push(`${GREEN}clean${RESET}`);
  lines.push(`    ${counts.join(', ')}`);

  // Chekhov status
  const ch = s.chekhovs;
  const chParts: string[] = [];
  if (ch.unwritten > 0) chParts.push(`${DIM}${ch.unwritten} unwritten${RESET}`);
  if (ch.planted > 0) chParts.push(`${BLUE}${ch.planted} planted${RESET}`);
  if (ch.armed > 0) chParts.push(`${YELLOW}${ch.armed} armed${RESET}`);
  if (ch.fired > 0) chParts.push(`${GREEN}${ch.fired} fired${RESET}`);
  if (ch.subverted > 0) chParts.push(`${MAGENTA}${ch.subverted} subverted${RESET}`);
  if (ch.orphaned > 0) chParts.push(`${RED}${ch.orphaned} orphaned${RESET}`);
  if (ch.no_intent > 0) chParts.push(`${RED}${BOLD}${ch.no_intent} no intent${RESET}`);
  if (chParts.length > 0) {
    lines.push(`    Chekhovs: ${chParts.join(', ')}`);
  }

  // Characters
  lines.push(`    Characters: ${s.characters.total} total, ${s.characters.with_arc} with arcs, ${s.characters.with_resolution} with resolution`);

  // Scenes
  const sceneParts = [`${s.scenes.total} total`];
  if (s.scenes.unreviewed > 0) sceneParts.push(`${YELLOW}${s.scenes.unreviewed} unreviewed${RESET}`);
  lines.push(`    Scenes: ${sceneParts.join(', ')}`);

  return lines.join('\n') + '\n';
}

// ── Format Chekhov ledger ──

export function formatChekhovLedger(data: ProjectData): string {
  const chekhovs = data.chekhovs;
  if (chekhovs.length === 0) return `${DIM}No Chekhovs found.${RESET}\n`;

  const active = chekhovs.filter(c => c.status !== 'unwritten' && c.intent && c.intent !== 'cut');
  const planned = chekhovs.filter(c => c.status === 'unwritten');
  const attention = chekhovs.filter(c =>
    c.status !== 'unwritten' && (!c.intent || c.intent === 'cut')
  );

  const lines: string[] = [];

  if (active.length > 0) {
    lines.push(`\n  ${BOLD}── Active Chekhovs ──${RESET}`);
    lines.push(`  ${DIM}Status  | Intent  | Name                           | Planted    | Next action${RESET}`);
    lines.push(`  ${DIM}────────┼─────────┼────────────────────────────────┼────────────┼────────────${RESET}`);
    for (const c of active) {
      const statusIcon = c.status === 'fired' ? `${GREEN}\u25CF` : c.status === 'armed' ? `${YELLOW}\u25D0` : `${BLUE}\u25CB`;
      const intentStr = c.status === 'fired' ? `${GREEN}\u2713 done ` : `\u2192 ${c.intent}  `;
      const name = (c.name ?? c.id).padEnd(30).slice(0, 30);
      const planted = (c.planted_in ?? '-').padEnd(10).slice(0, 10);
      const next = c.status === 'fired' ? 'resolved' : c.status === 'armed' ? 'payoff pending' : 'needs arming';
      lines.push(`  ${statusIcon} ${c.status.padEnd(5)}${RESET} | ${intentStr}${RESET} | ${name} | ${planted} | ${next}`);
    }
  }

  if (planned.length > 0) {
    lines.push(`\n  ${BOLD}── Planned (not yet written) ──${RESET}`);
    lines.push(`  ${DIM}Status     | Name                           | Target       | Notes${RESET}`);
    lines.push(`  ${DIM}───────────┼────────────────────────────────┼──────────────┼──────${RESET}`);
    for (const c of planned) {
      const name = (c.name ?? c.id).padEnd(30).slice(0, 30);
      const target = (c.intent_target ?? '-').padEnd(12).slice(0, 12);
      const notes = (c.intent_notes ?? '').slice(0, 40);
      lines.push(`  ${CYAN}\u270E unwritten${RESET} | ${name} | ${target} | ${notes}`);
    }
  }

  if (attention.length > 0) {
    lines.push(`\n  ${BOLD}── Needs Attention ──${RESET}`);
    lines.push(`  ${DIM}Status  | Intent | Name                           | Problem${RESET}`);
    lines.push(`  ${DIM}────────┼────────┼────────────────────────────────┼────────${RESET}`);
    for (const c of attention) {
      const statusIcon = c.status === 'planted' ? `${BLUE}\u25CB` : c.status === 'armed' ? `${YELLOW}\u25D0` : `${RED}\u2717`;
      const intentStr = c.intent === 'cut' ? `\u2192 cut ` : `${RED}???   ${RESET}`;
      const name = (c.name ?? c.id).padEnd(30).slice(0, 30);
      const problem = c.intent === 'cut' ? 'marked for removal \u2014 clean up refs' : 'NO INTENT \u2014 orphan or forgotten?';
      lines.push(`  ${statusIcon} ${c.status.padEnd(5)}${RESET} | ${intentStr} | ${name} | ${problem}`);
    }
  }

  return lines.join('\n') + '\n';
}

// ── Format character report ──

export function formatCharacterReport(data: ProjectData): string {
  if (data.characters.length === 0) return `${DIM}No characters found.${RESET}\n`;

  const lines: string[] = [];
  lines.push(`\n  ${BOLD}── Character Report ──${RESET}\n`);

  for (const char of data.characters) {
    // Count scene appearances
    const sceneCount = data.scenes.filter(s =>
      (s.characters ?? []).some(c => (typeof c === 'string' ? c : c.id) === char.id)
    ).length;
    const pct = data.scenes.length > 0 ? Math.round((sceneCount / data.scenes.length) * 100) : 0;

    // Arc status
    let arcStatus: string;
    if (char.arc?.planned_resolution) {
      arcStatus = `${GREEN}resolved/planned${RESET}`;
    } else if (char.arc?.goal || char.arc?.transformation) {
      arcStatus = `${YELLOW}arc defined, no resolution${RESET}`;
    } else {
      arcStatus = `${DIM}no arc${RESET}`;
    }

    const arcType = char.arc?.arc_type ? ` (${char.arc.arc_type})` : '';

    lines.push(`  ${BOLD}${char.name}${RESET} [${char.role ?? 'unknown'}]`);
    lines.push(`    Scenes: ${sceneCount}/${data.scenes.length} (${pct}%)  |  Arc: ${arcStatus}${arcType}`);
    if (char.one_line) lines.push(`    ${DIM}${char.one_line}${RESET}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Format pacing report ──

export function formatPacingReport(data: ProjectData): string {
  if (data.scenes.length === 0) return `${DIM}No scenes found.${RESET}\n`;

  const lines: string[] = [];
  lines.push(`\n  ${BOLD}── Pacing Report ──${RESET}\n`);

  // Thread density sparkline
  lines.push(`  ${BOLD}Thread density per scene:${RESET}`);
  const densities = data.scenes.map(s => (s.threads ?? []).length);
  const maxDensity = Math.max(...densities, 1);
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const sparkline = densities.map(d => {
    const idx = Math.round((d / maxDensity) * (bars.length - 1));
    return bars[idx];
  }).join('');
  lines.push(`  ${CYAN}${sparkline}${RESET}`);
  lines.push(`  ${DIM}${densities.map((_, i) => (i + 1) % 5 === 0 ? (i + 1).toString() : ' ').join('')}${RESET}`);
  lines.push('');

  // Per-thread scene count
  lines.push(`  ${BOLD}Thread coverage:${RESET}`);
  for (const thread of data.threads) {
    const count = data.scenes.filter(s => (s.threads ?? []).includes(thread.id)).length;
    const pct = Math.round((count / data.scenes.length) * 100);
    const bar = '\u2588'.repeat(Math.round(pct / 5));
    const color = thread.color ? '' : CYAN; // Could parse hex to ANSI but keep it simple
    lines.push(`  ${color}${(thread.name ?? thread.id).padEnd(25)}${RESET} ${bar} ${count} scenes (${pct}%)`);
  }

  return lines.join('\n') + '\n';
}

// ── JSON format ──

export function formatJson(result: LintResult): string {
  return JSON.stringify(result, null, 2);
}
