import * as React from "react";

export function Badge({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={"badge" + (className ? ` ${className}` : "")} {...props}>
      {children}
    </span>
  );
}
