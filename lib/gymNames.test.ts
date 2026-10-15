import { describe, expect, it } from 'vitest';
import { shortGymName } from './gymNames';

describe('shortGymName', () => {
  const gyms = ['Acme Fitness - Northside', 'Acme Fitness - Southside'];

  it('strips the organisation name when it is known', () => {
    expect(shortGymName('Acme Fitness - Northside', { organisationName: 'Acme Fitness' })).toBe('Northside');
    expect(shortGymName('acme fitness – Northside', { organisationName: 'Acme Fitness' })).toBe('Northside');
  });

  it('works out the organisation from the other gyms a person belongs to', () => {
    expect(shortGymName('Acme Fitness - Northside', { siblings: gyms })).toBe('Northside');
    expect(shortGymName('Acme Fitness - Southside', { siblings: gyms })).toBe('Southside');
  });

  it('does not strip anything the gyms do not share', () => {
    expect(shortGymName('Salford Quays', { siblings: ['Salford Quays', 'Worsley'] })).toBe('Salford Quays');
    expect(shortGymName('Acme Fitness - Northside', { siblings: ['Acme Fitness - Northside', 'Other Club - Centre'] })).toBe('Acme Fitness - Northside');
  });

  it('does not cut a shared first word out of a name that is not separated', () => {
    expect(shortGymName('Southport Gym', { siblings: ['Southport Gym', 'Southgate Gym'] })).toBe('Southport Gym');
  });

  it('with one gym and no organisation, uses the part after the last separator', () => {
    expect(shortGymName('Acme Fitness - Northside')).toBe('Northside');
    expect(shortGymName('Acme Fitness - Northside', { siblings: ['Acme Fitness - Northside'] })).toBe('Northside');
    expect(shortGymName('Worsley')).toBe('Worsley');
  });

  it('never returns an empty name', () => {
    expect(shortGymName('Acme Fitness - ', { organisationName: 'Acme Fitness' })).toBe('Acme Fitness -');
    expect(shortGymName('   ')).toBe('');
  });

  it('does not depend on any particular brand', () => {
    expect(shortGymName('Iron Works - Harbour Road', { siblings: ['Iron Works - Harbour Road', 'Iron Works - Mill Lane'] })).toBe('Harbour Road');
    expect(shortGymName('Peak Club: Hilltop', { siblings: ['Peak Club: Hilltop', 'Peak Club: Valley'] })).toBe('Hilltop');
  });
});
