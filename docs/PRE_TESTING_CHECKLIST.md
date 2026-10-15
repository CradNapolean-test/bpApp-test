# Before real testing: what I could check, and what only you can

Date: 2026-10-15 · Follows [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md). This covers the "not covered" items from the end of that audit. Some I could check from here (results below, new findings **R39 to R46** are added to the audit). The rest need a device, a dashboard login or a decision from you, so this file turns them into a checklist you can work through in a day.

## 1. What I checked from here

| Item | Result |
|---|---|
| Scheduled jobs | **Healthy.** All 126 active memberships have this week's credit reset (`last_reset_week` is Monday 12 Oct). The check-in reminder job ran at 04:16 UTC today. The red-flag report, programme rollouts (4 of 4 applied) and notifications are current. Hobby plan jobs can start any time in the hour after their scheduled time (04:00 ran at 04:16), so do not promise exact times. |
| Password-reset emails | **Work.** Four real accounts requested a reset and all four signed in afterwards, the latest yesterday at 20:40 UTC. These go through Supabase's own mailer, not Resend, so R2 does not affect them. Still test once with an address that is not on your Supabase team (section 3). |
| App emails (broadcasts, birthdays, "Email your coach") | **Will not reach members** until `RESEND_FROM_EMAIL` is set (R2). The member's "Email your coach" button reports "The email did not go through", so testers will see it failing. The Resend key in the project can only send, so I could not read its domain status; check it in Resend (section 3). |
| Web push | **Set up and consistent.** The two VAPID keys match and are accepted by the push library. Two members have subscribed, both on Apple devices (Apple's push service). Not tested end to end: a push needs a real device and would notify a real person. |
| Phone app | **None in this project** (you confirmed it is web only). Migrations `0108` to `0114` contain groundwork for one that nothing uses (R39). |
| Production site | Reachable, `x-vercel-cache: MISS`, about 185 to 205 ms to first byte from here. The sign-in page loads **1.15 MB of JavaScript and CSS (uncompressed) in 10 files** (R43). Manifest, icons, 11 iPhone splash images, `sw.js` and the offline page all load for a logged-out visitor. |
| Database distance | Cloudflare's edge is in London but each request still takes 91 to 123 ms, so the database is almost certainly not in London (R10). |
| Production logs | The Vercel log stream did not return data (Hobby keeps about an hour of logs and it was quiet). Look at the Vercel Logs tab yourself (section 3). |

## 2. New findings from this pass

(Full wording is in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md), R39 to R46.)

| ID | Severity | Finding |
|---|---|---|
| R39 | Low | Migration `0113` adds phone-push tables and a function for a phone app that is not part of this project; nothing sends to them. |
| R40 | Medium | Coaches get no push or email when a member messages them. Push goes member-ward only (`pushMemberIfFromCoach`); the coach relies on opening the app. Brad already has 64 unread. |
| R41 | Medium | Push failures are invisible: errors other than "subscription gone" are swallowed and counted nowhere, and sending a chat message waits for every push to finish. |
| R42 | Low | The push sender's contact address is a personal Gmail (`mailto:basfitnz@gmail.com`), the default because `VAPID_SUBJECT` is not set in Vercel. Push services see it. |
| R43 | Low | The sign-in page ships 1.15 MB of JavaScript and CSS (441, 242, 152, 110 KB for the biggest four). |
| R44 | Low | Icons, 11 splash images and the manifest are served `max-age=0, must-revalidate`, so every app launch re-checks each one. There are no iPad splash images. |
| R45 | Info | Jobs are healthy (above). |
| R46 | Low | The daily reminder job created reminders for 223 members, including 219 test accounts, so every day it writes notifications and attempts pushes for test data (add to R6). |

## 3. Your checklist (dashboards and devices)

Tick these off before testing. "Why" points at the finding behind each.

### Supabase dashboard

