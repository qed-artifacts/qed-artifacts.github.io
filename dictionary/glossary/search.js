const input = document.querySelector('#term-search');
const cards = [...document.querySelectorAll('.entry')];
const routes = [...document.querySelectorAll('.term-route')];
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const clusterSelect = document.querySelector('#cluster-filter');
const predicateSelect = document.querySelector('#predicate-filter');
const termSelect = document.querySelector('#term-filter');
const connectedOnly = document.querySelector('#connected-only');
const relationStatus = document.querySelector('#relation-status');
const relationCount = document.querySelector('#relation-count');
const relationEmpty = document.querySelector('#relation-empty');
const relationRows = [...document.querySelectorAll('.relation-row')];
const stage = document.querySelector('#graph-stage');
const caption = document.querySelector('#graph-caption');
const graph = JSON.parse(document.querySelector('#graph-data').textContent);
const normalize = value => value.normalize('NFKD').toLocaleLowerCase().replace(/\p{Diacritic}/gu, '').trim();
const indexed = cards.map(card => [card, normalize(card.textContent)]);
const entryText = new Map(indexed.map(([card, content]) => [card.id, content]));
const byCluster = new Map(graph.clusters.map(cluster => [cluster.cluster_id, cluster]));
const byRelation = new Map(graph.relations.map(edge => [edge.relation_id, edge]));
const params = new URLSearchParams(location.search);
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
    role: 'group', 'aria-label': `${nodes.length} ${nodes.length === 1 ? 'term' : 'terms'} and ${edges.length} reviewed ${edges.length === 1 ? 'relationship' : 'relationships'}` });
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
    if (edge.predicate === 'is-a') line.setAttribute('marker-end', 'url(#relation-arrow)');
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

function populateTerms(cluster, desired = '') {
  const current = desired || termSelect.value;
  const members = cluster ? cluster.members.map(item => item.object_id) : [];
  termSelect.replaceChildren(new Option('All cluster terms', ''));
  for (const id of members) termSelect.add(new Option(graph.terms[id].headword, id));
  termSelect.value = members.includes(current) ? current : '';
  termSelect.disabled = !cluster;
}

function update({ preserveTerm = true } = {}) {
  const cluster = byCluster.get(clusterSelect.value);
  if (!preserveTerm) populateTerms(cluster);
  if (!cluster) connectedOnly.checked = false;
  connectedOnly.disabled = !cluster;
  const predicate = predicateSelect.value;
  const focus = termSelect.value;
  const query = normalize(input.value);
  const members = new Set(cluster?.members.map(item => item.object_id) ?? []);
  const edges = graph.relations.filter(edge => (!predicate || edge.predicate === predicate) &&
    (!cluster || members.has(edge.source.object_id) || members.has(edge.target.object_id)));
  const focused = focus ? new Set([focus, ...edges.filter(edge =>
    edge.source.object_id === focus || edge.target.object_id === focus)
    .flatMap(edge => [edge.source.object_id, edge.target.object_id])]) : null;
  const visibleEdges = focused ? edges.filter(edge => focused.has(edge.source.object_id) &&
    focused.has(edge.target.object_id)) : edges;
  const incident = new Set(visibleEdges.flatMap(edge => [edge.source.object_id, edge.target.object_id]));
  const candidateNodes = cluster ? new Set([...members, ...incident]) : new Set();
  const selectedNodes = [...candidateNodes].filter(id =>
    (!focused || focused.has(id)) && (!connectedOnly.checked || incident.has(id)) &&
    (!query || entryText.get(id)?.includes(query)));
  selectedNodes.sort((a, b) => graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en') || a.localeCompare(b));
  const nodeSet = new Set(selectedNodes);
  const drawnEdges = visibleEdges.filter(edge => nodeSet.has(edge.source.object_id) && nodeSet.has(edge.target.object_id));
  draw(selectedNodes, drawnEdges);
  for (const row of relationRows) {
    const edge = byRelation.get(row.dataset.relation);
    row.hidden = !edge || (cluster && !members.has(edge.source.object_id) && !members.has(edge.target.object_id)) ||
      (predicate && edge.predicate !== predicate) ||
      (focus && edge.source.object_id !== focus && edge.target.object_id !== focus) ||
      (cluster && !drawnEdges.includes(edge)) ||
      (query && !normalize(`${graph.terms[edge.source.object_id].headword} ${graph.terms[edge.target.object_id].headword}`).includes(query));
  }
  const visibleRows = relationRows.filter(row => !row.hidden).length;
  relationCount.textContent = String(visibleRows);
  relationEmpty.hidden = visibleRows !== 0;
  relationStatus.textContent = cluster ? `${selectedNodes.length} ${selectedNodes.length === 1 ? 'term' : 'terms'} · ${drawnEdges.length} reviewed ${drawnEdges.length === 1 ? 'relationship' : 'relationships'}` :
    `${graph.clusters.length} reviewed ${graph.clusters.length === 1 ? 'cluster' : 'clusters'} · ${graph.relations.length} reviewed ${graph.relations.length === 1 ? 'relationship' : 'relationships'}`;
  caption.textContent = cluster ? `${cluster.title}: ${cluster.description} Solid arrows mean “is a kind of”; dashed lines mean “distinguished from”.` :
    graph.clusters.length ? 'Choose a reviewed cluster to see its map. All released entries are listed below.' :
      'No reviewed relation cluster has been released yet. The full glossary remains available below.';
  let shown = 0;
  for (const [card, content] of indexed) {
    const matches = (!cluster || nodeSet.has(card.id)) && (!query || content.includes(query));
    card.hidden = !matches;
    if (matches) shown += 1;
  }
  let routed = 0;
  for (const route of routes) {
    const matches = !!query && normalize(route.dataset.headword).includes(query);
    route.hidden = !matches;
    if (matches) routed += 1;
  }
  status.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'} shown${routed ? ` · ${routed} related term ${routed === 1 ? 'route' : 'routes'}` : ''}`;
  empty.hidden = shown !== 0 || routed !== 0;
  const next = new URL(location.href);
  for (const key of ['cluster', 'relation', 'term', 'connected', 'q']) next.searchParams.delete(key);
  if (clusterSelect.value) next.searchParams.set('cluster', clusterSelect.value);
  if (predicate) next.searchParams.set('relation', predicate);
  if (focus) next.searchParams.set('term', focus);
  if (connectedOnly.checked) next.searchParams.set('connected', '1');
  if (input.value) next.searchParams.set('q', input.value);
  history.replaceState(null, '', next);
}

clusterSelect.value = byCluster.has(params.get('cluster')) ? params.get('cluster') : (graph.clusters[0]?.cluster_id ?? '');
predicateSelect.value = ['is-a', 'distinguished-from'].includes(params.get('relation')) ? params.get('relation') : '';
connectedOnly.checked = params.get('connected') === '1';
input.value = params.get('q') ?? '';
populateTerms(byCluster.get(clusterSelect.value), params.get('term') ?? '');
clusterSelect.addEventListener('change', () => update({ preserveTerm: false }));
for (const control of [predicateSelect, termSelect, connectedOnly, input]) control.addEventListener('input', () => update());
update();
