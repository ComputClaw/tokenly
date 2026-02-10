import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export default function Card({ className = '', children }: CardProps) {
  return (
    <div className={`bg-gray-900/80 rounded-xl border border-gray-700/40 shadow-lg shadow-black/25 ${className}`}>
      {children}
    </div>
  );
}
