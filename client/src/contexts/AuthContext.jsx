import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../utils/api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('unipick_token')));

  useEffect(() => {
    const token = localStorage.getItem('unipick_token');
    if (!token) return;

    let active = true;
    authApi
      .me()
      .then((data) => {
        if (!active) return;
        if (data?.success && data.user) {
          setUser(data.user);
        } else {
          localStorage.removeItem('unipick_token');
        }
      })
      .catch(() => {
        if (active) localStorage.removeItem('unipick_token');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await authApi.login(username, password);
    if (data?.success && data.token) {
      localStorage.setItem('unipick_token', data.token);
      setUser(data.user);
    }
    return data;
  }, []);

  const demoLogin = useCallback(async () => {
    const data = await authApi.demoLogin();
    if (data?.success && data.token) {
      localStorage.setItem('unipick_token', data.token);
      setUser(data.user);
    }
    return data;
  }, []);

  const register = useCallback(async (usernameOrPayload, password, displayName) => {
    const data = await authApi.register(usernameOrPayload, password, displayName);
    if (data?.success && data.token) {
      localStorage.setItem('unipick_token', data.token);
      setUser(data.user);
    }
    return data;
  }, []);

  const updateProfile = useCallback(async (payloadOrDisplayName) => {
    const data = await authApi.updateProfile(payloadOrDisplayName);
    if (data?.success && data.user) {
      setUser(data.user);
    }
    return data;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    return authApi.changePassword(currentPassword, newPassword);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await authApi.me();
    if (data?.success && data.user) {
      setUser(data.user);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('unipick_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        demoLogin,
        register,
        logout,
        updateProfile,
        changePassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