| Where | Check | Why |
|---|---|---|
| Authentication, Sign In / Providers, Email | Turn **off** "Allow new users to sign up" | R1 |
| Authentication, SMTP Settings | A **custom SMTP** is enabled (Resend SMTP works). Without it, Supabase's built-in sender is limited to a few emails an hour and, on current plans, only to people on your Supabase team | Members' password resets |
| Authentication, URL Configuration | **Site URL** is the production address; **Redirect URLs** include `/reset-password` and `/auth/confirm` on it; remove `localhost` entries for production | Reset links pointing at the wrong place |
| Authentication, Email Templates | Wording and branding of Confirm, Reset and Change-email emails | First thing a member sees |
| Authentication, Attack Protection / Policies | Minimum password length 8 or more; leaked-password protection if your plan has it; CAPTCHA on sign-in if you keep any public sign-up | R1, M7 |
| Authentication, Multi-Factor | Enable TOTP, then enrol coaches and owners | R7 |
| Project Settings, Billing | Which **plan** you are on. Free projects have **no backups** and **pause after a week without use**, which could happen between now and testing | Data loss, downtime |
| Database, Backups | Daily backups present; point-in-time recovery if you can; **try one restore into a scratch project** | Recovery |
| Project Settings, Infrastructure | **Region** (London is best for UK members) and compute size | R10 |
| Database, Advisors | Run **Security Advisor** and **Performance Advisor** and send me the output; it lists missing row-level security, loose functions and missing indexes | R9, H1 |
| Realtime, Inspector / Settings | Concurrent-connection and channel limits for your plan | R29 |
| Reports / Logs | API errors (4xx and 5xx) over the last week | Hidden failures |
| Storage | Only `coach-branding` is public; others private | CM5 |

### Vercel

| Where | Check | Why |
|---|---|---|
| Settings, Environment Variables | Add `RESEND_FROM_EMAIL` and `VAPID_SUBJECT` (a business address) to **Production**, then redeploy | R2, R42 |
| Settings, Billing | Plan (Hobby is non-commercial) | R8 |
| Settings, Advanced | Enable **Skew Protection** | R8 |
| Settings, Domains | Add a custom domain **before** members install the app | R8 |
| Cron Jobs tab | Last run and status for all seven jobs | R45 |
| Logs tab | Errors in the last 24 hours | Hidden failures |
| Settings, Billing | Set a spend alert | Surprise bills |

### Resend

| Check | Why |
|---|---|
| Domain verified (SPF, DKIM, and add a DMARC record) and a real from-address chosen | R2 |
| Plan limits: the free plan caps daily and monthly sends, so a broadcast to a full gym can exceed it | R2, R25 |
| Send a test email to a Gmail and an Outlook address; check it is not in spam | Deliverability |

### Sentry

Trigger one deliberate error in production and confirm it appears, with the right environment, and that alerts reach someone.

### Real-device test script (iPhone first, then a mid-range Android)

Run each on a phone that is **not** your development machine, on mobile data as well as Wi-Fi.

| # | Test | Expected | Finding |
|---|---|---|---|
| 1 | Open the production address in Safari, Share, **Add to Home Screen**, launch from the icon | Splash shows, opens full screen, no browser bar | R44 |
| 2 | Sign in, close the app fully, reopen | Still signed in; no flash of blank screen | M1 |
| 3 | "Forgot password" with an address not on your Supabase team | Email arrives in under a minute; link opens the reset page on the right address | Section 1 |
| 4 | Allow notifications when asked; have a coach message you with the app closed | Push arrives; tapping opens the chat | R18, R41 |
| 5 | Two members sign in on the same phone one after the other, each message the other's coach | Each gets only their own notifications | R18 |
| 6 | Food diary: add food with the keyboard open; scroll; delete an entry | Nothing hides under the keyboard or the bottom bar | R21 |
| 7 | Food diary: scan a barcode | Camera opens (HTTPS), scans, asks nothing it should not; try a poor-light scan | FT7, FT8 |
| 8 | Chat: record and send a **voice note**; play it back on the coach side | Records and plays on iPhone (it needs to be recorded in a format Safari can play) | M4 |
| 9 | Chat: send a **photo** straight from the camera (HEIC) | Uploads and shows for the coach | PT4 |
| 10 | With the Add-food sheet open, swipe back / press Android back | The sheet closes, you stay on the screen | R21 |
| 11 | Check-in: fill the day using only the on-screen controls, then try the number box | Nothing records until you change a value; clearing a box un-logs it (once fixed) | R12 |
| 12 | Book a class, cancel inside and outside the cut-off; check credits and the notification | Refund only before the cut-off; ledger is right | CH4 |
| 13 | On the day of a class, check in 10 minutes early and 20 minutes late | Behaves as you decide (R17) | R17 |
| 14 | Turn on aeroplane mode mid-use, then back on | Offline banner, no lost typing, recovers cleanly | OfflineBanner |
| 15 | Leave the app open, have a developer deploy a new version, then use it | A clear "update available" or no error | R8 |
| 16 | Set the phone to **VoiceOver / TalkBack** and sign in, book, log food | Every control is announced; you can reach and operate everything | LT7 |
| 17 | Set the phone text size to the largest | Nothing is cut off or overlapping | UI |
| 18 | Rotate to landscape and open on an iPad | Layout still usable | UI2 |
| 19 | Slow connection (Safari Develop menu, or Android developer options "slow 3G") | Screens show a loading state, not a blank page | M1, R13 |
| 20 | Coach on a phone: open Messages, Clients, a member, Classes | Fast enough to use between sessions (aim under 3 s) | R13 |

