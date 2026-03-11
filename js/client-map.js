// ===================================================================
// CLIENT MAP
// ===================================================================
const MAP_AIRLINES = [{"name":"Air China","country":"China","lat":39.9,"lng":116.4,"city":"Beijing","src":"images/Air_China.png"},{"name":"Air China Cargo","country":"China","lat":39.9,"lng":116.4,"city":"Beijing","src":"images/Air_China_Cargo.png"},{"name":"Loong Air","country":"China","lat":30.3,"lng":120.2,"city":"Hangzhou","src":"images/Loong_Air.png"},{"name":"JDL Airlines","country":"China","lat":28.2,"lng":112.9,"city":"Changsha","src":"images/JDL_Airlines.png"},{"name":"Shenzhen Airlines","country":"China","lat":22.5,"lng":114.1,"city":"Shenzhen","src":"images/Shenzhen_Airlines.png"},{"name":"OK Air","country":"China","lat":41.8,"lng":123.4,"city":"Shenyang","src":"images/OK_Air.png"},{"name":"Hong Kong Airlines","country":"Hong Kong","lat":22.3,"lng":114.2,"city":"Hong Kong","src":"images/Hong_Kong_Airlines.png"},{"name":"Eva Air","country":"Taiwan","lat":25.1,"lng":121.6,"city":"Taipei","src":"images/Eva_Air.png"},{"name":"Tigerair Taiwan","country":"Taiwan","lat":25.05,"lng":121.5,"city":"Taipei","src":"images/Tigerair_Taiwan.png"},{"name":"Uni Air","country":"Taiwan","lat":24.8,"lng":120.9,"city":"Hsinchu","src":"images/Uni_Air.png"},{"name":"Thai Airways","country":"Thailand","lat":13.8,"lng":100.5,"city":"Bangkok","src":"images/Thai_Airways.png"},{"name":"Singapore Airlines","country":"Singapore","lat":1.35,"lng":103.82,"city":"Singapore","src":"images/Singapore_Airlines.png"},{"name":"Philippine Airlines","country":"Philippines","lat":14.6,"lng":121.0,"city":"Manila","src":"images/Philippine_Airlines.png"},{"name":"Cebu Pacific","country":"Philippines","lat":14.5,"lng":121.1,"city":"Manila","src":"images/Cebu_Pacific.png"},{"name":"Alliance Airlines","country":"Canada","lat":-27.5,"lng":153.0,"city":"Brisbane","src":"images/Alliance_Airlines.png"},{"name":"Flair Airlines","country":"Thailand","lat":53.5,"lng":-113.5,"city":"Edmonton","src":"images/Flair_Airlines.png"},{"name":"Lufthansa","country":"Germany","lat":50.1,"lng":8.7,"city":"Frankfurt","src":"images/Lufthansa.svg"}];

const MAP_COLORS = {'China':'#f87171','Hong Kong':'#fb923c','Taiwan':'#facc15','Thailand':'#a78bfa','Singapore':'#38bdf8','Philippines':'#4ade80','Australia':'#f97316','Canada':'#f43f5e','Germany':'#fbbf24'};

const MAP_OFFSETS = {'Eva Air':[20,-15],'Tigerair Taiwan':[20,10],'Uni Air':[-22,12],'Philippine Airlines':[-22,-10],'Cebu Pacific':[20,10],'Hong Kong Airlines':[-22,-12],'Shenzhen Airlines':[-22,12],'Loong Air':[22,-15],'Air China':[-24,-12],'Air China Cargo':[24,12]};

const MAP_LOGO_SCALE = {'Singapore Airlines':1.2,'Thai Airways':1.2,'Alliance Airlines':1.2,'Flair Airlines':1.2,'Lufthansa':1.2};

let mapInitialised = false;

// Prefetch world atlas data immediately on script load (cache the promise)
const _worldDataPromise = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
  .then(r => r.json())
  .catch(() => null);

