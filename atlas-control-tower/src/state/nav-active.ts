// Whether a sidebar nav item should render as the current one. Kept as a standalone
// predicate (rather than inlined in App.tsx's JSX) so the active-state rule itself is
// testable without a DOM/JSX runtime.
export function isActiveNavItem(currentArea: string, itemArea: string): boolean {
  return currentArea === itemArea;
}
