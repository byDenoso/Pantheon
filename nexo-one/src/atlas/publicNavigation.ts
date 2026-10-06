/** The hash belongs to the area router; section navigation leaves it unchanged. */
export function goToPublicSection(id: string) {
  const el = document.getElementById(`s-${id}`);
  if (!el) return;
  el.scrollIntoView({block: 'start'});
  el.focus({preventScroll: true});
}
