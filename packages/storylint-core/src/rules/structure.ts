import type { ProjectData, LintWarning } from '../types.js';
import type { Rule } from './engine.js';

// TALKING_HEADS: dialogue-heavy scene with no visual dynamism
// Language-agnostic: checks quotation marks (universal) and structural fields, not prose verbs
const talkingHeads: Rule = {
  id: 'TALKING_HEADS',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    // Universal quotation marks across languages: "", «», 「」, '', ""
    const dialogueMarkers = /[""\u201C\u201D\u00AB\u00BB\u300C\u300D\u300E\u300F\u2018\u2019]/;

    for (const scene of data.scenes) {
      const body = scene._body ?? '';
      if (body.length < 100) continue;

      const hasDialogue = dialogueMarkers.test(body);
      const hasLocation = !!scene.location;
      const hasVisualPrompt = !!scene.visual_prompt;
      // Use mood tags as a language-agnostic signal for action/dynamism
      const hasActionMood = (scene.mood ?? []).some(m =>
        !['dialogue', 'talking', 'conversation', 'discussion', 'static'].includes(m.toLowerCase())
      );
      // If scene has characters with expressions, there's at least visual direction
      const hasExpressions = (scene.characters ?? []).some(c =>
        typeof c !== 'string' && c.expression
      );

      if (hasDialogue && !hasLocation && !hasVisualPrompt && !hasActionMood && !hasExpressions) {
        warnings.push({
          rule: 'TALKING_HEADS',
          severity: 'warning',
          file: scene._file ?? `scenes/${scene.id}.md`,
          entity_id: scene.id,
          entity_type: 'scene',
          message: `"${scene.title ?? scene.id}" has dialogue but no location, visual prompt, mood tags, or character expressions`,
        });
      }
    }
    return warnings;
  },
};

// DEAD_END_SCENE: scene belongs to no thread
const deadEndScene: Rule = {
  id: 'DEAD_END_SCENE',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const scene of data.scenes) {
      if (!scene.threads || scene.threads.length === 0) {
        warnings.push({
          rule: 'DEAD_END_SCENE',
          severity: 'warning',
          file: scene._file ?? `scenes/${scene.id}.md`,
          entity_id: scene.id,
          entity_type: 'scene',
          message: `"${scene.title ?? scene.id}" belongs to no thread — disconnected from plot`,
        });
      }
    }
    return warnings;
  },
};

