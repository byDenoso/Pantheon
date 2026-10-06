// Swapped in for app/useSession.ts. The session belongs to the external shell: the frame
// is only mounted while it is authenticated, and session actions are delegated to it.
import {useCallback} from 'react';
import {postToParent, frameMessage} from './state.ts';

export interface SessionState {configured: boolean; authenticated: boolean; access?: 'PUBLIC' | 'PRIVATE'; mode?: string}
export type SessionRuntime = 'VERCEL_NATIVE' | 'APPS_SCRIPT_BRIDGE' | 'NONE';
const SESSION: SessionState = {configured: true, authenticated: true, access: 'PRIVATE', mode: 'PRIVATE_FRAME'};

export function useSession(_onChange?: (authenticated: boolean) => void) {
  const login = useCallback(async (_pin: string) => false, []);
  const logout = useCallback(async () => postToParent(frameMessage.logout()), []);
  const setError = useCallback((_m: string) => {}, []);
  return {session: SESSION, error: '', pending: false, runtimeAvailable: true as boolean | null, runtime: 'NONE' as SessionRuntime, login, logout, setError};
}
