/** @param {{visible: boolean, pageVisible: boolean, paused: boolean, reduced: boolean}} state */
export function shouldAnimate({visible, pageVisible, paused, reduced}) {
  return visible && pageVisible && !paused && !reduced;
}
