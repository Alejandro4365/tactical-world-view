// =================================================================
// Language families layer
// Country-level approximation: every country gets the family of its
// dominant native language (not its colonial official language where
// the two differ in Africa/Oceania, but yes for the Americas, so
// Latin America reads as Indo-European). Draws:
//   - a tinted fill (painted into an equirectangular canvas that
//     shares the terrain's UVs, so it morphs flat<->sphere for free)
//   - family borders (edges shared by two countries of different
//     families), as line segments morphed like the country borders
//   - one family name per group of neighboring countries
// =================================================================

let languageLayer = null;

const LANGUAGE_FILL_OPACITY = 0.5;
const LANGUAGE_BORDER_COLOR = 0xffd54a;
const LANGUAGE_BORDER_RADIUS = SPHERE_RADIUS * 1.006; // above country borders (1.004)
const LANGUAGE_BORDER_Z = 1.1;                        // above country borders (0.9)
const LANGUAGE_TEXTURE_WIDTH = 4096;
const LANGUAGE_TEXTURE_HEIGHT = 2048;

const LANGUAGE_FAMILIES = {
  indoEuropean:   { label: 'Indo-European',    color: '#4f8ef7' },
  afroAsiatic:    { label: 'Afro-Asiatic',     color: '#f0a63a' },
  nigerCongo:     { label: 'Niger-Congo',      color: '#3fbf7f' },
  niloSaharan:    { label: 'Nilo-Saharan',     color: '#b5651d' },
  sinoTibetan:    { label: 'Sino-Tibetan',     color: '#e5484d' },
  turkic:         { label: 'Turkic',           color: '#8e6bd8' },
  uralic:         { label: 'Uralic',           color: '#2fc4c9' },
  austronesian:   { label: 'Austronesian',     color: '#f06fb4' },
  austroasiatic:  { label: 'Austroasiatic',    color: '#9bd13b' },
  taiKadai:       { label: 'Tai-Kadai',        color: '#f2d13a' },
  japonic:        { label: 'Japonic',          color: '#ff8a65' },
  koreanic:       { label: 'Koreanic',         color: '#c586f0' },
  mongolic:       { label: 'Mongolic',         color: '#6fa8a0' },
  kartvelian:     { label: 'Kartvelian',       color: '#d98ca5' },
  transNewGuinea: { label: 'Trans-New Guinea', color: '#a39463' },
  eskimoAleut:    { label: 'Eskimo-Aleut',     color: '#cfe3f0' }
};

// Each group is one label: neighboring countries of one family.
// Codes are ISO A3, or the dataset name where the dataset has no code.
const LANGUAGE_GROUPS = [
  { family: 'indoEuropean', codes: ['ISL','IRL','GBR','FRA','ESP','PRT','ITA','CHE','DEU','AUT','BEL','NLD','LUX','DNK','NOR','SWE','POL','CZE','SVK','SVN','HRV','BIH','SRB','MNE','MKD','ALB','GRC','BGR','ROU','MDA','UKR','BLR','LTU','LVA','CYP','ARM','Kosovo'] },
  { family: 'indoEuropean', codes: ['RUS'] },
  { family: 'indoEuropean', codes: ['IRN','AFG','TJK'] },
  { family: 'indoEuropean', codes: ['IND','PAK','BGD','NPL','LKA'] },
  { family: 'indoEuropean', codes: ['USA','CAN','MEX','GTM','BLZ','HND','SLV','NIC','CRI','PAN','CUB','JAM','HTI','DOM','PRI','TTO','BHS'] },
  { family: 'indoEuropean', codes: ['COL','VEN','GUY','SUR','ECU','PER','BOL','BRA','PRY','URY','ARG','CHL','FLK'] },
  { family: 'indoEuropean', codes: ['AUS','NZL'] },
  { family: 'afroAsiatic',  codes: ['MAR','DZA','TUN','LBY','EGY','ESH','MRT','SDN','TCD','NER','ETH','ERI','DJI','SOM','Somaliland'] },
  { family: 'afroAsiatic',  codes: ['SAU','YEM','OMN','ARE','QAT','KWT','IRQ','SYR','JOR','LBN','ISR','PSE'] },
  { family: 'nigerCongo',   codes: ['SEN','GMB','GIN','GNB','SLE','LBR','CIV','GHA','TGO','BEN','BFA','MLI','NGA'] },
  { family: 'nigerCongo',   codes: ['CMR','GNQ','GAB','COG','COD','CAF','AGO','ZMB','MWI','MOZ','ZWE','BWA','NAM','ZAF','LSO','SWZ','TZA','KEN','UGA','RWA','BDI'] },
  { family: 'niloSaharan',  codes: ['SSD'] },
  { family: 'sinoTibetan',  codes: ['CHN','MMR','BTN','TWN'] },
  { family: 'turkic',       codes: ['TUR','AZE','N. Cyprus'] },
  { family: 'turkic',       codes: ['KAZ','UZB','TKM','KGZ'] },
  { family: 'uralic',       codes: ['FIN','EST'] },
  { family: 'uralic',       codes: ['HUN'] },
  { family: 'austronesian', codes: ['IDN','MYS','BRN','PHL','TLS'] },
  { family: 'austronesian', codes: ['MDG'] },
  { family: 'austronesian', codes: ['FJI','SLB','VUT','NCL'] },
  { family: 'austroasiatic', codes: ['VNM','KHM'] },
  { family: 'taiKadai',     codes: ['THA','LAO'] },
  { family: 'japonic',      codes: ['JPN'] },
  { family: 'koreanic',     codes: ['PRK','KOR'] },
  { family: 'mongolic',     codes: ['MNG'] },
  { family: 'kartvelian',   codes: ['GEO'] },
  { family: 'transNewGuinea', codes: ['PNG'] },
  { family: 'eskimoAleut',  codes: ['GRL'] }
];