## 4. Write-based proofs: how to run them safely

**Update, 15 Oct:** R3, R4 and R5 were run with your approval and are **confirmed** (details and numbers in [AUDIT_ROUND_2.md](AUDIT_ROUND_2.md)). R25 and R33 are left as code-only findings because proving them leaves rows that cannot be deleted from the app. H1, H2 and CM5 need a raw database call as a member; run `docs/audit-proofs/member-api-proofs.mjs` yourself as a seeded test member (read it first). The table below is the original protocol, kept for re-testing after the fixes.

These prove the High findings by doing the risky thing on **throwaway rows**, then deleting them. I did not run them because each writes to the live project. I can run them with you, **only on throwaway data**, if you approve. The safest set-up is a coach in a gym with no real members.

| Proof | Steps | Expected if the finding is real | Clean-up |
|---|---|---|---|
| **R3** form edit wipes answers | 1. As a coach, create a form "ZZ proof" with one question. 2. Assign it to a seeded test member (not a real one). 3. As that member, answer it. 4. As the coach, open the form, change one word, Save. 5. Open the member's form answer. | The answer is gone; the form still says "Completed" | Delete the form and the test member's assignment |
| **R4** wrong conversation | Two seeded test members with a few messages each; as a coach, click one then the other quickly (or throttle the network) and compare the header with the messages | Messages from the first member appear under the second's name | None (read-only) |
| **R5** whole-gym programme | In a gym with only seeded test members, build a one-day template, "Start a programme", leave "Everyone at the gym", press the button | Starts for everyone with no confirmation | Cancel or delete the rollout; restore the members' previous programme |
| **R25** broadcast with no confirm | Send a message to "My clients" in a gym where the only client is yourself | Sends immediately | Delete the message |
| **R33** group delete | Create a group, send a broadcast to it, try to delete the group | The database refuses | Delete the broadcast first, then the group |
| **H1 / H2 / CM5** member writes | As a seeded member, edit one exercise-library row to the same value; insert one booking directly; upload one file to the branding bucket | The database allows them | Delete the booking and the file |

If you would rather not, treat the code-reading evidence as sufficient and simply fix them first.

## 5. Privacy policy: what to give your lawyer

I am not a lawyer; this is the factual inventory from the code and database so the policy is written from what the app really does (H3).

| Area | What is collected |
|---|---|
| Identity and contact | Name, email, phone, date of birth, gender, emergency contact, timezone |
| Health and body | Health notes, injuries and limitations, PAR-Q and intake answers, weight, measurements, body-scan results and printouts, progress photos, sleep, steps, water, mood ratings, calorie targets |
| Training and nutrition | Food diary, meal photos, programmes, workout logs, Big Dog results |
| Gym activity | Bookings, attendance, credits ledger, plans, events, feedback, referrals |
| Communication | Chat messages, voice notes, photos, broadcasts, emails to the coach |
| Coach-side records | Private coach notes, contract notes, red-flag follow-ups |
| Device | Push subscription (browser endpoint), install and offline state, sign-in sessions; server logs (IP) |

| Who handles it | Why | Where |
|---|---|---|
| Supabase | Database, sign-in, file storage | Check region (R10) |
| Vercel | Hosting, logs | US East functions |
| Resend | App emails (once set up) | US |
| Sentry | Error reports and 10% performance samples | EU or US, check your Sentry project |
| Apple, Google, Mozilla push services | Deliver notifications | Global |
| Open Food Facts | Barcode lookups (the barcode number only, sent from your server) | EU |
| YouTube, Vimeo | Education and exercise videos (they set cookies when played) | Global |
| Anthropic | Meal-photo estimates: **switched off** today (no key set); if enabled, photos are sent to it | US |

Points the policy must also answer: who inside the gym can see what (every coach in a gym sees meal photos, forms and notes; owners likewise at database level, R37), how long data is kept, how a member exports or deletes their data (deletion exists; export does not), the legal basis for health data (explicit consent), and the age limit (the app accepts 10 and up, M8).

## 6. Suggested "ready for real testing" gate

Do these first; each is small:

1. Turn off public sign-up (R1) and enable custom SMTP (section 3).
2. Set `RESEND_FROM_EMAIL` and verify the domain, then redeploy (R2).
3. Remove the 219 test accounts and the "test" event (R6, R35).
4. Switch Brad's active gym to Salford, then fix R38 properly.
5. Fix R3, R4, R5 (forms, stale reply, whole-gym start); they can lose or misdeliver real data.
6. Add coach notifications for member messages (R40) and log push failures (R41).
7. Run the device script above on one iPhone and one Android.
8. Confirm backups and a restore (section 3).
