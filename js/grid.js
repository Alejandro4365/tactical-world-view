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

      // Texture v is flipped here: three.js uploads images with
      // flipY=true by default, so v=1 (not v=0) corresponds to the
      // top/north row of a normally-loaded image.
      uvs[vi * 2 + 0] = u;
      uvs[vi * 2 + 1] = 1 - v;

      vi++;
    }
  }

  const startPositions = new Float32Array(spherePositions);

  const indices = [];
  for (let row = 0; row < LAT_SEGMENTS; row++) {
    for (let col = 0; col < LON_SEGMENTS; col++) {
      const a = row * vertsPerRow + col;
      const b = a + 1;
      const c = a + vertsPerRow;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(startPositions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

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