// Family labels always beat country labels in collisions
const LANGUAGE_LABEL_PRIORITY_BOOST = 1e6;

function polygonsOf(geom) {
  return geom.type === 'Polygon' ? [geom.coordinates]
       : geom.type === 'MultiPolygon' ? geom.coordinates
       : [];
}

function featureKey(props) {
  return props.iso_a3 && props.iso_a3 !== '-99' ? props.iso_a3 : props.name;
}

// key -> index into LANGUAGE_GROUPS. A key listed twice is a table bug, so fail loudly.
function buildFamilyLookup() {
  const lookup = new Map();
  LANGUAGE_GROUPS.forEach((group, i) => {
    group.codes.forEach((code) => {
      if (lookup.has(code)) throw new Error('Country listed in two language groups: ' + code);
      lookup.set(code, i);
    });
  });
  return lookup;
}

function familyOfFeature(feature, lookup) {
  const idx = lookup.get(featureKey(feature.properties || {}));
  return idx === undefined ? null : LANGUAGE_GROUPS[idx].family;
}

// Equirectangular paint: x = lon, y = lat. This matches the terrain UVs
// (u = lon, v = lat, north at the top), so the same mapping works on the
// flat map and on the sphere.
function paintFamilyTexture(features, lookup) {
  const W = LANGUAGE_TEXTURE_WIDTH, H = LANGUAGE_TEXTURE_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  // The same-color stroke closes hairline gaps between neighboring polygons
  ctx.lineWidth = 1.5;

  features.forEach((feature) => {
    const family = familyOfFeature(feature, lookup);
    if (!family) return;
    ctx.fillStyle = LANGUAGE_FAMILIES[family].color;
    ctx.strokeStyle = LANGUAGE_FAMILIES[family].color;

    polygonsOf(feature.geometry).forEach((rings) => {
      ctx.beginPath();
      rings.forEach((ring) => {
        ring.forEach((p, i) => {
          const x = (p[0] + 180) / 360 * W;
          const y = (90 - p[1]) / 180 * H;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
      });
      // evenodd so lakes/holes stay unpainted
      ctx.fill('evenodd');
      ctx.stroke();
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

// A border is any edge shared by two countries whose families differ.
// Edges are matched by their endpoints rounded to 4 decimals.
function collectFamilyBorders(features, lookup) {
  const edges = new Map();
  const rk = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4);

  features.forEach((feature) => {
    const family = familyOfFeature(feature, lookup) || 'none';
    polygonsOf(feature.geometry).forEach((rings) => {
      rings.forEach((ring) => {
        for (let i = 0; i < ring.length - 1; i++) {
          const a = ring[i], b = ring[i + 1];
          const ka = rk(a), kb = rk(b);
          const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          const edge = edges.get(key);
          if (!edge) edges.set(key, { family, a, b, border: false });
          else if (edge.family !== family) edge.border = true;
        }
      });
    });
  });

  const flat = [], sphere = [];
  edges.forEach((edge) => {
    if (!edge.border) return;
    const p1 = projectLonLat(edge.a[0], edge.a[1], LANGUAGE_BORDER_RADIUS);
    const p2 = projectLonLat(edge.b[0], edge.b[1], LANGUAGE_BORDER_RADIUS);
    flat.push(p1.flat.x, p1.flat.y, LANGUAGE_BORDER_Z, p2.flat.x, p2.flat.y, LANGUAGE_BORDER_Z);
    sphere.push(p1.sphere.x, p1.sphere.y, p1.sphere.z, p2.sphere.x, p2.sphere.y, p2.sphere.z);
  });
  return { flat: new Float32Array(flat), sphere: new Float32Array(sphere) };
}

function buildLanguageLayer(geojson) {
  const features = geojson.features.filter((f) => f.geometry);
  const lookup = buildFamilyLookup();

  // Surface table typos instead of silently leaving a country uncolored
  const known = new Set(features.map((f) => featureKey(f.properties || {})));
  const missing = [...lookup.keys()].filter((k) => !known.has(k));
  if (missing.length) console.warn('Language table lists countries missing from the dataset:', missing);

  // --- Fill: second mesh sharing the terrain geometry, so applyMorph() moves it too ---
  const fillMaterial = new THREE.MeshBasicMaterial({
    map: paintFamilyTexture(features, lookup),
    transparent: true,
    opacity: LANGUAGE_FILL_OPACITY,
    depthWrite: false,
    // Pull toward the camera so it wins the depth test against the terrain it lies on
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const fill = new THREE.Mesh(mesh.geometry, fillMaterial);
  fill.renderOrder = 1;

  // --- Borders ---
  const borders = collectFamilyBorders(features, lookup);
  const borderGeometry = new THREE.BufferGeometry();
  borderGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(borders.sphere), 3));
  const borderLines = new THREE.LineSegments(
    borderGeometry,
    new THREE.LineBasicMaterial({ color: LANGUAGE_BORDER_COLOR, transparent: true, opacity: 0.95 })
  );
  borderLines.userData.flatPositions = borders.flat;
  borderLines.userData.spherePositions = borders.sphere;

  // --- Family names: one label per group, at the area-weighted center of its countries ---
  const stats = new Map();
  features.forEach((f) => {
    const s = polygonsStats(polygonsOf(f.geometry));
    if (s) stats.set(featureKey(f.properties || {}), s);
  });

  const labelGroup = new THREE.Group();
  const labelPriorities = [];
  LANGUAGE_GROUPS.forEach((group) => {
    let area = 0, lon = 0, lat = 0;
    group.codes.forEach((code) => {
      const s = stats.get(code);
      if (!s) return;
      area += s.area;
      lon += s.centroid[0] * s.area;
      lat += s.centroid[1] * s.area;
    });
    if (area === 0) return;

    const p = projectLonLat(lon / area, lat / area, SPHERE_LABEL_RADIUS);
    p.flat.z = FLAT_LABEL_Z;
    const sprite = makeLabelSprite(LANGUAGE_FAMILIES[group.family].label, { fontSize: 44, bold: true, fill: '#ffffff' });
    sprite.position.set(p.sphere.x, p.sphere.y, p.sphere.z);
    sprite.userData.flatPos = p.flat;
    sprite.userData.spherePos = p.sphere;
    labelGroup.add(sprite);
    labelPriorities.push(LANGUAGE_LABEL_PRIORITY_BOOST + area);
  });

  languageLayer = new THREE.Group();
  languageLayer.userData.borderLines = borderLines;
  languageLayer.userData.labelGroup = labelGroup;
  languageLayer.add(fill, borderLines, labelGroup);
  languageLayer.visible = document.getElementById('language-toggle').checked;

  labelGroup.children.forEach((sprite, i) => registerLabel(sprite, languageLayer, labelPriorities[i]));

  mesh.add(languageLayer);
  applyLanguageMorph(morphState.t);
  buildLanguageLegend();
}

function applyLanguageMorph(t) {
  if (!languageLayer) return;
  const borderLines = languageLayer.userData.borderLines;
  lerpBufferPositions(borderLines.geometry.attributes.position, borderLines.userData.flatPositions, borderLines.userData.spherePositions, t);
  applyLabelMorph(languageLayer.userData.labelGroup, t);
}

function buildLanguageLegend() {
  const legend = document.getElementById('language-legend');
  if (!legend) return;
  legend.textContent = '';
  const used = new Set(LANGUAGE_GROUPS.map((g) => g.family));
  Object.keys(LANGUAGE_FAMILIES).filter((k) => used.has(k)).forEach((key) => {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = LANGUAGE_FAMILIES[key].color;
    row.append(swatch, LANGUAGE_FAMILIES[key].label);
    legend.appendChild(row);
  });
}

function toggleLanguageLayer(checked) {
  if (languageLayer) languageLayer.visible = checked;
  const legend = document.getElementById('language-legend');
  if (legend) legend.hidden = !checked;
}