import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner.tsx';

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.firstElementChild!;
    expect(spinner).toBeInTheDocument();
    expect(spinner.className).toContain('animate-spin');
  });

  it('applies default medium size', () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.firstElementChild!;
    expect(spinner.className).toContain('h-8');
    expect(spinner.className).toContain('w-8');
  });

  it('applies small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const spinner = container.firstElementChild!;
    expect(spinner.className).toContain('h-4');
    expect(spinner.className).toContain('w-4');
  });

  it('applies large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const spinner = container.firstElementChild!;
    expect(spinner.className).toContain('h-12');
    expect(spinner.className).toContain('w-12');
  });

  it('applies custom className if provided', () => {
    const { container } = render(<LoadingSpinner className="my-custom-class" />);
    const spinner = container.firstElementChild!;
    expect(spinner.className).toContain('my-custom-class');
  });
});
