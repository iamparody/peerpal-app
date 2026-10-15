// Shape/colour per mood for MoodBlob. Kept in plain JS so it is unit-testable
// (tests/moodBlob.test.mjs) without a JSX toolchain.

export const MOOD_STATES = {
  idle:     { rx: 96, ry: 94,  fill: '#B8A9C9', mouthKey: 'neutral' },
  very_low: { rx: 102, ry: 88, fill: '#7B9BB5', mouthKey: 'very_low' },
  low:      { rx: 98, ry: 91,  fill: '#C9A96E', mouthKey: 'low' },
  neutral:  { rx: 96, ry: 94,  fill: '#9BB5A0', mouthKey: 'neutral' },
  good:     { rx: 92, ry: 98,  fill: '#7EC8A4', mouthKey: 'good' },
  great:    { rx: 88, ry: 102, fill: '#5FAD8E', mouthKey: 'great' },
};

// Unknown mood → idle, never undefined. An unknown key ("happy") used to throw on
// `s.rx` and blank the whole screen (TrialWelcomeScreen, every new sign-up).
export function resolveMoodKey(mood) {
  return mood && Object.prototype.hasOwnProperty.call(MOOD_STATES, mood) ? mood : 'idle';
}
