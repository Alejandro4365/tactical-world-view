// =================================================================
// Grid
// Builds the base terrain geometry (shared flat + sphere position
// buffers) and the camera-distance helper used to frame the flat map.
// =================================================================

function buildGrid() {
  const geometry = new THREE.BufferGeometry();

  const vertsPerRow = LON_SEGMENTS + 1;
  const vertsPerCol = LAT_SEGMENTS + 1;
  const vertexCount = vertsPerRow * vertsPerCol;

  flatPositions = new Float32Array(vertexCount * 3);
  spherePositions = new Float32Array(vertexCount * 3);
  sphereNormals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);

  let vi = 0;
  for (let row = 0; row <= LAT_SEGMENTS; row++) {
    const v = row / LAT_SEGMENTS;
    const lat = 90 - v * 180;

    for (let col = 0; col <= LON_SEGMENTS; col++) {
      const u = col / LON_SEGMENTS;
      const lon = u * 360 - 180;

      const p = projectLonLat(lon, lat, SPHERE_RADIUS);

      flatPositions[vi * 3 + 0] = p.flat.x;
      flatPositions[vi * 3 + 1] = p.flat.y;
      flatPositions[vi * 3 + 2] = p.flat.z;

      spherePositions[vi * 3 + 0] = p.sphere.x;
      spherePositions[vi * 3 + 1] = p.sphere.y;
      spherePositions[vi * 3 + 2] = p.sphere.z;

      // The outward normal of a sphere centered at the origin is the unit position
      sphereNormals[vi * 3 + 0] = p.sphere.x / SPHERE_RADIUS;
      sphereNormals[vi * 3 + 1] = p.sphere.y / SPHERE_RADIUS;
      sphereNormals[vi * 3 + 2] = p.sphere.z / SPHERE_RADIUS;

      // Texture v is flipped here: three.js uploads images with
      // flipY=true by default, so v=1 (not v=0) corresponds to the
      // top/north row of a normally-loaded image.
      uvs[vi * 2 + 0] = u;
      uvs[vi * 2 + 1] = 1 - v;

      vi++;
    }
  }

  // Start as a sphere (morphState.t = 1)
  const startPositions = new Float32Array(spherePositions);
  const startNormals = new Float32Array(sphereNormals);

  // More than 65535 vertices, so the index buffer must be 32-bit
  const indices = new Uint32Array(LAT_SEGMENTS * LON_SEGMENTS * 6);
  let ii = 0;
  for (let row = 0; row < LAT_SEGMENTS; row++) {
    for (let col = 0; col < LON_SEGMENTS; col++) {
      const a = row * vertsPerRow + col;
      const b = a + 1;
      const c = a + vertsPerRow;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }

  const positionAttr = new THREE.BufferAttribute(startPositions, 3);
  const normalAttr = new THREE.BufferAttribute(startNormals, 3);
  // Both buffers are rewritten on every morph frame
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  normalAttr.setUsage(THREE.DynamicDrawUsage);

  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('normal', normalAttr);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  return geometry;
}

// Camera distance (looking straight down -z at the origin) needed so
// the flat map's full FLAT_WIDTH x FLAT_HEIGHT bounding box fits
// entirely within the current viewport.
function getFlatFitDistance() {
  const container = document.getElementById('view-container');
  const aspect = container.clientWidth / container.clientHeight;
  const vFov = camera.fov * Math.PI / 180;
  const distForHeight = (FLAT_HEIGHT / 2) / Math.tan(vFov / 2);
  const distForWidth = (FLAT_WIDTH / 2) / (Math.tan(vFov / 2) * aspect);
  return Math.max(distForHeight, distForWidth) * 1.02;
}