function initClientMap() {
  if (mapInitialised) return;
  mapInitialised = true;

  const wrap = document.getElementById('client-map-wrap');
  d3.select('#client-map').selectAll('*').remove();
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  const svg = d3.select('#client-map');
  const R = 20;

  const zoom = d3.zoom()
    .scaleExtent([0.8, 12])
    .on('zoom', ({transform}) => {
      g.attr('transform', transform);
      // Scale logos proportionally with zoom (sqrt for dampened but visible scaling)
      const logoScale = Math.sqrt(transform.k) / transform.k;
      g.selectAll('.marker-group').attr('transform', function() {
        const orig = d3.select(this).attr('data-xy');
        if (!orig) return d3.select(this).attr('transform');
        const [x, y] = orig.split(',').map(Number);
        return `translate(${x},${y}) scale(${logoScale})`;
      });
    });

  svg.call(zoom);
  const g = svg.append('g');

  const projection = d3.geoNaturalEarth1()
    .scale(W / 4.08)
    .rotate([-155, -10])
    .translate([W / 2, H / 2 + H * 0.12]);

  const path = d3.geoPath().projection(projection);

  g.append('path').datum({type:'Sphere'}).attr('class','sphere').attr('d', path);
  g.append('path').datum(d3.geoGraticule()()).attr('class','graticule').attr('d', path);

  // Reserve country layer in correct z-order (above graticule, below markers)
  const countryG = g.append('g').attr('class','country-layer');

  // Draw markers immediately, don't wait for country polygons
  drawMapMarkers();

  // Fill in countries from prefetched data
  _worldDataPromise.then(world => {
    if (!world) return;
    countryG.selectAll('.country')
      .data(topojson.feature(world, world.objects.countries).features)
      .join('path').attr('class','country').attr('d', path);
  });

  function drawMapMarkers() {
    const markerG = g.append('g').attr('class','markers');
    const tip = document.getElementById('map-tip');
    const destCanada   = projection([-96, 56]);
    const destThailand = projection([101, 15]);

    MAP_AIRLINES.forEach((airline, i) => {
      const xy = projection([airline.lng, airline.lat]);
      if (!xy) return;
      const off = MAP_OFFSETS[airline.name] || [0, 0];
      const [x, y] = [xy[0] + off[0], xy[1] + off[1]];
      const color = MAP_COLORS[airline.country] || '#fff';
      const r = R * (MAP_LOGO_SCALE[airline.name] || 1.0);

      const mg = markerG.append('g')
        .attr('class','marker-group')
        .attr('data-xy', `${x},${y}`)
        .attr('transform', `translate(${x},${y})`);

      const dest = airline.name === 'Flair Airlines' ? destThailand : destCanada;
      const dx = dest[0] - x, dy = dest[1] - y;

      const pingEl = mg.append('circle')
        .attr('class','ping').attr('r', r)
        .attr('fill','none').attr('stroke', color).attr('stroke-width', 1.5)
        .node();

      pingEl.animate([
        { transform:'translate(0px,0px)', opacity:0.85, offset:0 },
        { opacity:0.5, offset:0.55 },
        { transform:`translate(${dx}px,${dy}px)`, opacity:0, offset:1 }
      ], { duration:14000, easing:'cubic-bezier(0,0,0.2,1)', iterations:Infinity, delay:0 });

      mg.append('circle').attr('class','marker-bg').attr('r', r)
        .attr('fill','white').attr('stroke', color).attr('stroke-width', 2);

      const clipId = `mclip-${i}`;
      mg.append('clipPath').attr('id', clipId).append('circle').attr('r', r - 2);

      mg.append('image')
        .attr('href', airline.src)
        .attr('x', -(r-2)).attr('y', -(r-2))
        .attr('width', (r-2)*2).attr('height', (r-2)*2)
        .attr('preserveAspectRatio','xMidYMid meet')
        .attr('clip-path', `url(#${clipId})`);

      mg.on('mouseenter', function(event) {
        document.getElementById('map-tip-name').textContent = airline.name;
        document.getElementById('map-tip-loc').textContent  = `${airline.city} · ${airline.country}`;
        document.getElementById('map-tip-img').src = airline.src;
        const tx = event.clientX + 220 > window.innerWidth ? event.clientX - 220 : event.clientX + 20;
        tip.style.left = tx + 'px';
        tip.style.top  = (event.clientY - 40) + 'px';
        tip.classList.add('show');
        d3.select(this).select('.marker-bg').transition().duration(150).attr('r', r * 1.25);
      })
      .on('mousemove', function(event) {
        const tx = event.clientX + 220 > window.innerWidth ? event.clientX - 220 : event.clientX + 20;
        tip.style.left = tx + 'px';
        tip.style.top  = (event.clientY - 40) + 'px';
      })
      .on('mouseleave', function() {
        tip.classList.remove('show');
        d3.select(this).select('.marker-bg').transition().duration(150).attr('r', r);
      });
    });
  }

  // Legend
  const byCountry = {};
  MAP_AIRLINES.forEach(a => { (byCountry[a.country] = byCountry[a.country] || []).push(a); });
  const legEl = document.getElementById('map-leg-items');
  legEl.innerHTML = '';
  Object.entries(byCountry).forEach(([c, arr]) => {
    const d = document.createElement('div');
    d.className = 'map-leg';
    d.innerHTML = `<div class="map-leg-dot" style="background:${MAP_COLORS[c]||'#fff'}"></div><span>${c}</span><span class="map-leg-cnt">(${arr.length})</span>`;
    legEl.appendChild(d);
  });

  // Zoom buttons
  document.getElementById('mzin').onclick    = () => svg.transition().call(zoom.scaleBy, 1.5);
  document.getElementById('mzout').onclick   = () => svg.transition().call(zoom.scaleBy, 0.67);
  document.getElementById('mzreset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

  // Rotate button — cycles longitude by 90° each click
  let currentRotation = -155;
  document.getElementById('mzrotate').onclick = () => {
    currentRotation -= 90;
    projection.rotate([currentRotation, -10]);
    g.selectAll('.sphere').attr('d', path);
    g.selectAll('.graticule').attr('d', path);
    countryG.selectAll('.country').attr('d', path);
    // Reposition markers
    g.selectAll('.marker-group').each(function(d, i) {
      const airline = MAP_AIRLINES[i];
      if (!airline) return;
      const off = MAP_OFFSETS[airline.name] || [0, 0];
      const xy = projection([airline.lng, airline.lat]);
      if (!xy) { d3.select(this).attr('visibility','hidden'); return; }
      const [x, y] = [xy[0] + off[0], xy[1] + off[1]];
      d3.select(this).attr('visibility','visible')
        .attr('data-xy', `${x},${y}`)
        .attr('transform', `translate(${x},${y})`);
    });
    // Reset zoom after rotation
    svg.call(zoom.transform, d3.zoomIdentity);
  };
}

// Re-init map on window resize when client page is active
let mapResizeTimer;
window.addEventListener('resize', () => {
  if (!document.getElementById('page-client').classList.contains('active')) return;
  clearTimeout(mapResizeTimer);
  mapResizeTimer = setTimeout(() => {
    mapInitialised = false;
    initClientMap();
  }, 200);
});
