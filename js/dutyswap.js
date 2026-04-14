// ===================================================================
// DUTY SWAP PAGE — Tab & Carousel logic
// ===================================================================

function dsShowTab(n) {
  document.querySelectorAll('.ds-tab').forEach((t, i) => t.classList.toggle('active', i === n - 1));
  document.querySelectorAll('.ds-subpage').forEach((p, i) => p.classList.toggle('active', i === n - 1));
}

let dsCurrent = 0;
const DS_TOTAL = 5;

function dsCarouselGo(idx) {
  dsCurrent = idx;
  document.querySelectorAll('.ds-child-page').forEach((p, i) => p.classList.toggle('active', i === idx));
  document.querySelectorAll('.ds-carousel-pill').forEach((p, i) => p.classList.toggle('active', i === idx));
  const prev = document.getElementById('ds-prev');
  const next = document.getElementById('ds-next');
  if (prev) prev.disabled = (idx === 0);
  if (next) next.disabled = (idx === DS_TOTAL - 1);
}

function dsCarouselStep(dir) {
  const next = dsCurrent + dir;
  if (next >= 0 && next < DS_TOTAL) dsCarouselGo(next);
}
