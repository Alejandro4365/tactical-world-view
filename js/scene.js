// =================================================================
// Core scene
// =================================================================

function init() {
  const container = document.getElementById('view-container');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020611);

  camera = new THREE.PerspectiveCamera(
    50, container.clientWidth / container.clientHeight, 0.1, 5000
  );
  camera.position.set(0, 0, 260);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY));
  headlight = new THREE.DirectionalLight(0xffffff, HEADLIGHT_INTENSITY);
  scene.add(headlight);
  scene.add(headlight.target);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(5, 3, 5);
  scene.add(sun);

  const geometry = buildGrid();
  // Dark placeholder color until the first skin texture arrives
  const material = new THREE.MeshPhongMaterial({ color: 0x081226, shininess: 5 });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  applySkin('blueMarble');

  // TrackballControls rotates about any axis, so the globe has no pole lock
  controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.noZoom = false;
  controls.noPan = false;
  controls.noRotate = false;
  controls.rotateSpeed = 1.9;
  controls.zoomSpeed = 3.4;
  controls.panSpeed = 1.2;
  controls.dynamicDampingFactor = 0.12;
  // Globe mode: unlimited zoom out, but never into the surface.
  // Map mode sets its own limits in toggleView().
  controls.minDistance = GLOBE_MIN_DISTANCE;
  controls.maxDistance = Infinity;
  // Left rotates by default (globe mode); see updateLeftMouseMapping()
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  const container = document.getElementById('view-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  controls.handleResize();

  if (!isGlobe && !isAnimating) {
    // Keep the zoom-out limit in sync with the new viewport
    controls.maxDistance = getFlatFitDistance();
    camera.position.z = getFlatFitDistance();
    camera.lookAt(0, 0, 0);
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (isGlobe && autoRotateEnabled) {
    mesh.rotation.y += AUTO_ROTATE_SPEED;
  }
  controls.update();
  headlight.position.copy(camera.position);
  headlight.target.position.copy(controls.target);
  // Pin globe center / constrain map view after controls moved the camera
  enforceViewConstraints();
  // Size, place and cull all labels for this frame's camera
  updateLabels();
  updateTiles();
  renderer.render(scene, camera);
}

// Rewrites the position and normal buffers as a per-vertex blend between
// the flat map and the sphere, driven by t (0..1). The language fill
// shares this geometry, so it morphs with it.
function applyMorph(t) {
  const posAttr = mesh.geometry.attributes.position;
  const norAttr = mesh.geometry.attributes.normal;
  const pos = posAttr.array;
  const nor = norAttr.array;

  for (let i = 0; i < pos.length; i += 3) {
    pos[i]     = flatPositions[i]     + (spherePositions[i]     - flatPositions[i])     * t;
    pos[i + 1] = flatPositions[i + 1] + (spherePositions[i + 1] - flatPositions[i + 1]) * t;
    pos[i + 2] = flatPositions[i + 2] + (spherePositions[i + 2] - flatPositions[i + 2]) * t;

    // Flat normal is +z, sphere normal is outward: blend, then renormalize
    const nx = sphereNormals[i] * t;
    const ny = sphereNormals[i + 1] * t;
    const nz = (1 - t) + sphereNormals[i + 2] * t;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nor[i]     = nx / len;
    nor[i + 1] = ny / len;
    nor[i + 2] = nz / len;
  }

  posAttr.needsUpdate = true;
  norAttr.needsUpdate = true;
  applyCountryMorph(t);
  applyLanguageMorph(t);
}