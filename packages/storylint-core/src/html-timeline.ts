import type { ProjectData, Scene, Chekhov } from './types.js';

// ── Layout constants ──

const SPINE_Y = 400;
const SCENE_R = 18;
const SCENE_SPACING = 120;
const BONE_OFFSET_Y = 120;
const BONE_SPACING_Y = 100;
const MARGIN_LEFT = 250;
const MARGIN_TOP = 60;

const CHEKHOV_SYMBOL: Record<string, string> = {
  planted: '○', armed: '◐', fired: '●', subverted: '◑', orphaned: '✕', unwritten: '✎',
};

const CHEKHOV_CSS_COLOR: Record<string, string> = {
  planted: '#3498DB', armed: '#F39C12', fired: '#2ECC71',
  subverted: '#9B59B6', orphaned: '#E74C3C', unwritten: '#1ABC9C',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateFishboneHTML(data: ProjectData): string {
  const threadMap = new Map(data.threads.map(t => [t.id, t]));

  // Assign thread lanes
  const aboveThreads: string[] = [];
  const belowThreads: string[] = [];
  for (const thread of data.threads) {
    if (thread.fishbone_position === 'below') belowThreads.push(thread.id);
    else aboveThreads.push(thread.id);
  }
  if (aboveThreads.length === 0 && belowThreads.length === 0) {
    data.threads.forEach((t, i) => {
      if (i % 2 === 0) aboveThreads.push(t.id);
      else belowThreads.push(t.id);
    });
  }

  const threadY = new Map<string, number>();
  aboveThreads.forEach((id, i) => threadY.set(id, SPINE_Y - BONE_OFFSET_Y - (i * BONE_SPACING_Y)));
  belowThreads.forEach((id, i) => threadY.set(id, SPINE_Y + BONE_OFFSET_Y + (i * BONE_SPACING_Y)));

  // Compute scene positions
  interface ScenePos { x: number; y: number; onSpine: boolean; scene: Scene }
  const positions: ScenePos[] = [];
  let currentX = MARGIN_LEFT;

  for (const scene of data.scenes) {
    const threads = scene.threads ?? [];
    const isSpine = threads.length !== 1 || !threadY.has(threads[0]);
    const y = isSpine ? SPINE_Y : threadY.get(threads[0])!;
    positions.push({ x: currentX, y, onSpine: isSpine, scene });
    currentX += SCENE_SPACING;
  }

  const totalWidth = currentX + MARGIN_LEFT;
  const allYs = positions.map(p => p.y);
  const minY = Math.min(...allYs) - 180;
  const maxY = Math.max(...allYs) + 250;
  const totalHeight = maxY - minY + MARGIN_TOP * 2;
  const yOffset = -minY + MARGIN_TOP;

  // Build SVG elements
  const svgParts: string[] = [];

  // Spine line
  const spinePositions = positions.filter(p => p.onSpine);
  if (spinePositions.length >= 2) {
    const x1 = spinePositions[0].x - 20;
    const x2 = spinePositions[spinePositions.length - 1].x + 20;
    svgParts.push(`<line x1="${x1}" y1="${SPINE_Y + yOffset}" x2="${x2}" y2="${SPINE_Y + yOffset}" stroke="#666" stroke-width="3" stroke-dasharray="none"/>`);
    // Arrow
    svgParts.push(`<polygon points="${x2},${SPINE_Y + yOffset} ${x2 - 10},${SPINE_Y + yOffset - 6} ${x2 - 10},${SPINE_Y + yOffset + 6}" fill="#666"/>`);
  }

  // Bone lines (thread to spine connections)
  for (const pos of positions) {
    if (pos.onSpine) continue;
    // Find nearest spine scene
    let nearest: ScenePos | undefined;
    let minDist = Infinity;
    for (const sp of spinePositions) {
      const d = Math.abs(sp.x - pos.x);
      if (d < minDist) { minDist = d; nearest = sp; }
    }
    if (nearest) {
      const threadId = (pos.scene.threads ?? [])[0];
      const thread = threadMap.get(threadId);
      const color = thread?.color ?? '#999';
      svgParts.push(`<line x1="${nearest.x}" y1="${SPINE_Y + yOffset}" x2="${pos.x}" y2="${pos.y + yOffset}" stroke="${color}" stroke-width="2" opacity="0.5"/>`);
    }
  }

  // Within-thread lines
  const threadScenes = new Map<string, ScenePos[]>();
  for (const pos of positions) {
    if (pos.onSpine) continue;
    const tid = (pos.scene.threads ?? [])[0];
    const list = threadScenes.get(tid) ?? [];
    list.push(pos);
    threadScenes.set(tid, list);
  }
  for (const [tid, scenes] of threadScenes) {
    const thread = threadMap.get(tid);
    const color = thread?.color ?? '#999';
    for (let i = 1; i < scenes.length; i++) {
      svgParts.push(`<line x1="${scenes[i-1].x}" y1="${scenes[i-1].y + yOffset}" x2="${scenes[i].x}" y2="${scenes[i].y + yOffset}" stroke="${color}" stroke-width="2"/>`);
    }
  }

  // Thread labels
  for (const thread of data.threads) {
    const ty = threadY.get(thread.id);
    if (ty === undefined) continue;
    const color = thread.color ?? '#999';
    svgParts.push(`<text x="${MARGIN_LEFT - 20}" y="${ty + yOffset + 5}" text-anchor="end" fill="${color}" font-size="13" font-weight="bold">${esc(thread.name ?? thread.id)}</text>`);
  }

  // Scene nodes
  for (const pos of positions) {
    const s = pos.scene;
    const threads = s.threads ?? [];
    const isConvergence = threads.length >= 2;
    const threadId = threads[0];
    const thread = threadMap.get(threadId);
    const color = isConvergence ? '#F39C12' : (thread?.color ?? '#888');
    const r = isConvergence ? SCENE_R + 4 : SCENE_R;

    svgParts.push(`<g class="scene-node" data-id="${esc(s.id)}">`);
    svgParts.push(`  <circle cx="${pos.x}" cy="${pos.y + yOffset}" r="${r}" fill="${color}" stroke="white" stroke-width="2" opacity="0.9"/>`);
    // Label
    const label = s.title ?? s.id;
    const shortLabel = label.length > 20 ? label.slice(0, 18) + '…' : label;
    const labelY = pos.y + yOffset + r + 16;
    svgParts.push(`  <text x="${pos.x}" y="${labelY}" text-anchor="middle" fill="#eee" font-size="11">${esc(shortLabel)}</text>`);
    svgParts.push(`</g>`);

    // Chekhov markers
    const events: { name: string; status: string }[] = [];
    for (const cId of s.chekhovs_planted ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ name: ch.name ?? ch.id, status: 'planted' });
    }
    for (const cId of s.chekhovs_armed ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ name: ch.name ?? ch.id, status: 'armed' });
    }
    for (const cId of s.chekhovs_fired ?? []) {
      const ch = data.chekhovs.find(c => c.id === cId);
      if (ch) events.push({ name: ch.name ?? ch.id, status: 'fired' });
    }

    events.forEach((ev, i) => {
      const symbol = CHEKHOV_SYMBOL[ev.status] ?? '?';
      const chColor = CHEKHOV_CSS_COLOR[ev.status] ?? '#999';
      const isAbove = pos.y <= SPINE_Y;
      const dir = isAbove ? -1 : 1;
      const markerY = pos.y + yOffset + (dir * (r + 20 + i * 16));
      const shortName = ev.name.length > 22 ? ev.name.slice(0, 20) + '…' : ev.name;
      svgParts.push(`<text x="${pos.x}" y="${markerY}" text-anchor="middle" fill="${chColor}" font-size="10">${symbol} ${esc(shortName)}</text>`);
    });
  }

  // Tension sparkline at bottom
  const tensions = positions.map(p => p.scene.tension ?? 5);
  const sparkY = maxY + yOffset - 40;
  svgParts.push(`<text x="${MARGIN_LEFT - 20}" y="${sparkY}" text-anchor="end" fill="#666" font-size="11">tension</text>`);
  const sparkPoints = positions.map((p, i) => `${p.x},${sparkY - (tensions[i] * 4)}`).join(' ');
  svgParts.push(`<polyline points="${sparkPoints}" fill="none" stroke="#E74C3C" stroke-width="1.5" opacity="0.6"/>`);
  for (let i = 0; i < positions.length; i++) {
    const ty = sparkY - (tensions[i] * 4);
    svgParts.push(`<circle cx="${positions[i].x}" cy="${ty}" r="3" fill="#E74C3C" opacity="0.8"/>`);
  }

  const projectName = data.config.project?.name ?? 'Untitled';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(projectName)} — Fishbone Timeline</title>
