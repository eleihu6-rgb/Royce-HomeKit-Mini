// ===================================================================
// ABOUT PAGE — OFFICE MAP (D3 globe with city icons)
// ===================================================================
const ABOUT_OFFICES = [
  { name: 'Vancouver',  lat: 49.28, lng: -123.12, hq: true },
  { name: 'Dallas',     lat: 32.78, lng: -96.80 },
  { name: 'New Jersey', lat: 40.06, lng: -74.41 },
  { name: 'Malta',      lat: 35.90, lng: 14.51 },
  { name: 'Shanghai',   lat: 31.23, lng: 121.47 },
  { name: 'Hong Kong',  lat: 22.32, lng: 114.17 },
  { name: 'Singapore',  lat: 1.35,  lng: 103.82 }
];

// City icons — SVG paths drawn at ~24x24 viewBox, cartoon/line style
// Vancouver: Moose + Mountains (Canada)
// Dallas: Cowboy hat + Star (Texas)
// New Jersey: Statue of Liberty
// Malta: Knight shield + Cross
// Shanghai: Oriental Pearl Tower
// Hong Kong: Junk boat (traditional sailboat)
// Singapore: Merlion
const CITY_ICONS = {
  'Vancouver': {
    color: '#4ade80',
    offset: [24, -16],
    // Mountains with snow caps + pine tree
    paths: [
      { d: 'M0 20 L8 4 L12 10 L16 2 L24 20Z', fill: 'none', stroke: '#4ade80', sw: 1.2 },
      { d: 'M6 6 L8 4 L10 6', fill: '#fff', stroke: '#fff', sw: 0.8 },
      { d: 'M14 4 L16 2 L18 4', fill: '#fff', stroke: '#fff', sw: 0.8 },
      // Pine tree
      { d: 'M-4 20 L-4 14 M-7 20 L-4 15 L-1 20 M-6 18 L-4 16 L-2 18', fill: 'none', stroke: '#22c55e', sw: 1 },
      // Moose antler silhouette (tiny)
      { d: 'M26 18 Q27 14 30 13 Q31 11 29 10 M30 13 Q32 12 33 10', fill: 'none', stroke: '#a78bfa', sw: 1 },
      { d: 'M26 18 Q27 20 29 20 Q30 20 30 18', fill: 'none', stroke: '#a78bfa', sw: 1 },
    ]
  },
  'Dallas': {
    color: '#f97316',
    offset: [22, -18],
    // Cowboy hat + lone star
    paths: [
      // Hat brim
      { d: 'M0 16 Q4 14 8 10 Q12 6 12 3 Q14 6 14 10 Q16 6 16 3 Q16 6 16 10 Q20 14 24 16', fill: 'none', stroke: '#f97316', sw: 1.3 },
      // Hat band
      { d: 'M6 13 Q12 10 18 13', fill: 'none', stroke: '#fbbf24', sw: 0.8 },
      // Lone star
      { d: 'M12 19 L13 21 L15 21 L13.5 22.5 L14 24.5 L12 23 L10 24.5 L10.5 22.5 L9 21 L11 21Z', fill: '#fbbf24', stroke: 'none', sw: 0 },
    ]
  },
  'New Jersey': {
    color: '#38bdf8',
    offset: [22, -20],
    // Statue of Liberty (simplified)
    paths: [
      // Body / robe
      { d: 'M10 24 L8 12 Q10 10 12 10 Q14 10 16 12 L14 24Z', fill: 'none', stroke: '#38bdf8', sw: 1.2 },
      // Head
      { d: 'M12 10 Q10 8 10 7 Q10 5 12 5 Q14 5 14 7 Q14 8 12 10', fill: 'none', stroke: '#38bdf8', sw: 1 },
      // Crown spikes
      { d: 'M10 6 L9 3 M11 5 L10.5 2 M12 5 L12 1.5 M13 5 L13.5 2 M14 6 L15 3', fill: 'none', stroke: '#fbbf24', sw: 0.8 },
      // Torch arm raised
      { d: 'M14 10 L18 4 M18 4 L17 2 Q18 1 19 2 L18 4', fill: 'none', stroke: '#fbbf24', sw: 1 },
      // Torch flame
      { d: 'M17.5 2 Q18 0 18.5 1 Q19 0 18.5 2', fill: '#fbbf24', stroke: '#fbbf24', sw: 0.5 },
      // Tablet
      { d: 'M8 12 L6 14 L7 16 L9 14Z', fill: 'none', stroke: '#38bdf8', sw: 0.8 },
    ]
  },
  'Malta': {
    color: '#fb923c',
    offset: [20, -18],
    // Knight shield with Maltese cross
    paths: [
      // Shield
      { d: 'M4 4 L4 14 Q4 20 12 22 Q20 20 20 14 L20 4Z', fill: 'none', stroke: '#fb923c', sw: 1.3 },
      // Maltese cross (simplified)
      { d: 'M12 8 L10 10 L12 12 L14 10Z', fill: '#fb923c', stroke: 'none', sw: 0 },
      { d: 'M12 8 L10 6 L12 4 L14 6Z', fill: '#fb923c', stroke: 'none', sw: 0 },
      { d: 'M12 12 L10 14 L12 16 L14 14Z', fill: '#fb923c', stroke: 'none', sw: 0 },
      { d: 'M8 10 L6 8 L4 10 L6 12Z', fill: '#fb923c', stroke: 'none', sw: 0 },
      { d: 'M16 10 L18 8 L20 10 L18 12Z', fill: '#fb923c', stroke: 'none', sw: 0 },
    ]
  },
  'Shanghai': {
    color: '#f472b6',
    offset: [20, -22],
    // Oriental Pearl Tower
    paths: [
      // Base
      { d: 'M8 24 L6 18 L18 18 L16 24', fill: 'none', stroke: '#f472b6', sw: 1 },
      // Middle column
      { d: 'M10 18 L10 12 L14 12 L14 18', fill: 'none', stroke: '#f472b6', sw: 1 },
      // Lower sphere
      { d: 'M12 15 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', fill: 'none', stroke: '#f472b6', sw: 1 },
      // Upper column
      { d: 'M11 12 L11 7 L13 7 L13 12', fill: 'none', stroke: '#f472b6', sw: 0.8 },
      // Upper sphere
      { d: 'M12 8.5 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', fill: 'none', stroke: '#f472b6', sw: 1 },
      // Antenna
      { d: 'M12 6.5 L12 1', fill: 'none', stroke: '#f472b6', sw: 0.8 },
      // Tip
      { d: 'M12 1 L11.5 2.5 L12.5 2.5Z', fill: '#f472b6', stroke: 'none', sw: 0 },
    ]
  },
  'Hong Kong': {
    color: '#f87171',
    offset: [20, 14],
    // Traditional junk boat
    paths: [
      // Hull
      { d: 'M0 16 Q2 20 12 20 Q22 20 24 16Z', fill: 'none', stroke: '#f87171', sw: 1.3 },
      // Mast
      { d: 'M12 16 L12 3', fill: 'none', stroke: '#f87171', sw: 1 },
      // Main sail (batten sail)
      { d: 'M12 4 L20 8 L20 14 L12 14Z', fill: 'none', stroke: '#f87171', sw: 0.8 },
      // Battens
      { d: 'M12 7 L19 9.5', fill: 'none', stroke: '#f87171', sw: 0.5 },
      { d: 'M12 10 L20 11.5', fill: 'none', stroke: '#f87171', sw: 0.5 },
      // Front sail
      { d: 'M12 5 L5 10 L5 14 L12 14Z', fill: 'none', stroke: '#f87171', sw: 0.8 },
      // Flag
      { d: 'M12 3 L15 4 L12 5', fill: '#f87171', stroke: 'none', sw: 0 },
    ]
  },
  'Singapore': {
    color: '#2dd4bf',
    offset: [20, -20],
    // Merlion
    paths: [
      // Body (lion sitting)
      { d: 'M8 24 L8 16 Q8 12 12 12 Q16 12 16 16 L16 24', fill: 'none', stroke: '#2dd4bf', sw: 1.2 },
      // Head
      { d: 'M10 12 Q10 8 12 7 Q14 8 14 12', fill: 'none', stroke: '#2dd4bf', sw: 1.2 },
      // Mane
      { d: 'M10 10 Q8 9 9 7 Q10 8 10 10 M14 10 Q16 9 15 7 Q14 8 14 10', fill: 'none', stroke: '#2dd4bf', sw: 0.8 },
      // Fish tail (curving up)
      { d: 'M16 18 Q20 16 22 12 Q24 10 22 8', fill: 'none', stroke: '#2dd4bf', sw: 1.2 },
      { d: 'M22 8 Q20 7 20 9 Q21 10 22 8', fill: '#2dd4bf', stroke: 'none', sw: 0 },
      // Water spray from mouth
      { d: 'M12 9 Q10 6 8 4 M12 9 Q11 5 10 3 M12 9 Q12 5 12 2', fill: 'none', stroke: '#38bdf8', sw: 0.7 },
      // Water drops
      { d: 'M8 3.5 Q8 3 8.5 3.5 Q8 4 8 3.5', fill: '#38bdf8', stroke: 'none', sw: 0 },
      { d: 'M10 2.5 Q10 2 10.5 2.5 Q10 3 10 2.5', fill: '#38bdf8', stroke: 'none', sw: 0 },
    ]
  }
};

