import { formatDisplayTimestamp } from './display-format.js';
import { validateSummaryImageData } from './summary-image-data.js';

export const SUMMARY_IMAGE_WIDTH = 1080;
export const SUMMARY_IMAGE_HEIGHT = 1440;
const BLUE = '#00baff';
const WHITE = '#f8fafc';

function gradient(ctx, x, y, x2, y2, stops) {
  const result = ctx.createLinearGradient(x, y, x2, y2);
  stops.forEach(([offset, color]) => result.addColorStop(offset, color));
  return result;
}

function text(ctx, value, x, y, width, size, { color = WHITE, weight = 700, align = 'left' } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  // Measure actual local font metrics; horizontally condense only exceptionally long input.
  let fitted = size;
  do { ctx.font = `${weight} ${fitted}px Arial, sans-serif`; } while (ctx.measureText(value).width > width && --fitted > 20);
  ctx.fillText(value, x, y, width);
  ctx.restore();
}

function line(ctx, x, y, x2, y2, color = BLUE, width = 2) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function card(ctx, x, y, w, h, radius = 38) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = gradient(ctx, x, y, x, y + h, [[0, '#031321'], [.25, '#020a11'], [.65, '#01070c'], [1, '#02101b']]);
  ctx.shadowColor = '#007fcc55'; ctx.shadowBlur = 10; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gradient(ctx, x, y, x + w, y + h, [[0, '#49efff'], [.4, '#008cff'], [.75, '#00cfff'], [1, '#0867ff']]);
  ctx.lineWidth = 2; ctx.stroke();
  ctx.clip();
  for (const [cx, cy] of [[x + w * .25, y], [x + w * .7, y + h]]) {
    ctx.shadowBlur = 0;
    // A shallow elliptical wash keeps illumination at the rim, not behind the numbers.
    ctx.save(); ctx.translate(cx, cy); ctx.scale(w * .3, Math.min(54, h * .3));
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, '#30bfff80'); glow.addColorStop(.25, '#008fff35'); glow.addColorStop(1, '#008fff00');
    ctx.fillStyle = glow; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    const left = cx - w * .23, right = cx + w * .23;
    const highlight = gradient(ctx, left, cy, right, cy, [[0, '#00aaff00'], [.35, '#38cfff88'], [.5, '#c3f8ff'], [.65, '#38cfff88'], [1, '#00aaff00']]);
    ctx.shadowColor = '#139eff'; ctx.shadowBlur = 9;
    line(ctx, left, cy, right, cy, highlight, 2.5);
  }
  ctx.restore();
}

function icon(ctx, name, x, y, size = 96) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 100, size / 100);
  ctx.strokeStyle = gradient(ctx, 0, 0, 60, 100, [[0, '#90f3ff'], [.45, '#21c9f4'], [1, '#0096ee']]);
  ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const circle = (cx, cy, r, fill = false) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); };
  if (name === 'followers') {
    circle(35, 30, 16); circle(76, 31, 13, true);
    ctx.beginPath(); ctx.moveTo(7, 82); ctx.bezierCurveTo(9, 49, 61, 49, 63, 82); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(66, 51); ctx.bezierCurveTo(85, 47, 99, 60, 98, 76); ctx.lineTo(74, 76); ctx.bezierCurveTo(75, 65, 72, 58, 66, 51); ctx.fill();
  } else if (name === 'stars') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? 22 : 46;
      const px = 50 + Math.cos(angle) * radius, py = 52 + Math.sin(angle) * radius;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
  } else if (name === 'forks') {
    circle(25, 20, 11); circle(75, 20, 11); circle(25, 81, 11);
    ctx.beginPath(); ctx.moveTo(25, 32); ctx.lineTo(25, 69); ctx.moveTo(75, 32); ctx.bezierCurveTo(75, 62, 25, 44, 25, 69); ctx.stroke();
  } else if (name === 'watchers') {
    ctx.beginPath(); ctx.moveTo(3, 50); ctx.bezierCurveTo(27, 9, 73, 9, 97, 50); ctx.bezierCurveTo(73, 91, 27, 91, 3, 50); ctx.closePath(); ctx.stroke(); circle(50, 50, 16, true);
  } else if (name === 'repositories') {
    ctx.beginPath(); ctx.moveTo(5, 28); ctx.lineTo(50, 5); ctx.lineTo(95, 28); ctx.lineTo(50, 52); ctx.closePath(); ctx.stroke();
    for (const dy of [23, 46]) { ctx.beginPath(); ctx.moveTo(5, 28 + dy); ctx.lineTo(50, 52 + dy); ctx.lineTo(95, 28 + dy); ctx.stroke(); }
  } else if (name === 'refresh') {
    ctx.beginPath(); ctx.arc(50, 50, 36, -.8, 2.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(50, 50, 36, Math.PI - .8, Math.PI + 2.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(79, 10); ctx.lineTo(79, 28); ctx.lineTo(60, 28); ctx.moveTo(21, 90); ctx.lineTo(21, 72); ctx.lineTo(40, 72); ctx.stroke();
  }
  ctx.restore();
}

// Resolve against this packaged module, never document.baseURI or user input.
const FOOTER_ICON_URL = new URL('../../assets/icons/icon-128.png', import.meta.url).href;

function loadFooterIcon(documentContext, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      reject(new TypeError('Invalid icon loading timeout')); return;
    }
    const image = documentContext.createElement('img');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) {
        image.removeAttribute('src');
        reject(error);
      } else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('Footer icon loading timed out')), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0
      ? null : new Error('Footer icon has invalid dimensions'));
    image.onerror = () => finish(new Error('Footer icon loading failed'));
    try { image.src = FOOTER_ICON_URL; } catch (error) { finish(error); }
  });
}

