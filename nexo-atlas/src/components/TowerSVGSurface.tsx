import {useEffect} from 'react';
import './TowerSVGSurface.css';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXCLUDED = '.galaxy-three-mount, .galaxy-three-canvas, .obs-canvas, [data-tower-svg-native], canvas, video, iframe, object, embed, img, picture';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'CANVAS', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'PICTURE']);

type Paint = {
  node: Element;
  style: CSSStyleDeclaration;
  rect: DOMRect;
  clipRects: DOMRect[];
  movingClipRects: Set<DOMRect>;
  z: number;
  order: number;
  opacity: number;
};

const svg = (tag: string, attributes: Record<string, string | number> = {}) => {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
};

function visible(element: Element, style: CSSStyleDeclaration, rect: DOMRect) {
  if (element.closest('.sr-only,.visually-hidden,.atlas-a11y-stations,[data-a11y-only]')) return false;
  const clipped = style.clip !== 'auto' || /inset\(\s*(?:50%|100%)/i.test(style.clipPath);
  if (clipped || ((style.overflow === 'hidden' || style.overflow === 'clip') && rect.width <= 1 && rect.height <= 1)) return false;
  return rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
}

function gradient(defs: SVGDefsElement, value: string, rect: DOMRect, id: string) {
  const match = value.match(/^linear-gradient\((.*)\)$/i);
  if (!match) return null;
  const parts = match[1]!.split(/,(?![^()]*\))/).map(part => part.trim());
  const anglePart = /^(to\s+\w+(?:\s+\w+)?|[-+\d.]+deg)$/i.test(parts[0] || '') ? parts.shift() : undefined;
  const angle = anglePart?.endsWith('deg') ? Number.parseFloat(anglePart) : 180;
  const radians = (angle - 90) * Math.PI / 180;
  const x1 = 50 - Math.cos(radians) * 50, y1 = 50 - Math.sin(radians) * 50;
  const x2 = 50 + Math.cos(radians) * 50, y2 = 50 + Math.sin(radians) * 50;
  const stops = parts.map(part => {
    const stop = part.match(/^(.*?)(?:\s+([\d.]+%))?$/);
    return stop && stop[1] ? { color: stop[1].trim(), offset: stop[2] || '' } : null;
  }).filter((stop): stop is { color: string; offset: string } => Boolean(stop));
  if (stops.length < 2 || stops.some(stop => !CSS.supports('color', stop.color))) return null;
  const element = svg('linearGradient', { id, x1: `${x1}%`, y1: `${y1}%`, x2: `${x2}%`, y2: `${y2}%`, gradientUnits: 'objectBoundingBox' });
  stops.forEach((stop, index) => element.append(svg('stop', { offset: stop.offset || `${index * 100 / (stops.length - 1)}%`, 'stop-color': stop.color })));
  defs.append(element);
  void rect;
  return `url(#${id})`;
}

function computedFill(defs: SVGDefsElement, style: CSSStyleDeclaration, rect: DOMRect, id: string) {
  const image = style.backgroundImage;
  if (image && image !== 'none') { const paint = gradient(defs, image, rect, id); if (paint) return paint; }
  return style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' ? style.backgroundColor : null;
}

