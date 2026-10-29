export const SESSION_CHANGE_EVENT = 'nexo:session-change';

export function emitSessionChange(target: EventTarget, authenticated: boolean): void {
  const event = new Event(SESSION_CHANGE_EVENT);
  Object.defineProperty(event, 'authenticated', { value: authenticated, enumerable: true });
  target.dispatchEvent(event);
}

export function onSessionChange(target: EventTarget, listener: () => void): () => void {
  const handler = () => listener();
  target.addEventListener(SESSION_CHANGE_EVENT, handler);
  return () => target.removeEventListener(SESSION_CHANGE_EVENT, handler);
}
