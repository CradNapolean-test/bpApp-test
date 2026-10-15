// A tiny "the data changed" counter shared by the browser (R13). After a save the page used to be reloaded whole from the server
// (router.refresh); data that a screen fetches for itself when it opens (useOnDemand) is not part of that reload, so useAction bumps
// this number after a successful save and those screens read their data again.
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeDataVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataVersion(): number {
  return version;
}

// What the server renders with: no saves have happened yet.
export function getServerDataVersion(): number {
  return 0;
}
