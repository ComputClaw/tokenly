import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950',
  secondary: 'bg-gray-800 text-gray-300 hover:bg-gray-700',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
  ghost: 'text-gray-400 hover:text-gray-200 hover:bg-gray-800',
  outline: 'border border-gray-700 text-gray-300 hover:bg-gray-800',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-medium rounded-md transition-colors disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
