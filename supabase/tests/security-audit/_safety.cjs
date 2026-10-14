// Shared safety guard for the security-audit scripts. They create and delete test rows and test users, so they must
// never run against the project the app itself uses. A script only runs when --ref names a project listed in the
// AUDIT_ALLOWED_REFS environment variable (comma separated). The list is empty by default, so nothing runs until a
// throwaway sandbox project is named on purpose.
const ref = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
const allowed = (process.env.AUDIT_ALLOWED_REFS || '').split(',').map((r) => r.trim()).filter(Boolean);
if (!ref || !allowed.includes(ref)) {
  console.error('Refusing to run: --ref=' + (ref || '<missing>') + ' is not listed in AUDIT_ALLOWED_REFS. These scripts write test data; point them at a throwaway sandbox project only.');
  process.exit(2);
}
