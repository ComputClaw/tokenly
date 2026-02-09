import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export default function Card({ className = '', children }: CardProps) {
  return (
    <div className={`bg-gray-900 rounded-lg border border-gray-800 ${className}`}>
      {children}
    </div>
  );
}
