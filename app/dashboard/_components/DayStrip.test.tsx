import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DayStrip, EarlierButton, type DayStripDay } from './DayStrip';

// The shared strip must keep Book exactly as it was before it was taken out of ClassesArea (item 8), and draw the signed-off looks on
// the food diary and the check-in.
const day = (iso: string, over: Partial<DayStripDay> = {}): DayStripDay => ({
  iso,
  weekday: 'Thu',
  dayNum: Number(iso.slice(8)),
  label: iso,
  ring: 0,
  ...over,
});

function chipOf(html: string, iso: string): string {
  const at = html.indexOf(`data-day="${iso}"`);
  const chip = html.indexOf('data-chip', at);
  return html.slice(html.indexOf('class="', chip) + 7, html.indexOf('"', html.indexOf('class="', chip) + 7));
}

describe('Book look (unchanged)', () => {
  const html = renderToStaticMarkup(
    <DayStrip
      selected="2026-11-19"
      onSelect={() => {}}
      days={[day('2026-11-19', { ring: 1 }), day('2026-11-20', { ring: 1 }), day('2026-11-21'), day('2026-11-22', { faded: true })]}
    />
  );

  it("draws Book's four days with Book's own classes", () => {
    expect(chipOf(html, '2026-11-19')).toContain('bg-zinc-100 font-extrabold text-[#1d1d1b]');
    expect(chipOf(html, '2026-11-20')).toContain('border-2 border-accent font-bold text-[#5fd6d6]');
    expect(chipOf(html, '2026-11-21')).toContain('bg-white/[.07] font-semibold text-zinc-200');
    expect(chipOf(html, '2026-11-22')).toContain('font-semibold text-zinc-600');
  });

  it('keeps aria-pressed and no month line or ring', () => {
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('aria-current');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('uppercase');
  });
});

describe('food and check-in look', () => {
  const html = renderToStaticMarkup(
    <DayStrip
      variant="progress"
      months
      selected="2026-11-17"
      onSelect={() => {}}
      todayIso="2026-11-19"
      caption="Food logged on 3 days this week."
      onToday={() => {}}
      days={[
        day('2026-11-01', { ring: 1, month: 'Nov' }),
        day('2026-11-16', { ring: 1 }),
        day('2026-11-17', { ring: 0.9 }),
        day('2026-11-18', { ring: 0.5 }),
        day('2026-11-19', { ring: 1, isToday: true }),
        day('2026-11-20', { below: { text: 'no food', danger: true } }),
      ]}
    />
  );

  it('draws done, part, plain, picked and today', () => {
    expect(chipOf(html, '2026-11-16')).toContain('border-2 border-accent font-bold text-[#5fd6d6]');
    expect(chipOf(html, '2026-11-17')).toContain('bg-zinc-100 font-extrabold text-[#1d1d1b]');
    expect(chipOf(html, '2026-11-18')).toContain('font-semibold text-zinc-400');
    // Today all done: the full teal ring with a white number (owner, 21 Nov).
    expect(chipOf(html, '2026-11-19')).toContain('border-2 border-accent font-extrabold text-white');
    expect(chipOf(html, '2026-11-20')).toContain('bg-white/[.07] font-semibold text-zinc-400');
  });

  it('draws one part ring, from 12 o clock, for the part-done day not picked', () => {
    // (The other svg on the strip is the Today button's icon.)
    expect(html.match(/stroke-dasharray/g)).toHaveLength(1);
    expect(html).toContain('stroke-dasharray="53.41 106.81"');
    expect(html).toContain('rotate(-90 18 18)');
  });

  it('marks the picked day as pressed and only today as the current date, with the month, caption, Today button and the red no food', () => {
    expect(html).toMatch(/data-day="2026-11-17"[^>]*aria-pressed="true"/);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/data-day="2026-11-19"[^>]*aria-current="date"/);
    expect(html.match(/aria-current=/g)).toHaveLength(1);
    expect(html).toContain('>Nov</span>');
    expect(html).toContain('Food logged on 3 days this week.');
    expect(html).toContain('Today</button>');
    expect(html).toContain('text-red-400');
  });
});

describe("the coach's Earlier button", () => {
  const html = (loading: boolean, failed: boolean) => renderToStaticMarkup(<EarlierButton onClick={() => {}} loading={loading} failed={failed} />);

  it('says to a screen reader what it shows: ready, loading or failed', () => {
    expect(html(false, false)).toContain('aria-label="Show four earlier weeks"');
    expect(html(false, false)).not.toContain('aria-busy');
    expect(html(true, false)).toContain('aria-label="Loading four earlier weeks"');
    expect(html(true, false)).toContain('aria-busy="true"');
    expect(html(false, true)).toContain('aria-label="Could not load earlier weeks. Try again"');
    expect(html(false, true)).toContain('Try again</button>');
  });

  it('keeps its focus while loading (aria-disabled, not disabled)', () => {
    expect(html(true, false)).toContain('aria-disabled="true"');
    expect(html(true, false)).not.toMatch(/ disabled=""/);
  });
});
