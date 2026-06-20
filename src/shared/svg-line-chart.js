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

function getPointCoordinates(records, margin, plotWidth, plotHeight, scaleMax) {
  const denominator = Math.max(1, records.length - 1);

  return records.map((record, index) => ({
    ...record,
    x: margin.left + ((plotWidth * index) / denominator),
    y: margin.top + plotHeight - ((record.value / scaleMax) * plotHeight),
  }));
}

export function createSvgLineChart(data, options = {}) {
  const metricKey = options.metricKey || 'views';
  const metricLabel = options.metricLabel || 'Value';
  const titleText = options.title || `${metricLabel} chart`;
  const width = 640;
  const height = 220;
  const margin = { top: 20, right: 16, bottom: 46, left: 36 };
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
  svg.classList.add('svg-line-chart');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', titleText);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const title = createSvgElement('title');
  title.textContent = titleText;
  svg.append(title);

  const description = createSvgElement('desc');
  description.textContent = records.length > 0
    ? `${metricLabel} for ${records.length} available day${records.length === 1 ? '' : 's'} in GitHub's 14-day traffic window.`
    : `No daily ${metricLabel.toLowerCase()} data is available in GitHub's 14-day traffic window.`;
  svg.append(description);

  const grid = createSvgElement('g');
  grid.classList.add('svg-line-chart__grid');
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
    emptyGroup.classList.add('svg-line-chart__empty');
    svg.append(emptyGroup);
    addText(emptyGroup, `No daily ${metricLabel.toLowerCase()} data yet`, {
      x: width / 2,
      y: height / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
    });
    return svg;
  }

  const points = getPointCoordinates(records, margin, plotWidth, plotHeight, scaleMax);
  const lineGroup = createSvgElement('g');
  lineGroup.classList.add('svg-line-chart__series');
  svg.append(lineGroup);

  const path = createSvgElement('path');
  path.classList.add('svg-line-chart__line');
  path.setAttribute('d', points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '));
  lineGroup.append(path);

  points.forEach((point, index) => {
    const circle = createSvgElement('circle');
    circle.classList.add('svg-line-chart__point');
    circle.setAttribute('cx', point.x);
    circle.setAttribute('cy', point.y);
    circle.setAttribute('r', '4');
    circle.setAttribute('aria-label', `${point.date}, ${metricLabel}: ${point.value}`);

    const pointTitle = createSvgElement('title');
    pointTitle.textContent = `${point.date}\n${metricLabel}: ${point.value}`;
    circle.append(pointTitle);
    lineGroup.append(circle);

    addText(svg, formatDateLabel(point.date, points[index - 1]?.date), {
      class: 'svg-line-chart__label',
      x: point.x,
      y: height - 16,
      'text-anchor': 'middle',
    });
  });

  addText(svg, String(maxValue), {
    class: 'svg-line-chart__axis-value',
    x: margin.left - 8,
    y: margin.top + 4,
    'text-anchor': 'end',
  });
  addText(svg, '0', {
    class: 'svg-line-chart__axis-value',
    x: margin.left - 8,
    y: margin.top + plotHeight + 4,
    'text-anchor': 'end',
  });

  return svg;
}
