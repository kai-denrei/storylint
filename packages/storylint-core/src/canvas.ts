import type { ProjectData, Scene, Chekhov } from './types.js';

// ── Canvas JSON types ──

interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  color?: string;
  label?: string;
}

interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  toEnd?: 'none' | 'arrow';
  fromEnd?: 'none' | 'arrow';
  color?: string;
  label?: string;
}

interface Canvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ── Layout constants ──

const SPINE_Y = 0;
const SCENE_W = 220;
const SCENE_H = 80;
const SCENE_SPACING = 300;
const BONE_OFFSET_Y = 180;      // vertical distance from spine to thread lane
const BONE_SPACING_Y = 160;     // spacing between stacked thread lanes
const CHEKHOV_W = 160;
const CHEKHOV_H = 40;
const CHEKHOV_OFFSET_Y = 50;    // offset below/above scene node
const THREAD_LABEL_W = 200;
const THREAD_LABEL_H = 50;

// ── Chekhov status symbols and colors ──

const CHEKHOV_SYMBOL: Record<string, string> = {
  planted: '○',
  armed: '◐',
  fired: '●',
  subverted: '◑',
  orphaned: '✕',
  unwritten: '✎',
};

const CHEKHOV_COLOR: Record<string, string> = {
  planted: '5',    // cyan
  armed: '3',      // yellow
  fired: '4',      // green
  subverted: '6',  // purple
  orphaned: '1',   // red
  unwritten: '5',  // cyan
};

// ── Helpers ──

function sceneId(scene: Scene): string {
  return `scene-${scene.id}`;
}

function getSceneThreads(scene: Scene): string[] {
  return scene.threads ?? [];
}

function isSpineScene(scene: Scene, threadCount: Map<string, number>): boolean {
  const threads = getSceneThreads(scene);
  if (threads.length === 0) return true;  // orphan scenes go on spine
  if (threads.length >= 2) return true;   // convergence = spine
  return false;
}

// ── Main generator ──

