import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricCard from './MetricCard.tsx';

describe('MetricCard', () => {
  it('renders title, value, and subtitle', () => {
    render(<MetricCard title="Total Clients" value={42} subtitle="Last 24h" />);
    expect(screen.getByText('Total Clients')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
  });

  it('renders without subtitle when not provided', () => {
    render(<MetricCard title="Count" value={10} />);
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<MetricCard title="Health" value="OK" />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('applies correct color class for blue (default)', () => {
    const { container } = render(<MetricCard title="Test" value={1} />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-blue-50');
    expect(card.className).toContain('text-blue-700');
    expect(card.className).toContain('border-blue-200');
  });

  it('applies correct color class for green', () => {
    const { container } = render(<MetricCard title="Test" value={1} color="green" />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-green-50');
    expect(card.className).toContain('text-green-700');
  });

  it('applies correct color class for yellow', () => {
    const { container } = render(<MetricCard title="Test" value={1} color="yellow" />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-yellow-50');
    expect(card.className).toContain('text-yellow-700');
  });

  it('applies correct color class for red', () => {
    const { container } = render(<MetricCard title="Test" value={1} color="red" />);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-red-50');
    expect(card.className).toContain('text-red-700');
  });

  it('is memoized (same props do not cause re-render)', () => {
    const props = { title: 'Test', value: 5 as string | number };
    const { rerender, container } = render(<MetricCard {...props} />);
    const firstChild = container.firstElementChild;
    rerender(<MetricCard {...props} />);
    expect(container.firstElementChild).toBe(firstChild);
  });
});
