/** Deterministic artwork only: points and filaments carry no observed quantities. */
export function cosmicGeometry(count: number, seed = 20261103) {
  let value = seed >>> 0;
  const random = () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
  const nodes = Array.from({length: 48}, () => {
    const angle = random() * Math.PI * 2, z = random() * 2 - 1, radius = 3.1 * Math.cbrt(random());
    return [radius * Math.sqrt(1-z*z) * Math.cos(angle), radius * z, radius * Math.sqrt(1-z*z) * Math.sin(angle)];
  });
  const edges = nodes.flatMap((a,i) => nodes.map((b,j) => ({j,d:a.reduce((s,x,k)=>s+(x-b[k]!)**2,0)})).filter(b=>b.j!==i).sort((a,b)=>a.d-b.d).slice(0,3).map(b=>[i,b.j]));
  const positions = new Float32Array(count*3), sizes = new Float32Array(count);
  for (let i=0;i<count;i++) {
    const edge=edges[Math.floor(random()*edges.length)]!, a=nodes[edge[0]!]!, b=nodes[edge[1]!]!;
    const filament=random()>.32, t=filament?random():0, spread=filament?.065:.16;
    for(let k=0;k<3;k++) positions[i*3+k]=a[k]!+(b[k]!-a[k]!)*t+(random()+random()+random()-1.5)*spread;
    sizes[i]=filament?.7+random()*1.2:1+random()*2.5;
  }
  return {positions,sizes};
}
