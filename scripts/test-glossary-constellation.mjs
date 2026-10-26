import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConstellationLayout } from './glossary-constellation-layout.mjs';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every released term has one stable map position, including terms without displayed links', () => {
  const html = fs.readFileSync(path.join(siteRoot, 'dictionary', 'glossary', 'index.html'), 'utf8');
  const raw = /<script type="application\/json" id="graph-data">([^<]+)<\/script>/.exec(html)?.[1];
  assert.ok(raw, 'generated page has graph data');
  const graph = JSON.parse(raw);
  const layout = buildConstellationLayout(graph.terms, graph.relations);
  assert.deepEqual(layout, graph.constellation, 'generated positions match the canonical graph');
  assert.equal(layout.nodes.length, Object.keys(graph.terms).length);
  assert.equal(new Set(layout.nodes.map(node => node.id)).size, layout.nodes.length);
  assert.equal(layout.summary.connected + layout.summary.unlinked, layout.summary.total);
  assert.equal(layout.summary.total, 878);
  assert.equal(graph.relations.length, 505);
  assert.equal(layout.summary.connected, 261);
  assert.equal(layout.summary.unlinked, 617);
  const quality = layout.nodes.find(node => node.id === 'glossary.quality.quality-management');
  assert.deepEqual([quality.x, quality.y], [layout.size / 2, layout.size / 2],
    'Quality remains the central editorial anchor');
  for (const node of layout.nodes) {
    assert.ok(node.x >= 0 && node.x <= layout.size && node.y >= 0 && node.y <= layout.size);
    assert.ok(Math.hypot(node.x - layout.size / 2, node.y - layout.size / 2) < 590);
  }
  for (let i = 0; i < layout.nodes.length; i++) {
    for (let j = i + 1; j < layout.nodes.length; j++) {
      assert.ok(Math.hypot(layout.nodes[i].x - layout.nodes[j].x,
        layout.nodes[i].y - layout.nodes[j].y) >= 6,
      `overlapping map dots: ${layout.nodes[i].id} and ${layout.nodes[j].id}`);
    }
  }
});

test('reverse-oriented and duplicate working edges do not create extra nodes or components', () => {
  const terms = Object.fromEntries(['A', 'B', 'C'].map(id => [id, { headword: id }]));
  const endpoint = object_id => ({ object_id });
  const edges = [
    { relation_id: 'one', source: endpoint('A'), target: endpoint('B'), direction: 'target-to-source' },
    { relation_id: 'two', source: endpoint('B'), target: endpoint('A'), direction: 'source-to-target' }
  ];
  const layout = buildConstellationLayout(terms, edges);
  assert.equal(layout.summary.connected, 2);
  assert.equal(layout.summary.unlinked, 1);
  assert.equal(layout.summary.components, 1);
  assert.equal(layout.nodes.find(node => node.id === 'C').connected, false);
  assert.deepEqual(buildConstellationLayout(terms, edges), layout);
});
