const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createSvgElement(tagName) {
  return document.createElementNS(SVG_NAMESPACE, tagName);
}

function isValidDateString(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
}

function parseDailyRecord(record, metricKey) {
  const date = typeof record?.date === 'string' ? record.date.trim() : '';
  const value = Number(record?.[metricKey]);

  if (!isValidDateString(date)) {
    return null;
  }

  return {
    date,
    value: Number.isFinite(value) && value > 0 ? value : 0,
  };
}

function formatDateLabel(date, previousDate) {
  const [, month, day] = date.split('-').map(Number);
  const previousMonth = previousDate ? Number(previousDate.split('-')[1]) : month;

  if (!previousDate || month !== previousMonth || day === 1) {
    return `${new Date(`${date}T00:00:00Z`).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })} ${day}`;
  }

  return String(day);
}

function addText(parent, textContent, attributes = {}) {
  const text = createSvgElement('text');
  Object.entries(attributes).forEach(([name, value]) => text.setAttribute(name, value));
  text.textContent = textContent;
  parent.append(text);
  return text;
}

function addLine(parent, attributes = {}) {
  const line = createSvgElement('line');
  Object.entries(attributes).forEach(([name, value]) => line.setAttribute(name, value));
  parent.append(line);
  return line;
}

export function createSvgBarChart(data, options = {}) {
  const metricKey = options.metricKey || 'views';
  const metricLabel = options.metricLabel || 'Value';
  const titleText = options.title || `${metricLabel} chart`;
  const width = 640;
  const height = 220;
  const margin = { top: 20, right: 16, bottom: 42, left: 36 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const records = (Array.isArray(data) ? data : [])
    .map((record) => parseDailyRecord(record, metricKey))
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14);
  const maxValue = Math.max(0, ...records.map((record) => record.value));
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const svg = createSvgElement('svg');
  svg.classList.add('svg-bar-chart');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', titleText);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const title = createSvgElement('title');
  title.textContent = titleText;
  svg.append(title);

  const grid = createSvgElement('g');
  grid.classList.add('svg-bar-chart__grid');
  svg.append(grid);

  [0, 0.5, 1].forEach((step) => {
    const y = margin.top + plotHeight - (plotHeight * step);
    addLine(grid, {
      x1: margin.left,
      x2: width - margin.right,
      y1: y,
      y2: y,
    });
  });

  if (records.length === 0) {
    const emptyGroup = createSvgElement('g');
    emptyGroup.classList.add('svg-bar-chart__empty');
    svg.append(emptyGroup);
    addText(emptyGroup, 'No traffic data yet', {
      x: width / 2,
      y: height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    return svg;
  }

  const bars = createSvgElement('g');
  bars.classList.add('svg-bar-chart__bars');
  svg.append(bars);

  const slotWidth = plotWidth / records.length;
  const barWidth = Math.max(4, Math.min(28, slotWidth * 0.56));
  const zeroBarHeight = 2;

  records.forEach((record, index) => {
    const valueHeight = (record.value / scaleMax) * plotHeight;
    const barHeight = record.value > 0 ? valueHeight : zeroBarHeight;
    const x = margin.left + (index * slotWidth) + ((slotWidth - barWidth) / 2);
    const y = margin.top + plotHeight - barHeight;
    const rect = createSvgElement('rect');
    rect.classList.add('svg-bar-chart__bar');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', barHeight);
    rect.setAttribute('rx', '3');
    rect.setAttribute('aria-label', `${record.date}, ${metricLabel}: ${record.value}`);

    const barTitle = createSvgElement('title');
    barTitle.textContent = `${record.date}\n${metricLabel}: ${record.value}`;
    rect.append(barTitle);
    bars.append(rect);

    addText(svg, formatDateLabel(record.date, records[index - 1]?.date), {
      class: 'svg-bar-chart__label',
      x: margin.left + (index * slotWidth) + (slotWidth / 2),
      y: height - 14,
      'text-anchor': 'middle',
    });
  });

  addText(svg, String(maxValue), {
    class: 'svg-bar-chart__axis-value',
    x: margin.left - 8,
    y: margin.top + 4,
    'text-anchor': 'end',
  });
  addText(svg, '0', {
    class: 'svg-bar-chart__axis-value',
    x: margin.left - 8,
    y: margin.top + plotHeight + 4,
    'text-anchor': 'end',
  });

  return svg;
}
