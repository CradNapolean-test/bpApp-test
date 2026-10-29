import { describe, expect, it } from 'vitest';

import { buildExpoMessages, inBatches, isExpoPushToken, PUSH_BODY_MAX, routeForPushUrl, summariseTickets } from './expoPush';

const T1 = 'ExponentPushToken[abcdefghij1234567890]';
const T2 = 'ExpoPushToken[zzzzzzzzzzzzzzzzzzzzzz]';

describe('isExpoPushToken', () => {
  it('accepts both spellings', () => {
    expect(isExpoPushToken(T1)).toBe(true);
    expect(isExpoPushToken(T2)).toBe(true);
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'abc', 'ExponentPushToken[]', 'ExponentPushToken[short]', "ExponentPushToken[abc'; drop table x;--]", 'ExponentPushToken[' + 'a'.repeat(101) + ']', 42, null, undefined]) {
      expect(isExpoPushToken(bad)).toBe(false);
    }
  });
});

describe('buildExpoMessages', () => {
  it('makes one message per phone, with the link as data', () => {
    const msgs = buildExpoMessages([T1, T2], { title: 'Your coach messaged you', body: 'Hi there', url: '/dashboard?open=messages' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ to: T1, title: 'Your coach messaged you', body: 'Hi there', data: { url: '/dashboard?open=messages' }, sound: 'default', priority: 'high', channelId: 'default' });
  });
  it('defaults the link to the dashboard', () => {
    expect(buildExpoMessages([T1], { title: 't', body: 'b' })[0].data.url).toBe('/dashboard');
  });
  it('leaves out bad tokens and sends each phone once', () => {
    expect(buildExpoMessages(['junk', T1, T1], { title: 't', body: 'b' }).map((m) => m.to)).toEqual([T1]);
  });
  it('sends nothing when there are no phones', () => {
    expect(buildExpoMessages([], { title: 't', body: 'b' })).toEqual([]);
  });
  it('cuts a long message to a few lines, ending in dots', () => {
    const body = buildExpoMessages([T1], { title: 't', body: 'x'.repeat(500) })[0].body;
    expect(body).toHaveLength(PUSH_BODY_MAX);
    expect(body.endsWith('...')).toBe(true);
  });
  it('trims spaces and leaves short text alone', () => {
    expect(buildExpoMessages([T1], { title: '  Hello ', body: ' hi ' })[0]).toMatchObject({ title: 'Hello', body: 'hi' });
  });
});

describe('inBatches', () => {
  it('splits into groups of at most 100', () => {
    const sizes = inBatches(Array.from({ length: 250 }, (_, i) => i)).map((b) => b.length);
    expect(sizes).toEqual([100, 100, 50]);
  });
  it('gives nothing for nothing', () => {
    expect(inBatches([])).toEqual([]);
  });
});

describe('summariseTickets', () => {
  it('counts the sent ones', () => {
    expect(summariseTickets([T1, T2], [{ status: 'ok', id: 'a' }, { status: 'ok', id: 'b' }])).toEqual({ sent: 2, failed: 0, deadTokens: [] });
  });
  it('forgets a phone Expo says is gone, and only that one', () => {
    const r = summariseTickets([T1, T2], [{ status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } }, { status: 'error', message: 'y', details: { error: 'MessageRateExceeded' } }]);
    expect(r).toEqual({ sent: 0, failed: 2, deadTokens: [T1] });
  });
  it('treats an answer that does not match as all failed, forgetting nothing', () => {
    expect(summariseTickets([T1, T2], [{ status: 'ok' }])).toEqual({ sent: 0, failed: 2, deadTokens: [] });
    expect(summariseTickets([T1], { errors: [{ code: 'x' }] })).toEqual({ sent: 0, failed: 1, deadTokens: [] });
    expect(summariseTickets([T1], null)).toEqual({ sent: 0, failed: 1, deadTokens: [] });
  });
  it('copes with a null ticket', () => {
    expect(summariseTickets([T1], [null])).toEqual({ sent: 0, failed: 1, deadTokens: [] });
  });
});

describe('routeForPushUrl', () => {
  it('maps the web links to the phone screens', () => {
    expect(routeForPushUrl('/dashboard?open=messages')).toBe('/chat');
    expect(routeForPushUrl('/dashboard?open=nutrition')).toBe('/food');
    expect(routeForPushUrl('/dashboard?open=checkin')).toBe('/checkin');
    expect(routeForPushUrl('/dashboard?open=book')).toBe('/classes');
  });
  it('opens Home for the plain dashboard link', () => {
    expect(routeForPushUrl('/dashboard')).toBe('/');
  });
  it('opens the notifications list for a web target the phone has no screen for', () => {
    expect(routeForPushUrl('/dashboard?open=bigdog')).toBe('/notifications');
  });
  it('accepts a link that names one of the app screens, dropping any query', () => {
    expect(routeForPushUrl('/chat')).toBe('/chat');
    expect(routeForPushUrl('/food?date=2026-10-12')).toBe('/food');
    expect(routeForPushUrl('/')).toBe('/');
  });
  it('never opens anything but the app screens', () => {
    for (const odd of ['https://evil.example/chat', '//evil.example', 'javascript:alert(1)', '/admin', '/coach/clients/1', '/reset-password?token_hash=x', '', 'chat', 42, null, undefined, {}]) {
      expect(routeForPushUrl(odd)).toBe('/notifications');
    }
  });
});
