export interface FocusReturnTarget {
  isConnected: boolean;
  focus: (options?: FocusOptions) => void;
}

/** Keep focus continuity without reviving a trigger removed by navigation. */
export function restoreFocus(target: FocusReturnTarget | null): boolean {
  if (!target?.isConnected) return false;
  target.focus({ preventScroll: true });
  return true;
}
