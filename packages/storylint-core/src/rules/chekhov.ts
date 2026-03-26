import type { ProjectData, LintWarning } from '../types.js';
import type { Rule } from './engine.js';
import { getThreshold } from './engine.js';

function sceneIndex(scenes: ProjectData['scenes'], sceneId: string): number {
  return scenes.findIndex(s => s.id === sceneId);
}

function getArmedSceneIds(chekhov: ProjectData['chekhovs'][0]): string[] {
  if (!chekhov.armed_in) return [];
  return chekhov.armed_in.map(a => typeof a === 'string' ? a : a.scene);
}

// NO_INTENT: planted/armed Chekhov with no intent field — the real orphan signal
const noIntent: Rule = {
  id: 'NO_INTENT',
  defaultSeverity: 'error',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const c of data.chekhovs) {
      if ((c.status === 'planted' || c.status === 'armed') && !c.intent) {
        warnings.push({
          rule: 'NO_INTENT',
          severity: 'error',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" is ${c.status} but has no intent — orphan or forgotten?`,
          details: 'Add an intent field (fire, subvert, cut) to declare your plan for this Chekhov.',
        });
      }
    }
    return warnings;
  },
};

// ORPHANED_CHEKHOV: intent to fire but no fired_in and story has moved past
const orphanedChekhov: Rule = {
  id: 'ORPHANED_CHEKHOV',
  defaultSeverity: 'error',
  fn(data) {
    const warnings: LintWarning[] = [];
    const totalScenes = data.scenes.length;
    if (totalScenes === 0) return warnings;

    for (const c of data.chekhovs) {
      if (c.status === 'fired' || c.status === 'subverted' || c.status === 'unwritten') continue;
      if (c.intent === 'cut') continue;

      // Find the last scene this chekhov appears in
      const armedIds = getArmedSceneIds(c);
      const allSceneIds = [c.planted_in, ...armedIds].filter(Boolean) as string[];
      if (allSceneIds.length === 0) continue;

      const lastIdx = Math.max(...allSceneIds.map(id => sceneIndex(data.scenes, id)).filter(i => i >= 0));
      if (lastIdx < 0) continue;

      // If the last appearance is more than 80% through the story and it's not fired
      const positionPct = (lastIdx + 1) / totalScenes;
      if (positionPct < 0.8) continue; // Still time

      if (!c.fired_in) {
        warnings.push({
          rule: 'ORPHANED_CHEKHOV',
          severity: 'error',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" was last seen at scene ${lastIdx + 1}/${totalScenes} (${Math.round(positionPct * 100)}%) and has no payoff`,
          details: c.intent ? `Intent is "${c.intent}" but no fired_in scene exists.` : undefined,
        });
      }
    }
    return warnings;
  },
};

// LATE_ARMING: too many scenes between planting and first arming
const lateArming: Rule = {
  id: 'LATE_ARMING',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'LATE_ARMING', 10);
    const warnings: LintWarning[] = [];

    for (const c of data.chekhovs) {
      if (c.status === 'unwritten' || c.intent === 'cut') continue;
      if (!c.planted_in) continue;

      const armedIds = getArmedSceneIds(c);
      if (armedIds.length === 0 && c.status !== 'fired') continue; // Not armed yet, that's OK if just planted

      const plantIdx = sceneIndex(data.scenes, c.planted_in);
      if (plantIdx < 0) continue;

      let firstArmIdx: number;
      if (armedIds.length > 0) {
        const indices = armedIds.map(id => sceneIndex(data.scenes, id)).filter(i => i >= 0);
        if (indices.length === 0) continue;
        firstArmIdx = Math.min(...indices);
      } else if (c.fired_in) {
        firstArmIdx = sceneIndex(data.scenes, c.fired_in);
        if (firstArmIdx < 0) continue;
      } else {
        continue;
      }

      const gap = firstArmIdx - plantIdx;
      if (gap > threshold) {
        warnings.push({
          rule: 'LATE_ARMING',
          severity: 'warning',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" planted in scene ${plantIdx + 1}, first armed/fired ${gap} scenes later — reader may forget`,
        });
      }
    }
    return warnings;
  },
};

// UNARMED_PAYOFF: fired without being armed first
const unarmedPayoff: Rule = {
  id: 'UNARMED_PAYOFF',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const c of data.chekhovs) {
      if (c.status !== 'fired' || !c.fired_in) continue;
      const armedIds = getArmedSceneIds(c);
      if (armedIds.length === 0) {
        warnings.push({
          rule: 'UNARMED_PAYOFF',
          severity: 'warning',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" was fired without being armed first — payoff may feel unearned`,
        });
      }
    }
    return warnings;
  },
};

