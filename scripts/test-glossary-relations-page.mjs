import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = path.resolve(siteRoot, '..', 'dictionary-of-quality-content');
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'glossary-relations-fixture-'));
const preview = path.join(siteRoot, 'out', 'glossary-relations-fixture');
const write = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
};
const git = (...args) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
try {
  await fs.mkdir(path.join(fixture, 'scripts'), { recursive: true });
  for (const file of ['validate.mjs', 'navigation.mjs', 'relations.mjs', 'working-relations.mjs']) {
    await fs.copyFile(path.join(contentRoot, 'scripts', file), path.join(fixture, 'scripts', file));
  }
  const entries = [];
  for (let i = 0; i < 8; i += 1) {
    const number = i + 1;
    const object_id = `glossary.fixture${number}.scope`;
    const revision_id = `revision.glossary.${'12345678'[i].repeat(24)}`;
    const file = `entries/fixture-${number}/scope/${revision_id}`;
    entries.push({ object_id, revision_id, path: file + '.json' });
    const item = { schema: 'qed-glossary-public-object-v1', object_id, revision_id,
      headword: `Fixture term ${number}`, scope_label: 'isolated interface test',
      definition: `Fixture term ${number} has no dictionary meaning.`,
      explanation: ['This synthetic entry checks the graph and filter interface.'],
      content_license: 'CC0-1.0', review: { owner_editorial: true,
        owner_source_attestation: true, internal_validation: true,
        owner_release_authorization: true, independent_external_review: false } };
    await write(path.join(fixture, file + '.json'), item);
    await write(path.join(fixture, file + '.md'),
      `# ${item.headword}\n\n*Scope: ${item.scope_label}*\n\n${item.definition}\n\n${item.explanation[0]}\n\nOriginal glossary prose: CC0 1.0.\n`);
  }
  const catalog = { schema: 'qed-glossary-public-catalog-v1', entries };
  await write(path.join(fixture, 'catalog.json'), catalog);
  const endpoint = item => ({ object_id: item.object_id, revision_id: item.revision_id });
  const graph = { schema: 'qed-glossary-public-relations-v1',
    catalog_sha256: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    profile: 'glossary-relations-v1', clusters: [{ cluster_id: 'cluster.glossary.fixture',
      revision_id: `revision.cluster.${'9'.repeat(24)}`, title: 'Synthetic interface fixture',
      description: 'Eight synthetic terms with one connection and six isolates.',
      members: entries.map(endpoint) }], relations: [{
        relation_id: 'relation.glossary.fixture-one-is-a-two', revision_id: `revision.relation.${'8'.repeat(24)}`,
        source: endpoint(entries[0]), target: endpoint(entries[1]), predicate: 'is-a',
        scope: 'Isolated interface test', label: 'is a kind of',
        explanation: 'This synthetic connection tests layout and filtering.',
        review: { owner_editorial: true, owner_source_attestation: true,
          internal_validation: true, owner_release_authorization: true,
          independent_external_review: false }
      }] };
  await write(path.join(fixture, 'relations', 'graph.v1.json'), graph);
  await write(path.join(fixture, 'relations', 'studio-working.v1.json'), {
    schema: 'qed-glossary-studio-working-relations-v1',
    catalog_sha256: graph.catalog_sha256,
    standing: 'owner-approved-working-unvalidated',
    source_graph_sha256: 'f'.repeat(64), adopted_total: 4,
    holds: { endpoint_reconciliation: 1, unresolved_predicate: 1, already_reviewed: 0, duplicate_working: 0 },
    edges: [2, 3].map((number, index) => ({
      edge_id: `edge.dictionary-v3.fixture.${'ab'[index].repeat(24)}`,
      source: endpoint(entries[number - 1]), target: endpoint(entries[number]),
      source_node_id: `term.dictionary-v3.fixture${number}`,
      target_node_id: `term.dictionary-v3.fixture${number + 1}`,
      predicate: index ? 'supports' : 'component-of', direction: 'source-to-target',
      modality: 'asserted', domain: 'operational-causal',
      standing: 'owner-approved-working-unvalidated',
      scope: 'Studio working relation; exact glossary sense and claim have not been validated.'
    }))
  });
  git('init', '-q');
  git('config', 'user.name', 'Local fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'Synthetic relation UI fixture');
  git('tag', 'glossary-test-relations');
  execFileSync(process.execPath, [path.join(siteRoot, 'scripts', 'build-glossary-page.mjs'),
    '--source', fixture, '--tag', 'glossary-test-relations', '--output', path.join(preview, 'index.html')],
    { cwd: siteRoot, stdio: 'inherit' });
  for (const file of ['search.js', 'styles.css']) {
    await fs.copyFile(path.join(siteRoot, 'dictionary', 'glossary', file), path.join(preview, file));
  }
  const previewFile = path.join(preview, 'index.html');
  const html = await fs.readFile(previewFile, 'utf8');
  if (html.includes('Synthetic interface fixture (8)') ||
      html.includes('relation.glossary.fixture-one-is-a-two') ||
      !html.includes('8 released objects') || !html.includes('Fixture term 8') ||
      !html.includes('2 working relationships') ||
      html.includes('id="cluster-filter"') || html.includes('id="status-filter"') ||
      !html.includes('id="domain-filter"') ||
      !html.includes('id="relation-details"') ||
      !html.includes('Map focus') || html.includes('id="graph-prev"')) {
    throw Error('Fixture build exposed archived reviewed displays or lost working relations and entries');
  }
  await fs.writeFile(previewFile, html.replace('<body>',
    '<body>\n<div role="note" style="padding:12px 20px;background:#fff3c7;color:#332600;text-align:center;font-weight:700">LOCAL SYNTHETIC FIXTURE — interface test, not published dictionary content</div>'));
  console.log(JSON.stringify({ status: 'fixture-built', preview, members: 8,
    archived_reviewed_relations: 1, displayed_working_relations: 2 }));
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