function intersects(a: DOMRect, b: DOMRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

type LabelGroup = { group: SVGGElement; baseOpacity: number; movingClips: SVGRectElement[] };
type DynamicLabel = { position: {x: number; y: number} | null; rect: DOMRect; inlineOpacity: string; groups: LabelGroup[]; lastTransform: string };
const MOVING_LABEL = '.galaxy-three-label, .galaxy-event, .obs-tip, .obs-scene-labels button, .obs-scene-labels a, .obs-near span';

function inlinePosition(element: Element) {
  const matches = [...(element as HTMLElement).style.transform.matchAll(/translate(?:3d)?\(\s*([-+\d.e]+)px\s*,\s*([-+\d.e]+)px/g)];
  const match = matches[matches.length - 1];
  return match ? {x: Number(match[1]), y: Number(match[2])} : null;
}

function drawElement(defs: SVGDefsElement, layer: SVGGElement, paint: Paint, index: number, holes: DOMRect[], dynamicLabels: Map<Element, DynamicLabel>) {
  const {node, style, rect} = paint;
  const group = svg('g') as SVGGElement;
  group.setAttribute('opacity', String(paint.opacity));
  let clippedContent: SVGGElement = group;
  const movingClips: SVGRectElement[] = [];
  for (const clipRect of [...paint.clipRects].reverse()) {
    const clipId = `tower-svg-clip-${index}-${paint.clipRects.indexOf(clipRect)}`;
    const clip = svg('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    const clipShape = svg('rect', { x: clipRect.x, y: clipRect.y, width: clipRect.width, height: clipRect.height }) as SVGRectElement;
    clip.append(clipShape);
    if (paint.movingClipRects.has(clipRect)) movingClips.push(clipShape);
    defs.append(clip);
    const wrapper = svg('g', { 'clip-path': `url(#${clipId})` }) as SVGGElement;
    wrapper.append(clippedContent);
    clippedContent = wrapper;
  }
  layer.append(clippedContent);
  const label = node.closest(MOVING_LABEL);
  if (label) {
    let entry = dynamicLabels.get(label);
    if (!entry) { entry = { position: inlinePosition(label), rect: label.getBoundingClientRect(), inlineOpacity: (label as HTMLElement).style.opacity, groups: [], lastTransform: '' }; dynamicLabels.set(label, entry); }
    entry.groups.push({ group, baseOpacity: paint.opacity, movingClips });
  }
  const opacity = 1;
  const fill = computedFill(defs, style, rect, `tower-grad-${index}`);
  const radius = Math.max(0, ...style.borderRadius.split(/\s+/).map(value => Number.parseFloat(value) || 0));
  const borderWidth = Number.parseFloat(style.borderTopWidth) || 0;
  const borderColor = style.borderTopColor;
  const tag = node.tagName.toLowerCase();
  const isTextControl = ['input', 'textarea', 'select'].includes(tag);
  const border = borderWidth > 0 && borderColor !== 'rgba(0, 0, 0, 0)' ? borderColor : null;
  if (fill || border) {
    const background = svg('rect', {
      x: rect.x, y: rect.y, width: rect.width, height: rect.height, rx: radius,
      fill: fill || 'none', stroke: border || 'none', 'stroke-width': borderWidth,
      opacity: Number.isFinite(opacity) ? opacity : 1,
    });
    const ancestorHoles = node.querySelector(EXCLUDED) ? holes.filter(hole => intersects(rect, hole)) : [];
    if (ancestorHoles.length) {
      const maskId = `tower-svg-mask-${index}`;
      const mask = svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: innerWidth, height: innerHeight });
      mask.append(svg('rect', { x: 0, y: 0, width: innerWidth, height: innerHeight, fill: 'white' }));
      for (const hole of ancestorHoles) mask.append(svg('rect', { x: hole.x, y: hole.y, width: hole.width, height: hole.height, fill: 'black' }));
      defs.append(mask);
      background.setAttribute('mask', `url(#${maskId})`);
    }
    group.append(background);
  }

  if (tag === 'svg') {
    const copy = node.cloneNode(true) as SVGSVGElement;
    copy.removeAttribute('id');
    copy.setAttribute('x', String(rect.x)); copy.setAttribute('y', String(rect.y));
    copy.setAttribute('width', String(rect.width)); copy.setAttribute('height', String(rect.height));
    copy.setAttribute('aria-hidden', 'true'); copy.setAttribute('focusable', 'false');
    copy.style.color = style.color;
    copy.style.opacity = '1';
    group.append(copy);
    return;
  }

  if (isTextControl) {
    const control = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (document.activeElement !== node) {
      let value = tag === 'select' ? (node as HTMLSelectElement).selectedOptions[0]?.textContent || '' : control.value || (control as HTMLInputElement).placeholder || '';
      if (tag === 'input' && (node as HTMLInputElement).type === 'password') value = '•'.repeat(value.length);
      appendText(group, value, rect.x + (Number.parseFloat(style.paddingLeft) || 0), rect.y + (rect.height - (Number.parseFloat(style.fontSize) || 14)) / 2 + (Number.parseFloat(style.fontSize) || 14) * .82, style, opacity);
    }
    return;
  }

  if (SKIP_TAGS.has(node.tagName)) return;
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) drawTextNode(group, child as Text, style, opacity);
  }
}