// FRONT_LOADED_PLANT: too many Chekhovs planted in a single scene
const frontLoadedPlant: Rule = {
  id: 'FRONT_LOADED_PLANT',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    const plantCounts = new Map<string, string[]>();

    for (const c of data.chekhovs) {
      if (!c.planted_in) continue;
      const list = plantCounts.get(c.planted_in) ?? [];
      list.push(c.name);
      plantCounts.set(c.planted_in, list);
    }

    for (const [sceneId, names] of plantCounts) {
      if (names.length >= 3) {
        const scene = data.scenes.find(s => s.id === sceneId);
        warnings.push({
          rule: 'FRONT_LOADED_PLANT',
          severity: 'warning',
          file: scene?._file ?? `scenes/${sceneId}.md`,
          entity_id: sceneId,
          entity_type: 'scene',
          message: `${names.length} Chekhovs planted in one scene: ${names.join(', ')} — may overwhelm the reader`,
        });
      }
    }
    return warnings;
  },
};

// DISTANT_PAYOFF: too many scenes between last arming and firing
const distantPayoff: Rule = {
  id: 'DISTANT_PAYOFF',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'DISTANT_PAYOFF', 15);
    const warnings: LintWarning[] = [];

    for (const c of data.chekhovs) {
      if (!c.fired_in) continue;
      const firedIdx = sceneIndex(data.scenes, c.fired_in);
      if (firedIdx < 0) continue;

      const armedIds = getArmedSceneIds(c);
      const allPrior = [c.planted_in, ...armedIds].filter(Boolean) as string[];
      const indices = allPrior.map(id => sceneIndex(data.scenes, id)).filter(i => i >= 0);
      if (indices.length === 0) continue;

      const lastBeforeFire = Math.max(...indices);
      const gap = firedIdx - lastBeforeFire;

      if (gap > threshold) {
        warnings.push({
          rule: 'DISTANT_PAYOFF',
          severity: 'warning',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" last seen ${gap} scenes before payoff — reader may have forgotten`,
        });
      }
    }
    return warnings;
  },
};

// INTENT_MISMATCH: intent_target points to a scene that exists but doesn't reference this Chekhov
const intentMismatch: Rule = {
  id: 'INTENT_MISMATCH',
  defaultSeverity: 'warning',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const c of data.chekhovs) {
      if (!c.intent_target) continue;
      const targetScene = data.scenes.find(s => s.id === c.intent_target);
      if (!targetScene) continue; // Scene doesn't exist yet — that's fine

      // Check if the scene actually references this chekhov
      const sceneChekhovRefs = [
        ...(targetScene.chekhovs_planted ?? []),
        ...(targetScene.chekhovs_armed ?? []),
        ...(targetScene.chekhovs_fired ?? []),
      ];

      if (!sceneChekhovRefs.includes(c.id)) {
        warnings.push({
          rule: 'INTENT_MISMATCH',
          severity: 'warning',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" targets scene "${c.intent_target}" but that scene doesn't reference this Chekhov`,
          details: 'The plan exists but hasn\'t been executed. Update the scene or change the intent target.',
        });
      }
    }
    return warnings;
  },
};

// STALE_CUT: intent: cut but still has active references
const staleCut: Rule = {
  id: 'STALE_CUT',
  defaultSeverity: 'info',
  fn(data) {
    const warnings: LintWarning[] = [];
    for (const c of data.chekhovs) {
      if (c.intent !== 'cut') continue;

      // Check if any scene still references this chekhov
      const referencingScenes: string[] = [];
      for (const s of data.scenes) {
        const refs = [
          ...(s.chekhovs_planted ?? []),
          ...(s.chekhovs_armed ?? []),
          ...(s.chekhovs_fired ?? []),
        ];
        if (refs.includes(c.id)) {
          referencingScenes.push(s.id);
        }
      }

      if (referencingScenes.length > 0) {
        warnings.push({
          rule: 'STALE_CUT',
          severity: 'info',
          file: c._file ?? `chekhovs/${c.id}.md`,
          entity_id: c.id,
          entity_type: 'chekhov',
          message: `"${c.name}" is marked for cut but still referenced in: ${referencingScenes.join(', ')}`,
        });
      }
    }
    return warnings;
  },
};

// UNREVIEWED_INGEST: generated file not yet reviewed
const unreviewedIngest: Rule = {
  id: 'UNREVIEWED_INGEST',
  defaultSeverity: 'info',
  fn(data) {
    const warnings: LintWarning[] = [];
    const allEntities = [
      ...data.scenes.map(s => ({ ...s, _type: 'scene' as const })),
      ...data.characters.map(c => ({ ...c, _type: 'character' as const })),
      ...data.chekhovs.map(c => ({ ...c, _type: 'chekhov' as const })),
      ...data.threads.map(t => ({ ...t, _type: 'thread' as const })),
      ...data.world.map(w => ({ ...w, _type: 'world' as const })),
    ];

    for (const e of allEntities) {
      if (e._generated && e._reviewed === false) {
        warnings.push({
          rule: 'UNREVIEWED_INGEST',
          severity: 'info',
          file: e._file ?? '',
          entity_id: e.id,
          entity_type: e._type,
          message: `"${e.id}" was generated by ingest and has not been reviewed`,
        });
      }
    }
    return warnings;
  },
};

export const chekhovRules: Rule[] = [
  noIntent,
  orphanedChekhov,
  lateArming,
  unarmedPayoff,
  frontLoadedPlant,
  distantPayoff,
  intentMismatch,
  staleCut,
  unreviewedIngest,
];
