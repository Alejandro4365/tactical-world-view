// =================================================================
// Country borders / fills / names layer
// =================================================================

function hashColorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const color = new THREE.Color();
  color.setHSL((hash % 360) / 360, 0.5, 0.52);
  return color;
}

function makeLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 32;
  ctx.font = fontSize + 'px Segoe UI, sans-serif';
  const textWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = textWidth + 20;
  canvas.height = fontSize + 14;
  ctx.font = fontSize + 'px Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(2, 6, 17, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eaf6ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.085;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  return sprite;
}

function buildCountryLayer(geojson) {
  const fillFlatPositions = [];
  const fillSpherePositions = [];
  const fillColors = [];
  const fillIndices = [];
  const borderFlatPositions = [];
  const borderSpherePositions = [];
  const labelData = [];

  let vertexOffset = 0;

  geojson.features.forEach((feature) => {
    const props = feature.properties || {};
    const name = props.name || props.ADMIN || props.admin || 'Unknown';
    const geom = feature.geometry;
    if (!geom) return;
    const polygons = geom.type === 'Polygon' ? [geom.coordinates]
                    : geom.type === 'MultiPolygon' ? geom.coordinates
                    : null;
    if (!polygons) return;

    const color = hashColorForName(name);
    let largestRingLen = -1;
    let largestRingCentroid = null;

    polygons.forEach((rings) => {
      // --- Fill: triangulate outer + hole rings with earcut ---
      const flat2D = [];
      const holeIndices = [];
      rings.forEach((ring, ringIdx) => {
        if (ringIdx > 0) holeIndices.push(flat2D.length / 2);
        ring.forEach((pt) => { flat2D.push(pt[0], pt[1]); });
      });

      if (flat2D.length >= 6) {
        const triangleIndices = earcut(flat2D, holeIndices.length ? holeIndices : undefined);
        const localVertexCount = flat2D.length / 2;
        for (let i = 0; i < localVertexCount; i++) {
          const lon = flat2D[i * 2];
          const lat = flat2D[i * 2 + 1];
          const p = projectLonLat(lon, lat, SPHERE_FILL_RADIUS);
          fillFlatPositions.push(p.flat.x, p.flat.y, FLAT_FILL_Z);
          fillSpherePositions.push(p.sphere.x, p.sphere.y, p.sphere.z);
          fillColors.push(color.r, color.g, color.b);
        }
        for (let i = 0; i < triangleIndices.length; i++) {
          fillIndices.push(vertexOffset + triangleIndices[i]);
        }
        vertexOffset += localVertexCount;
      }

      // --- Border: every ring as a closed line loop ---
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

      // Track a simple planar-average centroid of the largest ring
      // (outer boundary) for label placement.
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

  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setIndex(fillIndices);
  fillGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fillSpherePositions), 3));
  fillGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fillColors), 3));
  const fillMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: COUNTRY_FILL_OPACITY,
    side: THREE.DoubleSide, depthWrite: false
  });
  const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
  fillMesh.userData.flatPositions = new Float32Array(fillFlatPositions);
  fillMesh.userData.spherePositions = new Float32Array(fillSpherePositions);

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
  countryLayer.userData.fillMesh = fillMesh;
  countryLayer.userData.borderLines = borderLines;
  countryLayer.userData.labelGroup = labelGroup;
  countryLayer.add(fillMesh, borderLines, labelGroup);
  countryLayer.visible = document.getElementById('borders-toggle').checked;

  mesh.add(countryLayer); // inherits mesh's own rotation (auto-spin) automatically
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
  const fillMesh = countryLayer.userData.fillMesh;
  const borderLines = countryLayer.userData.borderLines;
  const labelGroup = countryLayer.userData.labelGroup;

  lerpBufferPositions(fillMesh.geometry.attributes.position, fillMesh.userData.flatPositions, fillMesh.userData.spherePositions, t);
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
