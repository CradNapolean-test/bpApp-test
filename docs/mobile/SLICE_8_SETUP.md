# Slice 8: what you set up outside the code

Everything here happens in a dashboard or an account, so it is yours to do (or to approve). None of it is needed to run the
app in the browser or in Expo Go; it is needed for the features named in each heading.

## 1. Password reset email (needed for "Forgot your password?")

The app asks Supabase to email the member a code, and the member types it in. Supabase's default "Reset Password" email only
contains a link, so the **sandbox** project's template needs the code in it.

Sandbox Supabase dashboard > Authentication > Emails > Templates > **Reset Password**. Keep whatever link is already there and add
the code line, for example:

```html
<h2>Reset your password</h2>
<p>Your code is <strong>{{ .Token }}</strong>. Type it into the Ballistic Performance app. It works once and expires in an hour.</p>
<p>If you did not ask for this, you can ignore this email.</p>
```

Notes:
- The code length is a project setting (Authentication > Sign In / Providers > Email > Email OTP Length). The sandbox is on 8 digits;
  the app accepts 6 to 10, so changing it needs no app change.
- Supabase's built-in email sender only delivers to your own team's addresses and is limited to a few emails an hour. That is fine
  for testing with your own address. Real members need a custom SMTP sender (Authentication > Emails > SMTP Settings), which is a
  launch task, not a slice 8 one.
- Do not touch the live project's template from here. The live web app's template links to its own `/auth/confirm` page.
- The link form also works: `ballistic://reset-password?token_hash={{ .TokenHash }}&type=recovery` opens the app on the new-password
  step. Email apps often refuse to open a custom-scheme link, and a link that opens the app from any email app needs a web address
  (universal links), so the code is the main way until the app has one.

## 2. Push notifications on phones (needed to receive a real notification)

The code is written and checked as far as it can be without a phone build. To receive a real notification you need the following, in
this order. Items 1, 3 and 4 create accounts or cloud resources, so each is yours to do or to approve; none has been started.

1. **Apply migration 0113** (`npx supabase db push`). It adds the `push_devices` table and `register_push_device()`. Until it is applied
   the phone cannot register and the web sender quietly finds no phones. Then run
   `node supabase/tests/security-audit/push-devices-check.cjs --ref=<sandbox ref> --expect-0113` (all checks must pass).
2. **The web app's sender needs nothing new**: `apps/web/lib/push.ts` now also sends to phones, so every push the web already sends (a coach
   message, nutrition feedback, check-in reminders) reaches the phone. It only runs where the web app runs (the sandbox Vercel project
   once it exists), with the same environment it already has. Optional: `EXPO_ACCESS_TOKEN` (Expo's "enhanced push security"), never needed to start.
3. **An EAS project** (an expo.dev account and `npx eas-cli@latest init` in `apps/mobile`). This creates the Expo project and writes its id into
   `app.json` (`extra.eas.projectId`); without that id the app shows "not set up in this version" and cannot make a push token.
4. **Apple and Google credentials**, both set up through EAS:
   - iOS: the paid Apple Developer Program (not enrolled yet), then `eas credentials` lets EAS create the push key. A real iPhone is needed;
     simulators cannot receive push.
   - Android: a Firebase project with Cloud Messaging, its `google-services.json` in the app, and the FCM service-account key uploaded to Expo.
5. **A development build** (`eas build --profile development`), because Expo Go cannot receive remote push on Android and the notifications
   plugin is a native change. Install it on the phone, sign in, tap "Turn on" on Home (or Profile > Notifications), then send a message from
   the coach side of the sandbox web app.

The browser version of the app does no push (the web app keeps its own browser push). Notification text, including a coach message preview, travels
through Expo's push service on its way to Apple and Google; the browser push already sends the same text through the browsers' push services.
