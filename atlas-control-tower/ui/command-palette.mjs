/** Command palette (⌘K / Ctrl+K).
 *
 *  One text field over two different things: commands, which are known up front,
 *  and entities, which are not. Entity results are read from the projection that
 *  is already on screen — the palette never issues a search the map cannot
 *  explain, so every result it offers is a node you can actually navigate to. */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Subsequence match: "dmco" finds "Domínio Cosmologia". Returns a score, or
 *  -1 for no match, so ranking and filtering are one pass. */
export function fuzzyScore(text, query) {
 const haystack = String(text || '').toLowerCase();
 const needle = String(query || '').toLowerCase().trim();
 if (!needle) return 0;
 if (haystack.includes(needle)) return 1000 - haystack.indexOf(needle) - haystack.length * 0.01;
 let score = 0, at = 0, streak = 0;
 for (const ch of needle) {
  const found = haystack.indexOf(ch, at);
  if (found < 0) return -1;
  streak = found === at ? streak + 1 : 0;
  score += 10 + streak * 4 - Math.min(8, found - at);
  at = found + 1;
 }
 return score - haystack.length * 0.02;
}

export function rankCommands(commands, query, limit = 8) {
 return commands
  .map(c => ({...c, score: Math.max(fuzzyScore(c.title, query), fuzzyScore(c.keywords || '', query) - 40)}))
  .filter(c => c.score >= 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);
}

export function rankEntities(nodes, query, limit = 12) {
 if (!query.trim()) return [];
 return nodes
  .map(n => ({node: n, score: Math.max(
    fuzzyScore(n.displayLabel || n.label || '', query),
    fuzzyScore(n.id, query) - 30,
    fuzzyScore(n.summary || '', query) - 120)}))
  .filter(x => x.score >= 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);
}

export function createPalette({root, input, list, getNodes, commands = [], onRun, onSelect}) {
 if (!root || !input || !list) return {open() {}, close() {}, isOpen: () => false};
 let items = [];
 let cursor = 0;
 let open = false;

 function render() {
  const query = input.value;
  const matchedCommands = rankCommands(commands, query);
  const matchedEntities = rankEntities(getNodes?.() || [], query);
  items = [
   ...matchedCommands.map(c => ({kind: 'command', id: c.id, title: c.title, hint: c.hint || '', run: () => onRun?.(c)})),
   ...matchedEntities.map(({node}) => ({
    kind: 'entity', id: node.id,
    title: node.displayLabel || node.label || node.id,
    hint: `${node.tier || node.type || ''}${node.layer ? ` · ${node.layer}` : ''}`,
    tone: node.signal || 'unknown',
    run: () => onSelect?.(node)
   }))
  ];
  cursor = Math.max(0, Math.min(cursor, items.length - 1));

  if (!items.length) {
   list.innerHTML = query.trim()
    ? `<li class="cp-empty">Nada corresponde a <b>${esc(query)}</b> no recorte atual. Amplie o zoom semântico ou ligue outra camada.</li>`
    : '<li class="cp-empty">Digite para buscar comandos e entidades desta projeção.</li>';
   return;
  }
  list.innerHTML = items.map((item, i) => `
   <li class="cp-item${i === cursor ? ' is-active' : ''}" data-index="${i}" role="option" aria-selected="${i === cursor}">
    <span class="cp-kind" data-kind="${esc(item.kind)}"${item.tone ? ` data-tone="${esc(item.tone)}"` : ''}>${item.kind === 'command' ? '⌘' : '◉'}</span>
    <span class="cp-title">${esc(item.title)}</span>
    ${item.hint ? `<span class="cp-hint">${esc(item.hint)}</span>` : ''}
   </li>`).join('');
  for (const li of list.querySelectorAll('.cp-item')) {
   li.onmouseenter = () => {cursor = Number(li.dataset.index); paint()};
   li.onclick = () => run();
  }
 }

 function paint() {
  for (const li of list.querySelectorAll('.cp-item')) {
   const on = Number(li.dataset.index) === cursor;
   li.classList.toggle('is-active', on);
   li.setAttribute('aria-selected', String(on));
   if (on) li.scrollIntoView({block: 'nearest'});
  }
 }

 function run() {
  const item = items[cursor];
  if (!item) return;
  api.close();
  item.run();
 }

 const api = {
  isOpen: () => open,
  open() {
   open = true;
   root.hidden = false;
   root.classList.add('is-open');
   input.value = '';
   cursor = 0;
   render();
   input.focus();
  },
  close() {
   open = false;
   root.classList.remove('is-open');
   root.hidden = true;
  },
  toggle() {open ? api.close() : api.open()},
  refresh: render
 };

 input.addEventListener('input', () => {cursor = 0; render()});
 input.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown') {event.preventDefault(); cursor = Math.min(items.length - 1, cursor + 1); paint()}
  else if (event.key === 'ArrowUp') {event.preventDefault(); cursor = Math.max(0, cursor - 1); paint()}
  else if (event.key === 'Enter') {event.preventDefault(); run()}
  else if (event.key === 'Escape') {event.preventDefault(); api.close()}
 });
 root.addEventListener('pointerdown', event => {if (event.target === root) api.close()});

 return api;
}
