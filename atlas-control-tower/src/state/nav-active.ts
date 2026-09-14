// Product navigation has one visible research surface. Internal compatibility areas
// (graphs/universe) still resolve to it so /mapa and ?scope=universo deep links do not
// create a second active navigation item.
export function isActiveNavItem(currentArea: string, itemArea: string): boolean {
  if (itemArea === 'observatory' && ['observatory', 'graphs', 'universe'].includes(currentArea)) return true;
  return currentArea === itemArea;
}
