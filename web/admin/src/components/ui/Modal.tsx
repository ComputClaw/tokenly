import type { ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  labelledBy: string;
  maxWidth?: 'sm' | 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function Modal({ onClose, labelledBy, maxWidth = 'md', className = '', children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4"
      onClick={onClose}
      aria-label="Close modal"
    >
      <div
        className={`bg-gray-900 border border-gray-700 rounded-lg shadow-xl ${maxWidthClasses[maxWidth]} w-full ${className}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </div>
    </div>
  );
}
