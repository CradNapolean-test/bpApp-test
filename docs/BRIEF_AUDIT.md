# Audit: Codebase vs. Rob's BP App Brief (BP-App-Export.zip)

Date: 2026-09-30. Decision: **stay a web app (Next.js + Supabase + Vercel, installable PWA)** until
fully working; native/React Native port comes later. The export's "React Native + Node + S3"
recommendation is therefore ignored for now.

Method: migrations, schema, `lib/data`, and dashboard/coach components searched for each brief
item. Items marked "verify" were inferred from grep and need a UI check before building.

## Already covered (no work needed, or minor tuning)

| Brief item | Where |
|---|---|
| Booking, capacity, waitlist + auto-promotion | `0003`, `0006` (`book_class`, waitlist promotion) |
| Credits as append-only ledger, weekly membership reset, bonus/pack credits | `0005`, `0055` |
| Membership tiers as packages (credits/week) | `membership_packages`, `client_memberships` |
| Cancel-before-cutoff refund | `classes.cutoff_hours`, `cancel_booking` |
| Coach manual credit grants, coach books on behalf of client | `0062`, `CreditPackManager` |
| Attendance / no-show | `0005`, `0041` |
| Coach groups (e.g. "Ryan's Challenge") | `client_groups`, `GroupsManager` |
| Scheduled coach messages (one-off) | `0031` `scheduled_communications` |
| Chat (Realtime) | `ChatTab`, `chat_messages` |
| Nutrition: macro tracking, photo diary, manual import modes, targets | `FoodTrackingTab`, `PhotoDiaryTab`, `nutrition_tracking_mode` |
| Sleep / steps / water logging | `daily_logs`, `WeeklyLogTab`, `habits` |
| Progress photos (private bucket) | `0006` |
| Training programs, templates, exercise library, logging | `0013`, `0020` |
| Education / video library | `education_*` tables, `EducationTab` |
| Forms (feedback can reuse) | `form_templates` etc. |
| Push notifications, PWA manifest | `0060`, `sw.js`, `manifest.json` |
| Multi-site | `gyms` system (`0052`-`0056`) — but see gap 3 |

## Gaps — ordered by value to Rob's brief

### High (core to how Rob runs the gym)

1. **Cancellation rule with blackout window.** Brief: 3h cutoff, and 11pm-5am does not count
   toward the window (so a 6am class must be cancelled by 11pm the night before). Current: flat
   `cutoff_hours` (default 12) with no blackout. Needs a `cutoff_hours = 3` default plus
   blackout-aware deadline calc in `cancel_booking`, and the same deadline shown in the UI.
2. **Advance-booking limits by membership.** Brief: 2 weeks (Challenge), 2 weeks + 5 days
   (Full / Big Dog). Nothing enforces a booking horizon today. Add
   `membership_packages.advance_booking_days`, enforce in `book_class`.
3. **Two sites within one business.** `gyms` isolates whole rosters; Rob has ONE business
   with Worsley + Salford Quays, members bookable at either, shared coaches. Likely needs a
   `locations` table under a gym and `classes.location_id`, with a location filter on the
   booking screen. Confirm with Rob how many members cross sites.
4. **Strong (3/week, resets Saturday) vs Big Dog (unlimited).** Weekly reset exists but resets
   on Monday (`last_reset_week` = Monday). Needs configurable reset day (Saturday) and an
   "unlimited" package flag (no credit deduction). Rob said the reset day may change — make it a
   setting.
5. **Max 12 per session / session schedule.** Capacity is per-class already; seed the Mon-Sat
   schedule from the brief for both sites (Mon/Wed/Fri 10 slots, Tue/Thu variant with 12pm,
   Sat 6 slots, all 45 min).
6. **Chat: voice notes and photo attachments.** Brief lists text, voice, photos. `chat_messages`
   has no attachment fields. Needs Storage bucket + attachment columns + recorder UI.
7. **Recurring automated check-ins.** Brief: repeat every ~4 weeks, mix message wording,
   plan ahead. Current scheduler is one-off `send_at` only. Add recurrence (interval + rotating
   message list) to `scheduled_communications`.

### Medium

