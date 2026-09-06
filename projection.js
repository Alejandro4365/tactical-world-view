// =================================================================
// Projection
// Equal Earth projection + the shared helper that turns a lon/lat
// into both a flat-map position and a sphere position. Everything
// here is pure math - no THREE scene objects, no state.
// =================================================================

// --- Equal Earth projection (Savric, Patterson & Jenny, 2018) ---
const EE_A1 = 1.340264, EE_A2 = -0.081106, EE_A3 = 0.000893, EE_A4 = 0.003796;
function equalEarthProject(lonDeg, latDeg) {
  const lambda = lonDeg * Math.PI / 180;
  const phi = latDeg * Math.PI / 180;
  const theta = Math.asin((Math.sqrt(3) / 2) * Math.sin(phi));
  const t2 = theta * theta;
  const t3 = t2 * theta;
  const t6 = t3 * t3;
  const t7 = t6 * theta;
  const t8 = t7 * theta;
  const t9 = t8 * theta;
  const x = (2 * Math.sqrt(3) * lambda * Math.cos(theta)) /
            (3 * (9 * EE_A4 * t8 + 7 * EE_A3 * t6 + 3 * EE_A2 * t2 + EE_A1));
  const y = EE_A4 * t9 + EE_A3 * t7 + EE_A2 * t3 + EE_A1 * theta;
  return { x, y };
}
const EE_X_MAX = equalEarthProject(180, 0).x;
const EE_Y_MAX = equalEarthProject(0, 90).y;

// Shared projection helper: given a lon/lat, return both the flat
// map position (Equal Earth, z=0) and the sphere position (standard
// spherical->cartesian). sphereRadius lets overlay layers sit
// slightly above the base terrain to avoid z-fighting.
function projectLonLat(lonDeg, latDeg, sphereRadius) {
  const r = sphereRadius === undefined ? SPHERE_RADIUS : sphereRadius;
  const proj = equalEarthProject(lonDeg, latDeg);
  const fx = (proj.x / EE_X_MAX) * (FLAT_WIDTH / 2);
  const fy = (proj.y / EE_Y_MAX) * (FLAT_HEIGHT / 2);
  const phi = (90 - latDeg) * Math.PI / 180;   // colatitude
  const theta = (lonDeg + 180) * Math.PI / 180; // azimuth
  const sx = -r * Math.sin(phi) * Math.cos(theta);
  const sy = r * Math.cos(phi);
  const sz = r * Math.sin(phi) * Math.sin(theta);
  return { flat: { x: fx, y: fy, z: 0 }, sphere: { x: sx, y: sy, z: sz } };
}

function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}
