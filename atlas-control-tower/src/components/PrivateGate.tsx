import type { ReactNode } from 'react';
import type { AtlasSession } from '../core/auth';

/**
 * Compatibility wrapper kept while callers are migrated. Atlas product surfaces
 * are public/read-only; write and execution authorization belongs to backend
 * endpoints, not to the projection UI.
 */
export function PrivateGate({ children }: {
  session: AtlasSession | null;
  area: string;
  onGoToLogin: () => void;
  children: ReactNode;
}) {
  return <>{children}</>;
}