function appendText(layer: SVGGElement, text: string, x: number, y: number, style: CSSStyleDeclaration, opacity: number) {
  if (!text) return;
  const element = svg('text', {
    x, y, fill: style.color, opacity,
    'font-family': style.fontFamily, 'font-size': style.fontSize,
    'font-weight': style.fontWeight, 'font-style': style.fontStyle,
    'letter-spacing': style.letterSpacing, 'text-anchor': 'start',
    'dominant-baseline': 'alphabetic',
  });
  element.textContent = text;
  layer.append(element);
}

function drawTextNode(layer: SVGGElement, textNode: Text, style: CSSStyleDeclaration, parentOpacity: number) {
  const rawText = textNode.textContent || '';
  if (!rawText.trim()) return;
  const transform = style.textTransform;
  const range = document.createRange();
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const tokens = /\S+/g;
  for (let match = tokens.exec(rawText); match; match = tokens.exec(rawText)) {
    range.setStart(textNode, match.index);
    range.setEnd(textNode, match.index + match[0].length);
    const fragments = range.getClientRects();
    if (fragments.length > 1) {
      let line = '', lineRect: DOMRect | null = null;
      const flush = () => { if (lineRect && line) appendText(layer, transform === 'uppercase' ? line.toUpperCase() : transform === 'lowercase' ? line.toLowerCase() : line, lineRect.left, lineRect.top + (lineRect.height - fontSize) / 2 + fontSize * .82, style, parentOpacity); };
      for (let i = match.index; i < match.index + match[0].length; i++) {
        range.setStart(textNode, i); range.setEnd(textNode, i + 1);
        const characterRect = range.getBoundingClientRect();
        if (lineRect && Math.abs(characterRect.top - lineRect.top) > 2) { flush(); line = ''; lineRect = null; }
        if (!lineRect) lineRect = characterRect;
        line += rawText[i];
      }
      flush(); continue;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const word = transform === 'uppercase' ? match[0].toUpperCase() : transform === 'lowercase' ? match[0].toLowerCase() : match[0];
    appendText(layer, word, rect.left, rect.top + (rect.height - fontSize) / 2 + fontSize * .82, style, parentOpacity);
  }
}

function collectPaints(root: Element, host: Element) {
  const paints: Paint[] = [];
  const holes: DOMRect[] = [];
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const rects = new WeakMap<Element, DOMRect>();
  const styleOf = (element: Element) => {
    let style = styles.get(element);
    if (!style) { style = getComputedStyle(element); styles.set(element, style); }
    return style;
  };
  const rectOf = (element: Element) => {
    let rect = rects.get(element);
    if (!rect) { rect = element.getBoundingClientRect(); rects.set(element, rect); }
    return rect;
  };
  let order = 0;
  const walk = (element: Element) => {
    if (element === host || host.contains(element)) return;
    if (element.matches(EXCLUDED)) {
      const rect = rectOf(element);
      if (rect.width && rect.height) holes.push(rect);
      return;
    }
    if (SKIP_TAGS.has(element.tagName) && element.tagName !== 'SVG') return;
    const style = styleOf(element);
    const rect = rectOf(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || element.closest('.sr-only,.visually-hidden,.atlas-a11y-stations,[data-a11y-only]')) return;
    if (visible(element, style, rect)) {
      const clipRects: DOMRect[] = [];
      const movingClipRects = new Set<DOMRect>();
      const movingLabel = element.closest(MOVING_LABEL);
      for (let ancestor: Element | null = element; ancestor && ancestor !== host; ancestor = ancestor.parentElement) {
        const ancestorStyle = styleOf(ancestor);
        if (/(hidden|clip|auto|scroll)/.test(`${ancestorStyle.overflowX} ${ancestorStyle.overflowY}`)) {
          const clipRect = rectOf(ancestor);
          if (clipRect.width && clipRect.height) {
            clipRects.push(clipRect);
            if (movingLabel?.contains(ancestor)) movingClipRects.add(clipRect);
          }
        }
      }
      let z = 0;
      let opacity = 1;
      for (let ancestor: Element | null = element; ancestor && ancestor !== host; ancestor = ancestor.parentElement) {
        const ancestorStyle = styleOf(ancestor);
        const ancestorZ = Number.parseInt(ancestorStyle.zIndex, 10);
        if (Number.isFinite(ancestorZ)) z += ancestorZ;
        const ancestorOpacity = Number.parseFloat(ancestorStyle.opacity);
        if (Number.isFinite(ancestorOpacity)) opacity *= ancestorOpacity;
      }
      paints.push({ node: element, style, rect, clipRects, movingClipRects, z, order: order++, opacity: Math.max(0, Math.min(1, opacity)) });
    }
    if (element.tagName !== 'SVG') {
      const children = Array.from(element.children);
      for (const child of element.tagName === 'DETAILS' && !(element as HTMLDetailsElement).open ? children.filter(child => child.tagName === 'SUMMARY') : children) walk(child);
    }
  };
  walk(root);
  return {paints, holes};
}

export default function TowerSVGSurface() {
  useEffect(() => {
    const host = document.createElement('div');
    host.dataset.towerSvgHost = '';
    const surface = svg('svg', { 'data-tower-svg-surface': '', 'data-ready': 'false', 'aria-hidden': 'true', focusable: 'false' }) as SVGSVGElement;
    host.append(surface);
    document.body.append(host);
    document.body.dataset.towerSvgEnabled = '';
    let timer = 0;
    let disposed = false;
    let rendering = false;
    let repaintCount = 0;
    let unmappedLabels = new WeakSet<Element>();

    const render = () => {
      if (disposed || rendering || document.visibilityState === 'hidden') return;
      rendering = true;
      const started = performance.now();
      // Temporarily expose the source styles synchronously; no paint occurs until this task yields.
      document.body.classList.remove('tower-svg-active');
      surface.setAttribute('viewBox', `0 0 ${Math.max(1, innerWidth)} ${Math.max(1, innerHeight)}`);
      const defs = svg('defs') as SVGDefsElement;
      const layer = svg('g', { 'data-tower-svg-content': '' }) as SVGGElement;
      const holes: DOMRect[] = [];
      const paints: Paint[] = [];
      const dynamicLabels = new Map<Element, DynamicLabel>();
      let index = 0;
      const sources = [document.getElementById('root'), ...Array.from(document.body.children).filter(child => child !== host && child.id !== 'root')].filter((node): node is HTMLElement => node instanceof HTMLElement);
      for (const source of sources) {
        if (!source.isConnected || source.matches(EXCLUDED)) continue;
        const {paints: sourcePaints, holes: sourceHoles} = collectPaints(source, host);
        holes.push(...sourceHoles);
        paints.push(...sourcePaints);
      }
      paints.sort((a, b) => a.z - b.z || a.order - b.order);
      for (const paint of paints) drawElement(defs, layer, paint, index++, holes, dynamicLabels);
      // Build off-document: text measurements must not flush styles after every SVG insertion.
      surface.replaceChildren(defs, layer);
      document.body.classList.add('tower-svg-active');
      surface.dataset.ready = 'true';
      host.dataset.elementCount = String(index);
      host.dataset.renderMs = (performance.now() - started).toFixed(2);
      host.dataset.repaintCount = String(++repaintCount);
      (surface as SVGSVGElement & {__towerLabels?: Map<Element, DynamicLabel>}).__towerLabels = dynamicLabels;
      unmappedLabels = new WeakSet<Element>();
      rendering = false;
    };
    const triggers: Record<string, number> = {};
    const schedule = (reason?: unknown) => {
      const name = typeof reason === 'string' ? reason : reason instanceof Event ? reason.type : 'external';
      triggers[name] = (triggers[name] || 0) + 1;
      host.dataset.triggers = JSON.stringify(triggers);
      if (timer) return;
      timer = window.setTimeout(() => { timer = 0; requestAnimationFrame(render); }, 90);
    };
    const onPointer = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest(EXCLUDED)) return;
      const control = target.closest('button,a,input,select,textarea,[role="button"]');
      if (!control) return;
      if (event instanceof PointerEvent && (event.type === 'pointerover' || event.type === 'pointerout')) {
        const related = event.relatedTarget instanceof Element ? event.relatedTarget.closest('button,a,input,select,textarea,[role="button"]') : null;
        if (related === control) return;
      }
      schedule();
    };
    const onMotion = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || host.contains(target) || target.closest(EXCLUDED) || target.closest(MOVING_LABEL)) return;
      schedule(`motion:${event.type}:${target.tagName}:${target.getAttribute('class')}`);
    };

    render();
    const observer = new MutationObserver(records => {
      const relevant = records.filter(record => {
        if (record.target === document.body || host.contains(record.target as Node)) return false;
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        return !target?.closest(EXCLUDED);
      });
      if (!relevant.length) return;
      if (relevant.every(record => record.type === 'attributes' && record.attributeName === 'style' && record.target instanceof Element && record.target.closest(MOVING_LABEL))) {
        const labels = (surface as SVGSVGElement & {__towerLabels?: Map<Element, DynamicLabel>}).__towerLabels;
        const changedLabels = new Set<Element>();
        for (const record of relevant) {
          const target = record.target as Element;
          const label = target.closest(MOVING_LABEL);
          if (label) changedLabels.add(label);
        }
        // Batch all layout reads first; patch the cached vector groups only after reads finish.
        const updates: Array<{label: Element; entry: DynamicLabel; transform: string; opacityRatio?: number}> = [];
        for (const label of changedLabels) {
          const entry = labels?.get(label);
          if (!entry) {
            const rect = label.getBoundingClientRect();
            const inlineOpacity = (label as HTMLElement).style.opacity;
            if (!unmappedLabels.has(label) && rect.width > 1 && rect.height > 1 && inlineOpacity !== '0') {
              unmappedLabels.add(label);
              schedule('missing-label');
            }
            continue;
          }
          const position = inlinePosition(label);
          const current = position && entry.position ? null : label.getBoundingClientRect();
          const dx = position && entry.position ? position.x - entry.position.x : current!.left - entry.rect.left;
          const dy = position && entry.position ? position.y - entry.position.y : current!.top - entry.rect.top;
          const transform = `translate(${dx} ${dy})`;
          const currentInlineOpacity = (label as HTMLElement).style.opacity;
          const base = Number.parseFloat(entry.inlineOpacity), next = Number.parseFloat(currentInlineOpacity);
          updates.push({ label, entry, transform, opacityRatio: Number.isFinite(base) && base > 0 && Number.isFinite(next) ? next / base : undefined });
        }
        for (const {entry, transform, opacityRatio} of updates) {
          if (entry.lastTransform !== transform) {
            for (const item of entry.groups) {
              item.group.setAttribute('transform', transform);
              for (const clip of item.movingClips) clip.setAttribute('transform', transform);
            }
            entry.lastTransform = transform;
          }
          if (opacityRatio !== undefined) for (const item of entry.groups) item.group.setAttribute('opacity', String(Math.max(0, Math.min(1, item.baseOpacity * opacityRatio))));
        }
        return;
      }
      schedule(`mutation:${relevant.map(r => { const e = r.target instanceof Element ? r.target : r.target.parentElement; return `${r.type}:${r.attributeName || ''}:${e?.tagName}:${e?.getAttribute('class')}`; }).slice(0, 2).join('|')}`);
    });
    const observerOptions: MutationObserverInit = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-expanded', 'aria-selected', 'value', 'data-theme'] };
    observer.observe(document.body, observerOptions);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    const root = document.getElementById('root');
    if (root) resize.observe(root);
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('animationstart', onMotion, true);
    document.addEventListener('animationend', onMotion, true);
    document.addEventListener('animationcancel', onMotion, true);
    document.addEventListener('transitionrun', onMotion, true);
    document.addEventListener('transitionend', onMotion, true);
    document.addEventListener('transitioncancel', onMotion, true);
    document.addEventListener('input', schedule, true);
    document.addEventListener('change', schedule, true);
    document.addEventListener('pointerover', onPointer, true);
    document.addEventListener('pointerout', onPointer, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('pointerup', onPointer, true);
    void document.fonts?.ready.then(schedule);

    return () => {
      disposed = true;
      observer.disconnect(); resize.disconnect();
      window.clearTimeout(timer);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('visibilitychange', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('animationstart', onMotion, true);
      document.removeEventListener('animationend', onMotion, true);
      document.removeEventListener('animationcancel', onMotion, true);
      document.removeEventListener('transitionrun', onMotion, true);
      document.removeEventListener('transitionend', onMotion, true);
      document.removeEventListener('transitioncancel', onMotion, true);
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('change', schedule, true);
      document.removeEventListener('pointerover', onPointer, true);
      document.removeEventListener('pointerout', onPointer, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('pointerup', onPointer, true);
      document.body.classList.remove('tower-svg-active');
      delete document.body.dataset.towerSvgEnabled;
      host.remove();
    };
  }, []);
  return null;
}
