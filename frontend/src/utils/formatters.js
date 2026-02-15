const DISPLAY_LOCALE = 'ar-EG';

const currencyFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  style: 'currency',
  currency: 'EGP',
});

const numberFormatter = new Intl.NumberFormat(DISPLAY_LOCALE);

const dateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE);

const dateTimeFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const latinDecimalFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  numberingSystem: 'latn',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const asNumber = (value) => Number(value || 0);

export const formatCurrency = (value) => currencyFormatter.format(asNumber(value));

export const formatNumber = (value) => numberFormatter.format(asNumber(value));

export const formatPercent = (value, maximumFractionDigits = 2) => (
  new Intl.NumberFormat(DISPLAY_LOCALE, {
    style: 'percent',
    maximumFractionDigits,
  }).format(asNumber(value) / 100)
);

export const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatter.format(parsed);
};

// Keep data-entry fields Latin when pre-filling editable numeric inputs.
export const formatLatinDecimal = (value) => latinDecimalFormatter.format(asNumber(value));
