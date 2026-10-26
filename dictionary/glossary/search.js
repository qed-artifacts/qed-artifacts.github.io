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
const termIds = Object.keys(graph.terms).sort((a, b) =>
  graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en') ||
  (graph.terms[a].scope ?? '').localeCompare(graph.terms[b].scope ?? '', 'en') || a.localeCompare(b));
termSelect.replaceChildren();
termSelect.add(new Option('Overview · all released terms', ''));
for (const id of termIds) termSelect.add(new Option(`${graph.terms[id].headword}${graph.terms[id].scope ? ` · ${graph.terms[id].scope}` : ''}`, id));
termSelect.value = graph.terms[params.get('term')] ? params.get('term') : '';
const map = window.GlossaryMap.createMap(stage, graph, id => { termSelect.value = id; update(); });
let previousMapKey = '';

function update() {
  connectedOnly.disabled = graph.relations.length === 0 || !termSelect.value;
  if (connectedOnly.disabled) connectedOnly.checked = false;
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
  const mapKey = `${focus}\u0000${domain}\u0000${predicate}\u0000${relationQuery}`;
  if (mapKey !== previousMapKey) {
    map.update(focus, visibleEdges);
    previousMapKey = mapKey;
  }
  const visibleIds = new Set(visibleEdges.map(edge => edge.relation_id));
  for (const row of relationRows) row.hidden = !visibleIds.has(row.dataset.relation);
  relationCount.textContent = String(visibleEdges.length);
  relationEmpty.hidden = visibleEdges.length !== 0;
  relationStatus.textContent = `${visibleEdges.length} working ${visibleEdges.length === 1 ? 'relationship' : 'relationships'}`;
  caption.textContent = focus ?
    `${focusEdges.length} direct ${focusEdges.length === 1 ? 'relationship' : 'relationships'} for ${graph.terms[focus].headword}. All ${termIds.length} released terms remain on the map; the list below contains all ${visibleEdges.length} matching relationships.` :
    `All ${termIds.length} released terms are on the map. Select a dot or use Map focus to reveal its connections; the list below contains ${visibleEdges.length} matching relationships.`;
  if (relationQuery) relationDetails.open = true;
  const incident = new Set([focus, ...focusEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id])]);
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
  if (focus) next.searchParams.set('term', focus);
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
