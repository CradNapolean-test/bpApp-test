# Coach side: desktop walk-through and extra findings

This adds to [COACHING_REVIEW.md](COACHING_REVIEW.md), the main usability review of the coach side. Read that first. That review lists desktop width as still to check, so this one covers it, plus points it doesn't make. Anything already covered there isn't repeated here.

## How this was done

- **When and as whom:** 5 November 2026, about 4:30 to 5 pm, live in the in-app browser. Signed in as coach Brad at Salford Quays.
- **Widths:** desktop width (1366px) for everything, plus a quick check at phone width (375px).
- **Member used for the deep dive:** Member A.
- **Read only.** I only expanded lists and opened the session roster, Run this class and Last weights. Nothing was saved, ticked, booked or sent.
  - Messages wasn't opened, because on a wide screen it marks a thread as read.
  - Classes → Reports wasn't opened either. It opens on Red flags, which saves data when it loads.
- **Earlier code-only pass:** points from it that turned out wrong or already fixed have been dropped.

## Fixed already (seen live, no action)

- **Check-in reply:** "Reply to Member A" with "Send and mark reviewed" now ends the week.
- **Credits:** "Out of credits" no longer appears in "Members to check in on".
- **Number format:** check-in steps read "9,929".

## Still there (from COACHING_REVIEW.md, seen again today)

- Member A's Overview at 4:40 pm still says "Next: Thu 5 Nov 6:45am", a class she attended that morning.
- The 6:45am roster still offers "Cancel this session" for a class that finished hours ago.
- On a phone, To do titles are cut off and the + button covers the last row's count.

## Fixed later on 5 November 2026 (items 1 to 6)

Checked in the browser as Brad, desktop width. Nothing was marked, sent or saved during the check.

- **1. Fair comparison.** "Sessions attended" is now compared with the same day and time last week: last week's days before today's weekday, plus that weekday's sessions that had started by now.
  - Live on Thursday afternoon: "9 · ▲ 2 vs this time last week". Before the fix it read "▼ 1 vs last week".
  - Code: `lib/data/coachDashboard.ts` (bookings now read the class start time).
- **2. Counts.**
  - The checked-in tile adds "2 not set up yet", so 12 + 2 adds up to the 14 in total.
  - The new-members tile says "joined this week", so it can't be read against "New members to review".
- **3. Class fill.** The "average class fill" tile opens Classes → Reports → Busiest. "Red flag follow-ups" links to `section=red-flags`, and Reports opens on the section named in the link (`ReportsPane.tsx` `reportSectionFromParam`).
- **4. No food.** Each check-in row says when a week had no food or food on only some days. For example, "Week of 26 Oct · 7 days logged · no food" and "3 days logged · food on 2". Photo diary members count days with meal photos. The dashboard also reads `calories` now, so a day with only a Quick Add counts as logged.
- **5. Thin weeks.**
  - Weeks with 3 or more days come first, newest first.
  - Weeks with 1 or 2 days go under "Only 1 or 2 days logged", with a "Mark all reviewed" button for the coach's own members.
  - The summary reads "5 weeks to read · 6 with only 1 or 2 days logged".
- **6. Next check-in.** Opening a check-in from the dashboard saves the list's order for that browser tab (`lib/checkinQueue.ts`). Once the week is reviewed, the week page shows a "Next check-in: {name} · {week}" card. After the last one, it shows "That was the last check-in on your list. Back to the dashboard".
  - Not seen on screen: it only appears on a reviewed week, and no week was marked on live data to test it.
  - The order saved was confirmed live, and the list logic has tests (`lib/checkinQueue.test.ts`).

---

## New findings

### Dashboard

1. **This week's sessions are compared with the whole of last week.** On Thursday afternoon the tile reads "9 sessions attended ▼ 1 vs last week" (`lib/data/coachDashboard.ts:328`). Until the week is nearly over, it will almost always show a red ▼. Compare with the same days of last week.
2. **Counts disagree on the same screen.**
   - "7 / 12 members checked in" sits next to "14 members in total", and Clients says "14 members".
   - The "1 new member" tile sits under "New members to review · 2".

   Use one total, or say what the 12 leaves out.
3. **"Average class fill" opens Red flags.** Both the "Red flag follow-ups" row and the "3% average class fill" tile link to Classes → Reports, which opens on Red flags. So tapping a fill figure shows red flags. That screen also saves data when it loads (`red_flag_report`). Link the fill tile to Reports → Busiest, which ranks sessions by bookings. Overview has no fill figure.
4. **"7 days logged" hides "no food".** Member A's row reads "Week of 26 Oct · 7 days logged". The week itself opens with a red "No food logged on any of the 7 days." The row should carry that, for example "7 days · no food".
5. **Thin weeks become review items.** "Weekly check-ins to review" has 11 rows for 6 members, and 5 of them are weeks with only 1 or 2 days logged.
   - Ideas: a minimum number of days, or put those weeks under a "Little logged" heading.
   - Add a "Mark all reviewed" action for a group.
