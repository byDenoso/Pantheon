import {createRuntimeHolder} from './runtime.ts';
import {createRefreshBroker} from './refresh.ts';
import {HOST, FRAME, type FromFrame} from './protocol.ts';

/** The one in-memory generation shared by every adapter in the frame. */
export const runtimeHolder = createRuntimeHolder();

/** Frame -> parent. Same-origin target only; never '*'. */
export function postToParent(msg: FromFrame, win: Window = window): boolean {
  const origin = win.location.origin;
  if (!origin || origin === 'null' || win.parent === win) return false;
  win.parent.postMessage(msg, origin);
  return true;
}
/** Pending "new generation" request of this frame (at most one in flight). */
export const broker = createRefreshBroker({post: m => postToParent(m)});
export const frameMessage = {logout: (): FromFrame => ({channel: FRAME, type: 'SESSION_ACTION', action: 'logout'})};
export {HOST};
