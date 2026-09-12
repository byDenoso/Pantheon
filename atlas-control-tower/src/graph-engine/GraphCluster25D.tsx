import type {CSSProperties} from 'react';
import type {GraphCluster25D as Cluster25D} from './types25d';

export function GraphCluster25D({cluster}:{cluster:Cluster25D}){
  const style={left:`${cluster.x}%`,top:`${cluster.y}%`,width:`${cluster.width}%`,height:`${cluster.height}%`,'--cluster-z':`${cluster.z}px`} as CSSProperties;
  return <div className="graph-25d-cluster" style={style} aria-hidden="true"><span>{cluster.label}</span></div>;
}
