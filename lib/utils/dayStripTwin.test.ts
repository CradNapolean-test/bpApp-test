import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The web's test run leaves packages/ out (vitest.config.mts), so the phone's copy of the day strip's logic is held to the web's
// here: while the two files are the same, the web's tests (dayStrip.test.ts) cover the phone's copy too.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe("the phone's copy of the day strip logic", () => {
  for (const name of ['dayStrip.ts', 'dayStrip.test.ts']) {
    it(`keeps packages/shared/src/utils/${name} the same as lib/utils/${name}`, () => {
      expect(read(`../../packages/shared/src/utils/${name}`)).toBe(read(`./${name}`));
    });
  }
});
