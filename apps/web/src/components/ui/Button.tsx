import * as React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-mono uppercase tracking-widest transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";
    
    const variants = {
      primary: "bg-[#1A1A1A] text-[#F4F4F0] hover:bg-[#C0392B]",
      secondary: "bg-[#C0392B] text-white hover:bg-[#1A1A1A]",
      outline: "border border-[#1A1A1A] text-[#1A1A1A] bg-transparent hover:border-[#C0392B] hover:text-[#C0392B]",
    };

    const sizes = {
      sm: "px-4 py-2 text-[10px]",
      md: "px-8 py-3 text-xs",
      lg: "px-12 py-5 text-sm",
    };

    const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`;

    return (
      <button
        ref={ref}
        className={combinedClassName}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
