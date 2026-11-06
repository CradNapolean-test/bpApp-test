import { describe, expect, it } from 'vitest';
import { guessTrackingType, normaliseExerciseName } from './trackingGuess';

// Names are from the live exercise library and templates (5 Nov 2026), spelling and capitals as the coaches typed them.
const expectType = (type: ReturnType<typeof guessTrackingType>, names: string[]) => {
  for (const name of names) expect(guessTrackingType(name), name).toBe(type);
};

describe('guessTrackingType', () => {
  it('reads machines and calorie targets as calories', () => {
    expectType('calories', ['BIKE', 'ROWER', 'SKI ERG', 'KCals', 'Erg Of Choice', 'Erg Sprints', 'Rower/Ski']);
  });

  it('reads runs, shuttles and crawls as distance', () => {
    expectType('distance', ['RUN', 'SHUTTLES', 'BEAR CRAWL', 'REVERSE CRAWL']);
  });

  it('reads carries and the prowler as weight and distance', () => {
    expectType('weight_distance', ['FARMERS WALK', 'FARMER CARRIES', 'SUITCASE CARRY', 'MB BEAR HUG CARRY', 'PLATE PINCH CARRY', 'PROWLER PUSH', 'PROWLER DRAG']);
  });

  it('reads holds, isometrics and static planks as time, with a weight when something is held', () => {
    expectType('time', ['PLANK', 'SIDE PLANK', 'WALL SIT', 'DEAD HANG', 'Suppoerted Squat Hold', 'ISO SPRINTER BRIDGE', 'BAND LATERAL RAISE HOLD', 'BATTLE ROPES']);
    expectType('weight_time', ['PLATE FRONT RAISE HOLD', 'MB BEAR HUG HOLD', 'DB GLUTE BRIDGE HOLD', 'Iso Incline DB Row', 'SUITCASE HOLDS']);
  });

  it('reads bodyweight moves, slams and wall balls as reps', () => {
    expectType('reps', [
      'PRESS UPS',
      'Narrow Press Ups',
      'PLANK PRESS UP',
      'PULL UP',
      'Chin Ups',
      'TURKISH SIT-UP',
      'Last Min - Anchored Sit Ups',
      'BURPEE',
      'BURPEE THRUSTER',
      'MOUNTAIN CLIMBERS',
      'HIGH KNEES',
      'BOX JUMPS',
      'MB SLAMS',
      'Ball Slams',
      'WALL BALLS',
      'MB SQUAT JUMPS',
      'SHOULDER TAPS',
      'PLANK FOOT TAPS',
      'BEAR HOLD SHOULDER TAPS',
      'BW SQUATS',
      'DEADBUG',
      'Anchored Reverse Crunch',
      'KNEELING RING ROLL OUT',
    ]);
  });

  it('leaves lifts, loaded and cable moves, and combinations on weight x reps', () => {
    expectType(null, [
      'BACK SQUAT',
      'BENCH PRESS',
      'KB Swings',
      'PUSH PRESS',
      'WEIGHTED SIT UPS',
      'Cable Crunch',
      'Cable Deadbugs',
      'DB DEADBUG',
      'BW BB Tricep Extension',
      'Squat Hold + Run',
      'MB SLAM X10 + CRAWL',
      'DB SQUAT & PRESS',
      'SHUTTLE UP, DOWNS',
      'BB Push Up + Squat',
      'PLANK REACH',
      'DB PLANK PULL THROUGH',
      'HIGH PLANK RELAY',
      'SKIER SWING',
      'AB CYCLE',
      'BB CYCLE SQUAT',
      'CALF RAISE',
      '',
    ]);
  });
});

describe('normaliseExerciseName', () => {
  it('lower-cases and turns punctuation into single spaces, keeping the signs that mark a combination', () => {
    expect(normaliseExerciseName('  TURKISH   SIT-UP ')).toBe('turkish sit up');
    expect(normaliseExerciseName('Squat Hold + Run')).toBe('squat hold + run');
    expect(normaliseExerciseName("Conditioning — AMRAP 10'")).toBe('conditioning amrap 10');
  });
});
