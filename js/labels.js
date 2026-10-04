// =================================================================
// Labels
// Shared label placement for every layer (country names, language
// family names). Every label on the visible side is always shown;
// each frame the layout shrinks and shifts labels so they don't
// collide. Labels are placed in priority order (family names first,
// then larger countries). Each label takes the first free option:
//   full size in place -> smaller in place -> smaller and nudged away
// If nothing is free, it takes the spot with the least overlap.
// Size and offset are smoothed over frames so labels glide.
// =================================================================

const labelRegistry = []; // { sprite, layer, priority, active, scale, ox, oy }

const LABEL_PX_SCALE = 0.5;   // canvas px -> screen px (32px font = 16px on screen)
const LABEL_PADDING_PX = 3;   // minimum gap between two labels
const LABEL_MIN_SCALE = 0.45; // smallest a label may shrink to (fraction of full size)
const LABEL_SMOOTHING = 0.3;  // 0..1, how fast size/offset follow their target per frame

// [scale, nudge radius]. Nudge radius 0 = stay on the anchor; otherwise
// try 8 directions at that multiple of the label size. Order = preference.
const LABEL_TIERS = [
  [1, 0], [0.8, 0], [0.65, 0], [0.65, 1],
  [0.5, 0], [0.5, 1], [0.5, 1.8],
  [LABEL_MIN_SCALE, 0], [LABEL_MIN_SCALE, 1], [LABEL_MIN_SCALE, 1.8], [LABEL_MIN_SCALE, 2.8]
];
const LABEL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 1], [-0.7, 1], [0.7, -1], [-0.7, -1]];

const _lblWorld = new THREE.Vector3();
const _lblView = new THREE.Vector3();
const _lblNdc = new THREE.Vector3();
const _lblToCam = new THREE.Vector3();

function registerLabel(sprite, layer, priority) {
  labelRegistry.push({ sprite, layer, priority, active: false, scale: 1, ox: 0, oy: 0 });
}

// Absolute polygon area in lon/lat degrees (shoelace). Only used to rank labels.
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

// Total area plus a label anchor (planar vertex average of the largest outer ring).
function polygonsStats(polygons) {
  let area = 0, bestArea = -1, best = null;
  polygons.forEach((rings) => {
    const outer = rings[0];
    if (!outer || outer.length < 2) return;
    const a = ringArea(outer);
    area += a;
    if (a > bestArea) { bestArea = a; best = outer; }
  });
  if (!best) return null;
  let lon = 0, lat = 0;
  best.forEach((p) => { lon += p[0]; lat += p[1]; });
  return { area, centroid: [lon / best.length, lat / best.length] };
}

// Lerps every label sprite between its stored flat and sphere positions.
function applyLabelMorph(labelGroup, t) {
  labelGroup.children.forEach((sprite) => {
    const f = sprite.userData.flatPos, s = sprite.userData.spherePos;
    sprite.position.set(
      f.x + (s.x - f.x) * t,
      f.y + (s.y - f.y) * t,
      f.z + (s.z - f.z) * t
    );
  });
}

function labelBox(cx, cy, w, h) {
  const hw = w / 2 + LABEL_PADDING_PX, hh = h / 2 + LABEL_PADDING_PX;
  return { l: cx - hw, r: cx + hw, t: cy - hh, b: cy + hh };
}

// Total overlap area between a box and everything already placed (0 = free)
function overlapAmount(box, placed) {
  let total = 0;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const w = Math.min(box.r, p.r) - Math.max(box.l, p.l);
    if (w <= 0) continue;
    const h = Math.min(box.b, p.b) - Math.max(box.t, p.t);
    if (h > 0) total += w * h;
  }
  return total;
}

// Best (scale, offset) for one label given the boxes already placed.
function chooseLabelPlacement(c, placed) {
  let best = null, bestOverlap = Infinity;

  for (const [scale, radius] of LABEL_TIERS) {
    const w = c.baseW * scale, h = c.baseH * scale;
    const tries = radius === 0 ? 1 : LABEL_DIRS.length;

    for (let k = 0; k < tries; k++) {
      const dx = radius === 0 ? 0 : LABEL_DIRS[k][0] * radius * w * 0.55;
      const dy = radius === 0 ? 0 : LABEL_DIRS[k][1] * radius * h * 1.1;
      const box = labelBox(c.x + dx, c.y + dy, w, h);
      const overlap = overlapAmount(box, placed);

      if (overlap === 0) return { scale, dx, dy, box };
      // Nothing free yet: remember the least-bad spot (earlier = larger wins ties)
      if (overlap < bestOverlap) { bestOverlap = overlap; best = { scale, dx, dy, box }; }
    }
  }
  return best;
}

function updateLabels() {
  if (!renderer || !camera) return;
  const el = renderer.domElement;
  const W = el.clientWidth, H = el.clientHeight;
  const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
  // Far-side culling only applies once the mesh is (almost) a sphere
  const onSphere = morphState.t >= 0.9;
  camera.updateMatrixWorld();

  const candidates = [];
  labelRegistry.forEach((entry) => {
    const s = entry.sprite;
    if (!entry.layer.visible) { entry.active = false; return; }
    s.getWorldPosition(_lblWorld);

    // A label faces the camera when its outward normal (its position,
    // the sphere being centered at the origin) points toward the camera.
    // Labels on the far side are behind the planet, so they can't be shown.
    if (onSphere) {
      _lblToCam.copy(camera.position).sub(_lblWorld);
      if (_lblWorld.dot(_lblToCam) <= 0) { s.visible = false; entry.active = false; return; }
    }

    _lblView.copy(_lblWorld).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_lblView.z;
    if (depth <= camera.near) { s.visible = false; entry.active = false; return; }

    _lblNdc.copy(_lblWorld).project(camera);
    if (Math.abs(_lblNdc.x) > 1.1 || Math.abs(_lblNdc.y) > 1.1) { s.visible = false; entry.active = false; return; }

    candidates.push({
      entry,
      x: (_lblNdc.x * 0.5 + 0.5) * W,
      y: (0.5 - _lblNdc.y * 0.5) * H,
      baseW: s.userData.pxW * LABEL_PX_SCALE,
      baseH: s.userData.pxH * LABEL_PX_SCALE,
      // world units covered by one screen pixel at this label's depth
      worldPerPx: (2 * depth * tanHalfFov) / H
    });
  });

  // Highest priority first: it gets the best spot, the rest flow around it
  candidates.sort((a, b) => b.entry.priority - a.entry.priority);

  const placed = [];
  candidates.forEach((c) => {
    const target = chooseLabelPlacement(c, placed);
    placed.push(target.box);

    const e = c.entry;
    if (!e.active) {
      // Just became visible: snap, don't glide in from stale values
      e.active = true;
      e.scale = target.scale; e.ox = target.dx; e.oy = target.dy;
    } else {
      e.scale += (target.scale - e.scale) * LABEL_SMOOTHING;
      e.ox += (target.dx - e.ox) * LABEL_SMOOTHING;
      e.oy += (target.dy - e.oy) * LABEL_SMOOTHING;
    }

    const w = c.baseW * e.scale, h = c.baseH * e.scale;
    const s = e.sprite;
    s.visible = true;
    // Constant on-screen size regardless of zoom (times the shrink factor)
    s.scale.set(w * c.worldPerPx, h * c.worldPerPx, 1);
    // Sprite pivot shifts the quad on screen: right by ox, down by oy (px)
    s.center.set(0.5 - e.ox / w, 0.5 + e.oy / h);
  });
}