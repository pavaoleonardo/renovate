/**
 * Moving one row of a list, the way the editor's arrows move a line.
 *
 * Dragging is how a line of an estimate is reordered with a mouse, but a finger
 * cannot drag: on a phone the up/down buttons call this instead. Kept pure so the
 * decision — what «up» means on the first row, what happens at the ends — is
 * tested once, here, instead of inside a component nobody can test.
 *
 * Anything out of bounds, or a move to the same place, returns the very same array
 * (the caller can skip a re-render), and a real move never mutates the input.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items

  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
