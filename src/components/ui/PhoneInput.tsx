import { useState, useEffect, type ChangeEvent } from 'react';

interface PhoneInputProps {
  label?: string;
  value: string;
  onChange: (fullNumber: string, localDigits: string) => void;
  error?: string | null;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  id?: string;
}

/**
 * Normalizes input: removes non-digits, strips leading "+234", "234", or "0".
 * Returns up to 10 local digits (e.g. "8031234567").
 */
export function extractLocalNigerianDigits(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) {
    digits = digits.slice(3);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Groups 10 digits for human readability: "803 123 4567".
 */
export function formatLocalPhoneGrouping(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function PhoneInput({
  label = 'Phone number',
  value,
  onChange,
  error,
  placeholder = '803 123 4567',
  required = false,
  disabled = false,
  helperText,
  id = 'phone-input',
}: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState(() => {
    const local = extractLocalNigerianDigits(value);
    return formatLocalPhoneGrouping(local);
  });

  useEffect(() => {
    const local = extractLocalNigerianDigits(value);
    setDisplayValue(formatLocalPhoneGrouping(local));
  }, [value]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const localDigits = extractLocalNigerianDigits(raw);
    const formatted = formatLocalPhoneGrouping(localDigits);
    setDisplayValue(formatted);

    const fullE164 = localDigits ? `+234${localDigits}` : '';
    onChange(fullE164, localDigits);
  };

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label} {!required && <span className="text-xs font-normal text-gray-400">(Optional)</span>}
        </label>
      )}

      <div className="relative flex rounded-lg shadow-sm">
        {/* Country Code Prefix Badge */}
        <div className="inline-flex items-center gap-1.5 px-3.5 rounded-l-lg border border-r-0 border-gray-300 bg-gray-100/90 text-gray-700 select-none shrink-0 transition-colors">
          <span className="text-base leading-none" role="img" aria-label="Nigeria">🇳🇬</span>
          <span className="font-semibold text-[14px] text-gray-800 tracking-tight">+234</span>
        </div>

        {/* Input Field */}
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={12} // "803 123 4567" is 12 chars
          className={`block w-full min-w-0 flex-1 rounded-none rounded-r-lg border bg-gray-50 px-3.5 py-2.5 text-[15px] text-gray-900 transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? 'border-danger-500 bg-red-50/10' : 'border-gray-300'
          }`}
        />
      </div>

      {error ? (
        <p className="text-xs text-danger-500 font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] text-gray-400 font-body">{helperText}</p>
      ) : (
        <p className="text-[11px] text-gray-400 font-body">
          Enter 10 or 11 digits (e.g. 080... or 80...). Saved as +234...
        </p>
      )}
    </div>
  );
}
