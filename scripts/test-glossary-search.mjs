import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const script = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'dictionary', 'glossary', 'search.js'), 'utf8');

function interfaceFixture(graph = { relations: [], terms: {} }) {
  const node = tagName => ({ tagName, children: [], attributes: {}, textContent: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this[name] = fn; } });
  const control = (value = '') => ({ value, checked: false, disabled: false,
    addEventListener(name, fn) { this[name] = fn; },
    replaceChildren() {}, add() {} });
  const input = control();
  const cards = [{ id: 'glossary.ltfd.scope', textContent: 'LTPD lot tolerance percent defective', hidden: false },
    { id: 'glossary.fitness.scope', textContent: 'Fitness for use', hidden: false }];
  const groups = cards.map(card => {
    const count = { textContent: '' };
    return { hidden: false, open: false, querySelectorAll: () => [card],
      querySelector: () => count, count };
  });
  cards.forEach((card, index) => { card.closest = () => groups[index]; });
  const routes = [{ dataset: { headword: 'Fitness' }, hidden: true },
    { dataset: { headword: 'Error' }, hidden: true }];
  const nodes = { '#term-search': input, '#search-status': { textContent: '' },
    '#no-results': { hidden: true },
    '#predicate-filter': control(), '#domain-filter': control(),
    '#term-filter': control(), '#relation-search': control(), '#connected-only': control(),
    '#relation-status': { textContent: '' }, '#relation-count': { textContent: '' },
    '#relation-empty': { hidden: true }, '#relation-details': { open: false },
    '#graph-stage': node('div'), '#graph-caption': { textContent: '' },
    '#expand-letters': control(), '#collapse-letters': control(),
    '#graph-data': { textContent: JSON.stringify(graph) } };
  const relationRows = graph.relations.map(edge => ({ dataset: { relation: edge.relation_id }, hidden: true }));
  const document = { querySelector: selector => nodes[selector],
    querySelectorAll: selector => selector === '.entry' ? cards : selector === '.term-route' ? routes :
      selector === '.letter-group' ? groups : selector === '.relation-row' ? relationRows : [],
    createElement: node };
  const location = { href: 'https://example.test/dictionary/glossary/', search: '', hash: '' };
  const mapUpdates = [];
  vm.runInNewContext(script, { document, location, history: { replaceState() {} },
    window: { addEventListener() {}, GlossaryMap: { createMap() { return { update(focus, edges) {
      mapUpdates.push({ focus, edges });
    } }; } } }, requestAnimationFrame: fn => fn(),
    URL, URLSearchParams, Option: function (label, value) { return { label, value }; } });
  return { input, cards, routes, status: nodes['#search-status'], empty: nodes['#no-results'],
    connected: nodes['#connected-only'], groups,
    expand: nodes['#expand-letters'], collapse: nodes['#collapse-letters'],
    term: nodes['#term-filter'], predicate: nodes['#predicate-filter'],
    relationSearch: nodes['#relation-search'], relationCount: nodes['#relation-count'],
    relationDetails: nodes['#relation-details'], stage: nodes['#graph-stage'],
    caption: nodes['#graph-caption'], relationRows, mapUpdates };
}

test('scoped term routes appear as navigation without becoming entry counts', () => {
  const view = interfaceFixture();
  view.input.value = 'fitness';
  view.input.input();
  assert.equal(view.routes[0].hidden, false);
  assert.equal(view.routes[1].hidden, true);
  assert.match(view.status.textContent, /^1 entry available · 1 related term route$/);
  assert.equal(view.groups[0].hidden, true);
  assert.equal(view.groups[1].open, true);
});

test('all-entry search remains available without a reviewed cluster filter', () => {
  const view = interfaceFixture();
  assert.equal(view.cards.every(card => !card.hidden), true);
  assert.equal(view.connected.disabled, true);
  view.input.value = 'unknown';
  view.input.input();
  assert.equal(view.empty.hidden, false);
  assert.equal(view.status.textContent, '0 entries available');
  assert.equal(view.groups.every(group => group.hidden), true);
});

test('letter controls expand and collapse the visible groups', () => {
  const view = interfaceFixture();
  view.expand.click();
  assert.equal(view.groups.every(group => group.open), true);
  view.collapse.click();
  assert.equal(view.groups.every(group => !group.open), true);
});

test('constellation starts with all terms, then focuses without hiding unrelated entries', () => {
  const endpoint = id => ({ object_id: id });
  const graph = { terms: { a: { headword: 'Alpha' }, b: { headword: 'Beta' },
    c: { headword: 'Gamma' } }, relations: [
    { relation_id: 'one', source: endpoint('a'), target: endpoint('b'),
      predicate: 'supports', label: 'supports', direction: 'source-to-target',
      domain: 'one', modality: 'asserted' },
    { relation_id: 'two', source: endpoint('c'), target: endpoint('b'),
      predicate: 'qualifies', label: 'qualifies', direction: 'target-to-source',
      domain: 'one', modality: 'possible' }
  ] };
  const view = interfaceFixture(graph);
  assert.equal(view.term.value, '');
  assert.equal(view.mapUpdates.at(-1).focus, '');
  assert.equal(view.connected.disabled, true);
  assert.equal(view.relationCount.textContent, '2');
  view.term.value = 'b';
  view.term.input();
  assert.equal(view.mapUpdates.at(-1).focus, 'b');
  assert.equal(view.mapUpdates.at(-1).edges.length, 2);
  assert.equal(view.connected.disabled, false);
  assert.match(view.caption.textContent, /All 3 released terms remain on the map/);
  assert.equal(view.relationCount.textContent, '2');
  view.predicate.value = 'supports';
  view.predicate.input();
  assert.equal(view.mapUpdates.at(-1).edges.length, 1);
  assert.equal(view.relationCount.textContent, '1');
  assert.deepEqual(view.relationRows.map(row => row.hidden), [false, true]);
  view.relationSearch.value = 'alpha';
  view.relationSearch.input();
  assert.equal(view.relationDetails.open, true);
  view.term.value = 'c';
  view.term.input();
  view.connected.checked = true;
  view.connected.input();
  assert.equal(view.cards.every(card => card.hidden), true);
});

test('generated page groups every released entry under one alphabet section', () => {
  const html = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '..', 'dictionary', 'glossary', 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<article class="entry" id="([^"]+)">/g)];
  const groups = [...html.matchAll(/<details class="letter-group" id="(letter-[a-z]+|letter-number)"/g)];
  const statedTotal = Number(/This page contains (\d+) released/.exec(html)?.[1]);
  assert.equal(entries.length, statedTotal);
  assert.equal(new Set(entries.map(match => match[1])).size, entries.length);
  assert.ok(groups.length > 1 && groups.length <= 27);
  assert.equal([...html.matchAll(/<details class="letter-group"[^>]* open>/g)].length, 0,
    'all alphabet groups begin collapsed');
  assert.match(html, /<div class="letter-entries">/);
});
