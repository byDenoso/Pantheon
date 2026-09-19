// Optional, subtle sound layer for the galaxy. Never autoplays: every sound is
// triggered by an explicit interaction handler (focus, selection, domain
// transition) the caller already had a reason to fire. Mobile starts muted;
// mute is always visible and persists per browser via localStorage.
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'nexo-galaxy-muted';

function readStoredMute(defaultMuted: boolean): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch { /* storage unavailable: fall back to the default */ }
  return defaultMuted;
}

export interface GalaxyAudio {
  muted: boolean;
  toggle: () => void;
  playFocus: () => void;
  playSelection: () => void;
  playDomainTransition: () => void;
}

export function useGalaxyAudio(defaultMutedOnMobile: boolean): GalaxyAudio {
  const [muted, setMuted] = useState(() => readStoredMute(defaultMutedOnMobile));
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* best effort only */ }
  }, [muted]);

  const ensureContext = useCallback((): AudioContext | null => {
    if (muted || typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    if (!contextRef.current) contextRef.current = new AudioCtor();
    return contextRef.current;
  }, [muted]);

  const play = useCallback((frequency: number, duration: number) => {
    const ctx = ensureContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.02);
  }, [ensureContext]);

  return {
    muted,
    toggle: () => setMuted(value => !value),
    playFocus: () => play(420, 0.09),
    playSelection: () => play(660, 0.07),
    playDomainTransition: () => play(280, 0.16),
  };
}