export function generateFishboneCanvas(data: ProjectData): string {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  let edgeCounter = 0;

  const nextEdgeId = () => `edge-${++edgeCounter}`;

  // Count how many scenes each thread has
  const threadSceneCount = new Map<string, number>();
  for (const scene of data.scenes) {
    for (const t of getSceneThreads(scene)) {
      threadSceneCount.set(t, (threadSceneCount.get(t) ?? 0) + 1);
    }
  }

  // Assign thread lanes: above threads get positive Y offset, below get negative
  const aboveThreads: string[] = [];
  const belowThreads: string[] = [];

  for (const thread of data.threads) {
    if (thread.fishbone_position === 'below') {
      belowThreads.push(thread.id);
    } else {
      aboveThreads.push(thread.id);
    }
  }

  // If no position specified, auto-alternate
  if (aboveThreads.length === 0 && belowThreads.length === 0) {
    data.threads.forEach((t, i) => {
      if (i % 2 === 0) aboveThreads.push(t.id);
      else belowThreads.push(t.id);
    });
  }

  // Compute Y position for each thread lane
  const threadY = new Map<string, number>();
  aboveThreads.forEach((id, i) => {
    threadY.set(id, SPINE_Y - BONE_OFFSET_Y - (i * BONE_SPACING_Y));
  });
  belowThreads.forEach((id, i) => {
    threadY.set(id, SPINE_Y + BONE_OFFSET_Y + SCENE_H + (i * BONE_SPACING_Y));
  });

  // Get thread metadata
  const threadMap = new Map(data.threads.map(t => [t.id, t]));

  // ── Place scenes ──

  // Track which scenes are on the spine vs on a bone
  const scenePositions = new Map<string, { x: number; y: number; onSpine: boolean }>();

  // First pass: determine spine vs bone for each scene
  const spineScenes: Scene[] = [];
  const boneScenes = new Map<string, Scene[]>(); // threadId -> scenes exclusive to that thread

  for (const scene of data.scenes) {
    const threads = getSceneThreads(scene);
    if (threads.length !== 1 || !threadY.has(threads[0])) {
      spineScenes.push(scene);
    } else {
      const threadId = threads[0];
      const list = boneScenes.get(threadId) ?? [];
      list.push(scene);
      boneScenes.set(threadId, list);
    }
  }

  // Place spine scenes evenly along X axis
  // We need to interleave: for each scene in rank order, if it's spine, place on spine.
  // If it's bone-only, we still need to advance X to maintain rank ordering.
  let currentX = 0;

  for (const scene of data.scenes) {
    const threads = getSceneThreads(scene);
    const isSpine = threads.length !== 1 || !threadY.has(threads[0]);

    if (isSpine) {
      // Spine scene
      const x = currentX;
      const y = SPINE_Y;
      scenePositions.set(scene.id, { x, y, onSpine: true });

      const thread = threads.length > 0 ? threadMap.get(threads[0]) : undefined;
      nodes.push({
        id: sceneId(scene),
        type: 'file',
        file: `scenes/${scene.id}.md`,
        x,
        y,
        width: SCENE_W,
        height: SCENE_H,
        color: threads.length >= 2 ? '3' : undefined, // yellow for convergence
      });
    } else {
      // Bone scene — place at the thread's Y lane
      const threadId = threads[0];
      const ty = threadY.get(threadId)!;
      const thread = threadMap.get(threadId);

      scenePositions.set(scene.id, { x: currentX, y: ty, onSpine: false });

      nodes.push({
        id: sceneId(scene),
        type: 'file',
        file: `scenes/${scene.id}.md`,
        x: currentX,
        y: ty,
        width: SCENE_W,
        height: SCENE_H,
        color: thread?.color,
      });
    }

    currentX += SCENE_SPACING;
  }

  // ── Spine edges (connect consecutive spine scenes) ──

  const spineOrder = data.scenes.filter(s => {
    const pos = scenePositions.get(s.id);
    return pos?.onSpine;
  });

  for (let i = 1; i < spineOrder.length; i++) {
    edges.push({
      id: nextEdgeId(),
      fromNode: sceneId(spineOrder[i - 1]),
      fromSide: 'right',
      toNode: sceneId(spineOrder[i]),
      toSide: 'left',
      toEnd: 'arrow',
      color: '#888888',
    });
  }

  // ── Bone edges (connect bone scenes to nearest spine scene) ──

  for (const scene of data.scenes) {
    const pos = scenePositions.get(scene.id)!;
    if (pos.onSpine) continue;

    // Find nearest spine scene before or at this position
    let nearestSpine: Scene | undefined;
    let minDist = Infinity;
    for (const sp of spineOrder) {
      const spPos = scenePositions.get(sp.id)!;
      const dist = Math.abs(spPos.x - pos.x);
      if (dist < minDist) {
        minDist = dist;
        nearestSpine = sp;
      }
    }

    if (nearestSpine) {
      const isAbove = pos.y < SPINE_Y;
      const thread = threadMap.get(getSceneThreads(scene)[0]);
      edges.push({
        id: nextEdgeId(),
        fromNode: sceneId(nearestSpine),
        fromSide: isAbove ? 'top' : 'bottom',
        toNode: sceneId(scene),
        toSide: isAbove ? 'bottom' : 'top',
        toEnd: 'none',
        fromEnd: 'none',
        color: thread?.color,
      });
    }
  }

  // ── Thread within-bone edges (connect consecutive bone scenes in same thread) ──

  for (const [threadId, scenes] of boneScenes) {
    const thread = threadMap.get(threadId);
    for (let i = 1; i < scenes.length; i++) {
      edges.push({
        id: nextEdgeId(),
        fromNode: sceneId(scenes[i - 1]),
        fromSide: 'right',
        toNode: sceneId(scenes[i]),
        toSide: 'left',
        toEnd: 'arrow',
        color: thread?.color,
      });
    }
  }

  // ── Thread labels ──

  for (const thread of data.threads) {
    const ty = threadY.get(thread.id);
    if (ty === undefined) continue;

    // Place label to the left of the first scene in this thread
    const firstScene = data.scenes.find(s => getSceneThreads(s).includes(thread.id));
    if (!firstScene) continue;
    const firstPos = scenePositions.get(firstScene.id);
    if (!firstPos) continue;

    nodes.push({
      id: `thread-label-${thread.id}`,
      type: 'text',
      text: `**${thread.name ?? thread.id}**`,
      x: firstPos.x - THREAD_LABEL_W - 40,
      y: ty + (SCENE_H - THREAD_LABEL_H) / 2,
      width: THREAD_LABEL_W,
      height: THREAD_LABEL_H,
      color: thread.color,
    });
  }

  // ── Chekhov markers ──

  // Collect all chekhov events per scene
  const chekhovEvents = new Map<string, { chekhov: Chekhov; status: string }[]>();

  for (const scene of data.scenes) {
    const events: { chekhov: Chekhov; status: string }[] = [];

    for (const cId of scene.chekhovs_planted ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ chekhov: ch, status: 'planted' });
    }
    for (const cId of scene.chekhovs_armed ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ chekhov: ch, status: 'armed' });
    }
    for (const cId of scene.chekhovs_fired ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ chekhov: ch, status: 'fired' });
    }

    if (events.length > 0) {
      chekhovEvents.set(scene.id, events);
    }
  }

  for (const [sid, events] of chekhovEvents) {
    const pos = scenePositions.get(sid);
    if (!pos) continue;

    // Stack chekhov markers below (if spine/above) or above (if below spine) the scene
    const isAboveSpine = pos.y <= SPINE_Y;
    const markerDirection = isAboveSpine ? 1 : -1; // 1 = place below node, -1 = place above

    events.forEach((event, i) => {
      const symbol = CHEKHOV_SYMBOL[event.status] ?? '?';
      const color = CHEKHOV_COLOR[event.status] ?? '5';
      const markerY = pos.y + (markerDirection * (SCENE_H + 10 + (i * (CHEKHOV_H + 5))));

      const markerId = `chekhov-${sid}-${event.chekhov.id}-${event.status}`;

      nodes.push({
        id: markerId,
        type: 'text',
        text: `${symbol} ${event.chekhov.name ?? event.chekhov.id}`,
        x: pos.x + 10,
        y: markerY,
        width: CHEKHOV_W,
        height: CHEKHOV_H,
        color,
      });
    });
  }

  // ── Title node ──

  const projectName = data.config.project?.name ?? 'Untitled';
  nodes.unshift({
    id: 'title',
    type: 'text',
    text: `# ${projectName}\n**Fishbone Timeline**\n\n○ planted  ◐ armed  ● fired  ✕ orphaned`,
    x: -THREAD_LABEL_W - 80,
    y: SPINE_Y - 60,
    width: THREAD_LABEL_W + 40,
    height: 120,
  });

  const canvas: Canvas = { nodes, edges };
  return JSON.stringify(canvas, null, 2);
}
