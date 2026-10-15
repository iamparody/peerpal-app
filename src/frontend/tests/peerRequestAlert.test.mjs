// In-app peer-request ringtone + stale notification cleanup (src/utils/peerRequestAlert.js).
// Run: npm test   (from src/frontend)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  toneSchedule, createRingGate, playPeerRequestTone, staleRequestNotifications,
} from '../src/utils/peerRequestAlert.js';

describe('toneSchedule — distinct ringtone', () => {
  const notes = toneSchedule();
  test('rising C5-E5-G5 motif, played twice', () => {
    assert.equal(notes.length, 6);
    assert.deepEqual(notes.slice(0, 3).map(n => n.freq), [523.25, 659.25, 783.99]);
    assert.deepEqual(notes.slice(3).map(n => n.freq), [523.25, 659.25, 783.99]);
  });
  test('does not reuse the therapist-call tones (660/880 Hz)', () => {
    for (const n of notes) assert.ok(n.freq !== 660 && n.freq !== 880);
  });
  test('notes are in order and do not overlap', () => {
    for (let i = 1; i < notes.length; i++) {
      assert.ok(notes[i].at >= notes[i - 1].at + notes[i - 1].dur);
    }
  });
});

describe('createRingGate — one ring per burst', () => {
  test('second ring inside cooldown is blocked, allowed after', () => {
    const gate = createRingGate(4000);
    assert.equal(gate(0), true);
    assert.equal(gate(3999), false);
    assert.equal(gate(4000), true);
  });
});

function fakeAudio() {
  const started = [];
  const node = () => ({
    connect() {}, start(t) { started.push(t); }, stop() {},
    frequency: { value: 0 },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  });
  return { ctx: { currentTime: 10, destination: {}, createOscillator: node, createGain: node }, started };
}

describe('playPeerRequestTone', () => {
  test('schedules all six notes, then the shared gate blocks an immediate second call', () => {
    const { ctx, started } = fakeAudio();
    const now = 1_000_000;
    assert.equal(playPeerRequestTone({ now, getContext: () => ctx }), true);
    assert.equal(started.length, 6);
    assert.equal(playPeerRequestTone({ now: now + 100, getContext: () => ctx }), false);
    assert.equal(started.length, 6);
  });
  test('no AudioContext available: returns false, does not throw', () => {
    assert.equal(playPeerRequestTone({ now: 9_000_000, getContext: () => null }), false);
  });
  test('AudioContext throws: returns false, does not throw', () => {
    assert.equal(playPeerRequestTone({ now: 18_000_000, getContext: () => { throw new Error('blocked'); } }), false);
  });
});

describe('staleRequestNotifications', () => {
  const n = (id) => ({ data: { request_id: id } });
  test('keeps open requests, returns closed ones', () => {
    const stale = staleRequestNotifications([n('a'), n('b'), n('c')], ['b']);
    assert.deepEqual(stale.map(x => x.data.request_id), ['a', 'c']);
  });
  test('compares ids as strings', () => {
    assert.equal(staleRequestNotifications([n(42)], ['42']).length, 0);
  });
  test('notification without request id is stale', () => {
    assert.equal(staleRequestNotifications([{ data: {} }, {}], ['a']).length, 2);
  });
});
