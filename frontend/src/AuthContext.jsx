import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { getStoredDeviceId } from './sync/SyncContext';
import { hasCapability } from './permissions';

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
      return true;
    } catch (error) {
      console.error('Login failed', error);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setUser(null);
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
