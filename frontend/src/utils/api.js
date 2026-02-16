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
