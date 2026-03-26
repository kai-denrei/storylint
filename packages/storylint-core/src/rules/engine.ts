import type { ProjectData, LintWarning, LintResult, LintSummary, Severity } from '../types.js';
import { chekhovRules } from './chekhov.js';
import { characterRules } from './character.js';
import { pacingRules } from './pacing.js';
import { structureRules } from './structure.js';

export type RuleFn = (data: ProjectData) => LintWarning[];

export interface Rule {
  id: string;
  fn: RuleFn;
  defaultSeverity: Severity;
}

const allRules: Rule[] = [
  ...chekhovRules,
  ...characterRules,
  ...pacingRules,
  ...structureRules,
];

function getThreshold(config: ProjectData['config'], ruleId: string, defaultVal: number): number {
  return config.rules?.[ruleId]?.threshold ?? defaultVal;
}

export { getThreshold };

export function lint(data: ProjectData): LintResult {
  const disabled = new Set(data.config.disabled ?? []);
  const overrides = data.config.overrides ?? {};

  let warnings: LintWarning[] = [];

  for (const rule of allRules) {
    if (disabled.has(rule.id)) continue;

    const ruleWarnings = rule.fn(data);

    // Apply severity overrides
    const severityOverride = overrides[rule.id];
    if (severityOverride) {
      for (const w of ruleWarnings) {
        w.severity = severityOverride;
      }
    }

    // Apply per-entity lint suppression (for chekhovs)
    for (const w of ruleWarnings) {
      if (w.entity_type === 'chekhov') {
        const chekhov = data.chekhovs.find(c => c.id === w.entity_id);
        if (chekhov?.lint?.suppress?.includes(w.rule)) continue;
      }
      warnings.push(w);
    }
  }

  // Sort: errors first, then warnings, then info
  const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { warnings, summary: buildSummary(data, warnings) };
}

function buildSummary(data: ProjectData, warnings: LintWarning[]): LintSummary {
  const chekhovs = data.chekhovs;
  const noIntentCount = chekhovs.filter(c =>
    (c.status === 'planted' || c.status === 'armed') && !c.intent
  ).length;

  return {
    errors: warnings.filter(w => w.severity === 'error').length,
    warnings: warnings.filter(w => w.severity === 'warning').length,
    info: warnings.filter(w => w.severity === 'info').length,
    chekhovs: {
      unwritten: chekhovs.filter(c => c.status === 'unwritten').length,
      planted: chekhovs.filter(c => c.status === 'planted').length,
      armed: chekhovs.filter(c => c.status === 'armed').length,
      fired: chekhovs.filter(c => c.status === 'fired').length,
      subverted: chekhovs.filter(c => c.status === 'subverted').length,
      orphaned: chekhovs.filter(c => c.status === 'orphaned').length,
      no_intent: noIntentCount,
    },
    characters: {
      total: data.characters.length,
      with_arc: data.characters.filter(c => c.arc?.goal || c.arc?.transformation).length,
      with_resolution: data.characters.filter(c => c.arc?.planned_resolution).length,
    },
    scenes: {
      total: data.scenes.length,
      unreviewed: data.scenes.filter(s => s._generated && s._reviewed === false).length,
    },
  };
}
