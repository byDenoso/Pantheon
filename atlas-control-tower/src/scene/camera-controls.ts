// Pure camera math for the 3D map, kept out of AtlasCanvas.tsx (which needs a WebGL
// context to render) so orbit/zoom/level-distance behavior has real behavior tests.

export type CameraSpherical = { azimuth: number; polar: number; distance: number };

export const MIN_POLAR = 0.35;
export const MAX_POLAR = Math.PI - 0.35;
export const MIN_DISTANCE = 5;
export const MAX_DISTANCE = 34;

const ORBIT_STEP = 0.12;
const ZOOM_STEP = 1.4;

// Per-level camera distance: pulling back for the general overview (Universo/System)
// and moving in for a domain, closer still once a campaign is the focus -- so
// "reset Universo" is a real pull-back, not the same framing reused everywhere.
export function cameraDistanceForLevel(nodeType: string | undefined | null, compact = false): number {
  const type = String(nodeType || '').toUpperCase();
  if (type === 'ROOT' || type === 'SYSTEM') return compact ? 21 : 18;
  if (type === 'DOMAIN') return compact ? 16.5 : 14.2;
  if (type === 'CAMPAIGN') return compact ? 13 : 10.8;
  return compact ? 18 : 15.5;
}

export function clampSpherical(state: CameraSpherical): CameraSpherical {
  return {
    azimuth: state.azimuth,
    polar: Math.min(MAX_POLAR, Math.max(MIN_POLAR, state.polar)),
    distance: Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, state.distance))
  };
}

// Maps a keydown event's key to a camera delta. Returns null for keys the camera
// does not handle, so the caller can leave the browser's default behavior alone.
export function applyCameraKey(state: CameraSpherical, key: string): CameraSpherical | null {
  switch (key) {
    case 'ArrowLeft': return clampSpherical({ ...state, azimuth: state.azimuth - ORBIT_STEP });
    case 'ArrowRight': return clampSpherical({ ...state, azimuth: state.azimuth + ORBIT_STEP });
    case 'ArrowUp': return clampSpherical({ ...state, polar: state.polar - ORBIT_STEP });
    case 'ArrowDown': return clampSpherical({ ...state, polar: state.polar + ORBIT_STEP });
    case '+': case '=': return clampSpherical({ ...state, distance: state.distance - ZOOM_STEP });
    case '-': case '_': return clampSpherical({ ...state, distance: state.distance + ZOOM_STEP });
    default: return null;
  }
}

export function sphericalToCartesian(state: CameraSpherical): [number, number, number] {
  const { azimuth, polar, distance } = state;
  return [
    distance * Math.sin(polar) * Math.sin(azimuth),
    distance * Math.cos(polar),
    distance * Math.sin(polar) * Math.cos(azimuth)
  ];
}
