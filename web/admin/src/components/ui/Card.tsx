import type { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
}

export default function Card({ className = '', children }: CardProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {children}
    </div>
  );
}
