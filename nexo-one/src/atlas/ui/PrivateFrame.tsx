import {useEffect, useRef} from 'react';
import {createFrameBridge} from '../privateFrameBridge.ts';
import {refreshPrivateRuntime} from '../privateRefresh.ts';

export const PRIVATE_UI_URL = '/api/atlas-private-ui';
/**
 * No top-navigation, modals or downloads. Popups are allowed ONLY so an explicit user click on a validated HTTPS source link
 * can open a new tab; the frame's own guard decides (and always passes noopener,noreferrer). allow-popups-to-escape-sandbox
 * keeps the opened site from inheriting this sandbox.
 */
export const PRIVATE_FRAME_SANDBOX = 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';

const READY_TIMEOUT_MS = 10_000;

/** Guarded same-origin frame for the existing Atlas screens. Mounted only while the session is authenticated. */
export default function PrivateFrame({data, title, locale, onLogout, onError, onReady}: {data: Record<string, unknown>; title: string; locale: string; onLogout: () => void; onError: (code: string) => void; onReady?: () => void}) {
  const bridgeRef = useRef<ReturnType<typeof createFrameBridge> | null>(null);
  const localeRef = useRef(locale); localeRef.current = locale;
  // Language changes reuse the guarded channel without resetting camera, data or selection.
  useEffect(() => { bridgeRef.current?.setLocale(locale); }, [locale]);
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef({onLogout, onError, onReady});
  cb.current = {onLogout, onError, onReady};
  // freshest generation handed to the frame: a re-READY of the same frame must never resend an older one
  const latest = useRef<Record<string, unknown>>(data);
  useEffect(() => { latest.current = data; }, [data]);
  useEffect(() => {
    const timer = window.setTimeout(() => cb.current.onError('FRAME_TIMEOUT'), READY_TIMEOUT_MS);
    const bridge = createFrameBridge({
      win: window, origin: window.location.origin,
      getFrameWindow: () => ref.current?.contentWindow ?? null,
      getData: () => latest.current,
      getLocale: () => localeRef.current,
      onRefresh: signal => refreshPrivateRuntime(undefined, latest.current, Date.now, signal),
      onRefreshed: fresh => { latest.current = fresh as Record<string, unknown>; },
      onReady: () => {
        window.clearTimeout(timer);
        // the legacy screens are laid out for a full viewport: bring the frame to the top of it
        try { ref.current?.scrollIntoView({block: 'start'}); } catch { /* not scrollable */ }
      },
      onAccepted: () => cb.current.onReady?.(),
      onLogout: () => cb.current.onLogout(),
      onError: code => cb.current.onError(code),
    });
    bridgeRef.current = bridge;
    return () => { window.clearTimeout(timer); bridge.dispose(); if (bridgeRef.current === bridge) bridgeRef.current = null; };
  }, [data]);
  return (
    <iframe
      ref={ref} className="atlas-private-frame" title={title} src={PRIVATE_UI_URL}
      sandbox={PRIVATE_FRAME_SANDBOX} referrerPolicy="no-referrer"
    />
  );
}
