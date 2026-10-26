const input = document.querySelector('#term-search');
const cards = [...document.querySelectorAll('.entry')];
const letterGroups = [...document.querySelectorAll('.letter-group')];
const routes = [...document.querySelectorAll('.term-route')];
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const domainSelect = document.querySelector('#domain-filter');
const predicateSelect = document.querySelector('#predicate-filter');
const termSelect = document.querySelector('#term-filter');
const relationSearch = document.querySelector('#relation-search');
const connectedOnly = document.querySelector('#connected-only');
const relationStatus = document.querySelector('#relation-status');
const relationCount = document.querySelector('#relation-count');
const relationEmpty = document.querySelector('#relation-empty');
const relationRows = [...document.querySelectorAll('.relation-row')];
const stage = document.querySelector('#graph-stage');
const caption = document.querySelector('#graph-caption');
const graphPrev = document.querySelector('#graph-prev');
const graphNext = document.querySelector('#graph-next');
const graphPageStatus = document.querySelector('#graph-page-status');
const graph = JSON.parse(document.querySelector('#graph-data').textContent);
const normalize = value => value.normalize('NFKD').toLocaleLowerCase().replace(/\p{Diacritic}/gu, '').trim();
const indexed = cards.map(card => [card, normalize(card.textContent)]);
const byRelation = new Map(graph.relations.map(edge => [edge.relation_id, edge]));
const params = new URLSearchParams(location.search);
const pageSize = 24;
let graphPage = Math.max(0, Number.parseInt(params.get('map') ?? '1', 10) - 1 || 0);
const svgNS = 'http://www.w3.org/2000/svg';
const svgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
};

