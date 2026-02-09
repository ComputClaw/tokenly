import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from './UsersPage.tsx';
import type { UserListResponse } from '../types/api.ts';

vi.mock('../utils/formatRelative.ts', () => ({
  formatRelative: (iso: string) => iso,
}));

const mockUserData: UserListResponse = {
  users: [
    {
      user_id: 'u1',
      username: 'admin',
      role: 'super_admin',
      permissions: ['*'],
      enabled: true,
      created_at: '2026-01-01T00:00:00Z',
      last_login: '2026-02-09T08:00:00Z',
      must_change_password: false,
    },
    {
      user_id: 'u2',
      username: 'viewer1',
      role: 'viewer',
      permissions: ['read'],
      enabled: false,
      created_at: '2026-01-15T00:00:00Z',
      last_login: '2026-02-01T10:00:00Z',
      must_change_password: false,
    },
  ],
  total: 2,
};

const mockGetUsers = vi.fn();
const mockCreateUser = vi.fn();
const mockDisableUser = vi.fn();
const mockEnableUser = vi.fn();
const mockChangePassword = vi.fn();

vi.mock('../services/api-client.ts', () => ({
  getUsers: (...args: unknown[]) => mockGetUsers(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  disableUser: (...args: unknown[]) => mockDisableUser(...args),
  enableUser: (...args: unknown[]) => mockEnableUser(...args),
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}));

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsers.mockResolvedValue(mockUserData);
    mockCreateUser.mockResolvedValue(undefined);
    mockDisableUser.mockResolvedValue(undefined);
    mockEnableUser.mockResolvedValue(undefined);
  });

  it('renders user table', async () => {
    render(<UsersPage />);
    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });
    expect(screen.getByText('viewer1')).toBeInTheDocument();
    expect(screen.getByText('super_admin')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('add user modal opens and submits', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add user/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^username$/i), 'newuser');
    await user.type(screen.getByLabelText(/^password$/i), 'securepass12345');
    await user.type(screen.getByLabelText(/confirm password/i), 'securepass12345');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith('newuser', 'securepass12345', 'client_manager');
    });
  });

  it('disable toggle calls API for enabled user', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument();
    });

    // The 'admin' user is enabled, so button text is "Disable"
    const disableButtons = screen.getAllByRole('button', { name: /disable/i });
    await user.click(disableButtons[0]!);

    await waitFor(() => {
      expect(mockDisableUser).toHaveBeenCalledWith('admin');
    });
  });

  it('enable toggle calls API for disabled user', async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('viewer1')).toBeInTheDocument();
    });

    // The 'viewer1' user is disabled, so button text is "Enable"
    const enableButton = screen.getByRole('button', { name: /^enable$/i });
    await user.click(enableButton);

    await waitFor(() => {
      expect(mockEnableUser).toHaveBeenCalledWith('viewer1');
    });
  });
});