6. **No "next" after replying.** After "Send and mark reviewed" the page stays on that week with a toast (`WeeklyLogTab.tsx`, `CheckinReply`). To reach the next one, the coach goes back to the dashboard, expands the group again and picks the next row. A "Next check-in: Amy Johnstone →" link after sending would make Monday review one flow.
7. **To do rows behave in two ways.**
   - "Red flag follow-ups" has a › and leaves the page. The others have a ˅ and expand in place.
   - The "Weekly check-ins to review" count is a green badge, and green reads as "all fine".
8. **"Run this class" is three steps from the dashboard:** Up next → Open roster (a pop-up) → Run this class. While a class is on, the Up next card could link straight to it.

### Desktop width (1366px)

9. **The home page's right column is underused.**
   - Recent activity showed only 2 items.
   - Under it is a permanent "Add client" form, which a coach uses a few times a month.
   - Better uses for the space: messages needing a reply, or today's roster.
10. **There are two ways into messages, side by side:** the header chat icon and the Messages tab.
11. **The member page works well at this width.** The left menu and the three-column Overview read well, and the weight warning ("9.0kg further from the goal than at the start…") is clear. The Overview still leaves out:
    - protein against target (calories only)
    - the energy, stress and hunger trend (it's in the check-in, not the Overview)
    - unread messages
12. **The Clients table only has 4 columns:** Client, Status, Last active and Credits, with a lot of empty space in the Client column. There's room for:
    - "Last class": attendance next to logging would show cases like Member B, who is Green but red-flagged for attendance
    - check-in waiting or reviewed
    - weight trend
13. **Classes uses a full-width list with a centred pop-up.** The session list spans the page and the roster opens as a pop-up over it; on desktop the two could sit side by side. In the pop-up:
    - The biggest button is "Add a client" (a booking). Attended / No-show and "Run this class" are smaller.
    - "Remove" sits right next to the member's name.
14. **Run this class is a narrow column at this width.** Fine on a tablet. "Last weights" lists the warm-ups first, each as "Not done before" (Bike, Supported Squat Hold, MB Squat + Throw), so the lifts sit below them. Hide warm-ups there, or list lifts first.
15. **Library shows 474 exercises as two columns of large cards,** about 6 per screen. A compact list would suit desktop. See also `COACH_LIBRARY_REVIEW.md`.

### Words

16. **Client or member?** Both are used, sometimes on the same screen. Pick one.
    - **Client:** the Clients tab, "Add client", "All clients", and "Add a client" on the class roster.
    - **Member:** "14 members", "New members to review", "Members to check in on", and "Add a member" on the phone.
17. **"Big Dog" is both a plan and the strength challenge.** It's a plan in Business → Plans and on the member chip "Big Dog · 0 credits", and the challenge in "Working towards Big Dog". Both appear on Member A's Overview. The owner chose the names, so perhaps label them "Big Dog plan" and "Big Dog challenge".

### Menu for floor coaches

18. **Every coach sees every Library and Business tab.** Brad isn't an admin, but he sees all of them (COACHING_REVIEW.md already notes he can edit plans). A coach who only runs classes and check-ins needs just Dashboard, Clients, Classes and Messages.

### Data clean-up

- Exercise "Suppoerted Squat Hold" (typo) is in the Thursday programme.
- Exercise names mix capitals ("BACK SQUAT", "1-LEG GLUTE BRIDGE") and title case ("Landmine Reverse Lunge").

---

## What to change first (adds to the list in COACHING_REVIEW.md)

1. ~~**Fair numbers:** compare with the same days of last week, and use one member total on the dashboard (1, 2).~~ Fixed.
2. ~~**Check-in flow:** "no food" on the To do row, thin weeks grouped or skipped, and a "Next check-in" link after replying (4, 5, 6).~~ Fixed.
3. ~~**Class fill tile:** link it to the Reports Busiest section, not Red flags (3).~~ Fixed.
4. **Run this class from Up next** while a class is on (8).
5. **One word:** client or member (16).
6. **Use the desktop space:** more Clients columns and a better right column on the home page (9, 12).

## Testing notes (dev environment, not the app)

- **127.0.0.1 doesn't work for sign-in.** In the in-app browser, `127.0.0.1:3000` shows the page, but the app's code never starts on it, so Sign in does nothing. Next 16 dev blocks that address unless `allowedDevOrigins` lists it. Use `localhost:3000`.
- **The "You're offline" page can appear on localhost.** After a while, every full page load got the service worker's offline page even though the server was answering and requests made from the page worked.
  - Two workarounds: unregister the service worker (the app registers it again on the next load), or move around by clicking in the app.
  - `public/sw.js` only falls back when the request fails, so this is the browser pane, not a production problem.
- **Next.js dev tools button.** At phone width it covers the bottom bar's Dashboard tab. Development only.
- **The first dashboard load took over 45 seconds** while the dev server compiled. That isn't a real-world speed.
