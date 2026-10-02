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
  const texture = new THREE.TextureLoader().load(EARTH_TEXTURE_URL);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshPhongMaterial({ map: texture, shininess: 5 });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // TrackballControls instead of OrbitControls: OrbitControls always
  // orbits around a fixed world "up" axis, which is what made the
  // globe feel locked/gimbal-jammed near the poles. TrackballControls
  // rotates the camera about whatever arbitrary axis the drag implies,
  // so the globe can be spun freely in any direction, poles included.
  controls = new THREE.TrackballControls(camera, renderer.domElement);
  controls.noZoom = false;
  controls.noPan = false;
  controls.noRotate = false;
  controls.rotateSpeed = 1.9;
  controls.zoomSpeed = 3.4;
  controls.panSpeed = 1.2;
  controls.dynamicDampingFactor = 0.12;
  controls.minDistance = 105;
  controls.maxDistance = 900;
  // Left button rotates by default (globe mode). interactions.js flips
  // this to PAN in map mode (and to inert while fullscreen) - see
  // updateLeftMouseMapping().
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
  renderer.render(scene, camera);
}

// Rewrites the mesh's position buffer as a per-vertex lerp between
// the flat-map positions and the sphere positions, driven by t (0..1).
function applyMorph(t) {
  const posAttr = mesh.geometry.attributes.position;
  const arr = posAttr.array;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = flatPositions[i] + (spherePositions[i] - flatPositions[i]) * t;
  }
  posAttr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  applyCountryMorph(t);
}
