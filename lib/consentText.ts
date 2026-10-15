// What the onboarding consent step says (R22). The wording of the privacy policy and terms themselves is the owner's (D13: reviewed by a
// lawyer); this is only the plain-language summary shown before the box is ticked.
//
// TODO(owner): confirm this summary matches the published Privacy Policy, especially who can see what (D3) and how a person can ask for
// their information to be corrected or deleted.
export const CONSENT_TITLE = 'Before we start';

export const CONSENT_POINTS = [
  'We keep your contact details, your goal, your measurements, your food and training logs, and any health or injury notes you add.',
  'Your coach and the other coaches at your gym can see them so they can look after you.',
  'You can ask your coach to correct or delete your information.',
] as const;

export const CONSENT_LABEL = 'I have read and agree to the Privacy Policy and Terms of Service.';
export const CONSENT_REQUIRED_MESSAGE = 'Please tick the box to agree before continuing.';
