import type { InputHTMLAttributes } from 'react';

// Native <input type="checkbox"> keeps built-in keyboard/a11y semantics -- just given real
// size and the brand accent colour instead of the browser default. `accent-color` is honoured
// by every current browser's native checkbox rendering, no custom SVG needed.
export function Checkbox({
  className = '',
  ...props
}: { className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={`h-5 w-5 rounded accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
