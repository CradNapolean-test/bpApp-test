// Helpers shared by the broadcast composer, the email sender and the tests.

export const FIRST_NAME_TOKEN = '{first name}';

// "{first name}" -> the client's first name, or "there" when we don't have one. Mirrors the database's
// personalise_message(), which does the same for in-app messages.
export function personaliseMessage(text: string, fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] || 'there';
  return text.replace(/\{first name\}/gi, first);
}

// Messages a coach can start from. Wording is a starting point to edit, not fixed text.
export interface StarterMessage {
  title: string;
  body: string;
}

export const STARTER_MESSAGES: StarterMessage[] = [
  {
    title: 'Sunday check-in',
    body: 'Hi {first name}, how did your week go? Tell me about a win from this week, anything you struggled with, and what you want to focus on next week. If you have no questions, a thumbs up is fine.',
  },
  {
    title: 'Mid-week nudge',
    body: "Hi {first name}, just checking in to see you're ok. I haven't heard from you this week. Reply with a quick update or let me know if there is anything I can help with.",
  },
  {
    title: 'Out of hours',
    body: "Hi {first name}, thanks for your message. I'll reply when I'm back in the gym. For anything about your nutrition or training, send it here in the app so everything stays in one place.",
  },
  {
    title: 'Missed sessions',
    body: "Hi {first name}, I noticed we haven't seen you in the gym lately. How are things? Is there anything getting in the way that we can help to plan around?",
  },
];
