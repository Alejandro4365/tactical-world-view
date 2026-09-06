// =================================================================
// Config
// Static configuration constants used across the app. No state,
// no logic - just numbers/strings other modules read from.
// =================================================================

// --- Mesh configuration ---
// High-resolution lat/lon grid shared by BOTH the flat map and the
// globe. Every vertex is computed twice, mathematically:
//   - once as a point on the flat map plane (Equal Earth projection)
//   - once as a point on a sphere, via standard spherical->cartesian
//     conversion (the same formula THREE.SphereGeometry itself uses)
// Toggling just interpolates each vertex between its two positions.
// The country borders/fills/labels layer re-uses the exact same
// projection helper so it always lines up with the terrain.
const LON_SEGMENTS = 256; // columns (very high resolution mesh)
const LAT_SEGMENTS = 128; // rows
const SPHERE_RADIUS = 100;
const FLAT_WIDTH = 340;   // world units for the flat map's bounding box
const FLAT_HEIGHT = 170;

const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const COUNTRIES_GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson';

const AUTO_ROTATE_SPEED = 0.0012; // radians per frame, idle globe spin

// Available globe/map skins.
const SKINS = {
  blueMarble: { label: 'Blue Marble', url: 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg' },
  day:        { label: 'Day Map',      url: 'https://unpkg.com/three-globe/example/img/earth-day.jpg' },
  night:      { label: 'Night Lights', url: 'https://unpkg.com/three-globe/example/img/earth-night.jpg' },
  topo:       { label: 'Topographic',  url: 'https://unpkg.com/three-globe/example/img/earth-topology.png' },
  tactical:   { label: 'Tactical Dark', url: null, color: 0x081226 }
};

// --- Country borders / fills / names layer constants ---
const COUNTRY_FILL_OPACITY = 0.4;
const COUNTRY_BORDER_COLOR = 0xf2f8ff;
const SPHERE_FILL_RADIUS = SPHERE_RADIUS * 1.002;
const SPHERE_BORDER_RADIUS = SPHERE_RADIUS * 1.004;
const SPHERE_LABEL_RADIUS = SPHERE_RADIUS * 1.01;
const FLAT_FILL_Z = 0.5;
const FLAT_BORDER_Z = 0.9;
const FLAT_LABEL_Z = 1.4;

// --- Click-to-toggle tuning (see interactions.js) ---
const CLICK_MAX_DRAG_PX = 5;   // max pointer movement to still count as a "click"
const CLICK_MAX_TIME_MS = 500; // max press duration to still count as a "click"
