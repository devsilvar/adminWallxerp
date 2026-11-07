import { forwardRef, type InputHTMLAttributes } from 'react';

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const roundedClass = className.includes('rounded-') ? '' : 'rounded-lg';

    return (
      <div className="space-y-1">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`block w-full ${roundedClass} border bg-gray-50 px-3.5 py-2.5 text-[15px] text-gray-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white ${
            error ? 'border-danger-500' : 'border-gray-200'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-danger-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