// MISSING_REFERENCE: wikilink or frontmatter ref points to nonexistent entity
const missingReference: Rule = {
  id: 'MISSING_REFERENCE',
  defaultSeverity: 'error',
  fn(data) {
    const warnings: LintWarning[] = [];

    // Build a set of all known IDs
    const knownIds = new Set<string>();
    for (const s of data.scenes) knownIds.add(s.id);
    for (const c of data.characters) knownIds.add(c.id);
    for (const c of data.chekhovs) knownIds.add(c.id);
    for (const t of data.threads) knownIds.add(t.id);
    for (const w of data.world) knownIds.add(w.id);

    // Check wikilinks
    for (const link of data.wikilinks) {
      if (!knownIds.has(link.target)) {
        warnings.push({
          rule: 'MISSING_REFERENCE',
          severity: 'error',
          file: link.source,
          entity_id: link.target,
          entity_type: 'project',
          message: `[[${link.target}]] referenced but no entity with that ID exists`,
        });
      }
    }

    // Check scene → character refs
    for (const scene of data.scenes) {
      for (const c of scene.characters ?? []) {
        const charId = typeof c === 'string' ? c : c.id;
        if (!knownIds.has(charId)) {
          warnings.push({
            rule: 'MISSING_REFERENCE',
            severity: 'error',
            file: scene._file ?? `scenes/${scene.id}.md`,
            entity_id: charId,
            entity_type: 'project',
            message: `Scene "${scene.title ?? scene.id}" references character "${charId}" which doesn't exist`,
          });
        }
      }

      // Check scene → thread refs
      for (const t of scene.threads ?? []) {
        if (!knownIds.has(t)) {
          warnings.push({
            rule: 'MISSING_REFERENCE',
            severity: 'error',
            file: scene._file ?? `scenes/${scene.id}.md`,
            entity_id: t,
            entity_type: 'project',
            message: `Scene "${scene.title ?? scene.id}" references thread "${t}" which doesn't exist`,
          });
        }
      }

      // Check scene → chekhov refs
      const chekhovRefs = [
        ...(scene.chekhovs_planted ?? []),
        ...(scene.chekhovs_armed ?? []),
        ...(scene.chekhovs_fired ?? []),
      ];
      for (const cId of chekhovRefs) {
        if (!knownIds.has(cId)) {
          warnings.push({
            rule: 'MISSING_REFERENCE',
            severity: 'error',
            file: scene._file ?? `scenes/${scene.id}.md`,
            entity_id: cId,
            entity_type: 'project',
            message: `Scene "${scene.title ?? scene.id}" references Chekhov "${cId}" which doesn't exist`,
          });
        }
      }
    }

    // Deduplicate by file+entity_id+rule
    const seen = new Set<string>();
    return warnings.filter(w => {
      const key = `${w.file}:${w.entity_id}:${w.rule}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};

// TONAL_WHIPLASH: sharp mood contrast between consecutive scenes
const tonalWhiplash: Rule = {
  id: 'TONAL_WHIPLASH',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];

    const moodValence: Record<string, number> = {
      // Negative/dark
      cold: -2, clinical: -1, bureaucratic: -1, threatening: -3, violent: -3,
      hostile: -3, desperate: -3, panic: -3, grief: -3, bleak: -3, tense: -2,
      // Neutral
      neutral: 0, ambiguous: 0, procedural: 0,
      // Positive/warm
      warm: 2, hopeful: 3, safe: 3, sanctuary: 3, intimate: 2,
      gentle: 2, calm: 1, peaceful: 2, joyful: 3, triumphant: 3,
    };

    function avgValence(moods: string[]): number | null {
      const values = moods.map(m => moodValence[m.toLowerCase()]).filter((v): v is number => v !== undefined);
      if (values.length === 0) return null;
      return values.reduce((a, b) => a + b, 0) / values.length;
    }

    for (let i = 1; i < data.scenes.length; i++) {
      const prev = data.scenes[i - 1];
      const curr = data.scenes[i];
      const prevV = avgValence(prev.mood ?? []);
      const currV = avgValence(curr.mood ?? []);

      if (prevV === null || currV === null) continue;

      const swing = Math.abs(currV - prevV);
      if (swing >= 5) {
        warnings.push({
          rule: 'TONAL_WHIPLASH',
          severity: 'warning',
          file: curr._file ?? `scenes/${curr.id}.md`,
          entity_id: curr.id,
          entity_type: 'scene',
          message: `Sharp tonal shift between "${prev.title ?? prev.id}" and "${curr.title ?? curr.id}" — consider a transitional scene`,
        });
      }
    }
    return warnings;
  },
};

// DANGLING_THREAD: active thread with no scenes in final 20% of story
const danglingThread: Rule = {
  id: 'DANGLING_THREAD',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    if (data.scenes.length === 0) return warnings;

    const cutoff = Math.floor(data.scenes.length * 0.8);

    for (const thread of data.threads) {
      if (thread.status === 'resolved' || thread.status === 'dormant') continue;
      if (thread.planned_ending === 'dormant' || thread.planned_ending === 'abandoned') continue;

      const hasLateScene = data.scenes.slice(cutoff).some(s =>
        (s.threads ?? []).includes(thread.id)
      );

      if (!hasLateScene) {
        warnings.push({
          rule: 'DANGLING_THREAD',
          severity: 'warning',
          file: thread._file ?? `threads/${thread.id}.md`,
          entity_id: thread.id,
          entity_type: 'thread',
          message: `"${thread.name}" is active but has no scenes in the final 20% of the story`,
        });
      }
    }
    return warnings;
  },
};

export const structureRules: Rule[] = [
  talkingHeads,
  deadEndScene,
  missingReference,
  tonalWhiplash,
  danglingThread,
];
