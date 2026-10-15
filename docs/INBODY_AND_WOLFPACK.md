# InBody QR and Wolf Pack: what we found (Oct 2026)

Both items need an answer from the owners before anything big is built. This note records what is possible and what to ask.

## InBody QR

Today a member (or coach) types the numbers from the InBody printout into Progress > Body Scans and can attach a photo of the printout (`BodyScansTab.tsx`, `lib/data/bodyScans.ts`).

### What InBody actually offers (from InBody's own support pages)

1. **QR code on the printed result sheet.** On supported scales and firmware, the result sheet carries a QR code (the "QR Code Upload" setting has to be switched on in the device). The member scans it in a partner app and the results import. Partners such as Myzone use this. It needs specific firmware, and the QR is for apps InBody has set up as partners, so our app cannot just read it without InBody's help. The code points at InBody's own system, not at readable numbers.
2. **LookinBody Web API (cloud).** Completed tests are pushed to a partner by webhook. It is a paid service: an application form, a business partnership agreement and API terms, an API key, and the partner's server IP has to be registered. Only results from scales connected to the gym's LookinBody Web account are available. This is the route gym software such as FitSW, ClubReady and Charm uses.
3. **Aggregator (Terra).** A third party that normalises InBody data and pushes it to an app. Costs money and adds a middleman.
4. **PC export.** LookinBody 120 PC software exports results as CSV or images. Needs a person to export and upload.
5. **Open protocol** (serial/USB/LAN) for devices next to a PC. Not suitable for a web app.

Nobody can read the numbers by pointing a phone camera at the printed QR without InBody's help, so "member scans the QR and the numbers appear" only exists through option 1 (needs InBody to approve us as a partner) or option 2 (needs the paid API).

### What we can do now

- **Built:** a link `/dashboard?open=bodyscan` that opens a member straight on Body Scans. The gym can print it as a QR on the scale ("scan to add your scan") so the form is one tap away. Members who are signed out go to the login first and then land on Home, not Body Scans.
- **Cheap next step (not built):** CSV import of the LookinBody 120 export for a coach, so a whole day of scans goes in at once.

### Questions for the owners

1. Which InBody model(s), and is the gym on LookinBody Web (the cloud account)?
2. Is the goal "no typing for the member"? If yes, the realistic route is the paid LookinBody Web API (or InBody approving a partner QR flow). Ask InBody about pricing: Integration@inbody.com or LBSupport@inbody.com.
3. If typing is fine, is "scan a QR to open the form" enough?

### Recommendation

Start with the printed QR link (done) and ask InBody about the API cost. Only build the API route if the owners want fully automatic scans and accept the subscription.

## Wolf Pack challenge

Nothing called "Wolf Pack" exists in the code or the docs, so this needs a description from the owners first.

### Questions

1. Is it a **team** challenge (packs compete), a **whole-gym** goal (everyone adds to one total), or an **individual** challenge with a pack leaderboard?
2. How long does it run, and does it start on set dates (like the 6 week challenge) or is it always on?
3. What is scored: sessions attended, check-ins, steps, weight change, Big Dog results, points for habits?
4. Who sees whom: a public leaderboard with names, first names only, or just rank? Members must opt in (their numbers would be shown to other members).
5. Prizes, and who awards them?
6. Is it only for some plans (e.g. challenge members), or everyone?

### What we already have to build on

- **Events** with sign-ups and a banner on Home (`gym_events`, `EventBanner`), so "join the Wolf Pack" can be an event with a capacity.
- **Plans with a set length** (`duration_weeks`), the same mechanism as the 6 week challenge, with the countdown card on Home.
- **Rewards** with a ledger of who got what (`rewards`, `reward_grants`) for prizes.
- **Counts the app already keeps:** attended sessions (`bookings.attended`), daily check-ins (`daily_logs`), steps, Big Dog results and shirts.
- **Owner reports** (Reports screen) for a gym-wide view.

### Options

- **A. Light (about a day):** an event plus a manual leaderboard the coach updates, shown on Home while it runs. No new scoring.
- **B. Scored (a few days):** a `challenges` table (name, dates, metric), `challenge_members` (opt-in, team), and a server function that counts the chosen metric per member or team for the dates. A leaderboard screen that shows names only for members who opted in, built on a database view so other members never read raw rows.
- **C. Full module:** points ledger, badges, per-week rounds, push notifications. Only worth it if challenges become a regular product.

Recommendation: A for the first run to learn what the owners actually want, then B if it repeats.

### Privacy note

Any leaderboard shows one member's numbers to others. It must be opt-in, and row level security must stop members reading each other's logs directly: only the counted totals are exposed, through a security-definer function (the same pattern as `owner_activity_report`).
