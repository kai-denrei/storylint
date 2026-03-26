import type { ProjectData, LintWarning } from '../types.js';
import type { Rule } from './engine.js';
import { getThreshold } from './engine.js';

const HIGH_TENSION_MOODS = new Set([
  'tense', 'confrontation', 'violent', 'urgent', 'panic',
  'threatening', 'aggressive', 'hostile', 'intense', 'desperate',
]);

const LOW_TENSION_MOODS = new Set([
  'calm', 'peaceful', 'reflective', 'sanctuary', 'warm',
  'hopeful', 'quiet', 'intimate', 'gentle', 'safe',
]);

function isHighTension(scene: ProjectData['scenes'][0]): boolean {
  if (scene.tension !== undefined) return scene.tension >= 7;
  return (scene.mood ?? []).some(m => HIGH_TENSION_MOODS.has(m.toLowerCase()));
}

function isLowTension(scene: ProjectData['scenes'][0]): boolean {
  if (scene.tension !== undefined) return scene.tension <= 3;
  return (scene.mood ?? []).some(m => LOW_TENSION_MOODS.has(m.toLowerCase()));
}

// PACING_CLUSTER: too many consecutive high-tension scenes
const pacingCluster: Rule = {
  id: 'PACING_CLUSTER',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'PACING_CLUSTER', 3);
    const warnings: LintWarning[] = [];

    let runStart = -1;
    let runLength = 0;

    for (let i = 0; i < data.scenes.length; i++) {
      if (isHighTension(data.scenes[i])) {
        if (runStart < 0) runStart = i;
        runLength++;
      } else {
        if (runLength >= threshold) {
          const startScene = data.scenes[runStart];
          const endScene = data.scenes[runStart + runLength - 1];
          warnings.push({
            rule: 'PACING_CLUSTER',
            severity: 'warning',
            file: startScene._file ?? `scenes/${startScene.id}.md`,
            entity_id: startScene.id,
            entity_type: 'scene',
            message: `${runLength} consecutive high-tension scenes (${startScene.title ?? startScene.id} through ${endScene.title ?? endScene.id}) with no cooldown`,
          });
        }
        runStart = -1;
        runLength = 0;
      }
    }
    // Check trailing run
    if (runLength >= threshold) {
      const startScene = data.scenes[runStart];
      const endScene = data.scenes[runStart + runLength - 1];
      warnings.push({
        rule: 'PACING_CLUSTER',
        severity: 'warning',
        file: startScene._file ?? `scenes/${startScene.id}.md`,
        entity_id: startScene.id,
        entity_type: 'scene',
        message: `${runLength} consecutive high-tension scenes (${startScene.title ?? startScene.id} through ${endScene.title ?? endScene.id}) with no cooldown`,
      });
    }

    return warnings;
  },
};

// NO_COOLDOWN: no low-tension scene in a long span
const noCooldown: Rule = {
  id: 'NO_COOLDOWN',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'NO_COOLDOWN', 10);
    const warnings: LintWarning[] = [];

    let sinceLastCooldown = 0;
    let spanStart = 0;

    for (let i = 0; i < data.scenes.length; i++) {
      if (isLowTension(data.scenes[i])) {
        sinceLastCooldown = 0;
        spanStart = i + 1;
      } else {
        sinceLastCooldown++;
        if (sinceLastCooldown === threshold) {
          warnings.push({
            rule: 'NO_COOLDOWN',
            severity: 'warning',
            file: data.scenes[spanStart]._file ?? '',
            entity_id: data.scenes[spanStart].id,
            entity_type: 'scene',
            message: `${threshold} scenes without a low-tension moment (scenes ${spanStart + 1} through ${i + 1})`,
          });
        }
      }
    }
    return warnings;
  },
};

// THREAD_DOMINANCE: one thread appears in too many scenes
const threadDominance: Rule = {
  id: 'THREAD_DOMINANCE',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'THREAD_DOMINANCE', 0.70);
    const warnings: LintWarning[] = [];
    if (data.scenes.length === 0) return warnings;

    const threadCounts = new Map<string, number>();
    for (const scene of data.scenes) {
      for (const t of scene.threads ?? []) {
        threadCounts.set(t, (threadCounts.get(t) ?? 0) + 1);
      }
    }

    for (const [threadId, count] of threadCounts) {
      const pct = count / data.scenes.length;
      if (pct > threshold) {
        const thread = data.threads.find(t => t.id === threadId);
        warnings.push({
          rule: 'THREAD_DOMINANCE',
          severity: 'warning',
          file: thread?._file ?? `threads/${threadId}.md`,
          entity_id: threadId,
          entity_type: 'thread',
          message: `"${thread?.name ?? threadId}" appears in ${Math.round(pct * 100)}% of scenes — other threads may feel underdeveloped`,
        });
      }
    }
    return warnings;
  },
};

// THREAD_DROUGHT: active thread goes too long without a scene
const threadDrought: Rule = {
  id: 'THREAD_DROUGHT',
  defaultSeverity: 'warning',
  fn(data) {
    const threshold = getThreshold(data.config, 'THREAD_DROUGHT', 8);
    const warnings: LintWarning[] = [];

    for (const thread of data.threads) {
      if (thread.status === 'resolved' || thread.status === 'dormant') continue;

      const sceneIndices: number[] = [];
      for (let i = 0; i < data.scenes.length; i++) {
        if ((data.scenes[i].threads ?? []).includes(thread.id)) {
          sceneIndices.push(i);
        }
      }

      for (let i = 1; i < sceneIndices.length; i++) {
        const gap = sceneIndices[i] - sceneIndices[i - 1];
        if (gap > threshold) {
          warnings.push({
            rule: 'THREAD_DROUGHT',
            severity: 'warning',
            file: thread._file ?? `threads/${thread.id}.md`,
            entity_id: thread.id,
            entity_type: 'thread',
            message: `"${thread.name}" has a ${gap}-scene gap between scenes ${sceneIndices[i - 1] + 1} and ${sceneIndices[i] + 1}`,
          });
        }
      }
    }
    return warnings;
  },
};

// SCENE_LENGTH_MISMATCH: scene body significantly longer/shorter than average
const sceneLengthMismatch: Rule = {
  id: 'SCENE_LENGTH_MISMATCH',
  defaultSeverity: 'info',
  fn(data) {
    const warnings: LintWarning[] = [];
    const lengths = data.scenes.map(s => (s._body ?? '').length);
    if (lengths.length < 3) return warnings;

    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (avg === 0) return warnings;

    for (let i = 0; i < data.scenes.length; i++) {
      const ratio = lengths[i] / avg;
      const scene = data.scenes[i];

      if (ratio > 3) {
        warnings.push({
          rule: 'SCENE_LENGTH_MISMATCH',
          severity: 'info',
          file: scene._file ?? `scenes/${scene.id}.md`,
          entity_id: scene.id,
          entity_type: 'scene',
          message: `"${scene.title ?? scene.id}" is ${ratio.toFixed(1)}x longer than average — consider splitting`,
        });
      } else if (ratio < 0.2 && lengths[i] > 0) {
        warnings.push({
          rule: 'SCENE_LENGTH_MISMATCH',
          severity: 'info',
          file: scene._file ?? `scenes/${scene.id}.md`,
          entity_id: scene.id,
          entity_type: 'scene',
          message: `"${scene.title ?? scene.id}" is ${ratio.toFixed(1)}x shorter than average — may feel underdeveloped`,
        });
      }
    }
    return warnings;
  },
};

export const pacingRules: Rule[] = [
  pacingCluster,
  noCooldown,
  threadDominance,
  threadDrought,
  sceneLengthMismatch,
];