<style>
  body { margin: 0; background: #1a1a2e; color: #eee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
  #container { width: 100vw; height: 100vh; overflow: auto; cursor: grab; }
  #container:active { cursor: grabbing; }
  svg { display: block; }
  .scene-node { cursor: pointer; }
  .scene-node:hover circle { stroke: #F39C12; stroke-width: 3; }
  #header { position: fixed; top: 0; left: 0; padding: 16px 24px; background: rgba(26,26,46,0.9); z-index: 10; border-bottom: 1px solid #333; width: 100%; }
  #header h1 { margin: 0; font-size: 18px; }
  #header .legend { margin-top: 6px; font-size: 12px; color: #888; }
  #header .legend span { margin-right: 16px; }
  #tooltip { position: fixed; display: none; background: #16213e; border: 1px solid #444; padding: 10px 14px; border-radius: 6px; font-size: 12px; max-width: 280px; z-index: 20; pointer-events: none; }
  #tooltip .title { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
  #tooltip .detail { color: #aaa; }
</style>
</head>
<body>
<div id="header">
  <h1>${esc(projectName)} — Fishbone Timeline</h1>
  <div class="legend">
    <span style="color:#3498DB">○ planted</span>
    <span style="color:#F39C12">◐ armed</span>
    <span style="color:#2ECC71">● fired</span>
    <span style="color:#9B59B6">◑ subverted</span>
    <span style="color:#E74C3C">✕ orphaned</span>
    <span style="color:#666">— tension curve</span>
  </div>
</div>
<div id="container" style="padding-top: 70px;">
  <svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
    ${svgParts.join('\n    ')}
  </svg>
</div>
<div id="tooltip"></div>
<script>
const sceneData = ${JSON.stringify(positions.map(p => ({
    id: p.scene.id,
    title: p.scene.title ?? p.scene.id,
    threads: p.scene.threads ?? [],
    mood: p.scene.mood ?? [],
    tension: p.scene.tension ?? 5,
    characters: (p.scene.characters ?? []).map(c => typeof c === 'string' ? c : c.id),
  })))};

document.querySelectorAll('.scene-node').forEach(el => {
  const id = el.dataset.id;
  const scene = sceneData.find(s => s.id === id);
  if (!scene) return;

  el.addEventListener('mouseenter', e => {
    const tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = '<div class="title">' + scene.title + '</div>'
      + '<div class="detail">Threads: ' + (scene.threads.join(', ') || 'none') + '</div>'
      + '<div class="detail">Mood: ' + (scene.mood.join(', ') || '—') + '</div>'
      + '<div class="detail">Tension: ' + scene.tension + '/10</div>'
      + '<div class="detail">Characters: ' + (scene.characters.join(', ') || '—') + '</div>';
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
  });

  el.addEventListener('mousemove', e => {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
  });

  el.addEventListener('mouseleave', () => {
    document.getElementById('tooltip').style.display = 'none';
  });
});
</script>
</body>
</html>`;
}
