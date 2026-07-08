import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { canEditStockProduct as checkCanEditStockProduct } from '../utils/accessControl';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.me()
      .then((res) => {
        const u = res.data;
        setUser(u);
        localStorage.setItem('user', JSON.stringify(u));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth-logout', handleLogout);
    return () => window.removeEventListener('auth-logout', handleLogout);
  }, []);

  const login = async (usernameOrEmail, password) => {
    const res = await authAPI.login({ usernameOrEmail, password });
    const { token, user: u } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
    return u;
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        await authAPI.logout();
      } catch {
        // Clear local session even if the server call fails.
      }
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.dispatchEvent(new CustomEvent('auth-logout'));
  };

  const isAuthenticated = !!user;

  const hasPermission = (permissionCode) => {
    if (!user?.permissions) return false;
    return user.permissions.includes('admin.all') || user.permissions.includes(permissionCode);
  };

  const canEditStockProduct = useCallback(
    () => checkCanEditStockProduct(hasPermission, user),
    [user]
  );

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated,
      loading,
      hasPermission,
      canEditStockProduct,
      permissions: user?.permissions || [],
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
