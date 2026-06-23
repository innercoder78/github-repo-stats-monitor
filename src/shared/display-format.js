export const DATE_FORMAT_SYSTEM = 'system';
export const DATE_FORMAT_DD_MM_YYYY = 'dd/mm/yyyy';
export const DATE_FORMAT_MM_DD_YYYY = 'mm/dd/yyyy';
export const DATE_FORMAT_YYYY_MM_DD = 'yyyy/mm/dd';
export const TIME_FORMAT_SYSTEM = 'system';
export const TIME_FORMAT_12_HOUR = '12-hour';
export const TIME_FORMAT_24_HOUR = '24-hour';

export function getDefaultDisplayPreferences() {
  return {
    dateFormat: DATE_FORMAT_SYSTEM,
    timeFormat: TIME_FORMAT_SYSTEM,
  };
}

export function normalizeDisplayPreferences(preferences) {
  const displayPreferences = preferences && typeof preferences === 'object' ? preferences : {};
  const validDateFormats = [DATE_FORMAT_SYSTEM, DATE_FORMAT_DD_MM_YYYY, DATE_FORMAT_MM_DD_YYYY, DATE_FORMAT_YYYY_MM_DD];
  const validTimeFormats = [TIME_FORMAT_SYSTEM, TIME_FORMAT_12_HOUR, TIME_FORMAT_24_HOUR];

  return {
    dateFormat: validDateFormats.includes(displayPreferences.dateFormat) ? displayPreferences.dateFormat : DATE_FORMAT_SYSTEM,
    timeFormat: validTimeFormats.includes(displayPreferences.timeFormat) ? displayPreferences.timeFormat : TIME_FORMAT_SYSTEM,
  };
}

function getValidDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function getSystemDatePartOrder() {
  const parts = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(2026, 10, 23))
    .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
    .map((part) => part.type);

  return parts.length === 3 ? parts : ['month', 'day', 'year'];
}

function formatCustomDate(date, dateFormat, mode) {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear());

  if (mode === 'compact') {
    if (dateFormat === DATE_FORMAT_DD_MM_YYYY) {
      return `${day}/${month}`;
    }

    return `${month}/${day}`;
  }

  if (dateFormat === DATE_FORMAT_DD_MM_YYYY) {
    return `${day}/${month}/${year}`;
  }

  if (dateFormat === DATE_FORMAT_YYYY_MM_DD) {
    return `${year}/${month}/${day}`;
  }

  return `${month}/${day}/${year}`;
}

function formatSystemDate(date, mode) {
  if (mode === 'full') {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  const values = {
    day: pad(date.getDate()),
    month: pad(date.getMonth() + 1),
  };
  const dateParts = getSystemDatePartOrder()
    .filter((part) => part !== 'year')
    .map((part) => values[part]);

  return dateParts.join('/');
}

function formatTime(date, timeFormat) {
  const options = { hour: 'numeric', minute: '2-digit' };

  if (timeFormat === TIME_FORMAT_12_HOUR) {
    options.hour12 = true;
  }

  if (timeFormat === TIME_FORMAT_24_HOUR) {
    options.hour12 = false;
  }

  return new Intl.DateTimeFormat(undefined, options).format(date);
}

export function formatDisplayTimestamp(value, preferences = getDefaultDisplayPreferences(), mode = 'full') {
  const date = getValidDate(value);

  if (!date) {
    return '';
  }

  const normalizedPreferences = normalizeDisplayPreferences(preferences);
  const dateText = normalizedPreferences.dateFormat === DATE_FORMAT_SYSTEM
    ? formatSystemDate(date, mode)
    : formatCustomDate(date, normalizedPreferences.dateFormat, mode);
  const timeText = formatTime(date, normalizedPreferences.timeFormat);

  return `${dateText} ${timeText}`;
}
