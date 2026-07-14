/**
 * Returns the index that should receive focus when Tab is pressed in a trap.
 * A negative result means there are no tabbable controls to focus.
 */
export function focusTrapNextIndex(
  currentIndex: number,
  focusableCount: number,
  shiftKey: boolean
): number {
  if (focusableCount <= 0) return -1;
  if (currentIndex < 0) return shiftKey ? focusableCount - 1 : 0;
  if (shiftKey) return currentIndex === 0 ? focusableCount - 1 : currentIndex - 1;
  return currentIndex === focusableCount - 1 ? 0 : currentIndex + 1;
}
