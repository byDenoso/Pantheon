const MAX_HISTORY = 64;

const cloneRecord = value => value && typeof value === 'object' && !Array.isArray(value) ? {...value} : {};
const cloneList = value => Array.isArray(value) ? [...value] : [];

export function captureFrame(input = {}) {
  return {
    rootNode: String(input.rootNode || input.focusId || 'system:NEXO'),
    selectedNode: input.selectedNode == null ? null : String(input.selectedNode),
    camera: cloneRecord(input.camera),
    zoom: Number.isFinite(Number(input.zoom)) ? Number(input.zoom) : 1,
    yaw: Number.isFinite(Number(input.yaw)) ? Number(input.yaw) : 0,
    pitch: Number.isFinite(Number(input.pitch)) ? Number(input.pitch) : 0,
    filters: cloneRecord(input.filters),
    expandedRelations: cloneList(input.expandedRelations),
    visibleLayers: cloneList(input.visibleLayers),
    timestamp: Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now()
  };
}

export function createNavigationState(initial = {}) {
  const frame = captureFrame(initial);
  return {navigationStack:[frame], navigationIndex:0, frame};
}

export function pushFrame(state, frame, maxHistory = MAX_HISTORY) {
  const nextFrame = captureFrame(frame);
  const current = state?.navigationStack?.[state.navigationIndex] || null;
  const sameContext = current && current.rootNode === nextFrame.rootNode && current.selectedNode === nextFrame.selectedNode;
  let stack = Array.isArray(state?.navigationStack) ? state.navigationStack.slice(0, Number(state.navigationIndex) + 1) : [];
  if (sameContext) stack[stack.length - 1] = nextFrame;
  else stack.push(nextFrame);
  const cap = Math.max(2, Number(maxHistory) || MAX_HISTORY);
  if (stack.length > cap) stack = stack.slice(stack.length - cap);
  const navigationIndex = stack.length - 1;
  return {navigationStack:stack, navigationIndex, frame:stack[navigationIndex]};
}

export function restoreFrame(state, index) {
  const stack = Array.isArray(state?.navigationStack) ? state.navigationStack : [];
  if (!stack.length) return {state:createNavigationState(), frame:null};
  const navigationIndex = Math.max(0, Math.min(stack.length - 1, Number(index) || 0));
  const frame = stack[navigationIndex];
  return {state:{navigationStack:stack, navigationIndex, frame}, frame};
}

export function goBack(state) {
  return restoreFrame(state, Math.max(0, Number(state?.navigationIndex || 0) - 1));
}

export function goForward(state) {
  return restoreFrame(state, Math.min((state?.navigationStack?.length || 1) - 1, Number(state?.navigationIndex || 0) + 1));
}
