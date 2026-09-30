import { describe, expect, it } from 'vitest';
import { dayTrafficLight, trafficLight } from './accountability';

describe('trafficLight', () => {
  it('applies sleep thresholds at the boundaries', () => {
    expect(trafficLight('sleep', 7.5)).toBe('green');
    expect(trafficLight('sleep', 7)).toBe('amber');
    expect(trafficLight('sleep', 6)).toBe('amber');
    expect(trafficLight('sleep', 5.5)).toBe('red');
  });
  it('applies steps thresholds', () => {
    expect(trafficLight('steps', 8000)).toBe('green');
    expect(trafficLight('steps', 4000)).toBe('amber');
    expect(trafficLight('steps', 3999)).toBe('red');
  });
  it('applies water thresholds', () => {
    expect(trafficLight('water', 2.5)).toBe('green');
    expect(trafficLight('water', 1)).toBe('amber');
    expect(trafficLight('water', 0.75)).toBe('red');
  });
});

describe('dayTrafficLight', () => {
  it('is null when nothing is logged', () => {
    expect(dayTrafficLight({ sleep: null, steps: null, water: null })).toBeNull();
  });
  it('is green with two greens, red with two reds, else amber', () => {
    expect(dayTrafficLight({ sleep: 8, steps: 9000, water: 0.5 })).toBe('green');
    expect(dayTrafficLight({ sleep: 5, steps: 1000, water: 3 })).toBe('red');
    expect(dayTrafficLight({ sleep: 8, steps: 1000, water: 1.5 })).toBe('amber');
  });
});
