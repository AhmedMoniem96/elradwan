import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import axios from 'axios';
import { getStoredDeviceId } from './sync/SyncContext';
import { hasCapability } from './permissions';
import { parseApiError } from './utils/api';

const AuthContext = createContext(null);
const ACTIVE_BRANCH_ID_KEY = 'active_branch_id';

const getStoredBranchId = () => localStorage.getItem(ACTIVE_BRANCH_ID_KEY);

const persistSelectedBranchId = (branchId) => {
  if (branchId === null || branchId === undefined || branchId === '') {
    localStorage.removeItem(ACTIVE_BRANCH_ID_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_BRANCH_ID_KEY, String(branchId));
};

const getDeviceBranchId = (device) => device?.branch_id ?? device?.branch?.id ?? device?.branch ?? null;

const normalizeCollectionResponse = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    return payload.results;
  }

  return [];
};

const resolveSelectionById = (collection, preferredId) => {
  if (!Array.isArray(collection) || collection.length === 0) {
    return null;
  }

  if (preferredId !== null && preferredId !== undefined && preferredId !== '') {
    const match = collection.find((item) => String(item.id) === String(preferredId));
    if (match) {
      return match;
    }
  }

  return collection[0] || null;
};

const computeRuntimeContextSelection = ({ branches, devices, preferredBranchId, preferredDeviceId }) => {
  const selectedBranch = resolveSelectionById(branches, preferredBranchId);
  const selectedBranchId = selectedBranch?.id ?? null;
  const devicesForBranch = selectedBranch
    ? (devices || []).filter((device) => String(getDeviceBranchId(device)) === String(selectedBranch.id))
    : [];
  const selectableDevices = devicesForBranch.length > 0 ? devicesForBranch : (devices || []);
  const selectedDevice = resolveSelectionById(selectableDevices, preferredDeviceId);

  return {
    branchId: selectedBranchId,
    deviceId: selectedDevice?.id ?? null,
    devicesForSelectedBranch: selectableDevices,
  };
};

