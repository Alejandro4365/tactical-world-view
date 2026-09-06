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

  const btn = document.getElementById('toggle-btn');
  const modeText = document.getElementById('mode-text');
  btn.disabled = true;
  autoRotateEnabled = false;

  if (isGlobe) {
    // Sphere -> flat map: pull the camera back, then rotate the mesh
    // and camera "up" vector back to their canonical (parallel-to-
    // screen) orientation WHILE morphing, then settle into a
    // screen-filling top-down framing.
    const fitDistance = getFlatFitDistance();

    // Normalize the accumulated auto-spin to its equivalent angle in
    // [-PI, PI] so the tween to 0 takes the shortest path instead of
    // unwinding several full turns.
    mesh.rotation.y = normalizeAngle(mesh.rotation.y);
    const upTarget = { x: camera.up.x, y: camera.up.y, z: camera.up.z };

    gsap.timeline({
      onComplete: () => {
        controls.noRotate = true;
        controls.minDistance = 60;
        controls.maxDistance = 1200;
        btn.innerText = 'Switch to Planet Mode';
        modeText.innerText = 'Mapamundi (2D)';
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
    // Flat map -> sphere: morph back, then let free rotation resume.
    controls.noRotate = false;
    controls.minDistance = 105;
    controls.maxDistance = 900;
    const upTarget = { x: camera.up.x, y: camera.up.y, z: camera.up.z };

    gsap.timeline({
      onComplete: () => {
        autoRotateEnabled = true;
        btn.innerText = 'Switch to Mapamundi Mode';
        modeText.innerText = 'Planet (3D)';
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
//
// We can't just listen for a native "click" event: TrackballControls
// still pans on a left-button drag in flat/map mode (noPan is false),
// and a plain "click" fires on mouseup regardless of how far the
// pointer travelled in between. So we track the mousedown position/
// time ourselves and only treat the gesture as a "click" if the
// pointer barely moved and the press was short - a real drag-to-pan
// will not trigger a toggle.
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

// --- Left-button behavior per mode ---
// Globe mode: left button always rotates the globe (unaffected by
// fullscreen). Map mode: left button pans the flat map, but only
// when the page/element is NOT in fullscreen - while fullscreen it's
// left inert (-1, i.e. STATE.NONE) so it neither pans nor toggles.
function updateLeftMouseMapping() {
  if (!controls) return;
  if (isGlobe) {
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  } else if (isFullscreenActive()) {
    controls.mouseButtons.LEFT = -1;
  } else {
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  }
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
  if (!wasClick) return; // it was a drag/pan, not a click

  if (isGlobe) return;              // Task 1: only toggle by click in map mode
  if (isAnimating) return;          // don't interrupt an in-flight toggle
  if (isFullscreenActive()) return; // Task 1: block toggling while fullscreen

  toggleView();
}

// Wires up the click-to-toggle listeners on the 3D view, plus the
// fullscreen watcher that keeps the left-button mapping in sync (the
// user can enter/exit fullscreen at any time, not just around a
// toggleView() animation). Called once from main.js after the
// renderer's canvas exists.
function initInteractions() {
  const el = renderer.domElement;
  el.addEventListener('mousedown', onViewMouseDown);
  el.addEventListener('mouseup', onViewMouseUp);

  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
    .forEach((evt) => document.addEventListener(evt, updateLeftMouseMapping));

  updateLeftMouseMapping(); // set initial state (globe mode -> rotate)
}
