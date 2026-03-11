// ===================================================================
// ABOUT MODEL — Crew Cycle Wheel
// ===================================================================
let modelInitialised = false;

function initModelPage() {
  if (modelInitialised) return;
  modelInitialised = true;

  const MDL_CATS = [
    { label:'Long Term',        start:0, count:2, ringColor:'rgba(0,185,200,0.55)',  trackFill:'rgba(0,185,200,0.12)' },
    { label:'Short Term',       start:2, count:4, ringColor:'rgba(240,130,0,0.55)',  trackFill:'rgba(240,130,0,0.10)' },
    { label:'Day of Operation', start:6, count:3, ringColor:'rgba(76,175,80,0.55)',  trackFill:'rgba(76,175,80,0.10)' },
  ];
  const MDL_SEGS = [
    { name:'Manpower\nPlanning', label:'Manpower Planning', step:'Step 01', cat:'Long Term', color:'#00b4c4', badgeCol:'#40d8e2', g:['#40e0ea','#007b8a'], icon:'M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z', desc:'Long-term strategic workforce planning ensuring optimal crew availability for all flight operations.', feats:['Demand & availability forecasting','Operation history summary','Flight network analysis','Promotion & recruitment planning','Standby & leave balancing'],
      value: { metric:'More accurate planning by pairing and roster optimizer considering all legality and real case business constraints', details:['Automated leave, training &amp; standby planning integrated into crew establishment model'], airlines:[{name:'EVA Air',logo:'images/Eva_Air.png'},{name:'Air China',logo:'images/Air_China.png'}] } },
    { name:'Legality\nEngine',   label:'Legality Engine',   step:'Step 02', cat:'Long Term', color:'#007080', badgeCol:'#009baa', g:['#009baa','#004d57'], icon:'M12 1L3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4zm-1 14l-3-3 1.4-1.4 1.6 1.6 4.6-4.6L17 9l-6 6z', desc:'Industry-grade regulatory compliance engine ensuring all crew assignments meet global aviation standards.', feats:['FAA 117 & EASA compliance','Highly configurable rule sets','High-performance processing','Internal & external API service','Cost optimization built-in'],
      value: { metric:'Full legality compliance for government rules and multiple union agreements', details:['Proactive violation detection during planning phase — before roster publication'], airlines:[{name:'Singapore Airlines',logo:'images/Singapore_Airlines.png'},{name:'THAI Airways',logo:'images/Thai_Airways.png'},{name:'Air China',logo:'images/Air_China.png'},{name:'Alliance Airlines',logo:'images/Alliance_Airlines.png'}] } },
    { name:'Pairing\nOptimizer', label:'Pairing Optimizer', step:'Step 03', cat:'Short Term', color:'#f9b825', badgeCol:'#ffe082', g:['#ffe082','#f9a825'], icon:'M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z', desc:'ML-powered pairing engine balancing cost, crew utilization and fatigue across multiple bases simultaneously.', feats:['Machine learning powered','Multiple bases optimization','Multi-goal: cost, utilization, fatigue','Flexible daily/monthly/seasonal modes','Crew preference integration'],
      value: { metric:'Reduced operational costs <span class="mdl-val-num" style="--mod-color:#f9b825">&gt;5.24%</span>', details:['Rostering cycle shortened: 10+ days → 2 days','Daily crew utilization increased: +5% to +13%','Minimizes hotel layover costs, deadheads, and positioning flights','Scenario / what-if analysis for commercial schedule change impact'], airlines:[{name:'Singapore Airlines',logo:'images/Singapore_Airlines.png'},{name:'Air China',logo:'images/Air_China.png'},{name:'Alliance Airlines',logo:'images/Alliance_Airlines.png'}] } },
    { name:'Training\nOptimizer',label:'Training Optimizer',step:'Step 04', cat:'Short Term', color:'#f08000', badgeCol:'#ffb300', g:['#ffb300','#e65100'], icon:'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z', desc:'Automated training lifecycle management ensuring crew recency and regulatory compliance are always maintained.', feats:['Training / days-off automation','Approval & assignment automation','Specific duty preference support','Recency reassignment','Fatigue-aware scheduling'],
      value: { metric:'Earlier training facility booking reduced cost by <span class="mdl-val-num" style="--mod-color:#f08000">20%+</span>', details:['Auto-tracks qualification expiry &amp; sends proactive alerts','Conflict-free simulator, instructor &amp; venue scheduling','Recency auto-calculated; warns before upcoming flight'], airlines:[{name:'EVA Air',logo:'images/Eva_Air.png'},{name:'Alliance Airlines',logo:'images/Alliance_Airlines.png'},{name:'Air China',logo:'images/Air_China.png'}] } },
    { name:'PBS',                label:'Preference Bidding System', step:'Step 05', cat:'Short Term', color:'#d05000', badgeCol:'#ff8f00', g:['#ff8f00','#bf360c'], icon:'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z', desc:'Crew preference bidding system empowering staff to express scheduling preferences within operational constraints.', feats:['Crew preference bidding','Roster inquiry & real-time alerts','Crew info self-service portal','e-Logbook integration','Fair & transparent allocation'],
      value: { metric:'Crew satisfaction rate increased <span class="mdl-val-num" style="--mod-color:#d05000">&gt;21%</span>', details:[], airlines:[{name:'EVA Air',logo:'images/Eva_Air.png'}] } },
    { name:'Roster\nOptimizer',  label:'Roster Optimizer',  step:'Step 06', cat:'Short Term', color:'#a03800', badgeCol:'#e65100', g:['#e65100','#7f2800'], icon:'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z', desc:'Intelligent rostering engine that builds compliant, cost-efficient rosters while balancing crew wellbeing.', feats:['Half pairing optimization','Flexible daily, monthly & seasonal modes','Training optimization integration','Fatigue risk management','Preference bidding alignment'],
      value: { metric:'Rostering planning productivity increased <span class="mdl-val-num" style="--mod-color:#a03800">&gt;57%</span>', details:['Optimization speed: &gt;200% improvement','Scheduling fairness improved: &gt;41.4%'], airlines:[{name:'Air China',logo:'images/Air_China.png'},{name:'THAI Airways',logo:'images/Thai_Airways.png'}] } },
    { name:'Tracking',           label:'Tracking',           step:'Step 07', cat:'Day of Operation', color:'#3aaa3e', badgeCol:'#80e27e', g:['#80e27e','#2e7d32'], icon:'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z', desc:'Real-time crew tracking and operational recovery platform with full disruption management capabilities.', feats:['Real-time crew tracking','What-if simulation engine','Disruption recommendation','Trip trade management','Logbook handling & GD/APIS'],
      value: { metric:'Robust planning to decrease day-of-ops disruption rate <span class="mdl-val-num" style="--mod-color:#3aaa3e">&gt;7%</span>', details:['User efficiency increases 60% by full automated GD/APP/APIS process','Real-time check-in monitoring, visa validity alerts, connection time warnings','Automated crew notification and acknowledgment for schedule changes','Automated fatigue risk modeling integration','Semi-auto best fit for actionable reassignment options within minutes'], airlines:[{name:'EVA Air',logo:'images/Eva_Air.png'},{name:'THAI Airways',logo:'images/Thai_Airways.png'}] } },
    { name:'Crew APP',           label:'Crew APP',           step:'Step 08', cat:'Day of Operation', color:'#2e7d32', badgeCol:'#4caf50', g:['#4caf50','#1b5e20'], icon:'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z', desc:'Mobile-first self-service app giving crew members full visibility and control over their schedule anytime.', feats:['Roster inquiry & push notifications','Crew absent automation','Trip trade requests','e-Logbook mobile entry','Real-time flight status'],
      value: { metric:'Crew satisfaction rate increased <span class="mdl-val-num" style="--mod-color:#2e7d32">&gt;21%</span> by online bidding and duty swap', details:['Push notifications for schedule changes, check-in reminders, and flight updates','Self-service duty swap with legality check and manager approval workflow'], airlines:[{name:'THAI Airways',logo:'images/Thai_Airways.png'},{name:'EVA Air',logo:'images/Eva_Air.png'}] } },
    { name:'Crew\naiBuddy',       label:'Crew aiBuddy',       step:'Step 09', cat:'Day of Operation', color:'#1b5e20', badgeCol:'#1e8e22', g:['#1e8e22','#0a3d0c'], icon:'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z', desc:'Crew Own AI assistant for PBS bidding, Duty swap, absence management.', feats:['Flight and day off popularity and heatmap analysis','Bid item and actual intension mapping analysis and tunning','Bid line award rate analysis'],
      value: { metric:'Automated process may increase service efficiency by <span class="mdl-val-num" style="--mod-color:#1b5e20">15%</span>', details:['Increase overall crew satisfaction','Reduce unnecessary reserve duty'], airlines:[{name:'Flair Airlines',logo:'images/Flair_Airlines.png'}] } },
  ];

  const cv  = document.getElementById('mdl-cv');
  const ctx = cv.getContext('2d');

  // Dimension variables — updated by resizeMdl()
  let W, H, CX, CY, R_OUT, R_IN, R_BADGE, BADGE_R, fScale;

  function resizeMdl() {
    const wrap = document.getElementById('mdl-wrap');
    if (!wrap) return;
    const scene    = cv.parentElement;
    const controls = document.querySelector('.mdl-spin-controls');
    const dp       = document.getElementById('mdl-dp');
    const vc       = document.getElementById('mdl-vc');
    const btnH  = controls ? controls.offsetHeight + 14 : 50;
    const dpW   = Math.max(200, dp && dp.offsetWidth > 0 ? dp.offsetWidth + 16 : 280);
    const vcW   = Math.max(200, vc && vc.offsetWidth > 0 ? vc.offsetWidth + 16 : 280);
    const avH = wrap.clientHeight - 32 - btnH;
    const avW = wrap.clientWidth  - 32 - dpW - vcW;
    const size = Math.max(160, Math.min(avH, avW, 770));
    scene.style.width  = size + 'px';
    scene.style.height = size + 'px';
    cv.width  = size;
    cv.height = size;
    W = size; H = size; CX = size / 2; CY = size / 2;
    fScale  = size / 700;
    R_OUT   = size * 300 / 700;
    R_IN    = size * 148 / 700;
    R_BADGE = size * 170 / 700;
    BADGE_R = size * 16  / 700;
    wrap.style.setProperty('--mdl-scale', fScale.toFixed(4));
  }

  const N = MDL_SEGS.length, SLICE = Math.PI * 2 / N, GAP = 0.022;
  const START_ANGLE = -70 * Math.PI / 180;
  const iconPaths = MDL_SEGS.map(s => new Path2D(s.icon.split('z').join('Z')));

  function makeGrad(midAngle, col1, col2) {
    const mx = CX + (R_OUT + R_IN) / 2 * Math.cos(midAngle);
    const my = CY + (R_OUT + R_IN) / 2 * Math.sin(midAngle);
    const gr = ctx.createRadialGradient(mx, my, 10 * fScale, CX, CY, R_OUT);
    gr.addColorStop(0, col1); gr.addColorStop(1, col2); return gr;
  }

  let wheelAngle = 0, autoSpin = 0, velocity = 0, hoveredIdx = -1, pinnedIdx = 0;
  let isDragging = false, dragStartAngle = 0, dragLastAngle = 0, dragVel = 0;
  let lastDragTime = 0, lastTime = null, wasDragging = false;

  function hitTest(ex, ey) {
    const dx = ex - CX, dy = ey - CY, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < R_IN || dist > R_OUT) return -1;
    let a = ((Math.atan2(dy, dx) - wheelAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    for (let i = 0; i < N; i++) {
      const sa = ((START_ANGLE + i * SLICE + GAP) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const ea = ((START_ANGLE + (i + 1) * SLICE - GAP) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (sa < ea) { if (a >= sa && a <= ea) return i; } else { if (a >= sa || a <= ea) return i; }
    }
    return -1;
  }
  function getEventAngle(e) {
    const r = cv.getBoundingClientRect();
    return Math.atan2((e.clientY - r.top) * (H / r.height) - CY, (e.clientX - r.left) * (W / r.width) - CX);
  }
  function getEventPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  function drawArc(sa, ea, ro, ri) { ctx.beginPath(); ctx.arc(CX, CY, ro, sa, ea, false); ctx.arc(CX, CY, ri, ea, sa, true); ctx.closePath(); }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // Outer ring
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R_OUT + 40 * fScale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3 * fScale, 12 * fScale]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    // Category arcs
    const R_CAT_IN = R_OUT + 8 * fScale, R_CAT_OUT = R_OUT + 30 * fScale;
    MDL_CATS.forEach(cat => {
      const sa = START_ANGLE + cat.start * SLICE + wheelAngle + 0.04;
      const ea = START_ANGLE + (cat.start + cat.count) * SLICE + wheelAngle - 0.04;
      ctx.save(); drawArc(sa, ea, R_CAT_OUT, R_CAT_IN);
      ctx.fillStyle = cat.trackFill; ctx.fill();
      ctx.strokeStyle = cat.ringColor; ctx.lineWidth = 1.5; ctx.stroke();
      const midA = (sa + ea) / 2;
      const lx = CX + (R_CAT_IN + R_CAT_OUT) / 2 * Math.cos(midA), ly = CY + (R_CAT_IN + R_CAT_OUT) / 2 * Math.sin(midA);
      ctx.translate(lx, ly); ctx.rotate(midA + Math.PI / 2);
      ctx.font = `bold ${Math.max(6, Math.round(9 * fScale))}px Barlow Condensed,sans-serif`;
      ctx.fillStyle = cat.ringColor.replace('0.55', '1');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cat.label.toUpperCase(), 0, 0); ctx.restore();
    });
    // Segments
    MDL_SEGS.forEach((seg, i) => {
      const sa = START_ANGLE + i * SLICE + GAP + wheelAngle, ea = START_ANGLE + (i + 1) * SLICE - GAP + wheelAngle, ma = (sa + ea) / 2;
      const isHov = (i === hoveredIdx || i === pinnedIdx), scale = isHov ? 1.12 : 1.0;
      ctx.save();
      if (scale !== 1.0) { const smx = CX + (R_OUT + R_IN) / 2 * Math.cos(ma), smy = CY + (R_OUT + R_IN) / 2 * Math.sin(ma); ctx.translate(smx, smy); ctx.scale(scale, scale); ctx.translate(-smx, -smy); }
      drawArc(sa, ea, R_OUT, R_IN); ctx.fillStyle = makeGrad(ma, seg.g[0], seg.g[1]); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (isHov) { ctx.save(); ctx.shadowColor = 'rgba(255,255,255,0.6)'; ctx.shadowBlur = 20; drawArc(sa, ea, R_OUT, R_IN); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      ctx.beginPath(); ctx.arc(CX, CY, R_OUT - 9 * fScale, sa + 0.05, ea - 0.05, false); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 5 * fScale; ctx.lineCap = 'round'; ctx.stroke();
      const aA = ea - 0.03, aMidR = (R_OUT + R_IN) / 2, apx = CX + aMidR * Math.cos(aA), apy = CY + aMidR * Math.sin(aA), tAng = aA + Math.PI / 2, sz = 8 * fScale;
      ctx.beginPath(); ctx.moveTo(apx + sz * Math.cos(tAng), apy + sz * Math.sin(tAng)); ctx.lineTo(apx + sz * .65 * Math.cos(tAng + 2.45), apy + sz * .65 * Math.sin(tAng + 2.45)); ctx.lineTo(apx + sz * .65 * Math.cos(tAng - 2.45), apy + sz * .65 * Math.sin(tAng - 2.45)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      const bx = CX + R_BADGE * Math.cos(ma), by = CY + R_BADGE * Math.sin(ma);
      ctx.beginPath(); ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2); ctx.fillStyle = seg.badgeCol; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.save(); ctx.translate(bx, by); ctx.rotate(ma + Math.PI / 2); const ic = BADGE_R * 1.3 / 24; ctx.scale(ic, ic); ctx.translate(-12, -12); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill(iconPaths[i]); ctx.restore();
      const lR = R_OUT - 40 * fScale, lx = CX + lR * Math.cos(ma), ly = CY + lR * Math.sin(ma);
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(ma + Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${Math.max(5, Math.round(8 * fScale))}px Barlow,sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(seg.step.toUpperCase(), 0, seg.name.includes('\n') ? -22 * fScale : -14 * fScale);
      const lines = seg.name.split('\n'); lines.forEach((ln, li) => { ctx.font = `bold ${Math.max(7, Math.round(12.5 * fScale))}px Barlow Condensed,sans-serif`; ctx.fillStyle = '#ffffff'; ctx.fillText(ln, 0, (seg.name.includes('\n') ? -8 * fScale : 0) + li * 15 * fScale); });
      ctx.restore();
      const bd_a = START_ANGLE + i * SLICE + wheelAngle, bd_r = (R_OUT + R_IN) / 2;
      ctx.beginPath(); ctx.arc(CX + bd_r * Math.cos(bd_a), CY + bd_r * Math.sin(bd_a), 4 * fScale, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
      ctx.restore();
    });
    // Centre disc
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R_IN - 6 * fScale, 0, Math.PI * 2); ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 12; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = 'rgba(0,30,80,0.08)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(ts - lastTime, 50); lastTime = ts;
    if (!isDragging) { wheelAngle += (autoSpin + velocity) * (dt / 16.67); velocity *= 0.97; if (Math.abs(velocity) < 0.001) velocity = 0; }
    draw(); requestAnimationFrame(loop);
  }

  cv.addEventListener('mousemove', e => {
    if (isDragging) return;
    const p = getEventPos(e), idx = hitTest(p.x, p.y);
    if (idx !== hoveredIdx) { hoveredIdx = idx; if (pinnedIdx < 0) { if (idx >= 0) showDetail(idx); else clearDetail(); } }
  });
  cv.addEventListener('mouseleave', () => { hoveredIdx = -1; if (pinnedIdx < 0) clearDetail(); });
  cv.addEventListener('click', e => {
    if (wasDragging) return;
    const p = getEventPos(e), idx = hitTest(p.x, p.y);
    if (idx < 0) { pinnedIdx = -1; clearDetail(); return; }
    if (pinnedIdx === idx) { pinnedIdx = -1; clearDetail(); } else { pinnedIdx = idx; showDetail(idx); }
  });
  cv.addEventListener('mousedown', e => {
    const p = getEventPos(e); if (Math.sqrt((p.x - CX) ** 2 + (p.y - CY) ** 2) < R_IN) return;
    isDragging = true; wasDragging = false; dragStartAngle = getEventAngle(e) - wheelAngle;
    dragLastAngle = getEventAngle(e); lastDragTime = performance.now(); velocity = 0; cv.classList.add('dragging'); e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const a = getEventAngle(e), nw = a - dragStartAngle;
    if (Math.abs(nw - wheelAngle) > 0.005) wasDragging = true;
    const now = performance.now(), el = now - lastDragTime;
    if (el > 0) dragVel = (a - dragLastAngle) / el * 16.67;
    dragLastAngle = a; lastDragTime = now; wheelAngle = nw;
  });
  window.addEventListener('mouseup', () => {
    if (!isDragging) return; isDragging = false; cv.classList.remove('dragging'); velocity = dragVel * 0.6;
  });
  cv.addEventListener('touchstart', e => { const t = e.touches[0]; isDragging = true; wasDragging = false; dragStartAngle = getEventAngle(t) - wheelAngle; dragLastAngle = getEventAngle(t); lastDragTime = performance.now(); velocity = 0; e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { if (!isDragging) return; const t = e.touches[0], a = getEventAngle(t), now = performance.now(), el = now - lastDragTime; if (el > 0) dragVel = (a - dragLastAngle) / el * 16.67; dragLastAngle = a; lastDragTime = now; wheelAngle = a - dragStartAngle; wasDragging = true; e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', () => { isDragging = false; velocity = dragVel * 0.6; });

  const dp = document.getElementById('mdl-dp'), pc = document.getElementById('mdl-pc');
  const vc = document.getElementById('mdl-vc');

  function showValue(s) {
    if (!vc) return;
    const hdr = `<div class="mdl-vc-header" style="background:linear-gradient(135deg,${s.color} 0%,${s.g[1]} 100%)"><div class="mdl-dp-cat">${s.cat}</div><div class="mdl-dp-step">${s.step} · Value Measurement</div><div class="mdl-dp-title">${s.label}</div></div>`;
    if (!s.value) {
      vc.innerHTML = hdr + `<div class="mdl-vc-body"><div class="mdl-vc-empty">No performance benchmark data available for this module yet.</div></div>`;
      return;
    }
    const v = s.value;
    const allItems = [v.metric, ...v.details];
    const detailsHtml = `<div class="mdl-val-details">${allItems.map(d => `<div>${d}</div>`).join('')}</div>`;
    const logosHtml = v.airlines.map(a =>
      `<img src="${a.logo}" class="mdl-val-logo-lg" title="${a.name}">`
    ).join('');
    vc.innerHTML = hdr + `<div class="mdl-vc-body">
      <div class="mdl-val-item" style="--mod-color:${s.color}">
        ${detailsHtml}
      </div>
      <div class="mdl-val-logo-strip">
        <div class="mdl-val-logo-title">Proven Airlines</div>
        <div class="mdl-val-logo-row">${logosHtml}</div>
      </div>
    </div>`;
  }

  function clearValue() {
    if (!vc) return;
    vc.innerHTML = `<div class="mdl-vc-header"><div class="mdl-dp-cat">Proven Results</div><div class="mdl-dp-step">Click a segment</div><div class="mdl-dp-title">Value Measurement</div></div><div class="mdl-vc-body"><div class="mdl-vc-empty">Click any wheel segment to view its proven performance metrics and reference airlines.</div></div>`;
  }

  function showDetail(idx) {
    const s = MDL_SEGS[idx];
    dp.style.setProperty('--mdl-accent', s.color);
    pc.style.animation = 'none'; pc.offsetHeight; pc.style.animation = '';
    pc.innerHTML = `<div class="mdl-dp-header" style="background:${s.color}"><div class="mdl-dp-cat">${s.cat}</div><div class="mdl-dp-step">${s.step} · Crew Management</div><div class="mdl-dp-title">${s.label}</div></div><div class="mdl-dp-body"><div class="mdl-dp-desc">${s.desc}</div><div class="mdl-dp-feat-title">Key Features</div><ul class="mdl-dp-feats">${s.feats.map(f => `<li>${f}</li>`).join('')}</ul></div>`;
    showValue(s);
  }
  function clearDetail() {
    dp.style.setProperty('--mdl-accent', '#0055a5');
    pc.innerHTML = `<div class="mdl-dp-header"><div class="mdl-dp-cat">Crew Management</div><div class="mdl-dp-step">Hover a segment</div><div class="mdl-dp-title">Select a Module</div></div><div class="mdl-dp-body"><div class="mdl-dp-desc">Hover over any segment to explore each module's capabilities.</div><div class="mdl-dp-feat-title">Quick Tips</div><ul class="mdl-dp-feats"><li>Drag the wheel to spin freely</li><li>Click a segment to pin details</li><li>Use CW / CCW for auto-rotation</li></ul></div>`;
    clearValue();
  }

  document.getElementById('mdl-btnCW').addEventListener('click', () => { autoSpin = 0.007; document.getElementById('mdl-btnCW').classList.add('active'); document.getElementById('mdl-btnCCW').classList.remove('active'); document.getElementById('mdl-btnStop').classList.remove('active'); });
  document.getElementById('mdl-btnCCW').addEventListener('click', () => { autoSpin = -0.007; document.getElementById('mdl-btnCCW').classList.add('active'); document.getElementById('mdl-btnCW').classList.remove('active'); document.getElementById('mdl-btnStop').classList.remove('active'); });
  document.getElementById('mdl-btnStop').addEventListener('click', () => { autoSpin = 0; velocity = 0; document.getElementById('mdl-btnStop').classList.add('active'); document.getElementById('mdl-btnCW').classList.remove('active'); document.getElementById('mdl-btnCCW').classList.remove('active'); });

  showDetail(0);
  resizeMdl();
  requestAnimationFrame(loop);
  window.addEventListener('resize', resizeMdl);
}
