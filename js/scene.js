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

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
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
  // Globe mode has no zoom limits; map mode sets its own in toggleView()
  controls.minDistance = 0;
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
  // Pin globe center / constrain map view after controls moved the camera
  enforceViewConstraints();
  // Size, cull and de-collide all labels for this frame's camera
  updateLabels();
  renderer.render(scene, camera);
}

// Rewrites the mesh's position buffer as a per-vertex lerp between
// the flat-map positions and the sphere positions, driven by t (0..1).
// The language fill shares this geometry, so it morphs with it.
function applyMorph(t) {
  const posAttr = mesh.geometry.attributes.position;
  const arr = posAttr.array;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = flatPositions[i] + (spherePositions[i] - flatPositions[i]) * t;
  }
  posAttr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  applyCountryMorph(t);
  applyLanguageMorph(t);
}