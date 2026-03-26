import type { ProjectData, LintWarning } from '../types.js';
import type { Rule } from './engine.js';
import { getThreshold } from './engine.js';

function getSceneCharacterIds(scene: ProjectData['scenes'][0]): string[] {
  if (!scene.characters) return [];
  return scene.characters.map(c => typeof c === 'string' ? c : c.id);
}

// ABSENT_TOO_LONG: character disappears for too many consecutive scenes
const absentTooLong: Rule = {
  id: 'ABSENT_TOO_LONG',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'ABSENT_TOO_LONG', 8);
    const warnings: LintWarning[] = [];

    for (const char of data.characters) {
      // Find all scenes this character appears in
      const appearances: number[] = [];
      for (let i = 0; i < data.scenes.length; i++) {
        const ids = getSceneCharacterIds(data.scenes[i]);
        if (ids.includes(char.id)) {
          appearances.push(i);
        }
      }

      if (appearances.length < 2) continue;

      // Check gaps between appearances
      for (let i = 1; i < appearances.length; i++) {
        const gap = appearances[i] - appearances[i - 1];
        if (gap > threshold) {
          const fromScene = data.scenes[appearances[i - 1]];
          const toScene = data.scenes[appearances[i]];
          const pct = Math.round((gap / data.scenes.length) * 100);
          warnings.push({
            rule: 'ABSENT_TOO_LONG',
            severity: 'warning',
            file: char._file ?? `characters/${char.id}.md`,
            entity_id: char.id,
            entity_type: 'character',
            message: `${char.name} absent for ${gap} consecutive scenes (${pct}% of story) between "${fromScene.title ?? fromScene.id}" and "${toScene.title ?? toScene.id}"`,
          });
        }
      }
    }
    return warnings;
  },
};

// UNRESOLVED_ARC: character has arc.goal but no planned_resolution
const unresolvedArc: Rule = {
  id: 'UNRESOLVED_ARC',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const char of data.characters) {
      if (!char.arc?.goal && !char.arc?.transformation) continue;
      if (char.arc?.planned_resolution) continue;

      warnings.push({
        rule: 'UNRESOLVED_ARC',
        severity: 'warning',
        file: char._file ?? `characters/${char.id}.md`,
        entity_id: char.id,
        entity_type: 'character',
        message: `${char.name} has an arc goal but no planned_resolution — how does this end?`,
      });
    }
    return warnings;
  },
};

// NO_ARC: protagonist or supporting character with no arc block
const noArc: Rule = {
  id: 'NO_ARC',
  defaultSeverity: 'info',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const char of data.characters) {
      if (char.role !== 'protagonist' && char.role !== 'supporting') continue;
      if (char.arc?.goal || char.arc?.transformation || char.arc?.arc_type) continue;

      warnings.push({
        rule: 'NO_ARC',
        severity: 'info',
        file: char._file ?? `characters/${char.id}.md`,
        entity_id: char.id,
        entity_type: 'character',
        message: `${char.name} (${char.role}) has no arc defined`,
      });
    }
    return warnings;
  },
};

// UNLINKED_CHARACTER: character exists but appears in zero scenes
const unlinkedCharacter: Rule = {
  id: 'UNLINKED_CHARACTER',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const char of data.characters) {
      const appears = data.scenes.some(s => getSceneCharacterIds(s).includes(char.id));
      if (!appears) {
        warnings.push({
          rule: 'UNLINKED_CHARACTER',
          severity: 'warning',
          file: char._file ?? `characters/${char.id}.md`,
          entity_id: char.id,
          entity_type: 'character',
          message: `${char.name} exists but appears in no scenes`,
        });
      }
    }
    return warnings;
  },
};

// OVERCROWDED_SCENE: scene has too many primary characters
const overcrowdedScene: Rule = {
  id: 'OVERCROWDED_SCENE',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const scene of data.scenes) {
      if (!scene.characters) continue;
      const primaryCount = scene.characters.filter(c =>
        typeof c !== 'string' && c.role === 'primary'
      ).length;

      if (primaryCount >= 5) {
        warnings.push({
          rule: 'OVERCROWDED_SCENE',
          severity: 'warning',
          file: scene._file ?? `scenes/${scene.id}.md`,
          entity_id: scene.id,
          entity_type: 'scene',
          message: `"${scene.title ?? scene.id}" has ${primaryCount} primary characters — hard to give each meaningful focus`,
        });
      }
    }
    return warnings;
  },
};

export const characterRules: Rule[] = [
  absentTooLong,
  unresolvedArc,
  noArc,
  unlinkedCharacter,
  overcrowdedScene,
];
