import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import type { AuthUser } from '../types/api.ts';
import * as api from '../services/api-client.ts';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
}

type AuthAction =
  | { type: 'LOGIN_SUCCESS'; user: AuthUser }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; loading: boolean };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return { user: action.user, isAuthenticated: true, loading: false };
    case 'LOGOUT':
      return { user: null, isAuthenticated: false, loading: false };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
  }
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    user: null,
    isAuthenticated: false,
    loading: true,
  });

  useEffect(() => {
    api
      .refresh()
      .then((res) => {
        const token = res.access_token;
        if (token) {
          try {
            const parts = token.split('.');
            const payloadPart = parts[1];
            if (!payloadPart) {
              throw new Error('Invalid token format');
            }
            const payload = JSON.parse(atob(payloadPart));
            dispatch({
              type: 'LOGIN_SUCCESS',
              user: { username: payload.username, permissions: payload.permissions ?? [] },
            });
          } catch {
            dispatch({ type: 'LOGOUT' });
          }
        }
      })
      .catch(() => {
        dispatch({ type: 'LOGOUT' });
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    dispatch({ type: 'LOGIN_SUCCESS', user: res.user });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
