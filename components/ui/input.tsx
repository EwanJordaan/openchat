"use client";
import * as React from "react";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={className}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 9,
        background: "var(--surface-elevated)",
        color: "var(--text-primary)",
        padding: "0.45rem 0.6rem",
        fontSize: "0.85rem",
        width: "100%",
      }}
      {...props}
    />
  ),
);
Input.displayName = "Input";
