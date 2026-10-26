import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
const graphData = JSON.stringify({ clusters: graph.clusters, relations: graph.relations,
  terms: Object.fromEntries(objects.map(item => [item.object_id, { headword: item.headword, scope: item.scope_label }])) })
  .replace(/</g, '\\u003c');
const graphClusters = graph.clusters.map(cluster =>
  `<option value="${esc(cluster.cluster_id)}">${esc(cluster.title)} (${cluster.members.length})</option>`).join('');
const relationRows = graph.relations.map(edge => {
  const from = byId.get(edge.source.object_id);
  const to = byId.get(edge.target.object_id);
  if (!from || !to) throw Error(`Graph endpoint missing from current entries: ${edge.relation_id}`);
  return `<li class="relation-row" data-relation="${esc(edge.relation_id)}" data-source="${esc(edge.source.object_id)}" data-target="${esc(edge.target.object_id)}" data-predicate="${esc(edge.predicate)}" hidden>
  <a href="#${esc(edge.source.object_id)}">${esc(from.headword)}</a> <span>${esc(edge.label)}</span> <a href="#${esc(edge.target.object_id)}">${esc(to.headword)}</a>
  <p>${esc(edge.explanation)} <small>Scope: ${esc(edge.scope)}</small></p></li>`;
}).join('');
const entries = objects.map(item => {
  const target = `https://github.com/qed-artifacts/dictionary-of-quality-content/blob/${encodeURIComponent(tag)}/${item.path}`;
  return `<article class="entry" id="${esc(item.object_id)}">
  <div class="entry-top"><p class="scope">${esc(item.scope_label)}</p><h2>${esc(item.headword)}</h2></div>
  <p class="definition">${esc(item.definition)}</p>
  <details><summary>Read explanation</summary>${item.explanation.map(part => `<p>${esc(part)}</p>`).join('')}</details>
  <div class="entry-meta"><span>CC0 1.0</span><a href="${esc(target)}">View versioned object</a></div>
</article>`;
}).join('\n');
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
        <p id="relation-status" role="status" aria-live="polite">${graph.clusters.length} reviewed ${graph.clusters.length === 1 ? 'cluster' : 'clusters'} · ${graph.relations.length} reviewed ${graph.relations.length === 1 ? 'relationship' : 'relationships'}</p></div>
      <p class="explorer-copy">Clusters group released terms for browsing. Lines show separately reviewed conceptual relationships; terms can belong to a cluster without a line. Scoped aliases remain in term navigation below.</p>
      <div class="explorer-controls">
        <label for="cluster-filter">Cluster <select id="cluster-filter"><option value="">All released entries</option>${graphClusters}</select></label>
        <label for="predicate-filter">Relation <select id="predicate-filter"><option value="">All reviewed types</option><option value="is-a">Is a kind of</option><option value="distinguished-from">Distinguished from</option></select></label>
        <label for="term-filter">Focus term <select id="term-filter"><option value="">All cluster terms</option></select></label>
        <label class="focus-toggle"><input type="checkbox" id="connected-only"> Show only connected terms</label>
      </div>
      <div class="graph-stage" id="graph-stage" role="group" aria-label="Visual map of the selected cluster"></div>
      <p class="graph-caption" id="graph-caption">${graph.clusters.length ? 'Select a cluster to explore its released terms and reviewed relationships.' : 'No reviewed relation cluster has been released yet. The full glossary remains available below.'}</p>
      <details class="relation-details" open><summary>Relationship list <span id="relation-count">0</span></summary><ul id="relation-list">${relationRows}</ul><p id="relation-empty">No reviewed relationships in this selection.</p></details>
      <script type="application/json" id="graph-data">${graphData}</script>
    </section>
    <div class="browser"><label for="term-search">Find a term or topic</label><input id="term-search" type="search" placeholder="Search released entries" autocomplete="off" aria-describedby="search-status"><p id="search-status" role="status" aria-live="polite">${objects.length} ${objects.length === 1 ? 'entry' : 'entries'} shown</p></div>
    <div class="term-routes" id="term-routes" aria-label="Related term navigation">${routeCards}</div>
    <div class="entry-list" id="entries">${entries}</div>
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
  graph_relations: graph.relations.length, tag, commit, output }));
