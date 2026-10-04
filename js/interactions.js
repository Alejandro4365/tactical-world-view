// =================================================================
// Interactions
// The globe<->map toggle animation, plus user input that drives it:
//  - the UI button (always works)
//  - a left mouse click on the 3D view (only while in map/flat mode,
//    and only when the page/element is NOT in fullscreen)
// =================================================================

function toggleView() {
  if (isAnimating) return;
  isAnimating = true;

  // Reset the pan pivot so the camera never looks at a stale off-axis point
  controls.target.set(0, 0, 0);

  const btn = document.getElementById('toggle-btn');
  btn.disabled = true;
  autoRotateEnabled = false;

  if (isGlobe) {
    // Sphere -> flat map
    const fitDistance = getFlatFitDistance();

    // Shortest path back to rotation 0 instead of unwinding full turns
    mesh.rotation.y = normalizeAngle(mesh.rotation.y);
    const upTarget = { x: camera.up.x, y: camera.up.y, z: camera.up.z };

    gsap.timeline({
      onComplete: () => {
        controls.noRotate = true;
        controls.noPan = false;
        controls.minDistance = 60;
        // Zooming out past "map fits the page" would shrink the map off the page edges
        controls.maxDistance = getFlatFitDistance();
        btn.innerText = 'Switch to Planet Mode';
        btn.disabled = false;
        isGlobe = false;
        isAnimating = false;
        updateLeftMouseMapping();
      }
    })
    .to(camera.position, { x: 0, y: 0, z: fitDistance * 1.3, duration: 0.6, ease: 'power2.inOut',
        onUpdate: () => camera.lookAt(0, 0, 0) })
    .to(morphState, {
        t: 0, duration: 0.9, ease: 'power2.inOut',
        onUpdate: () => applyMorph(morphState.t)
      }, '-=0.15')
    .to(mesh.rotation, { y: 0, duration: 0.9, ease: 'power2.inOut' }, '<')
    .to(upTarget, { x: 0, y: 1, z: 0, duration: 0.9, ease: 'power2.inOut',
        onUpdate: () => camera.up.set(upTarget.x, upTarget.y, upTarget.z) }, '<')
    .to(camera.position, { x: 0, y: 0, z: fitDistance, duration: 0.5, ease: 'power2.out',
        onUpdate: () => camera.lookAt(0, 0, 0) }, '-=0.1');

  } else {
    // Flat map -> sphere
    controls.noRotate = false;
    // Planet mode: unlimited zoom out, but never into the surface
    controls.minDistance = GLOBE_MIN_DISTANCE;
    controls.maxDistance = Infinity;
    const upTarget = { x: camera.up.x, y: camera.up.y, z: camera.up.z };

    gsap.timeline({
      onComplete: () => {
        autoRotateEnabled = true;
        btn.innerText = 'Switch to Mapamundi Mode';
        btn.disabled = false;
        isGlobe = true;
        isAnimating = false;
        updateLeftMouseMapping();
      }
    })
    .to(camera.position, { x: 0, y: 0, z: 320, duration: 0.5, ease: 'power2.inOut',
        onUpdate: () => camera.lookAt(0, 0, 0) })
    .to(morphState, {
        t: 1, duration: 0.9, ease: 'power2.inOut',
        onUpdate: () => applyMorph(morphState.t)
      }, '-=0.1')
    .to(upTarget, { x: 0, y: 1, z: 0, duration: 0.9, ease: 'power2.inOut',
        onUpdate: () => camera.up.set(upTarget.x, upTarget.y, upTarget.z) }, '<')
    .to(camera.position, { x: 0, y: 0, z: 260, duration: 0.6, ease: 'power2.out',
        onUpdate: () => camera.lookAt(0, 0, 0) }, '-=0.2');
  }
}

// --- Click-to-toggle (map mode only, blocked in fullscreen) ---
// A native "click" fires after any drag, so track mousedown position/
// time and only count short, nearly-stationary presses as clicks.
let mouseDownPos = null;
let mouseDownTime = 0;

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

// --- Button behavior per mode ---
// Globe: left rotates, never pans. Map: left pans, inert in fullscreen.
function updateLeftMouseMapping() {
  if (!controls) return;
  // noPan is the master switch: the globe never pans
  controls.noPan = isGlobe;

  if (isGlobe) {
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  } else if (isFullscreenActive()) {
    // Both off: RIGHT may still hold 0 (left button) from the non-fullscreen map state
    controls.mouseButtons.LEFT = -1;
    controls.mouseButtons.RIGHT = -1;
  } else {
    // mouseButtons values are button codes: route physical left (0) into PAN
    controls.mouseButtons.LEFT = -1;
    controls.mouseButtons.RIGHT = 0;
  }
}

// Runs every frame after controls.update().
//  - Globe: sphere center stays at the page center (target pinned to origin).
//  - Map: camera always faces the xy plane, and the visible window can
//    never leave the map's bounds.
function enforceViewConstraints() {
  if (!controls || isAnimating) return;

  if (isGlobe) {
    // Shift camera and target together so the view direction is unchanged
    if (controls.target.lengthSq() > 0) {
      camera.position.sub(controls.target);
      controls.target.set(0, 0, 0);
    }
    return;
  }

  const fitDist = getFlatFitDistance();
  const d = Math.min(fitDist, Math.max(controls.minDistance, camera.position.z));
  const halfH = d * Math.tan(camera.fov * Math.PI / 360);
  const halfW = halfH * camera.aspect;

  // Pan range: 0 when the map fills the view, wider when zoomed in
  const limX = Math.max(0, FLAT_WIDTH / 2 - halfW);
  const limY = Math.max(0, FLAT_HEIGHT / 2 - halfH);
  const cx = Math.min(limX, Math.max(-limX, controls.target.x));
  const cy = Math.min(limY, Math.max(-limY, controls.target.y));

  // Camera directly above the target, looking straight down -z, no roll
  controls.target.set(cx, cy, 0);
  camera.position.set(cx, cy, d);
  camera.up.set(0, 1, 0);
  camera.lookAt(controls.target);
}

function onViewMouseDown(e) {
  if (e.button !== 0) return; // left button only
  mouseDownPos = { x: e.clientX, y: e.clientY };
  mouseDownTime = Date.now();
}

function onViewMouseUp(e) {
  if (e.button !== 0 || !mouseDownPos) return;

  const dx = e.clientX - mouseDownPos.x;
  const dy = e.clientY - mouseDownPos.y;
  const movedDist = Math.sqrt(dx * dx + dy * dy);
  const elapsed = Date.now() - mouseDownTime;
  mouseDownPos = null;

  const wasClick = movedDist <= CLICK_MAX_DRAG_PX && elapsed <= CLICK_MAX_TIME_MS;
  if (!wasClick) return;

  if (isGlobe) return;              // click-toggle only in map mode
  if (isAnimating) return;
  if (isFullscreenActive()) return;

  toggleView();
}

// Called once from main.js after the renderer's canvas exists.
function initInteractions() {
  const el = renderer.domElement;
  el.addEventListener('mousedown', onViewMouseDown);
  el.addEventListener('mouseup', onViewMouseUp);

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
    .forEach((evt) => document.addEventListener(evt, updateLeftMouseMapping));

  updateLeftMouseMapping();
}