// =================================================================
// Tiles
// Sharper imagery when zoomed in. A tile pyramid is drawn into one
// canvas that becomes the terrain texture. The active skin is painted
// underneath, so tiles that aren't loaded yet fall back to it.
// Tiles use the grid's lon/lat UVs, so they line up on map and globe.
// =================================================================

const tileCache = new Map();  // "z/row/col" -> Image | null (failed) | 'loading'
const tileQueue = [];         // { z, row, col } waiting to be fetched
let tileInFlight = 0;

let tileLevel = -1;           // level currently drawn, -1 = none
let tileCanvas = null, tileCtx = null, tileTexture = null;
let tileSkinImage = null;     // image of the active skin, painted underneath
let tileDirty = false, tileLastUpload = 0;

const tileKey = (z, row, col) => z + '/' + row + '/' + col;

// Called from skins.js whenever a skin texture is applied.
function setTileSkin(image) {
  tileSkinImage = image || null;
  tileLevel = -1; // force a rebuild on top of the new base
}

// Physical screen pixels per degree of longitude, blended between the
// map scale and the globe scale by morphState.t.
function screenPixelsPerDegree() {
  const canvas = renderer.domElement;
  const tanHalf = Math.tan(camera.fov * Math.PI / 360);
  const dist = camera.position.length();
  const flatPx = (canvas.height / (2 * dist * tanHalf)) * FLAT_WIDTH / 360;
  // Globe: measure to the surface facing the camera, not to the center
  const surfaceDist = Math.max(dist - SPHERE_RADIUS, 1e-3);
  const globePx = (canvas.height / (2 * surfaceDist * tanHalf)) * SPHERE_RADIUS * Math.PI / 180;
  return flatPx + (globePx - flatPx) * morphState.t;
}

// Smallest level whose texels-per-degree covers the screen, capped by
// the GPU texture limit and the canvas area limit.
function pickTileLevel() {
  const needed = screenPixelsPerDegree();
  const maxSize = renderer.capabilities.maxTextureSize;
  let maxZ = TILE_MAX_ZOOM;
  while (maxZ > 0 && (TILE_SIZE * 2 ** (maxZ + 1) > maxSize ||
                      TILE_SIZE * 2 ** (maxZ + 1) * TILE_SIZE * 2 ** maxZ > TILE_MAX_CANVAS_AREA)) maxZ--;
  let z = 0;
  while (z < maxZ && TILE_SIZE * 2 ** (z + 1) / 360 < needed) z++;
  return z;
}

function drawTile(img, z, row, col) {
  tileCtx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  tileDirty = true;
}

function rebuildTileLayer(z) {
  const cols = 2 ** (z + 1), rows = 2 ** z;
  const w = cols * TILE_SIZE, h = rows * TILE_SIZE;
  tileLevel = z;

  tileCanvas = document.createElement('canvas');
  tileCanvas.width = w;
  tileCanvas.height = h;
  tileCtx = tileCanvas.getContext('2d');
  tileCtx.fillStyle = '#081226';
  tileCtx.fillRect(0, 0, w, h);
  tileCtx.drawImage(tileSkinImage, 0, 0, w, h); // fallback: the skin, stretched

  // Drop queued-but-not-started requests from the old level
  tileQueue.forEach((e) => tileCache.delete(tileKey(e.z, e.row, e.col)));
  tileQueue.length = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = tileKey(z, row, col);
      const cached = tileCache.get(key);
      if (cached && cached !== 'loading') drawTile(cached, z, row, col);
      else if (cached === undefined) {
        tileCache.set(key, 'loading');
        tileQueue.push({ z, row, col });
      }
    }
  }

  // The previous tile texture is ours; a fresh skin texture is copied
  // into the canvas, so it can be released too
  if (tileTexture) tileTexture.dispose();
  if (mesh.material.map) mesh.material.map.dispose();
  tileTexture = new THREE.CanvasTexture(tileCanvas);
  tileTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  mesh.material.map = tileTexture;
  mesh.material.needsUpdate = true;
  tileDirty = true;
  pumpTileQueue();
}

function pumpTileQueue() {
  while (tileInFlight < TILE_MAX_CONCURRENT && tileQueue.length) {
    const { z, row, col } = tileQueue.shift();
    const key = tileKey(z, row, col);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    tileInFlight++;
    img.onload = () => {
      tileInFlight--;
      tileCache.set(key, img);
      if (z === tileLevel) drawTile(img, z, row, col);
      pumpTileQueue();
    };
    img.onerror = () => {
      tileInFlight--;
      tileCache.set(key, null); // failed: keep the skin underneath
      pumpTileQueue();
    };
    img.src = TILE_URL_TEMPLATE
      .replace('{z}', z).replace('{row}', row).replace('{col}', col);
  }
}

// Called every frame from animate().
function updateTiles() {
  if (!TILE_URL_TEMPLATE || !tileSkinImage || !mesh || !renderer) return;

  // Upgrade immediately; downgrade only after losing two levels (avoids
  // rebuilding the canvas on every zoom wobble)
  const z = pickTileLevel();
  if (z > tileLevel || z < tileLevel - 1) rebuildTileLayer(z);

  const now = performance.now();
  if (tileDirty && now - tileLastUpload > TILE_UPLOAD_INTERVAL_MS) {
    tileTexture.needsUpdate = true; // one full canvas upload, throttled
    tileDirty = false;
    tileLastUpload = now;
  }
}