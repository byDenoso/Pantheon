const spiralFragmentShader = `
uniform float uOpacity;
varying float vBrightness;
varying vec3 vColor;
varying float vNucleusFade;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float glow = exp(-d * d * 30.0);
  float spikeX = max(0.0, 1.0 - abs(uv.y) * 30.0) * smoothstep(0.5, 0.0, abs(uv.x));
  float spikeY = max(0.0, 1.0 - abs(uv.x) * 30.0) * smoothstep(0.5, 0.0, abs(uv.y));
  float spike = vBrightness > 0.85 ? spikeX + spikeY : 0.0;
  float alpha = (glow + spike * 0.35) * (0.25 + vBrightness * 0.75) * uOpacity * vNucleusFade;
  gl_FragColor = vec4(vColor * (0.7 + vBrightness * 0.45), alpha);
}
`;

function nodeSize(node: PlacedNode3D): number {
  if (node.type === 'DOMAIN') return node.domain === 'NEXO' ? 14.5 : 11.2;
  if (node.type === 'CAMPAIGN') return 9.4;
  if (node.id.startsWith('atlas.cluster.')) return 8.2;
  if (node.type === 'CAPABILITY' || node.type === 'PROVIDER') return 5.8;
  if (node.type === 'TEST') return 5.0;
  if (node.type === 'ACTION' || node.type === 'CLAIM') return 4.7;
  if (node.type === 'PROJECTION') return 4.3;
  return 3.7;
}

function nodeIntensity(node: PlacedNode3D, selectedId: string | null): number {
  if (node.id === selectedId) return 1;
  const state = String(node.state ?? '').toUpperCase();
  if (/RUNNING|ACTIVE|IN_PROGRESS|AWAITING_HUMAN/.test(state)) return 0.94;
  if (/BLOCKED|FAILED|CONFLICT/.test(state)) return 0.76;
  if (node.type === 'DOMAIN') return 0.88;
  return 0.64;
}

function buildNodeGeometry(
  nodes: PlacedNode3D[], selectedId: string | null, theme: 'dark' | 'light', morph: GalaxyMorphology | null = null,
): BufferGeometry {
  const tmp = new Color();
  const field = morph ? colorField(morph) : null;
  const fieldTint = new Color();
  const palette = morph ? Object.fromEntries(Object.keys(morph.arms).map(arm => [arm, domainColor(arm as PlacedNode3D['domain'], theme)])) : {};
  const coreColor = domainColor('NEXO' as PlacedNode3D['domain'], theme);
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const brightness = new Float32Array(nodes.length);
  const colors = new Float32Array(nodes.length * 3);
  const selected = selectedId ? nodes.find(node => node.id === selectedId) : null;

  nodes.forEach((node, index) => {
    const p = index * 3;
    positions[p] = node.x;
    positions[p + 1] = node.y;
    positions[p + 2] = node.z;
    sizes[index] = nodeSize(node);
    const focusFactor = selected && node.id !== selected.id
      ? node.domain === selected.domain ? 0.72 : 0.34
      : 1;
    brightness[index] = nodeIntensity(node, selectedId) * focusFactor;
    tmp.copy(domainColor(node.domain, theme));
    // Nucleus (NEXO) points fade from gold into the colour of the arm they drift towards.
    // Data points take the local field colour (mostly), keeping a hint of their own domain,
    // so they blend across junctions and the bulge edge like the stars around them.
    if (field && node.type !== 'DOMAIN') tmp.lerp(field(node.x, node.y, palette, coreColor, fieldTint), 0.7);
    tmp.toArray(colors, p);
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aBrightness', new Float32BufferAttribute(brightness, 1));
  geometry.setAttribute('aColor', new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
function buildRelationSegments(
  nodes: PlacedNode3D[],
  edges: GraphEdge[],
  selectedId: string | null,
): { structural: BufferGeometry; dependency: BufferGeometry; blocked: BufferGeometry; learning: BufferGeometry; selected: BufferGeometry } {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const structural: number[] = [];
  const dependency: number[] = [];
  const blocked: number[] = [];
  const learning: number[] = [];
  const selected: number[] = [];
  const dependencyKinds = new Set(['DEPENDS_ON', 'ROUTES_TO', 'VERIFIES']);

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const a = new Vector3(from.x, from.y, from.z);
    const b = new Vector3(to.x, to.y, to.z);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a);
    const normal2 = new Vector3(-direction.y, direction.x, 0).normalize();
    mid.addScaledVector(normal2, Math.min(8, direction.length() * 0.06));
    mid.z += Math.min(4, direction.length() * 0.025);
    const curve = new QuadraticBezierCurve3(a, mid, b);
    const points = curve.getPoints(10);

    const isSelected = edge.from === selectedId || edge.to === selectedId;
    const isBlocked = edge.blocked || edge.kind === 'BLOCKS' || edge.kind === 'CONTRADICTS';
    const target = isSelected
      ? selected
      : edge.is_learning
        ? learning
        : isBlocked
          ? blocked
          : dependencyKinds.has(edge.kind)
            ? dependency
            : structural;

    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[index]!;
      const p1 = points[index + 1]!;
      target.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
    }
  }

  const geometryOf = (values: number[]) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    return geometry;
  };
  return {
    structural: geometryOf(structural),
    dependency: geometryOf(dependency),
    blocked: geometryOf(blocked),
    learning: geometryOf(learning),
    selected: geometryOf(selected),
  };
}
function isMajor(node: PlacedNode3D, selectedId: string | null): boolean {
  return node.type === 'DOMAIN' || node.type === 'CAMPAIGN' || node.id.startsWith('atlas.cluster.') || node.id === selectedId;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function compatibleView(camera: PerspectiveCamera, target: Vector3): Canvas25DViewState {
  const offset = camera.position.clone().sub(target);
  const distance = Math.max(1, offset.length());
  return {
    yaw: Math.atan2(offset.x, offset.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, offset.y / distance))),
    zoom: 248 / distance,
    target: { x: target.x, y: target.y, z: target.z },
  };
}