function waves(ctx) {
  ctx.save();
  const glow = ctx.createRadialGradient(765, 1190, 0, 765, 1190, 540);
  // Paint the radial fade across the canvas so its bounding box cannot leave a seam.
  glow.addColorStop(0, '#00366b66'); glow.addColorStop(1, '#001b3300'); ctx.fillStyle = glow; ctx.fillRect(0, 0, SUMMARY_IMAGE_WIDTH, SUMMARY_IMAGE_HEIGHT);
  const ribbons = [
    { top: [-40, 1105, 350, 1320, 710, 1150, 1120, 1165], bottom: [1120, 1200, 710, 1090, 350, 1320, -40, 1170], edge: '#008bff99' },
    { top: [-40, 1170, 414, 1330, 710, 1190, 1120, 1075], bottom: [1120, 1165, 710, 1150, 414, 1340, -40, 1180], edge: '#00d9ff' },
  ];
  for (const { top, bottom, edge } of ribbons) {
    ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.bezierCurveTo(...top.slice(2));
    ctx.lineTo(bottom[0], bottom[1]); ctx.bezierCurveTo(...bottom.slice(2)); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, 1080, 0, 1250, [[0, '#0089f5'], [.35, '#006ee5ee'], [.7, '#007cdacc'], [1, '#00cfff']]);
    ctx.fill();
    // Stroke only the continuous curves. The ribbon closures remain outside the image.
    ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.bezierCurveTo(...top.slice(2));
    ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.shadowColor = '#007dff'; ctx.shadowBlur = 7; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(bottom[0], bottom[1]); ctx.bezierCurveTo(...bottom.slice(2));
    ctx.strokeStyle = '#0077dd88'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}

