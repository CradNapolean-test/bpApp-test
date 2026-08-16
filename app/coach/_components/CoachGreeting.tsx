'use client';

// Split out of app/coach/page.tsx: that page is an async Server Component, so computing
// `new Date()` inline there ran on the server's own clock (UTC on Vercel), not the coach's --
// wrong day label and wrong Morning/Afternoon/Evening greeting for roughly half of every 24h
// period for a non-UTC coach. Client components so this reflects the coach's actual browser
// clock, matching the fix applied to CoachHeaderExtras for the same reason.

export function CoachTodayLabel({ className }: { className?: string }) {
  const todayLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
  return <p className={className}>{todayLabel}</p>;
}

export function CoachTimeGreeting() {
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';
  return <>{timeGreeting}, Coach</>;
}
