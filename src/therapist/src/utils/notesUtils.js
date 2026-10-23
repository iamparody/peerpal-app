'use strict';

export const NOTE_TYPE_ORDER = ['pre', 'session', 'follow_up'];

export const NOTE_TYPE_LABELS = {
  pre:       'Pre-session',
  session:   'Session',
  follow_up: 'Follow-up',
};

/**
 * Groups a flat notes array into ordered sections for display.
 * pre notes appear first, then session, then follow_up.
 * Empty groups are omitted.
 */
export function groupNotesByType(notes) {
  return NOTE_TYPE_ORDER
    .map((type) => ({ type, label: NOTE_TYPE_LABELS[type], notes: notes.filter((n) => n.note_type === type) }))
    .filter((g) => g.notes.length > 0);
}

/**
 * Returns the label for the Notes button on a session card.
 */
export function notesLabel(count) {
  return count != null ? `Notes (${count})` : 'Notes';
}
