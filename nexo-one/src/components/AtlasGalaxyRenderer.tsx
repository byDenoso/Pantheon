import { forwardRef, useEffect, useState } from 'react';
import type { GraphEdge } from '../contracts/system.ts';
import type { PlacedNode3D } from '../viewmodels/graph3d.ts';
import { AtlasCanvas25D } from './AtlasCanvas25D.tsx';
import { GalaxyThree3D } from './GalaxyThree3D.tsx';
import type { CanvasGraph25DHandle } from './CanvasGraph25D.tsx';

function hasWebGL2(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2', {
      antialias: false,
      powerPreference: 'high-performance',
    }));
  } catch {
    return false;
  }
}

export const AtlasGalaxyRenderer = forwardRef<CanvasGraph25DHandle, {
  nodes: PlacedNode3D[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}>(function AtlasGalaxyRenderer({
  nodes,
  edges,
  selectedId,
  onSelect,
}, ref) {
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [threeFailed, setThreeFailed] = useState(false);

  useEffect(() => {
    setWebglAvailable(hasWebGL2());
  }, []);

  if (!webglAvailable || threeFailed) {
    return (
      <AtlasCanvas25D
        nodes={nodes}
        edges={edges}
        selectedId={selectedId}
        onSelect={onSelect}
        controllerRef={ref}
      />
    );
  }

  return (
    <div
      className="atlas3d-shell atlas-three-galaxy-shell"
      data-testid="atlas-3d-shell"
      data-renderer="three-procedural-galaxy"
    >
      <GalaxyThree3D
        ref={ref}
        nodes={nodes}
        edges={edges}
        selectedId={selectedId}
        onSelect={onSelect}
        onFailure={() => setThreeFailed(true)}
      />
    </div>
  );
});