let aboutMapInit = false;

function initAboutMap() {
  if (aboutMapInit) return;
  aboutMapInit = true;

  const wrap = document.getElementById('about-map-wrap');
  if (!wrap) return;
  d3.select('#about-map').selectAll('*').remove();
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  if (W < 10 || H < 10) { aboutMapInit = false; return; }

  const svg = d3.select('#about-map');
  const g = svg.append('g');

  // Position map so Vancouver lands near the right-bottom corner of the info panel
  const targetX = 363, targetY = 331;
  const projection = d3.geoNaturalEarth1()
    .scale(W / 4.64)
    .rotate([40, -10])
    .translate([0, 0]);
  const vanRaw = projection([-123.12, 49.28]);
  projection.translate([targetX - vanRaw[0], targetY - vanRaw[1]]);

  const path = d3.geoPath().projection(projection);

  // Sphere + graticule
  g.append('path').datum({ type: 'Sphere' }).attr('class', 'ab-sphere').attr('d', path);
  g.append('path').datum(d3.geoGraticule()()).attr('class', 'ab-graticule').attr('d', path);

  // Country layer
  const countryG = g.append('g').attr('class', 'ab-country-layer');

  _worldDataPromise.then(world => {
    if (!world) return;
    countryG.selectAll('.ab-country')
      .data(topojson.feature(world, world.objects.countries).features)
      .join('path').attr('class', 'ab-country').attr('d', path);
  });

  // Office markers + city icons
  const markerG = g.append('g').attr('class', 'ab-markers');

  ABOUT_OFFICES.forEach(office => {
    const xy = projection([office.lng, office.lat]);
    if (!xy) return;
    const [x, y] = xy;

    const mg = markerG.append('g')
      .attr('class', 'ab-marker')
      .attr('data-xy', `${x},${y}`)
      .attr('transform', `translate(${x},${y})`);

    // Pulse ring for HQ
    if (office.hq) {
      const pulse = mg.append('circle')
        .attr('r', 8)
        .attr('fill', 'none')
        .attr('stroke', '#fbbf24')
        .attr('stroke-width', 1.5)
        .node();
      pulse.animate([
        { transform: 'scale(1)', opacity: 0.8, offset: 0 },
        { transform: 'scale(3)', opacity: 0, offset: 1 }
      ], { duration: 2000, iterations: Infinity });
    }

    // Pin dot
    const r = office.hq ? 6 : 4.5;
    mg.append('circle')
      .attr('r', r)
      .attr('fill', office.hq ? '#fbbf24' : 'var(--accent-warning)')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('class', 'ab-pin');

    // Label
    mg.append('text')
      .attr('class', 'ab-label')
      .attr('x', 0)
      .attr('y', -r - 6)
      .attr('text-anchor', 'middle')
      .text(office.name + (office.hq ? ' (HQ)' : ''));

    // City icon
    const icon = CITY_ICONS[office.name];
    if (icon) {
      const ig = mg.append('g')
        .attr('class', 'ab-icon')
        .attr('data-ox', icon.offset[0])
        .attr('data-oy', icon.offset[1])
        .attr('transform', `translate(${icon.offset[0]},${icon.offset[1]}) scale(1.08)`)
        .attr('opacity', 0.85);

      icon.paths.forEach(p => {
        ig.append('path')
          .attr('d', p.d)
          .attr('fill', p.fill || 'none')
          .attr('stroke', p.stroke || icon.color)
          .attr('stroke-width', p.sw || 1)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round');
      });
    }
  });

  // Zoom: pins/labels stay constant size, icons scale with map
  const zoom = d3.zoom()
    .scaleExtent([0.8, 6])
    .on('zoom', ({ transform }) => {
      g.attr('transform', transform);
      const s = 1 / transform.k;
      g.selectAll('.ab-marker').each(function () {
        const el = d3.select(this);
        const orig = el.attr('data-xy');
        if (!orig) return;
        const [mx, my] = orig.split(',').map(Number);
        el.attr('transform', `translate(${mx},${my}) scale(${s})`);
        // Counter inverse-scale on icons so they grow/shrink with map zoom
        el.selectAll('.ab-icon').each(function () {
          const iconEl = d3.select(this);
          const ox = iconEl.attr('data-ox');
          const oy = iconEl.attr('data-oy');
          iconEl.attr('transform', `translate(${ox},${oy}) scale(${1.08 * transform.k})`);
        });
      });
    });
  svg.call(zoom);
}

// Re-init on resize when about page is active
let aboutMapResizeTimer;
window.addEventListener('resize', () => {
  if (!document.getElementById('page-about')?.classList.contains('active')) return;
  clearTimeout(aboutMapResizeTimer);
  aboutMapResizeTimer = setTimeout(() => {
    aboutMapInit = false;
    initAboutMap();
  }, 200);
});