const parseJwt = (token) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const [loading, setLoading] = useState(true);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [availableDevices, setAvailableDevices] = useState([]);
  const isRefreshingRef = useRef(false);
  const pendingRequestsRef = useRef([]);

  const flushPendingRequests = (nextToken) => {
    pendingRequestsRef.current.forEach(({ resolve }) => resolve(nextToken));
    pendingRequestsRef.current = [];
  };

  const rejectPendingRequests = (error) => {
    pendingRequestsRef.current.forEach(({ reject }) => reject(error));
    pendingRequestsRef.current = [];
  };

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    delete axios.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use((config) => {
      const storedAccessToken = localStorage.getItem('access_token');

      if (storedAccessToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${storedAccessToken}`;
      }

      return config;
    });

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error?.config;
        const statusCode = error?.response?.status;

        if (!originalRequest || statusCode !== 401 || originalRequest.skipAuthRefresh) {
          return Promise.reject(error);
        }

        const isAuthPath = originalRequest.url?.includes('/api/v1/token/');
        if (isAuthPath) {
          return Promise.reject(error);
        }

        if (originalRequest._retry) {
          logout();
          return Promise.reject(error);
        }

        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refresh_token');

        if (!refreshToken) {
          logout();
          return Promise.reject(error);
        }

        if (isRefreshingRef.current) {
          return new Promise((resolve, reject) => {
            pendingRequestsRef.current.push({ resolve, reject });
          })
            .then((nextToken) => {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${nextToken}`;
              return axios(originalRequest);
            });
        }

        isRefreshingRef.current = true;

        try {
          const refreshResponse = await axios.post(
            '/api/v1/token/refresh/',
            { refresh: refreshToken },
            { skipAuthRefresh: true },
          );
          const nextToken = refreshResponse.data?.access;

          if (!nextToken) {
            throw new Error('Token refresh response did not include access token.');
          }

          localStorage.setItem('access_token', nextToken);
          axios.defaults.headers.common.Authorization = `Bearer ${nextToken}`;
          setToken(nextToken);
          flushPendingRequests(nextToken);

          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${nextToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          rejectPendingRequests(refreshError);
          logout();
          return Promise.reject(refreshError);
        } finally {
          isRefreshingRef.current = false;
        }
      },
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [logout]);

  useEffect(() => {
    const hydrate = async () => {
      if (!token) {
        delete axios.defaults.headers.common.Authorization;
        setUser(null);
        setLoading(false);
        return;
      }

      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      const claims = parseJwt(token) || {};

      try {
        const [branchResp, deviceResp] = await Promise.all([
          axios.get('/api/v1/branches/'),
          axios.get('/api/v1/devices/'),
        ]);

        const branches = normalizeCollectionResponse(branchResp.data);
        const devices = normalizeCollectionResponse(deviceResp.data);
        setAvailableBranches(branches);
        setAvailableDevices(devices);

        const storedBranchId = getStoredBranchId();
        const storedDeviceId = getStoredDeviceId();
        const selection = computeRuntimeContextSelection({
          branches,
          devices,
          preferredBranchId: storedBranchId,
          preferredDeviceId: storedDeviceId,
        });

        persistSelectedBranchId(selection.branchId);

        setUser({
          username: claims.username || claims.user || 'User',
          id: claims.user_id || claims.sub || null,
          branch_id: selection.branchId,
          device_id: selection.deviceId,
          role: claims.role || ((claims.is_superuser || claims.is_staff) ? 'admin' : 'cashier'),
          is_superuser: Boolean(claims.is_superuser),
        });
      } catch (error) {
        console.error('Failed to load runtime auth context', error);
        setAvailableBranches([]);
        setAvailableDevices([]);
        setUser({
          username: claims.username || claims.user || 'User',
          id: claims.user_id || claims.sub || null,
          branch_id: null,
          device_id: null,
          role: claims.role || ((claims.is_superuser || claims.is_staff) ? 'admin' : 'cashier'),
          is_superuser: Boolean(claims.is_superuser),
        });
      } finally {
        setLoading(false);
      }
    };

    hydrate();
  }, [token]);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/v1/token/', { username, password });
      const { access, refresh } = response.data;
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      setLoading(true);
      setToken(access);
      return { ok: true };
    } catch (error) {
      console.error('Login failed', error);
      const parsedError = parseApiError(error);
      return {
        ok: false,
        code: parsedError.code,
        message: parsedError.message,
        fieldErrors: parsedError.fieldErrors,
      };
    }
  };

  const setActiveBranchId = (branchId) => {
    if (!user) return;

    const selection = computeRuntimeContextSelection({
      branches: availableBranches,
      devices: availableDevices,
      preferredBranchId: branchId,
      preferredDeviceId: user.device_id,
    });

    persistSelectedBranchId(selection.branchId);
    setUser((prev) => (prev
      ? {
        ...prev,
        branch_id: selection.branchId,
        device_id: selection.deviceId,
      }
      : prev));
  };

  const setActiveDeviceId = (deviceId) => {
    if (!user) return;

    const selection = computeRuntimeContextSelection({
      branches: availableBranches,
      devices: availableDevices,
      preferredBranchId: user.branch_id,
      preferredDeviceId: deviceId,
    });

    setUser((prev) => (prev
      ? {
        ...prev,
        branch_id: selection.branchId,
        device_id: selection.deviceId,
      }
      : prev));
  };

  const scopedDevices = user
    ? computeRuntimeContextSelection({
      branches: availableBranches,
      devices: availableDevices,
      preferredBranchId: user.branch_id,
      preferredDeviceId: user.device_id,
    }).devicesForSelectedBranch
    : availableDevices;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        availableBranches,
        availableDevices: scopedDevices,
        setActiveBranchId,
        setActiveDeviceId,
        can: (capability) => hasCapability(user, capability),
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
