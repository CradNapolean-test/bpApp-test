import { useEffect, useState } from 'react';

// The value, but only after it has stopped changing for `ms`. Used so typing "porridge" is one search, not eight.
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
