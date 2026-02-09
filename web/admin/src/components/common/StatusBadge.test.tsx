import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge.tsx';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="approved" />);
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('renders correct text for each status', () => {
    const statuses = ['approved', 'active', 'pending', 'rejected', 'stopped'];
    for (const s of statuses) {
      const { unmount } = render(<StatusBadge status={s} />);
      expect(screen.getByText(s)).toBeInTheDocument();
      unmount();
    }
  });

  it('applies green classes for approved status', () => {
    render(<StatusBadge status="approved" />);
    const badge = screen.getByText('approved');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('applies green classes for active status', () => {
    render(<StatusBadge status="active" />);
    const badge = screen.getByText('active');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('applies yellow classes for pending status', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText('pending');
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-800');
  });

  it('applies red classes for rejected status', () => {
    render(<StatusBadge status="rejected" />);
    const badge = screen.getByText('rejected');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('applies gray classes for unknown status', () => {
    render(<StatusBadge status="unknown" />);
    const badge = screen.getByText('unknown');
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-800');
  });
});
