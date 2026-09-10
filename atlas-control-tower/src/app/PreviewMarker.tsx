import type { PropsWithChildren } from 'react';

export function PreviewMarker({children}:PropsWithChildren){
  return <div data-atlas-frontend="react-vnext">{children}</div>;
}