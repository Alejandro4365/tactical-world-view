// =================================================================
// Labels
// Shared label placement for every layer (country names, language
// family names). Each frame: labels keep a constant on-screen size,
// far-side labels are dropped, and overlapping labels are resolved
// in favor of the higher-priority one. Zooming in frees up screen
// space, so lower-priority labels appear.
// =================================================================

const labelRegistry = []; // { sprite, layer, priority }
const LABEL_PX_SCALE = 0.5;  // canvas px -> screen px (32px font = 16px on screen)
const LABEL_PADDING_PX = 4;  // minimum gap between two labels

const _lblWorld = new THREE.Vector3();
const _lblView = new THREE.Vector3();
const _lblNdc = new THREE.Vector3();
const _lblToCam = new THREE.Vector3();

function registerLabel(sprite, layer, priority) {
  labelRegistry.push({ sprite, layer, priority });
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

function boxesOverlap(a, b) {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
}

function updateLabels() {
  if (!renderer || !camera) return;
  const el = renderer.domElement;
  const W = el.clientWidth, H = el.clientHeight;
  const tanHalfFov = Math.tan(camera.fov * Math.PI / 360);
  // Back-side culling only applies once the mesh is (almost) a sphere
  const onSphere = morphState.t >= 0.9;
  camera.updateMatrixWorld();

  const candidates = [];
  labelRegistry.forEach((entry) => {
    const s = entry.sprite;
    if (!entry.layer.visible) return;
    s.getWorldPosition(_lblWorld);

    // A label faces the camera when its outward normal (its position,
    // the sphere being centered at the origin) points toward the camera
    if (onSphere) {
      _lblToCam.copy(camera.position).sub(_lblWorld);
      if (_lblWorld.dot(_lblToCam) <= 0) { s.visible = false; return; }
    }

    _lblView.copy(_lblWorld).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_lblView.z;
    if (depth <= camera.near) { s.visible = false; return; }

    _lblNdc.copy(_lblWorld).project(camera);
    if (Math.abs(_lblNdc.x) > 1.1 || Math.abs(_lblNdc.y) > 1.1) { s.visible = false; return; }

    candidates.push({
      sprite: s,
      priority: entry.priority,
      x: (_lblNdc.x * 0.5 + 0.5) * W,
      y: (0.5 - _lblNdc.y * 0.5) * H,
      w: s.userData.pxW * LABEL_PX_SCALE,
      h: s.userData.pxH * LABEL_PX_SCALE,
      // world units covered by one screen pixel at this label's depth
      worldPerPx: (2 * depth * tanHalfFov) / H
    });
  });

  // Greedy placement: highest priority first, skip anything that collides
  candidates.sort((a, b) => b.priority - a.priority);
  const placed = [];
  candidates.forEach((c) => {
    const box = {
      l: c.x - c.w / 2 - LABEL_PADDING_PX, r: c.x + c.w / 2 + LABEL_PADDING_PX,
      t: c.y - c.h / 2 - LABEL_PADDING_PX, b: c.y + c.h / 2 + LABEL_PADDING_PX
    };
    if (placed.some((p) => boxesOverlap(box, p))) { c.sprite.visible = false; return; }
    placed.push(box);
    c.sprite.visible = true;
    // Constant on-screen size regardless of zoom
    c.sprite.scale.set(c.w * c.worldPerPx, c.h * c.worldPerPx, 1);
  });
}