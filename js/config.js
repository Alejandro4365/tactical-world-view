// =================================================================
// Config
// Static configuration constants used across the app. No state,
// no logic - just numbers/strings other modules read from.
// =================================================================

// --- Mesh configuration ---
// High-resolution lat/lon grid shared by BOTH the flat map and the
// globe. Every vertex is computed twice (Equal Earth for the map,
// spherical->cartesian for the globe); toggling interpolates between them.
const LON_SEGMENTS = 1024; // columns (was 256)
const LAT_SEGMENTS = 512;  // rows (was 128)
const SPHERE_RADIUS = 100;
const FLAT_WIDTH = 340;
const FLAT_HEIGHT = 170;

const AMBIENT_INTENSITY = 0.55;
const HEADLIGHT_INTENSITY = 0.7;

const COUNTRIES_GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries.geojson';

const AUTO_ROTATE_SPEED = 0.0012; // radians per frame, idle globe spin

// Globe/map skins. `urls` are tried in order: put a higher-resolution
// source first and keep the older one after it as a fallback.
const SKINS = {
  blueMarble: { label: 'Blue Marble',   urls: [
                'https://raw.githubusercontent.com/vvanhee/earth-wallpaper/main/world.topo.bathy.200401.3x5400x2700.png'
              ] },
  day:        { label: 'Day Map',       urls: ['https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_day_4096.jpg',
                                               'https://unpkg.com/three-globe/example/img/earth-day.jpg'] },
  night:      { label: 'Night Lights',  urls: ['https://unpkg.com/three-globe/example/img/earth-night.jpg'] },
  topo:       { label: 'Topographic',   urls: ['https://unpkg.com/three-globe/example/img/earth-topology.png'] },
  tactical:   { label: 'Tactical Dark', urls: null, color: 0x081226 }
};

// --- Country borders / names layer constants ---
const COUNTRY_BORDER_COLOR = 0xf2f8ff;
const SPHERE_BORDER_RADIUS = SPHERE_RADIUS * 1.004;
const SPHERE_LABEL_RADIUS = SPHERE_RADIUS * 1.01;
const FLAT_BORDER_Z = 0.9;
const FLAT_LABEL_Z = 1.4;

// --- Click-to-toggle tuning (see interactions.js) ---
const CLICK_MAX_DRAG_PX = 5;
const CLICK_MAX_TIME_MS = 500;


// Zooming
const GLOBE_MIN_DISTANCE = SPHERE_RADIUS * 1.03;
const GLOBE_MAX_DISTANCE = 900;
const MAP_MIN_DISTANCE = 10;    // was 60. Lower = zoom in closer
const MAP_MAX_DISTANCE = 1200;
