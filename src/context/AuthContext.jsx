import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { assistantService } from '../services/assistantService';
import { getToken, removeToken, setToken } from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const restore = async () => {
      if (!getToken()) {
        setIsInitializing(false);
        return;
      }
      try {
        const data = await authService.me();
        setUser(data.user);
      } catch {
        removeToken();
      } finally {
        setIsInitializing(false);
      }
    };
    restore();
  }, []);

  useEffect(() => {
    const expireSession = () => {
      removeToken();
      setUser(null);
    };
    window.addEventListener('lifeadmin:unauthorized', expireSession);
    return () => window.removeEventListener('lifeadmin:unauthorized', expireSession);
  }, []);

  const acceptSession = async (data, remember) => {
    if (getToken()) await assistantService.clear().catch(() => {});
    setToken(data.token, remember);
    setUser(data.user);
    return data.user;
  };
  const login = async (values, remember = false) =>
    await acceptSession(await authService.login(values), remember);
  const register = async (values) => await acceptSession(await authService.register(values), true);
  const loginWithGoogle = async (credential, remember = true) =>
    await acceptSession(await authService.google(credential), remember);
  const logout = async () => {
    try { await assistantService.clear(); } catch { /* Local logout must still succeed. */ }
    finally { removeToken(); setUser(null); }
  };
  const refreshCurrentUser = async () => {
    const data = await authService.me();
    setUser(data.user);
    return data.user;
  };

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), isInitializing, login, register, loginWithGoogle, logout, refreshCurrentUser }),
    [user, isInitializing],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