/** Render in a browser document. Returns a new detached canvas; never touches the application's UI. */
export async function renderSummaryImage(input, { document: documentContext = globalThis.document, iconTimeoutMs = 15000 } = {}) {
  const data = validateSummaryImageData(input);
  if (!documentContext?.createElement) throw new Error('Summary image rendering requires a browser document');
  if (documentContext.fonts?.ready) await documentContext.fonts.ready;
  const canvas = documentContext.createElement('canvas');
  canvas.width = SUMMARY_IMAGE_WIDTH; canvas.height = SUMMARY_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const footerIcon = await loadFooterIcon(documentContext, iconTimeoutMs);
  ctx.fillStyle = '#010306'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(540, 630, 20, 540, 630, 684);
  glow.addColorStop(0, '#00203b66'); glow.addColorStop(1, '#00000000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, SUMMARY_IMAGE_WIDTH, SUMMARY_IMAGE_HEIGHT);
  waves(ctx);
  // Center the two-color title as one measured line, including the word gap.
  ctx.font = '700 92px Arial, sans-serif';
  const repositoryWidth = ctx.measureText('Repository').width;
  const summaryWidth = ctx.measureText('Summary').width;
  const titleScale = Math.min(1, 990 / (repositoryWidth + 22 + summaryWidth));
  const titleLeft = (SUMMARY_IMAGE_WIDTH - (repositoryWidth + 22 + summaryWidth) * titleScale) / 2;
  text(ctx, 'Repository', titleLeft, 139, repositoryWidth * titleScale, 92 * titleScale);
  text(ctx, 'Summary', titleLeft + (repositoryWidth + 22) * titleScale, 139, summaryWidth * titleScale, 92 * titleScale, { color: BLUE });
  card(ctx, 308, 248, 464, 81, 41);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(308, 248, 464, 81, 41);
  ctx.strokeStyle = '#b7f7ff'; ctx.lineWidth = 2;
  ctx.shadowColor = '#00baff'; ctx.shadowBlur = 12; ctx.stroke();
  ctx.shadowBlur = 5; ctx.stroke(); ctx.restore();
  text(ctx, data.username ? `@${data.username}` : 'Account unavailable', 540, 289, 420, 46, { align: 'center' });
  const number = (value) => value === null ? '—' : new Intl.NumberFormat().format(value);
  const cards = [['followers', 'Total Followers', 45, 372], ['stars', 'Total Stars', 553, 372], ['forks', 'Total Forks', 45, 620], ['watchers', 'Total Watchers', 553, 620]];
  for (const [key, label, x, y] of cards) {
    card(ctx, x, y, 482, 222, 33);
    icon(ctx, key, x + 82, y + 116, 90);
    line(ctx, x + 158, y + 45, x + 158, y + 178);
    text(ctx, label, x + 194, y + 58, 272, 34);
    text(ctx, number(data[key]), x + 190, y + 139, 276, 90);
  }
  card(ctx, 46, 863, 989, 156, 33);
  icon(ctx, 'repositories', 197, 941, 90);
  line(ctx, 286, 903, 286, 980, '#00dcff', 2);
  text(ctx, 'Repositories Monitored', 319, 941, 455, 39);
  text(ctx, number(data.configuredRepositories), 890, 941, 210, 96, { align: 'center' });
  const freshness = data.dataAsOf ? `Data as of: ${formatDisplayTimestamp(data.dataAsOf, data.displayPreferences)}` : 'Data as of: unavailable';
  ctx.font = '400 26px Arial, sans-serif';
  const freshnessWidth = Math.min(900, ctx.measureText(freshness).width);
  const freshnessLeft = (SUMMARY_IMAGE_WIDTH - freshnessWidth - 58) / 2;
  icon(ctx, 'refresh', freshnessLeft + 19, 1077, 38);
  text(ctx, freshness, freshnessLeft + 58, 1077, 900, 26, { weight: 400 });
  const warnings = [];
  if (data.validRepositories < data.configuredRepositories) warnings.push(`Statistics available for ${number(data.validRepositories)} of ${number(data.configuredRepositories)} repositories`);
  if (data.followers === null) warnings.push('Account followers unavailable');
  warnings.forEach((warning, index) => text(ctx, warning, 540, 1114 + index * 28, 990, 22, { weight: 400, align: 'center', color: '#bdd5e7' }));
  const iconScale = 84 / Math.max(footerIcon.naturalWidth, footerIcon.naturalHeight);
  const iconWidth = footerIcon.naturalWidth * iconScale, iconHeight = footerIcon.naturalHeight * iconScale;
  ctx.drawImage(footerIcon, 186 - iconWidth / 2, 1331 - iconHeight / 2, iconWidth, iconHeight);
  text(ctx, 'GitHub Repo Stats Monitor', 255, 1328, 425, 33);
  line(ctx, 697, 1311, 697, 1344, '#e7edf3', 2);
  text(ctx, 'A Chrome Extension', 722, 1328, 285, 25, { weight: 400 });
  return canvas;
}

/** Encode a detached canvas. Rejects unsupported, empty, failed, or stalled encoders. */
export function encodeSummaryImagePng(canvas, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!canvas || canvas.width !== SUMMARY_IMAGE_WIDTH || canvas.height !== SUMMARY_IMAGE_HEIGHT || typeof canvas.toBlob !== 'function') {
      reject(new TypeError('Expected a 1080 × 1440 canvas with PNG encoding support')); return;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) { reject(new TypeError('Invalid encoding timeout')); return; }
    const timer = setTimeout(() => reject(new Error('PNG encoding timed out')), timeoutMs);
    try {
      canvas.toBlob((blob) => {
        clearTimeout(timer);
        if (!blob || blob.type !== 'image/png' || !blob.size) reject(new Error('PNG encoding failed'));
        else resolve(blob);
      }, 'image/png');
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

export async function renderSummaryImagePng(data, options) {
  return encodeSummaryImagePng(await renderSummaryImage(data, options));
}
