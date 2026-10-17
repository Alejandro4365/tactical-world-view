// =================================================================
// State
// The mutable state shared across modules. Declared with let/const
// at the top level of a classic (non-module) script, so every other
// <script> loaded after this one on the page can read AND assign to
// these bindings directly - no imports/exports needed.
// =================================================================

let scene, camera, renderer, controls, mesh, headlight;
let flatPositions, spherePositions, sphereNormals; // Float32Array buffers (base terrain)
let countryLayer = null; // THREE.Group holding fills/borders/labels, child of mesh
let isGlobe = true;
let isAnimating = false;
let autoRotateEnabled = true; // slow idle spin of the globe mesh itself
const morphState = { t: 0 }; // 0 = fully flat map, 1 = fully sphere
