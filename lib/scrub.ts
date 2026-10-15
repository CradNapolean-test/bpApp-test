// Text that may be stored or reported with anything that looks like an email address taken out, and shortened. Provider errors and job
// details go through this so a log line or a database row never holds a member's address.
export function scrubAddresses(text: string, max = 200): string {
  return text.replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, '[address]').slice(0, max);
}