export const GalaxyThree3D = forwardRef<CanvasGraph25DHandle, Props>(function GalaxyThree3D({
  nodes,
  edges,
  selectedId,
  onSelect,
  onFailure,
  className = '',
  ariaLabel = 'Campo topológico tridimensional do NEXO ONE',
  viewMode = 'detail',
  morphology = null,
  glow = 0.21,
  events = NO_EVENTS,
  focusEvent = null,
  onEventSelect,
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const nodePointsRef = useRef<Points | null>(null);
  const labelsRef = useRef(new Map<string, HTMLSpanElement>());
  const eventsRef = useRef(new Map<string, HTMLSpanElement>());
  // Events are read per frame from a ref: toggling a kind must not rebuild the WebGL scene.
  const eventListRef = useRef(events);
  eventListRef.current = events;
  const tweenRef = useRef<Tween | null>(null);
  // Disk angle survives scene rebuilds, so markers and camera focus stay in sync.
  const diskAngleRef = useRef(0);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const [pageTheme, setThemeName] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  // The galaxy is a night sky in both site themes (like the Início hero): additive
  // starlight is invisible on a white page, so the spiral always renders dark.
  const themeName: 'dark' | 'light' = morphology ? 'dark' : pageTheme;

  const isMacro = viewMode === 'macro';
  const isMobile = size.width < 760;
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setThemeName(root.dataset.theme === 'light' ? 'light' : 'dark');
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const visibleLabels = useMemo(() => {
    const local = new Set<string>();
    if (selectedId) {
      local.add(selectedId);
      for (const edge of edges) {
        if (edge.from === selectedId) local.add(edge.to);
        if (edge.to === selectedId) local.add(edge.from);
      }
    }
    return nodes
      .filter(node => isMajor(node, selectedId) || local.has(node.id))
      .slice(0, isMobile ? 8 : morphology ? 14 : 42);
  }, [edges, isMobile, nodes, selectedId]);

  const visibleEventTagIds = useMemo(() => {
    const keep = new Set<string>();
    if (focusEvent?.id) keep.add(focusEvent.id);
    const seenKinds = new Set<GalaxyEvent['kind']>();
    for (const event of [...events].sort((a, b) => b.intensity - a.intensity)) {
      if (seenKinds.has(event.kind)) continue;
      seenKinds.add(event.kind);
      keep.add(event.id);
    }
    return keep;
  }, [events, focusEvent?.id]);

  const homeCamera = isMacro
    ? (isMobile ? MOBILE_MACRO_CAMERA : MACRO_CAMERA)
    : morphology
      ? (isMobile ? MOBILE_CAMERA : GALAXY_DETAIL_CAMERA)
      : (isMobile ? MOBILE_CAMERA : DEFAULT_CAMERA);

  const flyToPoint = (point: { x: number; y: number; z: number }, distance: number, duration = 720) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const target = new Vector3(point.x, point.y, point.z);
    const fromTarget = controls.target.clone();
    const direction = camera.position.clone().sub(fromTarget);
    if (direction.lengthSq() < 0.001) direction.set(0, 0.12, 1);
    direction.normalize();
    const toPosition = target.clone().addScaledVector(direction, distance);
    toPosition.y += distance * 0.045;
    tweenRef.current = {
      startAt: performance.now(),
      duration: reducedMotion ? 0 : duration,
      fromPosition: camera.position.clone(),
      toPosition,
      fromTarget,
      toTarget: target,
    };
  };

  const focusNode = (id: string, distance = 34): boolean => {
    const node = nodeMap.get(id);
    if (!node) return false;
    flyToPoint(node, distance);
    return true;
  };

  const reset = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    tweenRef.current = {
      startAt: performance.now(),
      duration: reducedMotion ? 0 : 760,
      fromPosition: camera.position.clone(),
      toPosition: homeCamera.clone(),
      fromTarget: controls.target.clone(),
      toTarget: DEFAULT_TARGET.clone(),
    };
  };

  useImperativeHandle(ref, () => ({
    reset,
    focusNode: (id, zoom = 2.15) => focusNode(id, Math.max(18, 74 / Math.max(0.7, zoom))),
    focusDomain: id => focusNode(id, isMobile ? 68 : 76),
    focusSubdomain: id => focusNode(id, isMobile ? 44 : 50),
    focusEntity: id => focusNode(id, isMobile ? 28 : 34),
    focusPoint: (point, zoom = 2) => flyToPoint(point, Math.max(18, 74 / Math.max(0.7, zoom))),
    getView: () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return { yaw: 0, pitch: 0, zoom: 1, target: { x: 0, y: 0, z: 0 } };
      }
      return compatibleView(camera, controls.target);
    },
  }), [homeCamera, isMacro, isMobile, nodeMap, reducedMotion]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setSize({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || failed) return;

    let renderer: WebGLRenderer | null = null;
    let composer: EffectComposer | null = null;
    let frame = 0;
    let disposed = false;

    try {
      renderer = new WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = themeName === 'light' ? 0.92 : (isMobile ? 0.96 : 1.0);
      // Phones are 3x screens: a 1.45 cap rendered the galaxy at half resolution (blurry, dull points).
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 2.5 : 2));
      renderer.setSize(size.width, size.height, false);
      renderer.domElement.className = 'galaxy-three-canvas';
      renderer.domElement.setAttribute('aria-label', ariaLabel);
      renderer.domElement.tabIndex = 0;
      mount.replaceChildren(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new Scene();
      sceneRef.current = scene;

      const camera = new PerspectiveCamera(isMobile ? 35 : 40, size.width / size.height, 0.1, 1200);
      camera.position.copy(homeCamera);
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(DEFAULT_TARGET);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.enablePan = true;
      controls.enableRotate = true;
      controls.screenSpacePanning = true;
      controls.rotateSpeed = 0.52;
      controls.zoomSpeed = 0.82;
      controls.panSpeed = 0.58;
      controls.minDistance = 12;
      controls.maxDistance = 360;
      controls.minPolarAngle = 0.18;
      controls.maxPolarAngle = Math.PI - 0.18;
      controlsRef.current = controls;

      const palette = paletteForTheme(themeName);
      const spiral = themeName === 'dark';
      const particleCount = spiral
        ? (isMobile ? 7000 : 26000)
        : isMacro ? (isMobile ? 90 : 320) : (isMobile ? 240 : 900);
      const galaxyGeometry = spiral ? buildSpiralGalaxy(particleCount, morphology ?? DEFAULT_MORPHOLOGY) : buildFieldGeometry(nodes, particleCount, isMacro, themeName);
      const galaxyMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: spiral ? (isMobile ? 1.18 : 0.95) * glow : isMacro ? (themeName === 'light' ? 0.20 : 0.24) : (themeName === 'light' ? 0.38 : 0.52) },
          uNucleusRadius: { value: (morphology?.bulge.radius ?? DEFAULT_MORPHOLOGY.bulge.radius) * G_SCALE * 1.6 * 2.7 },
        },
        vertexShader: spiral ? spiralVertexShader : galaxyVertexShader,
        fragmentShader: spiral ? spiralFragmentShader : galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const galaxy = new Points(galaxyGeometry, galaxyMaterial);
      // Everything that belongs to the disk turns together (stars, data points, relations).
      const disk = new Group();
      disk.rotation.z = diskAngleRef.current;
      scene.add(disk);
      const deepFieldGeometry = spiral ? buildDeepField(isMobile ? 220 : 560) : null;
      const deepFieldMaterial = spiral ? new ShaderMaterial({
        uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uOpacity: { value: isMobile ? 0.52 : 0.75 } },
        vertexShader: deepFieldVertexShader,
        fragmentShader: deepFieldFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }) : null;
      if (deepFieldGeometry && deepFieldMaterial) scene.add(new Points(deepFieldGeometry, deepFieldMaterial));
      disk.add(galaxy);

      const ringGeometry = buildFieldRingSegments(nodes, isMacro);
      const ringMaterial = new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: themeName === 'light' ? 0.05 : (isMacro ? 0.06 : 0.04), blending: NormalBlending, depthWrite: false });
      const ringLines = new LineSegments(ringGeometry, ringMaterial);
      ringLines.visible = !spiral;
      scene.add(ringLines);

      const grid = new GridHelper(isMacro ? 430 : 300, isMacro ? 30 : 22, palette.accent, palette.accent);
      grid.position.set(0, isMacro ? -94 : -74, -24);
      const gridMaterial = grid.material as LineBasicMaterial;
      gridMaterial.transparent = true; gridMaterial.opacity = themeName === 'light' ? 0.055 : 0.075; gridMaterial.depthWrite = false;
      grid.visible = !isMobile && !spiral;
      scene.add(grid);

      const nodeGeometry = buildNodeGeometry(nodes, selectedId, themeName, spiral ? (morphology ?? DEFAULT_MORPHOLOGY) : null);
      const nodeMaterial = new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() },
          uColorA: { value: palette.accent },
          uColorB: { value: palette.strong },
          uOpacity: { value: 1.0 },
        },
        vertexShader: galaxyVertexShader,
        fragmentShader: galaxyFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
      });
      const nodePoints = new Points(nodeGeometry, nodeMaterial);
      nodePointsRef.current = nodePoints;
      disk.add(nodePoints);

      const relationSegments = buildRelationSegments(nodes, edges, selectedId);
      const relationMaterial = new LineBasicMaterial({
        color: themeName === 'light' ? '#7d858d' : '#65727d',
        transparent: true,
        opacity: selectedId ? 0.16 : (isMacro ? 0.48 : 0.30),
        blending: NormalBlending,
        depthWrite: false,
      });
      const dependencyMaterial = new LineDashedMaterial({
        color: themeName === 'light' ? '#5d7488' : '#8ca3b5',
        transparent: true,
        opacity: selectedId ? 0.22 : 0.46,
        dashSize: 2.1,
        gapSize: 1.5,
        depthWrite: false,
      });
      const learningRelationMaterial = new LineDashedMaterial({
        color: themeName === 'light' ? '#8b4fb8' : '#c889ff',
        transparent: true,
        opacity: selectedId ? 0.42 : 0.72,
        dashSize: 3.2,
        gapSize: 1.1,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const blockedRelationMaterial = new LineBasicMaterial({
        color: '#df747d',
        transparent: true,
        opacity: selectedId ? 0.34 : 0.62,
        depthWrite: false,
      });
      const selectedRelationMaterial = new LineBasicMaterial({
        color: palette.strong,
        transparent: true,
        opacity: 0.98,
        blending: themeName === 'light' ? NormalBlending : AdditiveBlending,
        depthWrite: false,
      });
      const relationLines = new LineSegments(relationSegments.structural, relationMaterial);
      const dependencyLines = new LineSegments(relationSegments.dependency, dependencyMaterial);
      dependencyLines.computeLineDistances();
      const learningRelationLines = new LineSegments(relationSegments.learning, learningRelationMaterial);
      learningRelationLines.computeLineDistances();
      const blockedRelationLines = new LineSegments(relationSegments.blocked, blockedRelationMaterial);
      const selectedRelationLines = new LineSegments(relationSegments.selected, selectedRelationMaterial);
      disk.add(relationLines, dependencyLines, learningRelationLines, blockedRelationLines, selectedRelationLines);

      if (!isMobile && themeName === 'dark') {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.55 * glow, 0.5, 0.2);
        bloom.threshold = 0.2;
        bloom.strength = 0.55 * glow;
        bloom.radius = 0.5;
        composer.addPass(bloom);
      }

      const projected = new Vector3();
      const pickIndex = (clientX: number, clientY: number): number | null => {
        const rect = renderer!.domElement.getBoundingClientRect();
        const hitRadius = isMobile ? 28 : 16;
        let bestIndex: number | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let index = 0; index < nodes.length; index += 1) {
          const node = nodes[index]!;
          projected.set(node.x, node.y, node.z).applyAxisAngle(Z_AXIS, disk.rotation.z).project(camera);
          if (projected.z <= -1 || projected.z >= 1) continue;
          const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
          const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
          const distance = Math.hypot(clientX - x, clientY - y);
          if (distance > hitRadius) continue;
          // Favor the visually closest node when several points overlap.
          const score = distance + Math.max(0, projected.z + 1) * 2.5;
          if (score < bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }
        return bestIndex;
      };

      const pick = (clientX: number, clientY: number, focus = false) => {
        const index = pickIndex(clientX, clientY);
        if (index == null || !nodes[index]) {
          onSelect(null);
          return;
        }
        const id = nodes[index]!.id;
        onSelect(id);
        if (focus) focusNode(id, isMobile ? 28 : 34);
      };

      const onPointerDown = (event: PointerEvent) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY };
      };
      const onPointerUp = (event: PointerEvent) => {
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!start) return;
        const travel = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        const tapTolerance = isMobile ? 16 : 7;
        if (travel <= tapTolerance) pick(event.clientX, event.clientY);
      };
      const onPointerCancel = () => {
        pointerDownRef.current = null;
      };
      const onDoubleClick = (event: MouseEvent) => {
        pick(event.clientX, event.clientY, true);
      };
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointercancel', onPointerCancel);
      renderer.domElement.addEventListener('dblclick', onDoubleClick);

      const scratch = new Vector3();
      const updateLabels = () => {
        const width = size.width;
        const height = size.height;
        for (const node of visibleLabels) {
          const label = labelsRef.current.get(node.id);
          if (!label) continue;
          const projected = scratch.set(node.x, node.y, node.z).applyAxisAngle(Z_AXIS, disk.rotation.z).project(camera);
          const visible = projected.z > -1 && projected.z < 1;
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          label.style.opacity = visible ? '1' : '0';
          label.style.transform = `translate(-50%, -50%) translate(${x}px, ${y + (node.type === 'DOMAIN' ? 22 : 15)}px)`;
        }
        // Tags that would collide stack downwards instead of overlapping.
        const placed: Array<{ x: number; y: number }> = [];
        for (const event of eventListRef.current) {
          const marker = eventsRef.current.get(event.id);
          if (!marker) continue;
          const projected = scratch.set(event.x, event.y, event.z).applyAxisAngle(Z_AXIS, disk.rotation.z).project(camera);
          const visible = projected.z > -1 && projected.z < 1;
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          let shift = 0;
          while (placed.some(p => Math.abs(p.x - x) < 70 && Math.abs(p.y - (y + shift)) < 17)) shift += 17;
          placed.push({ x, y: y + shift });
          marker.style.opacity = visible ? '1' : '0';
          marker.style.setProperty('--tag-shift', `${shift}px`);
          marker.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        }
      };

      // Slow, continuous rotation of the disk (≈ one turn every 9 minutes); frame-rate independent.
      let lastFrame = 0;
      const animate = (now: number) => {
        if (disposed) return;
        if (spiral && !reducedMotion) {
          const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
          disk.rotation.z += dt * 0.0116;
        }
        diskAngleRef.current = disk.rotation.z;
        lastFrame = now;
        const tween = tweenRef.current;
        if (tween) {
          const raw = tween.duration <= 0 ? 1 : Math.min(1, (now - tween.startAt) / tween.duration);
          const t = easeOutCubic(raw);
          camera.position.lerpVectors(tween.fromPosition, tween.toPosition, t);
          controls.target.lerpVectors(tween.fromTarget, tween.toTarget, t);
          if (raw >= 1) tweenRef.current = null;
        }
        controls.update();
        galaxyMaterial.uniforms.uTime!.value = now * 0.001;
        nodeMaterial.uniforms.uTime!.value = now * 0.001;
        updateLabels();
        if (composer) composer.render();
        else renderer!.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        renderer?.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer?.domElement.removeEventListener('pointerup', onPointerUp);
        renderer?.domElement.removeEventListener('pointercancel', onPointerCancel);
        renderer?.domElement.removeEventListener('dblclick', onDoubleClick);
        controls.dispose();
        galaxyGeometry.dispose();
        galaxyMaterial.dispose();
        deepFieldGeometry?.dispose();
        deepFieldMaterial?.dispose();
        ringGeometry.dispose();
        ringMaterial.dispose();
        grid.geometry.dispose();
        gridMaterial.dispose();
        nodeGeometry.dispose();
        nodeMaterial.dispose();
        relationSegments.structural.dispose();
        relationSegments.dependency.dispose();
        relationSegments.blocked.dispose();
        relationSegments.learning.dispose();
        relationSegments.selected.dispose();
        relationMaterial.dispose();
        dependencyMaterial.dispose();
        blockedRelationMaterial.dispose();
        learningRelationMaterial.dispose();
        selectedRelationMaterial.dispose();
        composer?.dispose();
        renderer?.dispose();
        rendererRef.current = null;
        cameraRef.current = null;
        controlsRef.current = null;
        sceneRef.current = null;
        nodePointsRef.current = null;
        mount.replaceChildren();
      };
    } catch {
      renderer?.dispose();
      rendererRef.current = null;
      setFailed(true);
      onFailure?.();
      return;
    }
  }, [ariaLabel, edges, failed, glow, isMacro, isMobile, morphology, nodes, onFailure, onSelect, reducedMotion, selectedId, size.height, size.width, themeName, visibleLabels]);

  // Phones: the event sheet covers the lower half, so lift the framing while it is open.
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    if (isMobile && focusEvent) camera.setViewOffset(size.width, size.height, 0, size.height * 0.26, size.width, size.height);
    else camera.clearViewOffset();
  }, [focusEvent, isMobile, size.width, size.height]);

  useEffect(() => {
    if (!focusEvent) return;
    const event = events.find(item => item.id === focusEvent.id);
    if (!event) return;
    const point = new Vector3(event.x, event.y, event.z).applyAxisAngle(Z_AXIS, diskAngleRef.current);
    flyToPoint(point, isMobile ? 70 : 60, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEvent]);

  return (
    <div
      ref={hostRef}
      className={`galaxy-three-root ${className}`}
      data-renderer="three-nexo-field"
      data-particle-profile={isMobile ? 'mobile' : 'desktop'}
      data-view-mode={viewMode}
      data-theme={themeName}
    >
      <div ref={mountRef} className="galaxy-three-mount" />
      <div className="galaxy-three-vignette" aria-hidden="true" />
      {isMacro && <div className="nexo-field-heading" aria-hidden="true"><strong>NEXO FIELD</strong><span>DOMÍNIOS · CONEXÕES · INTELIGÊNCIA EM CONTEXTO</span></div>}
      <div className={`galaxy-events${focusEvent && events.some(e => e.id === focusEvent.id) ? ' dimmed' : ''}`} aria-hidden="true">
        {events.map(event => (
          <span
            key={event.id}
            ref={element => { if (element) eventsRef.current.set(event.id, element); else eventsRef.current.delete(event.id); }}
            className={`galaxy-event${focusEvent?.id === event.id ? ' focused' : ''}`}
            data-kind={event.kind}
            data-tag-visible={visibleEventTagIds.has(event.id) ? 'true' : 'false'}
            title={event.label}
            style={{ '--event-intensity': event.intensity } as CSSProperties}
          >
            <button type="button" tabIndex={-1} className="galaxy-event-hit" onClick={() => onEventSelect?.(event.id)}>
              <EventGlyph kind={event.kind} />
            </button>
            <span className="galaxy-event-tag"><b>{EVENT_TAG[event.kind]}</b><span>{event.label}</span></span>
          </span>
        ))}
      </div>
      <div className="galaxy-three-labels" aria-hidden="true">
        {visibleLabels.map(node => (
          <span
            key={node.id}
            ref={element => {
              if (element) labelsRef.current.set(node.id, element);
              else labelsRef.current.delete(node.id);
            }}
            className={`galaxy-three-label${node.type === 'DOMAIN' ? ' domain' : ''}${node.type === 'CAMPAIGN' ? ' campaign' : ''}${node.id.startsWith('atlas.cluster.') ? ' cluster' : ''}${node.id === selectedId ? ' selected' : ''}`}
            data-domain={node.domain}
            data-state={stateClass(node.state)}
            style={{ '--galaxy-label-intensity': node.id === selectedId ? 1 : 0.72 } as CSSProperties}
          >
            <i className="node-status" aria-hidden="true" />
            <span className="node-label-copy">
              <strong>{node.type === 'DOMAIN' && node.domain === 'NEXO' ? 'NEXO' : node.label}</strong>
              {(node.type === 'DOMAIN' || node.type === 'CAMPAIGN' || node.id.startsWith('atlas.cluster.') || node.id === selectedId) && (
                <small>
                  {node.type === 'DOMAIN'
                    ? (node.member_count ?? 0) + ' ENTIDADES'
                    : node.type === 'CAMPAIGN'
                      ? (node.member_count ?? 0) + ' ITENS'
                      : node.type}
                </small>
              )}
            </span>
          </span>
        ))}
      </div>
      <div className="galaxy-three-status" aria-live="polite">
        <i aria-hidden="true" />
        <span>{nodes.length} nós · {edges.length} relações · FIELD</span>
      </div>
      <div className="galaxy-three-controls" role="group" aria-label="Controles do NEXO FIELD">
        <button type="button" onClick={reset}>NEXO</button>
        <button type="button" aria-label="Girar para a esquerda" onClick={() => controlsRef.current?.rotateLeft(0.28)}>←</button>
        <button type="button" aria-label="Girar para a direita" onClick={() => controlsRef.current?.rotateLeft(-0.28)}>→</button>
        <button type="button" aria-label="Aproximar" onClick={() => controlsRef.current?.dollyIn(1.18)}>+</button>
        <button type="button" aria-label="Afastar" onClick={() => controlsRef.current?.dollyOut(1.18)}>−</button>
      </div>
      <div className="galaxy-three-a11y-list" aria-label="Entidades do NEXO FIELD">
        {nodes.map(node => (
          <button key={node.id} type="button" onClick={() => onSelect(node.id)}>{node.label}</button>
        ))}
      </div>
    </div>
  );
});
