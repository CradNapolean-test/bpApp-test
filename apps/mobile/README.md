# Ballistic Performance: member app (Expo)

The phone and browser app for gym members. Coaches and owners use the web app in `apps/web`. Both talk to the same Supabase project;
the database's row-level security is the security boundary, so this app only ever holds the public (publishable) key.

SANDBOX: this copy is pointed at the sandbox Supabase project only. See `docs/EXPO_REWRITE_PLAN.md` for how it is built and
`docs/EXPO_REWRITE_ROADMAP.md` for what is left before a store release.

## Run it

```bash
npm install                 # this folder has its own install; it is not an npm workspace
cp .env.local.example .env.local   # then fill in the sandbox URL and publishable key (never a service-role key)
npx expo start              # scan the QR code with Expo Go, or press w for the browser build
```

Push notifications, and anything else with native code Expo Go lacks, need a development build (`docs/SLICE_8_SETUP.md`).

## Check it

```bash
npx tsc --noEmit            # types
npx expo lint               # lint
npx expo-doctor             # dependency and config health
(cd ../../packages/shared && npx vitest run)   # the shared rules and their tests
```

## Where things are

- `src/app/` screens (Expo Router). `(app)/` is everything behind sign-in.
- `src/components/` shared pieces and the larger per-feature components.
- `src/lib/` one React Query hook per screen, the offline write queue (`writeQueue.ts`, `queuedWrites.ts`), push and session code.
- `../../packages/shared` the rules, types and tests shared with the web app (linked as `@ballistic/shared`).
- `scripts/` regenerates the icon set (`generate-icons.cjs`) and the brand images (`generate-brand-assets.cjs`).