8. **Big Dog achievements** (fully absent). 12 exercises x Rookie/Strong/Big Dog standards
   split M/F (data is in the brief transcript lines ~295-320), Big Dog test score logging by
   coach ("peak week"), tier T-shirt levels: White 1+, Turquoise 3+, Silver 6+, Gold 12. Small
   profile badge, tappable to achievements page. `client_exercise_maxes` exists but holds strength
   maxes, not these standards. Need `standards` seed data, `client_test_results`, gender on profile.
   Silver and White shirt images are missing from the export — ask Rob to resend.
9. **Accountability traffic lights.** Data exists; missing green/amber/red display and sliders
   (Sleep 7.5+/6-7.5/<6h; Steps 8000+/4000-8000/<4000; Water 2.5L+/1-2.5L/<1L, L/mL toggle),
   and the 6-week (Challenge) vs full-year (Full) weekly calendar view. Verify current
   `WeeklyLogTab` UI. Note: mockup 07 documents that +/- buttons must be permanently visible
   (Rob complained about hover-only).
10. **Sessions-completed counter + club milestones** (100/200/300 club) and **loyalty
    rewards** (e.g. water bottle at 18 months, hoodies). Attendance data exists; needs a count
    view, milestone config, reward-earned tracking (coach marks as handed out).
11. **Coach workload / engagement reporting.** Brief: clients per coach and how often each
    member messages their coach. `reports` exists; verify whether message-frequency per client
    and per-coach client counts are included.
12. **Body composition (InBody).** Brief wants Weight, Skeletal Muscle Mass, Body Fat % over
    time as a line graph, plus InBody printout scan upload. `measurement_logs` holds tape
    measurements only. Add InBody fields (or a new table) + chart; printout scans can reuse
    progress photos with a type tag.
13. **Coach-side manager portal extras**: "give extra credit", change bookings already exist;
    confirm reports for sessions/members/credits meet what Rob and Adam use in TeamUp.

### Low / later (brief marks some as "coming soon")

14. **Events** (yearly calendar, member sign-up, optional payment). None. Sign-up only first;
    no payments (per CLAUDE.md).
15. **Refer a friend** — shareable link/code with 6-week challenge discount. None. Discount
    redemption is manual for now.
16. **Feedback** — simple rating + comment; could ship as a form template.
17. **Merchandise / Supplements** — brief says "coming soon". Add placeholder tiles only.
18. **Dashboard shape.** Brief describes a tile-grid home (My Sessions, My Coaching, Training &
    Nutrition Resources, Events, Refer, etc.) with a profile icon top-right. Current app uses a
    category tab bar. Decide: keep the tab bar or adopt the tile home from mockup 01.
19. **Profile page** items from mockup 02: membership type, DOB, FAQs / T&Cs / Privacy under a
    "Help & Legal" section. Verify what `AccountTab` shows; `app/legal` exists.
20. **Branding**: brief specifies teal `#2ABFBF`, `#111` background, `#1e1e1e` cards, Helvetica
    Neue. App uses coach-configurable branding; set Ballistic defaults. Logo files are in the
    export `uploads/`.

## Conflicts / decisions for Rob

- Existing app is built around 1:1 coach-client coaching + PT-Distinction-style modules; brief
  adds gym-facing member features (achievements, clubs, events, referral). Confirm those are
  wanted in v1 vs. after go-live.
- Reset day (Saturday) may change — build as a setting.
- Payments: brief mentions paying for events; CLAUDE.md says no payment processor. Keep manual.
- Brief says Challenge members can't book intro sessions (coach-booked at signup) — matches
  coach-book RPC (`0062`).

## Suggested build order

1. Booking rules: cutoff + blackout, advance limits, reset day, unlimited flag, seed schedule (1-5).
2. Locations (3) once Rob confirms the model.
3. Accountability traffic lights (9) and sessions-completed/clubs (10) — quick wins on existing data.
4. Big Dog achievements (8).
5. Chat attachments (6), recurring check-ins (7).
6. Body composition (12), reporting (11).
7. Events / refer / feedback / placeholder tiles (14-17); dashboard restyle + branding (18-20).
