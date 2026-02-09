import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const baseClasses = 'border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  compact?: boolean;
}

export default function Input({ compact, className = '', ...props }: InputProps) {
  return (
    <input
      className={`${compact ? 'px-3 py-1.5' : 'px-3 py-2'} ${baseClasses} ${className}`}
      {...props}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  compact?: boolean;
}

export function Select({ compact, className = '', children, ...props }: SelectProps) {
  return (
    <select
      className={`${compact ? 'px-3 py-1.5' : 'px-3 py-2'} ${baseClasses} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  compact?: boolean;
}

export function Textarea({ compact, className = '', ...props }: TextareaProps) {
  return (
    <textarea
      className={`${compact ? 'px-3 py-1.5' : 'px-3 py-2'} ${baseClasses} ${className}`}
      {...props}
    />
  );
}
