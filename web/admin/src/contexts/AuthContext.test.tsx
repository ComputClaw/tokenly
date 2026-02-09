import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.tsx';

const mockLogin = vi.fn();
const mockLogout = vi.fn();
const mockRefresh = vi.fn();

vi.mock('../services/api-client.ts', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  refresh: (...args: unknown[]) => mockRefresh(...args),
}));

function TestConsumer() {
  const { isAuthenticated, loading, user, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="username">{user?.username ?? 'none'}</span>
      <button onClick={() => login('admin', 'pass')}>Login</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-refresh on mount attempts token refresh', async () => {
    mockRefresh.mockResolvedValue({ access_token: 'tok', token_type: 'bearer', expires_in: 3600 });
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('login() calls API and sets authenticated state', async () => {
    mockRefresh.mockRejectedValue(new Error('No session'));
    mockLogin.mockResolvedValue({
      access_token: 'token123',
      token_type: 'bearer',
      expires_in: 3600,
      user: { username: 'admin', permissions: ['*'] },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Wait for initial refresh to fail and set loading=false
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
      expect(screen.getByTestId('username').textContent).toBe('admin');
    });

    expect(mockLogin).toHaveBeenCalledWith('admin', 'pass');
  });

  it('logout() clears auth state', async () => {
    // Start with a valid token from refresh
    const payload = btoa(JSON.stringify({ username: 'admin', permissions: ['*'] }));
    const token = `header.${payload}.sig`;
    mockRefresh.mockResolvedValue({ access_token: token, token_type: 'bearer', expires_in: 3600 });
    mockLogout.mockResolvedValue(undefined);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });

    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated').textContent).toBe('false');
      expect(screen.getByTestId('username').textContent).toBe('none');
    });
  });

  it('provides user info to children after successful refresh', async () => {
    const payload = btoa(JSON.stringify({ username: 'johndoe', permissions: ['read'] }));
    const token = `header.${payload}.sig`;
    mockRefresh.mockResolvedValue({ access_token: token, token_type: 'bearer', expires_in: 3600 });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('username').textContent).toBe('johndoe');
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  });
});
