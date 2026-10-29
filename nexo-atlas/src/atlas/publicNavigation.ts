/** The hash belongs to the area router; section navigation leaves it unchanged. */
export function goToPublicSection(id: string) {
  const el = document.getElementById(`s-${id}`);
  if (!el) {if(['lines','methods','works','contact'].includes(id))window.location.href=`/?secao=${id}#/`;return;}
  el.scrollIntoView({block: 'start'});
  el.focus({preventScroll: true});
}
