import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { getStoredDeviceId } from './sync/SyncContext';
import { hasCapability } from './permissions';

const AuthContext = createContext(null);

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

        const branch = (branchResp.data || [])[0] || null;
        const devices = deviceResp.data || [];
        const storedDeviceId = getStoredDeviceId();
        const selectedDevice = devices.find((d) => d.id === storedDeviceId) || devices[0] || null;

        setUser({
          username: claims.username || claims.user || 'User',
          id: claims.user_id || claims.sub || null,
          branch_id: branch?.id || null,
          device_id: selectedDevice?.id || null,
          role: claims.role || ((claims.is_superuser || claims.is_staff) ? 'admin' : 'cashier'),
          is_superuser: Boolean(claims.is_superuser),
        });
      } catch (error) {
        console.error('Failed to load runtime auth context', error);
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

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, can: (capability) => hasCapability(user, capability) }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
