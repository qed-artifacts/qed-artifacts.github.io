const input = document.querySelector('#term-search');
const cards = [...document.querySelectorAll('.entry')];
const letterGroups = [...document.querySelectorAll('.letter-group')];
const routes = [...document.querySelectorAll('.term-route')];
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const domainSelect = document.querySelector('#domain-filter');
const predicateSelect = document.querySelector('#predicate-filter');
const modalitySelect = document.querySelector('#modality-filter');
const termSelect = document.querySelector('#term-filter');
const relationSearch = document.querySelector('#relation-search');
const connectedOnly = document.querySelector('#connected-only');
const coverageOnly = document.querySelector('#coverage-only');
const coveragePanel = document.querySelector('#coverage-panel');
const layerInputs = [...document.querySelectorAll('input[name="map-layer"]')];
const relationStatus = document.querySelector('#relation-status');
const relationCount = document.querySelector('#relation-count');
const relationEmpty = document.querySelector('#relation-empty');
const relationDetails = document.querySelector('#relation-details');
const relationRows = [...document.querySelectorAll('.relation-row')];
const stage = document.querySelector('#graph-stage');
const caption = document.querySelector('#graph-caption');
const graph = JSON.parse(document.querySelector('#graph-data').textContent);
const navigation = graph.navigation ?? { definition_routes: [], coverage_ids: [], quality_anchor: '' };
const coverageIds = new Set(navigation.coverage_ids);
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
  const layer = layerInputs.find(control => control.checked)?.value ?? 'meaning';
  const inNavigation = layer === 'navigation';
  coveragePanel.hidden = !inNavigation;
  domainSelect.disabled = inNavigation;
  predicateSelect.disabled = inNavigation;
  modalitySelect.disabled = inNavigation;
  if (inNavigation && !termSelect.value && graph.terms[navigation.quality_anchor]) {
    termSelect.value = navigation.quality_anchor;
  }
  const layerEdges = inNavigation ? navigation.definition_routes : graph.relations;
  connectedOnly.disabled = layerEdges.length === 0 || !termSelect.value;
  if (connectedOnly.disabled) connectedOnly.checked = false;
  const predicate = predicateSelect.value;
  const domain = domainSelect.value;
  const modality = modalitySelect.value;
  const focus = termSelect.value;
  const query = normalize(input.value);
  const relationQuery = normalize(relationSearch.value);
  const visibleEdges = layerEdges.filter(edge =>
    (inNavigation || !predicate || edge.predicate === predicate) &&
    (inNavigation || !domain || edge.domain === domain) &&
    (inNavigation || !modality || edge.modality === modality) &&
    (!relationQuery || normalize(`${graph.terms[edge.source.object_id].headword} ${edge.label} ${graph.terms[edge.target.object_id].headword}`).includes(relationQuery)));
  const focusEdges = visibleEdges.filter(edge => edge.source.object_id === focus || edge.target.object_id === focus);
  const mapKey = `${layer}\u0000${focus}\u0000${domain}\u0000${predicate}\u0000${modality}\u0000${relationQuery}`;
  if (mapKey !== previousMapKey) {
    map.update(focus, visibleEdges, layer);
    previousMapKey = mapKey;
  }
  const visibleIds = new Set(visibleEdges.map(edge => edge.relation_id));
  for (const row of relationRows) row.hidden = (row.dataset.layer ?? 'meaning') !== layer ||
    !visibleIds.has(row.dataset.relation);
  relationCount.textContent = String(visibleEdges.length);
  relationEmpty.hidden = visibleEdges.length !== 0;
  relationStatus.textContent = inNavigation ?
    `${visibleEdges.length} Studio reference ${visibleEdges.length === 1 ? 'route' : 'routes'} · ${coverageIds.size} coverage candidates` :
    `${visibleEdges.length} working ${visibleEdges.length === 1 ? 'relationship' : 'relationships'}`;
  caption.textContent = focus ?
    `${focusEdges.length} direct ${inNavigation ? 'Studio draft reference' : 'working relationship'}${focusEdges.length === 1 ? '' : 's'} for ${graph.terms[focus].headword}. All ${termIds.length} released terms remain on the map; the list below contains all ${visibleEdges.length} matching ${inNavigation ? 'routes' : 'relationships'}.` :
    `All ${termIds.length} released terms are on the map. Select a dot or use Map focus to reveal its connections; the list below contains ${visibleEdges.length} matching ${inNavigation ? 'routes' : 'relationships'}.`;
  if (relationQuery) relationDetails.open = true;
  const incident = new Set([focus, ...focusEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id])]);
  let shown = 0;
  for (const [card, content] of indexed) {
    const matches = (!connectedOnly.checked || incident.has(card.id)) &&
      (!inNavigation || !coverageOnly.checked || coverageIds.has(card.id)) &&
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
  for (const key of ['cluster', 'relation', 'term', 'connected', 'q', 'status', 'domain', 'modality', 'rq', 'map']) next.searchParams.delete(key);
  if (predicate) next.searchParams.set('relation', predicate);
  if (domain) next.searchParams.set('domain', domain);
  if (!inNavigation && modality) next.searchParams.set('modality', modality);
  if (focus) next.searchParams.set('term', focus);
  if (connectedOnly.checked) next.searchParams.set('connected', '1');
  if (input.value) next.searchParams.set('q', input.value);
  if (relationSearch.value) next.searchParams.set('rq', relationSearch.value);
  if (inNavigation) next.searchParams.set('map', 'navigation');
  history.replaceState(null, '', next);
}

predicateSelect.value = graph.relations.some(edge => edge.predicate === params.get('relation')) ? params.get('relation') : '';
domainSelect.value = graph.relations.some(edge => edge.domain === params.get('domain')) ? params.get('domain') : '';
modalitySelect.value = ['asserted', 'possible'].includes(params.get('modality')) ? params.get('modality') : '';
connectedOnly.checked = params.get('connected') === '1';
input.value = params.get('q') ?? '';
relationSearch.value = params.get('rq') ?? '';
if (params.get('map') === 'navigation') {
  const option = layerInputs.find(control => control.value === 'navigation');
  if (option) option.checked = true;
}
for (const control of [domainSelect, predicateSelect, modalitySelect, termSelect, connectedOnly, coverageOnly,
  input, relationSearch, ...layerInputs])
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
