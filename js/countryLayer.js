// =================================================================
// Country borders / names layer
// (Border lines and name labels only, no fill. Label size and
// collisions are handled per frame in labels.js.)
// =================================================================

function makeLabelSprite(text, { fontSize = 32, fill = '#eaf6ff', bold = false } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = (bold ? 'bold ' : '') + fontSize + 'px Segoe UI, sans-serif';
  ctx.font = font;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  // Just enough padding for the stroke outline below
  const padding = 6;
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;
  ctx.font = font;
  ctx.textBaseline = 'middle';

  // Dark outline keeps text legible over light and dark areas
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(2, 6, 17, 0.85)';
  ctx.strokeText(text, padding, canvas.height / 2);

  ctx.fillStyle = fill;
  ctx.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  // Real scale is set every frame by updateLabels(); the canvas size is what it reads
  sprite.userData.pxW = canvas.width;
  sprite.userData.pxH = canvas.height;
  return sprite;
}

function buildCountryLayer(geojson) {
  const borderFlatPositions = [];
  const borderSpherePositions = [];
  const labelData = [];

  geojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const name = props.name || props.ADMIN || props.admin || 'Unknown';
    const geom = feature.geometry;
    if (!geom) return;
    const polygons = geom.type === 'Polygon' ? [geom.coordinates]
                    : geom.type === 'MultiPolygon' ? geom.coordinates
                    : null;
    if (!polygons) return;

    // Border: every ring as a closed line loop
    polygons.forEach((rings) => {
      rings.forEach((ring) => {
        for (let i = 0; i < ring.length; i++) {
          const p1src = ring[i];
          const p2src = ring[(i + 1) % ring.length];
          const p1 = projectLonLat(p1src[0], p1src[1], SPHERE_BORDER_RADIUS);
          const p2 = projectLonLat(p2src[0], p2src[1], SPHERE_BORDER_RADIUS);
          borderFlatPositions.push(p1.flat.x, p1.flat.y, FLAT_BORDER_Z, p2.flat.x, p2.flat.y, FLAT_BORDER_Z);
          borderSpherePositions.push(p1.sphere.x, p1.sphere.y, p1.sphere.z, p2.sphere.x, p2.sphere.y, p2.sphere.z);
        }
      });
    });

    const stats = polygonsStats(polygons);
    if (!stats) return;
    const cProj = projectLonLat(stats.centroid[0], stats.centroid[1], SPHERE_LABEL_RADIUS);
    cProj.flat.z = FLAT_LABEL_Z;
    labelData.push({ name, flat: cProj.flat, sphere: cProj.sphere, area: stats.area });
  });

  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(borderSpherePositions), 3));
  const borderMaterial = new THREE.LineBasicMaterial({ color: COUNTRY_BORDER_COLOR, transparent: true, opacity: 0.85 });
  const borderLines = new THREE.LineSegments(borderGeometry, borderMaterial);
  borderLines.userData.flatPositions = new Float32Array(borderFlatPositions);
  borderLines.userData.spherePositions = new Float32Array(borderSpherePositions);

  const labelGroup = new THREE.Group();
  labelData.forEach(({ name, flat, sphere, area }) => {
    const sprite = makeLabelSprite(name);
    sprite.position.set(sphere.x, sphere.y, sphere.z);
    sprite.userData.flatPos = flat;
    sprite.userData.spherePos = sphere;
    labelGroup.add(sprite);
  });

  countryLayer = new THREE.Group();
  countryLayer.userData.borderLines = borderLines;
  countryLayer.userData.labelGroup = labelGroup;
  countryLayer.add(borderLines, labelGroup);
  countryLayer.visible = document.getElementById('borders-toggle').checked;

  // Larger countries win label collisions
  labelGroup.children.forEach((sprite, i) => registerLabel(sprite, countryLayer, labelData[i].area));

  mesh.add(countryLayer); // inherits the mesh's rotation (auto-spin)
  applyCountryMorph(morphState.t);
}

function lerpBufferPositions(attr, flatArr, sphereArr, t) {
  const arr = attr.array;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = flatArr[i] + (sphereArr[i] - flatArr[i]) * t;
  }
  attr.needsUpdate = true;
}

function applyCountryMorph(t) {
  if (!countryLayer) return;
  const borderLines = countryLayer.userData.borderLines;
  lerpBufferPositions(borderLines.geometry.attributes.position, borderLines.userData.flatPositions, borderLines.userData.spherePositions, t);
  applyLabelMorph(countryLayer.userData.labelGroup, t);
}

function toggleBordersLayer(checked) {
  if (countryLayer) countryLayer.visible = checked;
}

async function loadCountries() {
  const statusEl = document.getElementById('borders-status');
  const langStatusEl = document.getElementById('language-status');

  let geojson;
  try {
    const res = await fetch(COUNTRIES_GEOJSON_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    geojson = await res.json();
    buildCountryLayer(geojson);
    document.getElementById('borders-toggle').disabled = false;
    if (statusEl) statusEl.textContent = geojson.features.length + ' countries loaded';
  } catch (err) {
    console.error('Failed to load country border data:', err);
    if (statusEl) statusEl.textContent = 'Border data unavailable';
    if (langStatusEl) langStatusEl.textContent = 'Needs country data';
    return;
  }

  // Separate try: a language-layer bug must not report the borders as broken
  try {
    buildLanguageLayer(geojson);
    document.getElementById('language-toggle').disabled = false;
    if (langStatusEl) langStatusEl.textContent = 'Country-level approximation';
  } catch (err) {
    console.error('Failed to build language families layer:', err);
    if (langStatusEl) langStatusEl.textContent = 'Language layer unavailable';
  }
}