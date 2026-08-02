import { domainColors, statusMeta } from './data.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
};
const shade = (hex, factor) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(Math.round(r * factor), 0, 255)},${clamp(Math.round(g * factor), 0, 255)},${clamp(Math.round(b * factor), 0, 255)})`;
};
const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y, xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || .00001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export class AtlasRenderer {
  constructor(canvas, { onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = onSelect || (() => {});
    this.projects = [];
    this.dependencies = [];
    this.selectedId = null;
    this.mode = 'iso';
    this.angle = -0.18;
    this.zoom = 1.18;
    this.pan = { x: 0, y: 16 };
    this.hitAreas = [];
    this.pointer = null;
    this.dragDistance = 0;
    this.raf = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointercancel', () => this.pointerCancel());
    canvas.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    this.resize();
  }

  setData(projects, dependencies, selectedId) {
    this.projects = projects;
    this.dependencies = dependencies;
    this.selectedId = selectedId;
    this.requestDraw();
  }
  setSelected(id) { this.selectedId = id; this.requestDraw(); }
  setMode(mode) { this.mode = mode; this.requestDraw(); }
  rotateBy(delta) { this.angle += delta; this.requestDraw(); }
  zoomBy(delta) { this.zoom = clamp(this.zoom + delta, .55, 1.8); this.requestDraw(); }
  reset() { this.angle = -.18; this.zoom = 1.18; this.pan = { x: 0, y: 16 }; this.requestDraw(); }
  requestDraw() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.draw()); }
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width; this.height = rect.height; this.dpr = dpr;
    if (rect.width < 520 && !this.mobileAdjusted) { this.zoom = .72; this.pan = { x: 0, y: 4 }; this.mobileAdjusted = true; }
    if (rect.width >= 520 && this.mobileAdjusted) { this.zoom = 1.18; this.pan = { x: 0, y: 16 }; this.mobileAdjusted = false; }
    this.requestDraw();
  }
  pointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: this.pan.x, panY: this.pan.y };
    this.dragDistance = 0; this.canvas.classList.add('dragging');
  }
  pointerMove(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    const dx = event.clientX - this.pointer.x, dy = event.clientY - this.pointer.y;
    this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, dy));
    this.pan.x = this.pointer.panX + dx; this.pan.y = this.pointer.panY + dy; this.requestDraw();
  }
  pointerUp(event) {
    if (!this.pointer || event.pointerId !== this.pointer.id) return;
    if (this.dragDistance < 5) this.selectAt(event);
    this.pointerCancel();
  }
  pointerCancel() { this.pointer = null; this.canvas.classList.remove('dragging'); }
  wheel(event) { event.preventDefault(); this.zoom = clamp(this.zoom * (event.deltaY > 0 ? .92 : 1.08), .55, 1.8); this.requestDraw(); }
  selectAt(event) {
    const rect = this.canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const hit = [...this.hitAreas].reverse().find((area) => pointInPolygon(point, area.polygon));
    if (hit) this.onSelect(hit.id);
  }

  rotatePoint(x, z) {
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    return { x: x * cos - z * sin, z: x * sin + z * cos };
  }
  project(x, z, height = 0) {
    const point = this.rotatePoint(x, z);
    const tileX = 70 * this.zoom;
    const tileY = (this.mode === 'top' ? 28 : 34) * this.zoom;
    const centerX = this.width * .5 + this.pan.x;
    const centerY = this.height * (this.mode === 'top' ? .48 : .54) + this.pan.y;
    return { x: centerX + (point.x - point.z) * tileX * .5, y: centerY + (point.x + point.z) * tileY * .5 - height * this.zoom };
  }
  projectCenter(project, height = 0) { return this.project(project.position.x * 1.13, project.position.z * 1.13, height); }

  drawPolygon(points, fill, stroke = null, lineWidth = 1) {
    const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  drawLine(points, color, width = 1, glow = 0) {
    const ctx = this.ctx; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = glow;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.stroke(); ctx.restore();
  }
  buildingGeometry(project) {
    const half = (project.size || .8) * .48;
    const height = (this.mode === 'top' ? 10 : 24 + (project.metrics?.complexity || 3) * 6) * this.zoom;
    const x = project.position.x * 1.13, z = project.position.z * 1.13;
    const base = [this.project(x - half, z - half), this.project(x + half, z - half), this.project(x + half, z + half), this.project(x - half, z + half)];
    const top = base.map((point) => ({ x: point.x, y: point.y - height }));
    return { base, top, height, polygon: [top[0], top[1], top[2], base[2], base[3], top[3]] };
  }
  drawGrid() {
    const ctx = this.ctx; ctx.save(); ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      const a = this.project(i, -12), b = this.project(i, 12), c = this.project(-12, i), d = this.project(12, i);
      this.drawLine([a, b], 'rgba(40,91,124,.16)', 1); this.drawLine([c, d], 'rgba(40,91,124,.16)', 1);
    }
    const platform = [this.project(-6.0, -5.6), this.project(6.0, -5.6), this.project(6.0, 5.6), this.project(-6.0, 5.6)];
    ctx.shadowColor = '#1e5374'; ctx.shadowBlur = 22; this.drawPolygon(platform, 'rgba(7,25,39,.76)', 'rgba(38,86,117,.58)', 1.4); ctx.restore();
  }
  drawDependencies(projectMap) {
    const typeColors = { strong: '#59f08a', data: '#47aaff', theory: '#ffbd3d', artifact: '#ff5ebc', control: '#b25cff', audit: '#ff6b65', content: '#28d7c0', knowledge: '#9aa9bb' };
    for (const [sourceId, targetId, type] of this.dependencies) {
      const source = projectMap.get(sourceId), target = projectMap.get(targetId); if (!source || !target) continue;
      const a = this.projectCenter(source, 2), b = this.projectCenter(target, 2); const color = typeColors[type] || '#667f91';
      const ctx = this.ctx; ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = (type === 'strong' ? 2 : 1.1) * this.zoom; ctx.shadowColor = color; ctx.shadowBlur = 9;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); const midX = (a.x + b.x) / 2, lift = Math.min(55, Math.abs(a.x - b.x) * .08 + 15); ctx.bezierCurveTo(midX, a.y - lift, midX, b.y - lift, b.x, b.y); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(midX, (a.y + b.y) / 2 - lift * .75, 2.2 * this.zoom, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  drawBuilding(project) {
    const ctx = this.ctx; const geometry = this.buildingGeometry(project); const color = domainColors[project.domain] || '#4f9dff'; const selected = project.id === this.selectedId;
    const baseHalf = (project.size || .8) * .66; const x = project.position.x * 1.13, z = project.position.z * 1.13;
    const pad = [this.project(x - baseHalf, z - baseHalf), this.project(x + baseHalf, z - baseHalf), this.project(x + baseHalf, z + baseHalf), this.project(x - baseHalf, z + baseHalf)];
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = selected ? 32 : 14; this.drawPolygon(pad, 'rgba(8,20,31,.94)', selected ? '#dffaff' : shade(color,.58), selected ? 2.2 : 1.1); ctx.restore();
    const [b0,b1,b2,b3] = geometry.base, [t0,t1,t2,t3] = geometry.top;
    this.drawPolygon([t3,t2,b2,b3], shade(color,.52), shade(color,.92), .8);
    this.drawPolygon([t1,t2,b2,b1], shade(color,.68), shade(color,.98), .8);
    ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = selected ? 26 : 12; this.drawPolygon([t0,t1,t2,t3], shade(color,.92), selected ? '#ffffff' : color, selected ? 2 : 1); ctx.restore();
    const floors = Math.max(2, Math.round((project.metrics?.complexity || 3) * .65));
    ctx.save(); ctx.globalAlpha = .42;
    for (let floor = 1; floor < floors; floor++) {
      const ratio = floor / floors; const leftA = { x: t3.x + (b3.x - t3.x) * ratio, y: t3.y + (b3.y - t3.y) * ratio }; const leftB = { x: t2.x + (b2.x - t2.x) * ratio, y: t2.y + (b2.y - t2.y) * ratio };
      const rightA = { x: t1.x + (b1.x - t1.x) * ratio, y: t1.y + (b1.y - t1.y) * ratio }; const rightB = { x: t2.x + (b2.x - t2.x) * ratio, y: t2.y + (b2.y - t2.y) * ratio };
      this.drawLine([leftA,leftB], shade(color,1.15), .7); this.drawLine([rightA,rightB], shade(color,1.2), .7);
    }
    ctx.restore();
    const beaconBase = { x:(t0.x+t1.x+t2.x+t3.x)/4, y:(t0.y+t1.y+t2.y+t3.y)/4 };
    ctx.save(); ctx.strokeStyle=color;ctx.fillStyle=shade(color,1.15);ctx.shadowColor=color;ctx.shadowBlur=18;ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(beaconBase.x,beaconBase.y);ctx.lineTo(beaconBase.x,beaconBase.y-12*this.zoom);ctx.stroke();ctx.beginPath();ctx.arc(beaconBase.x,beaconBase.y-14*this.zoom,3.4*this.zoom,0,Math.PI*2);ctx.fill();ctx.restore();
    const faceCenter = { x:(t3.x+t2.x+b2.x+b3.x)/4, y:(t3.y+t2.y+b2.y+b3.y)/4 };
    ctx.save(); ctx.textAlign='center'; ctx.fillStyle='#eaf7ff'; ctx.shadowColor='#00111d';ctx.shadowBlur=4;ctx.font=`700 ${clamp(8.4*this.zoom,7,13)}px system-ui`; ctx.fillText(project.shortName || project.name, faceCenter.x, faceCenter.y - 4*this.zoom);
    ctx.fillStyle='rgba(221,239,250,.78)';ctx.font=`${clamp(6.7*this.zoom,6,10)}px system-ui`;ctx.fillText(`${project.metrics.artifacts} artefatos · ${project.metrics.runs} runs`,faceCenter.x,faceCenter.y+9*this.zoom);ctx.restore();
    const statusColor = statusMeta[project.status]?.color || '#8ba0b1'; ctx.save();ctx.fillStyle=statusColor;ctx.shadowColor=statusColor;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(t0.x+5*this.zoom,t0.y+3*this.zoom,2.2*this.zoom,0,Math.PI*2);ctx.fill();ctx.restore();
    this.hitAreas.push({ id: project.id, polygon: geometry.polygon });
  }
  draw() {
    if (!this.width || !this.height) return;
    const ctx = this.ctx; ctx.clearRect(0,0,this.width,this.height); this.hitAreas=[];
    const gradient=ctx.createRadialGradient(this.width*.5,this.height*.3,40,this.width*.5,this.height*.45,this.width*.7);gradient.addColorStop(0,'rgba(14,49,74,.48)');gradient.addColorStop(1,'rgba(2,9,16,.03)');ctx.fillStyle=gradient;ctx.fillRect(0,0,this.width,this.height);
    this.drawGrid(); const projectMap=new Map(this.projects.map((project)=>[project.id,project])); this.drawDependencies(projectMap);
    const ordered=[...this.projects].sort((a,b)=>{const ra=this.rotatePoint(a.position.x,a.position.z),rb=this.rotatePoint(b.position.x,b.position.z);return (ra.x+ra.z)-(rb.x+rb.z)}); for(const project of ordered)this.drawBuilding(project);
  }
}
