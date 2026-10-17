// =================================================================
// Skins
// =================================================================

// Incremented per request so a slow download of an earlier choice
// can't overwrite a skin picked after it.
let skinRequestId = 0;

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, resolve, undefined,
      () => reject(new Error('Failed to load skin texture: ' + url)));
  });
}

function setSkinMap(texture, color) {
  // Free the GPU memory of the texture being replaced
  if (mesh.material.map) mesh.material.map.dispose();
  mesh.material.map = texture;
  mesh.material.color.set(color);
  mesh.material.needsUpdate = true;
}

async function applySkin(key) {
  const skin = SKINS[key];
  if (!skin || !mesh) return;
  const requestId = ++skinRequestId;

  if (!skin.urls) {
    setSkinMap(null, skin.color);
    return;
  }

  for (const url of skin.urls) {
    try {
      const tex = await loadTexture(url);
      if (requestId !== skinRequestId) { tex.dispose(); return; }
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      setSkinMap(tex, 0xffffff);
      return;
    } catch (err) {
      console.warn(err.message);
    }
  }
  console.error('All sources failed for skin "' + key + '"; keeping the current skin.');
}

function setSkinMap(texture, color) {
  if (mesh.material.map) mesh.material.map.dispose();
  mesh.material.map = texture;
  mesh.material.color.set(color);
  mesh.material.needsUpdate = true;
  setTileSkin(texture ? texture.image : null); // tiles paint over this skin
}