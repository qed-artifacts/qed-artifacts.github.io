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
const relationDetails = document.querySelector('#relation-details');
const relationRows = [...document.querySelectorAll('.relation-row')];
const stage = document.querySelector('#graph-stage');
const caption = document.querySelector('#graph-caption');
const graph = JSON.parse(document.querySelector('#graph-data').textContent);
const normalize = value => value.normalize('NFKD').toLocaleLowerCase().replace(/\p{Diacritic}/gu, '').trim();
const indexed = cards.map(card => [card, normalize(card.textContent)]);
const params = new URLSearchParams(location.search);
const degree = new Map();
for (const edge of graph.relations) {
  for (const id of [edge.source.object_id, edge.target.object_id]) degree.set(id, (degree.get(id) || 0) + 1);
}
const connectedTerms = [...degree.keys()].sort((a, b) =>
  graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en') || a.localeCompare(b));
const defaultFocus = [...connectedTerms].sort((a, b) =>
  degree.get(b) - degree.get(a) || graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en'))[0] || '';

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function endpoints(edge) {
  return edge.direction === 'target-to-source' ?
    [edge.target.object_id, edge.source.object_id] :
    [edge.source.object_id, edge.target.object_id];
}

function rail(title, items, incoming) {
  const section = element('section', `focus-rail ${incoming ? 'incoming' : 'outgoing'}`);
  section.append(element('h3', '', `${title} (${items.length})`));
  if (!items.length) {
    section.append(element('p', 'rail-empty', 'No matching relationships.'));
    return section;
  }
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.edge.predicate)) groups.set(item.edge.predicate, []);
    groups.get(item.edge.predicate).push(item);
  }
  for (const predicate of [...groups.keys()].sort()) {
    const group = element('div', 'focus-relation-group');
    group.append(element('h4', '', predicate.replaceAll('-', ' ')));
    const list = element('ul', 'focus-neighbors');
    for (const { edge, other } of groups.get(predicate).sort((a, b) =>
      graph.terms[a.other].headword.localeCompare(graph.terms[b.other].headword, 'en'))) {
      const name = graph.terms[other].headword;
      const item = element('li', 'focus-neighbor');
      const button = element('button', 'neighbor-focus', name);
      button.type = 'button';
      button.setAttribute('aria-label', `Focus map on ${name}`);
      button.addEventListener('click', () => { termSelect.value = other; update(); });
      const link = element('a', 'neighbor-definition', 'Definition');
      link.href = `#${other}`;
      link.setAttribute('aria-label', `Read definition of ${name}`);
      const arrow = element('span', 'neighbor-direction', '→');
      arrow.setAttribute('aria-hidden', 'true');
      if (incoming) item.append(button, arrow);
      else item.append(arrow, button);
      if (edge.modality === 'possible') item.append(element('span', 'modality-label', 'possible'));
      item.append(link);
      list.append(item);
    }
    group.append(list);
    section.append(group);
  }
  return section;
}

function draw(focus, edges) {
  stage.replaceChildren();
  if (!focus || !graph.terms[focus]) {
    stage.append(element('p', 'map-empty', 'No connected terms are available.'));
    return;
  }
  const name = graph.terms[focus].headword;
  const incoming = [], outgoing = [];
  for (const edge of edges) {
    const [from, to] = endpoints(edge);
    if (to === focus) incoming.push({ edge, other: from });
    if (from === focus) outgoing.push({ edge, other: to });
  }
  const layout = element('div', 'focus-layout');
  const center = element('div', 'focus-center');
  const node = element('div', 'focus-node');
  node.append(element('span', 'focus-label', 'Focused term'));
  node.append(element('strong', '', name));
  const definition = element('a', '', 'Read definition');
  definition.href = `#${focus}`;
  node.append(definition);
  center.append(node);
  layout.append(rail('Points to this term', incoming, true), center,
    rail('From this term', outgoing, false));
  stage.append(layout);
  stage.setAttribute('aria-label', `${name}: ${incoming.length} incoming and ${outgoing.length} outgoing relationships`);
}

termSelect.replaceChildren();
for (const id of connectedTerms) termSelect.add(new Option(graph.terms[id].headword, id));
termSelect.value = connectedTerms.includes(params.get('term')) ? params.get('term') : defaultFocus;
termSelect.disabled = connectedTerms.length === 0;

function update() {
  connectedOnly.disabled = graph.relations.length === 0;
  const predicate = predicateSelect.value;
  const domain = domainSelect.value;
  const focus = termSelect.value;
  const query = normalize(input.value);
  const relationQuery = normalize(relationSearch.value);
  const visibleEdges = graph.relations.filter(edge =>
    (!predicate || edge.predicate === predicate) &&
    (!domain || edge.domain === domain) &&
    (!relationQuery || normalize(`${graph.terms[edge.source.object_id].headword} ${edge.label} ${graph.terms[edge.target.object_id].headword}`).includes(relationQuery)));
  const focusEdges = visibleEdges.filter(edge => edge.source.object_id === focus || edge.target.object_id === focus);
  draw(focus, focusEdges);
  const visibleIds = new Set(visibleEdges.map(edge => edge.relation_id));
  for (const row of relationRows) row.hidden = !visibleIds.has(row.dataset.relation);
  relationCount.textContent = String(visibleEdges.length);
  relationEmpty.hidden = visibleEdges.length !== 0;
  relationStatus.textContent = `${visibleEdges.length} working ${visibleEdges.length === 1 ? 'relationship' : 'relationships'}`;
  caption.textContent = focus ?
    `${focusEdges.length} direct ${focusEdges.length === 1 ? 'relationship' : 'relationships'} for ${graph.terms[focus].headword}. The list below contains all ${visibleEdges.length} relationships matching the domain, type, and search filters.` :
    'No connected terms are available.';
  if (relationQuery) relationDetails.open = true;
  const incident = new Set(focusEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id]));
  let shown = 0;
  for (const [card, content] of indexed) {
    const matches = (!connectedOnly.checked || incident.has(card.id)) && (!query || content.includes(query));
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
  if (focus && focus !== defaultFocus) next.searchParams.set('term', focus);
  if (connectedOnly.checked) next.searchParams.set('connected', '1');
  if (input.value) next.searchParams.set('q', input.value);
  if (relationSearch.value) next.searchParams.set('rq', relationSearch.value);
  history.replaceState(null, '', next);
}

predicateSelect.value = graph.relations.some(edge => edge.predicate === params.get('relation')) ? params.get('relation') : '';
domainSelect.value = graph.relations.some(edge => edge.domain === params.get('domain')) ? params.get('domain') : '';
connectedOnly.checked = params.get('connected') === '1';
input.value = params.get('q') ?? '';
relationSearch.value = params.get('rq') ?? '';
for (const control of [domainSelect, predicateSelect, termSelect, connectedOnly, input, relationSearch])
  control.addEventListener('input', update);
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
  if (group) { group.hidden = false; group.open = true; }
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
}
window.addEventListener('hashchange', revealHash);
update();
if (location.hash) revealHash();
