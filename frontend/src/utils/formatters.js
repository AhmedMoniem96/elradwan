import i18n from '../i18n';

const FALLBACK_LOCALE = 'en-US';

const formattersCache = new Map();

const getDisplayLocale = () => i18n.resolvedLanguage || i18n.language || FALLBACK_LOCALE;

const getFormatters = () => {
  const locale = getDisplayLocale();

  if (!formattersCache.has(locale)) {
    formattersCache.set(locale, {
      currencyFormatter: new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
      }),
      numberFormatter: new Intl.NumberFormat(locale),
      dateFormatter: new Intl.DateTimeFormat(locale),
      dateTimeFormatter: new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      latinDecimalFormatter: new Intl.NumberFormat(locale, {
        numberingSystem: 'latn',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    });
  }

  return formattersCache.get(locale);
};

const asNumber = (value) => Number(value || 0);

export const formatCurrency = (value) => getFormatters().currencyFormatter.format(asNumber(value));

export const formatNumber = (value) => getFormatters().numberFormatter.format(asNumber(value));

export const formatPercent = (value, maximumFractionDigits = 2) => (
  new Intl.NumberFormat(getDisplayLocale(), {
    style: 'percent',
    maximumFractionDigits,
  }).format(asNumber(value) / 100)
);

export const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return getFormatters().dateFormatter.format(parsed);
};

export const formatDateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return getFormatters().dateTimeFormatter.format(parsed);
};

// Keep data-entry fields Latin when pre-filling editable numeric inputs.
export const formatLatinDecimal = (value) => getFormatters().latinDecimalFormatter.format(asNumber(value));
