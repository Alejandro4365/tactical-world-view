// =================================================================
// Skins
// =================================================================

function applySkin(key) {
  const skin = SKINS[key];
  if (!skin || !mesh) return;
  if (skin.url) {
    const tex = new THREE.TextureLoader().load(skin.url);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mesh.material.map = tex;
    mesh.material.color.set(0xffffff);
  } else {
    mesh.material.map = null;
    mesh.material.color.set(skin.color);
  }
  mesh.material.needsUpdate = true;
}
