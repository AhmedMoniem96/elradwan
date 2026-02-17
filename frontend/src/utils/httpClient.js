import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
const timeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const maxRetries = Number(import.meta.env.VITE_API_RETRY_COUNT || 1);
const retryDelayMs = Number(import.meta.env.VITE_API_RETRY_DELAY_MS || 300);

axios.defaults.baseURL = apiBaseUrl;
axios.defaults.timeout = timeoutMs;

const isRetryable = (error) => {
  const method = (error?.config?.method || 'get').toLowerCase();
  const status = error?.response?.status;
  const hasNoResponse = !error?.response;

  const idempotent = ['get', 'head', 'options'].includes(method);
  if (!idempotent) {
    return false;
  }

  if (hasNoResponse) {
    return true;
  }

  return status >= 500;
};

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    if (!config || !isRetryable(error)) {
      return Promise.reject(error);
    }

    config.__retryCount = config.__retryCount || 0;
    if (config.__retryCount >= maxRetries) {
      return Promise.reject(error);
    }

    config.__retryCount += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, retryDelayMs);
    });

    return axios(config);
  },
);
