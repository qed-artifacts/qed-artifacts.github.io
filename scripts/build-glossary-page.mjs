import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildConstellationLayout } from './glossary-constellation-layout.mjs';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};
const source = option('--source');
const tag = option('--tag');
const outputOption = option('--output');
const check = args.includes('--check');
if (!source || !tag || !/^glossary-[a-z0-9-]+$/.test(tag) ||
    args.some(arg => arg.startsWith('--') && !['--source', '--tag', '--check', '--output'].includes(arg)) ||
    !args.every((arg, index) => !['--source', '--tag', '--output'].includes(arg) || args[index + 1])) {
  throw Error('Usage: node scripts/build-glossary-page.mjs --source PUBLIC_CONTENT_CHECKOUT --tag GLOSSARY_TAG [--output SITE_FILE] [--check]');
}
const sourceRoot = path.resolve(source);
const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: sourceRoot, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
if (git('status', '--porcelain')) {
  throw Error('The public content checkout has uncommitted changes; compile from an exact clean release');
}
if (!git('tag', '--points-at', 'HEAD').split(/\r?\n/).includes(tag)) {
  throw Error(`The public content checkout HEAD is not tagged ${tag}`);
}
execFileSync(process.execPath, ['scripts/validate.mjs'], { cwd: sourceRoot, stdio: 'pipe' });
const catalog = JSON.parse(await fs.readFile(path.join(sourceRoot, 'catalog.json'), 'utf8'));
let navigation = { schema: 'qed-glossary-public-navigation-v1', routes: [] };
try {
  navigation = JSON.parse(await fs.readFile(path.join(sourceRoot, 'navigation.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let graph = { schema: 'qed-glossary-public-relations-v1', clusters: [], relations: [] };
try {
  graph = JSON.parse(await fs.readFile(path.join(sourceRoot, 'relations', 'graph.v1.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let working = { edges: [], holds: { endpoint_reconciliation: 0, unresolved_predicate: 0, already_reviewed: 0, duplicate_working: 0 }, adopted_total: 0 };
try {
  working = JSON.parse(await fs.readFile(path.join(sourceRoot, 'relations', 'studio-working.v1.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let studioNav = { definition_routes: [], coverage: { targets: [] } };
try {
  studioNav = JSON.parse(await fs.readFile(path.join(sourceRoot, 'relations', 'studio-navigation.v1.json'), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const objects = [];
for (const pointer of catalog.entries) {
  if (!/^entries\/[a-z0-9-]+\/[a-z0-9-]+\/revision\.glossary\.[a-f0-9]{24}\.json$/.test(pointer.path)) {
    throw Error(`Invalid public entry path: ${pointer.path}`);
  }
  const item = JSON.parse(await fs.readFile(path.join(sourceRoot, pointer.path), 'utf8'));
  if (item.object_id !== pointer.object_id || item.revision_id !== pointer.revision_id ||
      item.content_license !== 'CC0-1.0' || !item.review?.owner_release_authorization) {
    throw Error(`Public object differs from catalog or release scope: ${pointer.path}`);
  }
  objects.push({ ...item, path: pointer.path });
}
objects.sort((a, b) => a.headword.localeCompare(b.headword, 'en', { sensitivity: 'base' }) ||
  a.scope_label.localeCompare(b.scope_label, 'en', { sensitivity: 'base' }) || a.object_id.localeCompare(b.object_id));
const byId = new Map(objects.map(item => [item.object_id, item]));
const relations = working.edges.map(edge => ({ relation_id: edge.edge_id, source: edge.source, target: edge.target,
  predicate: edge.predicate, label: edge.predicate.replaceAll('-', ' '),
  domain: edge.domain, modality: edge.modality, direction: edge.direction,
  scope: edge.scope }));
const referenceRoutes = studioNav.definition_routes.map(route => ({
  relation_id: route.source_edge_ids[0], source: route.source, target: route.target,
  predicate: route.predicate, label: 'references in Studio draft',
  domain: 'editorial navigation', modality: route.modality, direction: route.direction,
  standing: route.standing
}));
const coverageIds = studioNav.coverage.targets.map(item => item.target.object_id);
const predicates = [...new Set(relations.map(edge => edge.predicate))].sort();
const domains = [...new Set(relations.map(edge => edge.domain))].sort();
const familyLabels = {
  'conceptual-ontological': 'Concepts and kinds',
  'evaluative-normative': 'Judgments and standards',
  'operational-causal': 'Actions and processes',
  'evidence-provenance': 'Evidence and support',
  'lexical-semiotic': 'Terms and meanings'
};
const familyCount = domain => relations.filter(edge => edge.domain === domain).length;
const modalityCount = modality => relations.filter(edge => edge.modality === modality).length;
const terms = Object.fromEntries(objects.map(item => [item.object_id, { headword: item.headword, scope: item.scope_label }]));
const constellation = buildConstellationLayout(terms, relations);
const graphData = JSON.stringify({ relations, terms, constellation,
  navigation: { definition_routes: referenceRoutes, coverage_ids: coverageIds,
    quality_anchor: studioNav.quality_anchor?.object_id ?? 'glossary.quality.quality-management' } })
  .replace(/</g, '\\u003c');
const relationRows = [...relations.map(edge => ({ ...edge, layer: 'meaning' })),
  ...referenceRoutes.map(edge => ({ ...edge, layer: 'navigation' }))].map(edge => {
  const fromId = edge.direction === 'target-to-source' ? edge.target.object_id : edge.source.object_id;
  const toId = edge.direction === 'target-to-source' ? edge.source.object_id : edge.target.object_id;
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) throw Error(`Graph endpoint missing from current entries: ${edge.relation_id}`);
  return `<li class="relation-row" data-relation="${esc(edge.relation_id)}" data-layer="${edge.layer}" data-domain="${esc(edge.domain)}" hidden>
  <a href="#${esc(fromId)}">${esc(from.headword)}</a> <small>${esc(from.scope_label)}</small> <span aria-label="points to">→</span> <strong>${esc(edge.label)}</strong> <span aria-label="points to">→</span> <a href="#${esc(toId)}">${esc(to.headword)}</a> <small>${esc(to.scope_label)}</small>${edge.layer === 'meaning' && edge.modality === 'possible' ? ' <em class="possibility">possible in Studio</em>' : ''}
  </li>`;
}).join('');
const semanticIds = new Set(relations.flatMap(edge => [edge.source.object_id, edge.target.object_id]));
const referenceIds = new Set(referenceRoutes.flatMap(edge => [edge.source.object_id, edge.target.object_id]));
const coverageSet = new Set(coverageIds);
const navigationOnly = [...referenceIds].filter(id => !semanticIds.has(id)).length;
const noLinks = objects.filter(item => !semanticIds.has(item.object_id) && !referenceIds.has(item.object_id)).length;
const entries = objects.map(item => {
  const target = `https://github.com/qed-artifacts/dictionary-of-quality-content/blob/${encodeURIComponent(tag)}/${item.path}`;
  return `<article class="entry" id="${esc(item.object_id)}">
  <div class="entry-top"><h3>${esc(item.headword)}</h3><p class="scope">${esc(item.scope_label)}</p></div>
  <p class="definition">${esc(item.definition)}</p>
  <details><summary>More about this term</summary>${item.explanation.map(part => `<p>${esc(part)}</p>`).join('')}
    <div class="entry-meta"><span>CC0 1.0</span><a href="${esc(target)}">View versioned object</a></div></details>
</article>`;
});
const initial = headword => {
  const first = headword.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '0–9';
};
const groups = new Map();
for (const [index, object] of objects.entries()) {
  const key = initial(object.headword);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entries[index]);
}
const letters = [...groups.keys()].sort((a, b) => a === '0–9' ? -1 : b === '0–9' ? 1 : a.localeCompare(b));
const entryGroups = letters.map(letter => {
  const group = groups.get(letter);
  const anchor = letter === '0–9' ? 'letter-number' : `letter-${letter.toLowerCase()}`;
  return `<details class="letter-group" id="${anchor}" data-letter="${esc(letter)}">
  <summary><span class="letter-title">${esc(letter)}</span><span class="letter-count">${group.length} ${group.length === 1 ? 'term' : 'terms'}</span></summary>
  <div class="letter-entries">${group.join('\n')}</div>
</details>`;
}).join('\n');
const alphabetLinks = letters.map(letter => {
  const anchor = letter === '0–9' ? 'letter-number' : `letter-${letter.toLowerCase()}`;
  return `<a href="#${anchor}" aria-label="Browse ${letter === '0–9' ? 'numbered terms' : `terms beginning with ${letter}`}">${esc(letter)}</a>`;
}).join('');
const routeCards = navigation.routes.map(route => {
  const links = route.targets.map(target => `<a href="#${esc(target.object_id)}">${esc(target.headword)} <span>· ${esc(target.scope_label)}</span></a>`).join('');
  return `<article class="term-route" data-headword="${esc(route.headword)}" hidden>
  <p class="scope">${esc(route.scope_label)}</p><h2>${esc(route.headword)}</h2>
  <p>${route.action === 'alias' ? 'In this scope, see the released entry:' : 'In this scope, choose the relevant released entry:'}</p>
  <div class="route-links">${links}</div>
</article>`;
}).join('\n');
const sourceTree = `https://github.com/qed-artifacts/dictionary-of-quality-content/tree/${encodeURIComponent(tag)}`;
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Glossary of Quality | QED Artifacts Institute</title>
  <meta name="description" content="Released, concise Dictionary of Quality glossary entries. Browse exact public versions compiled from the tagged glossary collection.">
  <link rel="canonical" href="https://qedartifacts.org/dictionary/glossary/">
  <link rel="stylesheet" href="../../assets/styles.css">
  <link rel="stylesheet" href="styles.css">
  <script src="constellation.js" defer></script>
  <script src="search.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to glossary</a>
  <header class="site-header">
    <a class="brand" href="/" aria-label="QED Artifacts Institute home"><span class="brand-mark">QED<span>AI</span></span><span class="brand-name">Artifacts Institute</span></a>
    <nav aria-label="Primary navigation"><a href="/">Home</a><a href="/dictionary/">Dictionary</a><a href="/apps/">Tools</a></nav>
  </header>
  <main id="main" class="glossary-shell">
    <div class="intro"><p class="eyebrow">Dictionary of Quality · released collection</p><h1>Glossary of Quality</h1>
      <p class="intro-copy">Short, scoped definitions from the public Dictionary of Quality collection. This page contains ${objects.length} released ${objects.length === 1 ? 'object' : 'objects'}; private drafts are excluded.</p>
      <p class="snapshot">Collection version <a href="${esc(sourceTree)}">${esc(tag)}</a> · commit <code>${esc(commit.slice(0, 12))}</code>. Original reader prose is CC0 1.0.</p>
    </div>
    <section class="relation-explorer" id="relationships" aria-labelledby="relationships-title">
      <div class="explorer-heading"><div><p class="eyebrow">Explore the collection</p><h2 id="relationships-title">Term relationships</h2></div>
        <p id="relation-status" role="status" aria-live="polite">${working.edges.length} working relationships</p></div>
      <p class="explorer-copy">Every released term appears in the constellation, with Quality at its center. The meaning map shows ${relations.length} owner-approved working relations touching ${constellation.summary.connected} terms; their exact senses and claims have not been independently validated. The separate references view offers ${referenceRoutes.length} routes derived from Studio draft definitions. A route helps you explore another term; it does not assert a conceptual relationship or claim the released definition uses the same wording.</p>
      <p class="map-reading-note">Quality is a visual anchor. Distance between dots and rings is page layout, not a measure of similarity, importance, or evidence strength.</p>
      <details class="map-reading-guide"><summary>How to read a connection</summary><p>Read each arrow from the first scoped term through its relation type to the second. A dashed line or “possible” label records Studio’s tentative wording; a solid line is still a working relation, not an independently validated claim. Following two links does not establish a new link between their endpoints. The separate reference routes help navigation only.</p></details>
      <fieldset class="layer-picker"><legend>Explore</legend><label><input type="radio" name="map-layer" value="meaning" checked> Meaning map</label><label><input type="radio" name="map-layer" value="navigation"> References and coverage</label></fieldset>
      <div class="explorer-controls">
        <label for="domain-filter">Connection theme <select id="domain-filter"><option value="">All themes · ${relations.length}</option>${domains.map(value => `<option value="${esc(value)}">${esc(familyLabels[value] ?? value.replaceAll('-', ' '))} · ${familyCount(value)}</option>`).join('')}</select></label>
        <label for="predicate-filter">Relation type <select id="predicate-filter"><option value="">All types</option>${predicates.map(value => `<option value="${esc(value)}">${esc(value.replaceAll('-', ' '))}</option>`).join('')}</select></label>
        <label for="modality-filter">How stated in Studio <select id="modality-filter"><option value="">All working forms · ${relations.length}</option><option value="asserted">Stated · ${modalityCount('asserted')}</option><option value="possible">Possible · ${modalityCount('possible')}</option></select></label>
        <label class="map-focus-control" for="term-filter">Map focus <select id="term-filter"></select></label>
        <label for="relation-search">Find relationship <input id="relation-search" type="search" placeholder="Search terms or relation type" autocomplete="off"></label>
        <label class="focus-toggle"><input type="checkbox" id="connected-only"> Show only terms connected to the map focus</label>
      </div>
      <div class="coverage-panel" id="coverage-panel" hidden><p><strong>${coverageIds.length} coverage candidates</strong> in the Studio collection map. Quality is the editorial anchor for this facet; these are not ${coverageIds.length} semantic relationships to Quality. ${navigationOnly} terms have a reference route but no displayed working relation; ${noLinks} have neither kind of displayed link.</p><label><input type="checkbox" id="coverage-only"> Show only coverage candidates in the A–Z entries</label></div>
      <div class="map-toolbar"><div class="map-legend" id="map-legend" aria-label="Map legend"><span><i class="map-key connected"></i>${constellation.summary.connected} terms with working relations</span><span><i class="map-key navigation"></i>${navigationOnly} additional terms with reference routes</span><span><i class="map-key unlinked"></i>${noLinks} terms without displayed links</span></div>
        <div class="map-zoom" aria-label="Map zoom"><button id="map-zoom-out" type="button" aria-label="Zoom out of constellation">−</button><button id="map-zoom-in" type="button" aria-label="Zoom into constellation">+</button><button id="map-reset" type="button">Show all</button></div></div>
      <div class="graph-stage" id="graph-stage" role="group" aria-label="Constellation of all released glossary terms"></div>
      <p class="graph-caption" id="graph-caption">Select a term to brighten its connections. All terms remain in the map, and the searchable list contains every displayed relationship.</p>
      <details class="relation-details" id="relation-details"><summary>Browse all matching relationships <span id="relation-count">0</span></summary><ul id="relation-list">${relationRows}</ul><p id="relation-empty">No relationships in this selection.</p></details>
      <script type="application/json" id="graph-data">${graphData}</script>
    </section>
    <div class="browser"><label for="term-search">Find a term or topic</label><input id="term-search" type="search" placeholder="Search released entries" autocomplete="off" aria-describedby="search-status"><p id="search-status" role="status" aria-live="polite">${objects.length} ${objects.length === 1 ? 'entry' : 'entries'} available</p></div>
    <div class="browse-tools"><nav class="alphabet-index" aria-label="Browse by first letter">${alphabetLinks}</nav><div class="browse-buttons"><button id="expand-letters" type="button">Expand all</button><button id="collapse-letters" type="button">Collapse all</button></div></div>
    <div class="term-routes" id="term-routes" aria-label="Related term navigation">${routeCards}</div>
    <div class="entry-list" id="entries">${entryGroups}</div>
    <p class="empty" id="no-results" hidden>No released entries match this search.</p>
  </main>
  <footer><p>QED Artifacts Institute · Dictionary of Quality</p><div><a href="${esc(sourceTree)}">Public object collection</a><a href="/">Home</a></div></footer>
</body>
</html>
`;
const output = outputOption ? path.resolve(outputOption) : path.join(siteRoot, 'dictionary', 'glossary', 'index.html');
if (check) {
  const checkedOut = await fs.readFile(output, 'utf8');
  if (checkedOut.replace(/\r\n/g, '\n') !== html) throw Error('Generated glossary page differs from tagged public release');
} else {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
}
console.log(JSON.stringify({ mode: check ? 'checked' : 'built', entries: objects.length,
  navigation_routes: navigation.routes.length, graph_clusters: graph.clusters.length,
  graph_relations: graph.relations.length, studio_working_relations: working.edges.length,
  studio_definition_routes: referenceRoutes.length, studio_coverage_candidates: coverageIds.length,
  tag, commit, output }));