function draw(nodes, edges) {
  stage.replaceChildren();
  if (!nodes.length) return;
  const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(nodes.length))));
  const rows = Math.ceil(nodes.length / columns);
  const width = columns * 218 + 40;
  const height = rows * 116 + 36;
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, width, height,
    role: 'group', 'aria-label': `${nodes.length} ${nodes.length === 1 ? 'term' : 'terms'} and ${edges.length} ${edges.length === 1 ? 'relationship' : 'relationships'}` });
  const defs = svgElement('defs');
  const marker = svgElement('marker', { id: 'relation-arrow', viewBox: '0 0 10 10', refX: 8,
    refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#146653' }));
  defs.append(marker);
  svg.append(defs);
  const positions = new Map(nodes.map((id, index) => [id, {
    x: 22 + (index % columns) * 218, y: 20 + Math.floor(index / columns) * 116
  }]));
  for (const edge of edges) {
    const a = positions.get(edge.source.object_id);
    const b = positions.get(edge.target.object_id);
    if (!a || !b) continue;
    const line = svgElement('line', { x1: a.x + 84, y1: a.y + 29, x2: b.x + 84, y2: b.y + 29,
      class: `graph-edge ${edge.predicate}` });
    if (edge.predicate === 'is-a' || edge.direction === 'source-to-target') line.setAttribute('marker-end', 'url(#relation-arrow)');
    const title = svgElement('title');
    title.textContent = `${graph.terms[edge.source.object_id].headword} ${edge.label} ${graph.terms[edge.target.object_id].headword}`;
    line.append(title);
    svg.append(line);
  }
  for (const id of nodes) {
    const position = positions.get(id);
    const entry = graph.terms[id];
    if (!entry) continue;
    const link = svgElement('a', { href: `#${id}`, class: 'graph-node', tabindex: 0,
      'aria-label': `${entry.headword}, ${entry.scope}` });
    link.append(svgElement('rect', { x: position.x, y: position.y, width: 168, height: 58, rx: 4 }));
    const label = svgElement('text', { x: position.x + 10, y: position.y + 25 });
    label.textContent = entry.headword.length > 24 ? entry.headword.slice(0, 23) + '…' : entry.headword;
    const title = svgElement('title');
    title.textContent = `${entry.headword} — ${entry.scope}`;
    link.append(label, title);
    svg.append(link);
  }
  stage.append(svg);
}

function populateTerms(desired = '') {
  const current = desired || termSelect.value;
  const members = [...new Set(graph.relations.flatMap(edge => [edge.source.object_id, edge.target.object_id]))];
  members.sort((a, b) => graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en'));
  termSelect.replaceChildren(new Option('All connected terms', ''));
  for (const id of members) termSelect.add(new Option(graph.terms[id].headword, id));
  termSelect.value = members.includes(current) ? current : '';
  termSelect.disabled = members.length === 0;
}

function update({ resetPage = true } = {}) {
  connectedOnly.disabled = graph.relations.length === 0;
  if (resetPage) graphPage = 0;
  const predicate = predicateSelect.value;
  const domain = domainSelect.value;
  const focus = termSelect.value;
  const query = normalize(input.value);
  const relationQuery = normalize(relationSearch.value);
  const visibleEdges = graph.relations.filter(edge =>
    (!predicate || edge.predicate === predicate) &&
    (!domain || edge.domain === domain) &&
    (!focus || edge.source.object_id === focus || edge.target.object_id === focus) &&
    (!relationQuery || normalize(`${graph.terms[edge.source.object_id].headword} ${edge.predicate} ${graph.terms[edge.target.object_id].headword}`).includes(relationQuery)));
  const incident = new Set(visibleEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id]));
  const pages = Math.max(1, Math.ceil(visibleEdges.length / pageSize));
  graphPage = Math.min(graphPage, pages - 1);
  const pageEdges = visibleEdges.slice(graphPage * pageSize, (graphPage + 1) * pageSize);
  const selectedNodes = [...new Set(pageEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id]))]
    .sort((a, b) => graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en') || a.localeCompare(b));
  draw(selectedNodes, pageEdges);
  graphPrev.disabled = graphPage === 0;
  graphNext.disabled = graphPage + 1 >= pages;
  graphPageStatus.textContent = visibleEdges.length ? `Map section ${graphPage + 1} of ${pages}` : 'No map sections';
  for (const row of relationRows) {
    const edge = byRelation.get(row.dataset.relation);
    row.hidden = !edge || !visibleEdges.includes(edge);
  }
  const visibleRows = visibleEdges.length;
  relationCount.textContent = String(visibleRows);
  relationEmpty.hidden = visibleRows !== 0;
  relationStatus.textContent = `${visibleRows} working ${visibleRows === 1 ? 'relationship' : 'relationships'}`;
  caption.textContent = visibleRows ?
    `Map section ${graphPage + 1} shows ${pageEdges.length} of ${visibleRows} matching relationships. Use the list to access every match.` :
    'No relationships match these filters.';
  let shown = 0;
  for (const [card, content] of indexed) {
    const matches = (!connectedOnly.checked || incident.has(card.id)) &&
      (!query || content.includes(query));
    card.hidden = !matches;
    if (matches) shown += 1;
  }
  for (const group of letterGroups) {
    const count = [...group.querySelectorAll('.entry')].filter(card => !card.hidden).length;
    group.hidden = count === 0;
    group.querySelector('.letter-count').textContent = `${count} ${count === 1 ? 'term' : 'terms'}`;
    if (count && query) group.open = true;
  }
  let routed = 0;
  for (const route of routes) {
    const matches = !!query && normalize(route.dataset.headword).includes(query);
    route.hidden = !matches;
    if (matches) routed += 1;
  }
  status.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'} available${routed ? ` · ${routed} related term ${routed === 1 ? 'route' : 'routes'}` : ''}`;
  empty.hidden = shown !== 0 || routed !== 0;
  const next = new URL(location.href);
  for (const key of ['cluster', 'relation', 'term', 'connected', 'q', 'status', 'domain', 'rq', 'map']) next.searchParams.delete(key);
  if (predicate) next.searchParams.set('relation', predicate);
  if (domain) next.searchParams.set('domain', domain);
  if (focus) next.searchParams.set('term', focus);
  if (connectedOnly.checked) next.searchParams.set('connected', '1');
  if (input.value) next.searchParams.set('q', input.value);
  if (relationSearch.value) next.searchParams.set('rq', relationSearch.value);
  if (graphPage) next.searchParams.set('map', String(graphPage + 1));
  history.replaceState(null, '', next);
}

predicateSelect.value = graph.relations.some(edge => edge.predicate === params.get('relation')) ? params.get('relation') : '';
domainSelect.value = graph.relations.some(edge => edge.domain === params.get('domain')) ? params.get('domain') : '';
connectedOnly.checked = params.get('connected') === '1';
input.value = params.get('q') ?? '';
relationSearch.value = params.get('rq') ?? '';
populateTerms(params.get('term') ?? '');
for (const control of [domainSelect, predicateSelect, termSelect, connectedOnly, input, relationSearch])
  control.addEventListener('input', () => update());
graphPrev.addEventListener('click', () => { graphPage -= 1; update({ resetPage: false }); });
graphNext.addEventListener('click', () => { graphPage += 1; update({ resetPage: false }); });
document.querySelector('#expand-letters').addEventListener('click', () => {
  for (const group of letterGroups) if (!group.hidden) group.open = true;
});
document.querySelector('#collapse-letters').addEventListener('click', () => {
  for (const group of letterGroups) group.open = false;
});
function revealHash() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  if (target.hidden || target.closest('.letter-group')?.hidden) {
    connectedOnly.checked = false;
    input.value = '';
    update();
  }
  const group = target.classList.contains('letter-group') ? target : target.closest('.letter-group');
  if (group) {
    group.hidden = false;
    group.open = true;
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
window.addEventListener('hashchange', revealHash);
update({ resetPage: false });
if (location.hash) revealHash();
