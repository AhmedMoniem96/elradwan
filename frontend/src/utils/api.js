export const normalizeCollectionResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
};

export const normalizeCountFromCollection = (payload) => normalizeCollectionResponse(payload).length;

const GENERAL_ERROR_KEYS = new Set(['message', 'detail', 'code', 'errors', 'non_field_errors']);

const sanitizeErrorMessage = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  const strippedValue = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!strippedValue) {
    return '';
  }

  return strippedValue;
};

const normalizeFieldMessage = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeErrorMessage).find(Boolean) || '';
  }

  if (typeof value === 'string') {
    return sanitizeErrorMessage(value);
  }

  return '';
};

const getCodeFromPayload = (payload) => {
  const rawCode = payload?.code ?? payload?.error_code ?? payload?.error;
  return typeof rawCode === 'string' ? rawCode : null;
};

const formatFieldName = (fieldName) => fieldName
  .replace(/_/g, ' ')
  .trim();

export const formatFieldErrors = (fieldErrors = {}) => {
  if (!fieldErrors || typeof fieldErrors !== 'object') {
    return '';
  }

  const entries = Object.entries(fieldErrors)
    .map(([field, value]) => {
      const message = normalizeFieldMessage(value);
      if (!message) {
        return null;
      }

      const normalizedField = formatFieldName(field);
      return normalizedField ? `${normalizedField}: ${message}` : message;
    })
    .filter(Boolean);

  return entries.join(' • ');
};

export const parseApiError = (error) => {
  const payload = error?.response?.data;
  const status = error?.response?.status ?? null;

  if (typeof payload === 'string') {
    return {
      code: null,
      message: sanitizeErrorMessage(payload) || null,
      fieldErrors: {},
      status,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      code: null,
      message: null,
      fieldErrors: {},
      status,
    };
  }

  const rawMessage = payload.message ?? payload.detail;
  const nonFieldError = normalizeFieldMessage(payload.non_field_errors);
  const message = sanitizeErrorMessage(rawMessage) || nonFieldError || null;
  const fieldErrors = {};

  if (payload.errors && typeof payload.errors === 'object') {
    Object.entries(payload.errors).forEach(([field, value]) => {
      const normalizedValue = normalizeFieldMessage(value);
      if (normalizedValue) {
        fieldErrors[field] = normalizedValue;
      }
    });
  }

  Object.entries(payload).forEach(([field, value]) => {
    if (GENERAL_ERROR_KEYS.has(field) || fieldErrors[field]) {
      return;
    }

    const normalizedValue = normalizeFieldMessage(value);
    if (normalizedValue) {
      fieldErrors[field] = normalizedValue;
    }
  });

  return {
    code: getCodeFromPayload(payload),
    message,
    fieldErrors,
    status,
  };
};
