import { formatDisplayTimestamp } from './display-format.js';
import { validateSummaryImageData } from './summary-image-data.js';

export const SUMMARY_IMAGE_WIDTH = 1200;
export const SUMMARY_IMAGE_HEIGHT = 1600;
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
  ctx.fillStyle = gradient(ctx, x, y, x + w * .6, y + h, [[0, '#05243b'], [.35, '#020c14'], [.7, '#010a11'], [1, '#03243e']]);
  ctx.shadowColor = '#007fcc'; ctx.shadowBlur = 15; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = gradient(ctx, x, y, x + w, y + h, [[0, '#49efff'], [.4, '#008cff'], [.75, '#00cfff'], [1, '#0867ff']]);
  ctx.lineWidth = 2; ctx.stroke();
  ctx.clip();
  for (const [cx, cy] of [[x + w * .25, y], [x + w * .7, y + h]]) {
    ctx.shadowBlur = 0;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * .38);
    glow.addColorStop(0, '#46d9ff66'); glow.addColorStop(.12, '#008fff33'); glow.addColorStop(1, '#008fff00');
    ctx.fillStyle = glow; ctx.fillRect(x, y, w, h);
    ctx.shadowColor = '#39cfff'; ctx.shadowBlur = 14;
    line(ctx, cx - w * .12, cy, cx + w * .12, cy, '#a5faff', 3);
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

function github(ctx) {
  ctx.save(); ctx.translate(405, 64); ctx.scale(4.5, 4.5);
  ctx.fillStyle = WHITE;
  // Locally defined GitHub mark; no image fetch or font dependency.
  const mark = new Path2D('M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.23 1.84 1.23 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 5.79c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 24 12C24 5.37 18.63 0 12 0Z');
  ctx.fill(mark); ctx.restore();
  text(ctx, 'GitHub', 535, 122, 300, 80);
  for (const [left, right] of [[145, 362], [841, 1055]]) {
    line(ctx, left, 120, right, 120, gradient(ctx, left, 0, right, 0, [[0, '#008fff00'], [.5, '#00cfff'], [1, '#008fff00']]), 3);
  }
}

function waves(ctx) {
  ctx.save();
  const glow = ctx.createRadialGradient(850, 1370, 0, 850, 1370, 600);
  glow.addColorStop(0, '#00366b88'); glow.addColorStop(1, '#001b3300'); ctx.fillStyle = glow; ctx.fillRect(0, 1140, 1200, 460);
  for (const front of [false, true]) {
    ctx.beginPath(); ctx.moveTo(0, front ? 1340 : 1405);
    ctx.bezierCurveTo(420, front ? 1555 : 1580, 720, front ? 1450 : 1285, 1200, front ? 1295 : 1385);
    ctx.lineTo(1200, 1390); ctx.bezierCurveTo(760, 1385, 510, 1560, 0, 1405); ctx.closePath();
    ctx.fillStyle = gradient(ctx, 0, 1300, 0, 1480, [[0, '#0067dd'], [.65, '#004ca3bb'], [1, '#00cfff']]);
    ctx.fill(); ctx.strokeStyle = front ? '#00cfff' : '#006dcf'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

/** Render in a browser document. Returns a new detached canvas; never touches the application's UI. */
export async function renderSummaryImage(input, { document: documentContext = globalThis.document } = {}) {
  const data = validateSummaryImageData(input);
  if (!documentContext?.createElement) throw new Error('Summary image rendering requires a browser document');
  if (documentContext.fonts?.ready) await documentContext.fonts.ready;
  const canvas = documentContext.createElement('canvas');
  canvas.width = SUMMARY_IMAGE_WIDTH; canvas.height = SUMMARY_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#010306'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(600, 700, 20, 600, 700, 760);
  glow.addColorStop(0, '#00203b66'); glow.addColorStop(1, '#00000000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 1600);
  waves(ctx);
  github(ctx);
  text(ctx, 'Repository', 600, 259, 540, 96, { align: 'right' });
  text(ctx, 'Summary', 617, 259, 525, 96, { color: BLUE });
  card(ctx, 342, 345, 516, 90, 45);
  text(ctx, data.username ? `@${data.username}` : 'Account unavailable', 600, 390, 460, 51, { align: 'center' });
  const number = (value) => value === null ? '—' : new Intl.NumberFormat().format(value);
  const cards = [['followers', 'Total Followers', 50, 490], ['stars', 'Total Stars', 615, 490], ['forks', 'Total Forks', 50, 775], ['watchers', 'Total Watchers', 615, 775]];
  for (const [key, label, x, y] of cards) {
    card(ctx, x, y, 535, 257);
    icon(ctx, key, x + 91, y + 134, 100);
    line(ctx, x + 175, y + 53, x + 175, y + 208);
    text(ctx, label, x + 213, y + 66, 300, 36);
    text(ctx, number(data[key]), x + 210, y + 157, 303, 100);
  }
  card(ctx, 50, 1060, 1100, 182);
  icon(ctx, 'repositories', 215, 1151, 100);
  line(ctx, 316, 1105, 316, 1197, '#00dcff', 3);
  text(ctx, 'Repositories Monitored', 354, 1151, 535, 43);
  text(ctx, number(data.configuredRepositories), 1055, 1151, 160, 106, { align: 'center' });
  const freshness = data.dataAsOf ? `Data as of: ${formatDisplayTimestamp(data.dataAsOf, data.displayPreferences)}` : 'Data as of: unavailable';
  ctx.font = '400 29px Arial, sans-serif';
  const freshnessWidth = Math.min(900, ctx.measureText(freshness).width);
  const freshnessLeft = (1200 - freshnessWidth - 65) / 2;
  icon(ctx, 'refresh', freshnessLeft + 21, 1294, 42);
  text(ctx, freshness, freshnessLeft + 65, 1294, 900, 29, { weight: 400 });
  const warnings = [];
  if (data.validRepositories < data.configuredRepositories) warnings.push(`Statistics available for ${number(data.validRepositories)} of ${number(data.configuredRepositories)} repositories`);
  if (data.followers === null) warnings.push('Account followers unavailable');
  warnings.forEach((warning, index) => text(ctx, warning, 600, 1334 + index * 31, 1050, 24, { weight: 400, align: 'center', color: '#bdd5e7' }));
  ctx.fillStyle = gradient(ctx, 200, 1500, 250, 1550, [[0, '#00e0ee'], [1, '#0095ed']]);
  [18, 32, 48].forEach((h, index) => { ctx.beginPath(); ctx.roundRect(200 + index * 19, 1540 - h, 12, h, 5); ctx.fill(); });
  text(ctx, 'GitHub Repo Stats Monitor', 280, 1518, 555, 35);
  line(ctx, 850, 1500, 850, 1537, '#e7edf3', 2);
  text(ctx, 'A Chrome Extension', 877, 1518, 275, 26, { weight: 400 });
  return canvas;
}

/** Encode a detached canvas. Rejects unsupported, empty, failed, or stalled encoders. */
export function encodeSummaryImagePng(canvas, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!canvas || canvas.width !== SUMMARY_IMAGE_WIDTH || canvas.height !== SUMMARY_IMAGE_HEIGHT || typeof canvas.toBlob !== 'function') {
      reject(new TypeError('Expected a 1200 × 1600 canvas with PNG encoding support')); return;
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
