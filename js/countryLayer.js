// =================================================================
// Country borders / names layer
// (Border lines and name labels only, no fill.)
// =================================================================

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 32;
  ctx.font = fontSize + 'px Segoe UI, sans-serif';
  const textWidth = Math.ceil(ctx.measureText(text).width);
  // Just enough padding for the stroke outline below
  const padding = 6;
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding * 2;
  ctx.font = fontSize + 'px Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';

  // Dark outline keeps text legible over light and dark areas
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(2, 6, 17, 0.85)';
  ctx.strokeText(text, padding, canvas.height / 2);

  ctx.fillStyle = '#eaf6ff';
  ctx.fillText(text, padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.085;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
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

    let largestRingLen = -1;
    let largestRingCentroid = null;

    polygons.forEach((rings) => {
      // Border: every ring as a closed line loop
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

      // Planar-average centroid of the largest outer ring for label placement
      const outer = rings[0];
      if (outer && outer.length > largestRingLen) {
        largestRingLen = outer.length;
        let sLon = 0, sLat = 0;
        outer.forEach((pt) => { sLon += pt[0]; sLat += pt[1]; });
        largestRingCentroid = [sLon / outer.length, sLat / outer.length];
      }
    });

    if (largestRingCentroid) {
      const cProj = projectLonLat(largestRingCentroid[0], largestRingCentroid[1], SPHERE_LABEL_RADIUS);
      cProj.flat.z = FLAT_LABEL_Z;
      labelData.push({ name, flat: cProj.flat, sphere: cProj.sphere });
    }
  });

  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(borderSpherePositions), 3));
  const borderMaterial = new THREE.LineBasicMaterial({ color: COUNTRY_BORDER_COLOR, transparent: true, opacity: 0.85 });
  const borderLines = new THREE.LineSegments(borderGeometry, borderMaterial);
  borderLines.userData.flatPositions = new Float32Array(borderFlatPositions);
  borderLines.userData.spherePositions = new Float32Array(borderSpherePositions);

  const labelGroup = new THREE.Group();
  labelData.forEach(({ name, flat, sphere }) => {
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
  const labelGroup = countryLayer.userData.labelGroup;

  lerpBufferPositions(borderLines.geometry.attributes.position, borderLines.userData.flatPositions, borderLines.userData.spherePositions, t);

  labelGroup.children.forEach((sprite) => {
    const f = sprite.userData.flatPos, s = sprite.userData.spherePos;
    sprite.position.set(
      f.x + (s.x - f.x) * t,
      f.y + (s.y - f.y) * t,
      f.z + (s.z - f.z) * t
    );
  });
}

function toggleBordersLayer(checked) {
  if (countryLayer) countryLayer.visible = checked;
}

const _labelWorld = new THREE.Vector3();
const _toCamera = new THREE.Vector3();

// Hides labels on the far side of the globe. A label faces the camera
// when its outward normal (its world position, since the sphere is
// centered at the origin) points toward the camera.
// Skipped while the map is flat or mid-morph so labels stay visible there.
function updateLabelVisibility() {
  if (!countryLayer) return;
  const labels = countryLayer.userData.labelGroup.children;

  if (morphState.t < 0.9) {
    labels.forEach((s) => { s.visible = true; });
    return;
  }

  labels.forEach((s) => {
    s.getWorldPosition(_labelWorld);
    _toCamera.copy(camera.position).sub(_labelWorld);
    s.visible = _labelWorld.dot(_toCamera) > 0;
  });
}

async function loadCountries() {
  const statusEl = document.getElementById('borders-status');
  try {
    const res = await fetch(COUNTRIES_GEOJSON_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const geojson = await res.json();
    buildCountryLayer(geojson);
    document.getElementById('borders-toggle').disabled = false;
    if (statusEl) statusEl.textContent = geojson.features.length + ' countries loaded';
  } catch (err) {
    console.error('Failed to load country border data:', err);
    if (statusEl) statusEl.textContent = 'Border data unavailable';
  }
}