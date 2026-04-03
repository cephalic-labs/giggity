import * as React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="block font-mono text-[10px] uppercase tracking-widest text-[#1A1A1A]/60">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full border border-[#1A1A1A]/10 bg-white px-4 py-3 font-body text-sm outline-none transition-all focus:border-[#C0392B] focus:ring-0 ${className}`}
          {...props}
        />
        {error && (
          <span className="block font-mono text-[10px] uppercase tracking-widest text-[#C0392B]">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
