// Web: the browser's localStorage, wrapped so the static/server render pass (no window) does not crash.
const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const authStorage = {
  getItem: (key: string) => (hasStorage() ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (hasStorage()) window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (hasStorage()) window.localStorage.removeItem(key);
  },
};
