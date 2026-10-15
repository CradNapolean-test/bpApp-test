// Keeps a hub's current sub-tab in the address (?tab=...) so reloading, sharing the link or pressing Back lands on the same tab instead of
// the hub's first one (HUB1). Uses the History API directly: switching tab is in-page state, so it must not trigger a server round trip.
// Pass null for the hub's default tab to leave the address clean.
export function writeTabToUrl(slug: string | null): void {
  try {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set('tab', slug);
    else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // An address that cannot be rewritten (an odd embedded browser) just means a reload starts on the first tab, as it did before.
  }
}
