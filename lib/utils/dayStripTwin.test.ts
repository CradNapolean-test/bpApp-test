import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The web's test run leaves packages/ out (vitest.config.mts), so the phone's copy of the day strip's logic (and of the swipe that
// changes the day) is held to the web's here: while the files are the same, the web's tests (dayStrip.test.ts, daySwipe.test.ts)
// cover the phone's copies too.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe("the phone's copy of the day strip logic", () => {
  for (const name of ['dayStrip.ts', 'dayStrip.test.ts', 'daySwipe.ts', 'daySwipe.test.ts']) {
    it(`keeps packages/shared/src/utils/${name} the same as lib/utils/${name}`, () => {
      expect(read(`../../packages/shared/src/utils/${name}`)).toBe(read(`./${name}`));
    });
  }
});
