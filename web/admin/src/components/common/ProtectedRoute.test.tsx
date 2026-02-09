import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.tsx';

const mockUseAuth = vi.fn();

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, loading: false });
    renderWithRouter(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: false });
    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    // Navigate component renders nothing visible, content is absent
    expect(container.textContent).toBe('');
  });

  it('shows loading spinner during auth check', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, loading: true });
    const { container } = renderWithRouter(
      <ProtectedRoute>
        <div>Protected content</div>
      </ProtectedRoute>,
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    // LoadingSpinner renders a div with animate-spin class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});
