import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const script = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'dictionary', 'glossary', 'search.js'), 'utf8');

function interfaceFixture() {
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
    '#no-results': { hidden: true }, '#cluster-filter': control(),
    '#predicate-filter': control(), '#status-filter': control(), '#domain-filter': control(),
    '#term-filter': control(), '#relation-search': control(), '#connected-only': control(),
    '#relation-status': { textContent: '' }, '#relation-count': { textContent: '' },
    '#relation-empty': { hidden: true }, '#graph-stage': { replaceChildren() {} },
    '#graph-caption': { textContent: '' }, '#graph-prev': control(),
    '#graph-next': control(), '#graph-page-status': { textContent: '' },
    '#expand-letters': control(), '#collapse-letters': control(),
    '#graph-data': { textContent: JSON.stringify({ clusters: [], relations: [], terms: {} }) } };
  const document = { querySelector: selector => nodes[selector],
    querySelectorAll: selector => selector === '.entry' ? cards : selector === '.term-route' ? routes :
      selector === '.letter-group' ? groups : [] };
  const location = { href: 'https://example.test/dictionary/glossary/', search: '', hash: '' };
  vm.runInNewContext(script, { document, location, history: { replaceState() {} },
    window: { addEventListener() {} }, requestAnimationFrame: fn => fn(),
    URL, URLSearchParams, Option: function (label, value) { return { label, value }; } });
  return { input, cards, routes, status: nodes['#search-status'], empty: nodes['#no-results'],
    cluster: nodes['#cluster-filter'], connected: nodes['#connected-only'], groups,
    expand: nodes['#expand-letters'], collapse: nodes['#collapse-letters'] };
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

test('all-entry search remains available when no relation cluster is selected', () => {
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

test('generated page groups every released entry under one alphabet section', () => {
  const html = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '..', 'dictionary', 'glossary', 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<article class="entry" id="([^"]+)">/g)];
  const groups = [...html.matchAll(/<details class="letter-group" id="(letter-[a-z]+|letter-number)"/g)];
  const statedTotal = Number(/This page contains (\d+) released/.exec(html)?.[1]);
  assert.equal(entries.length, statedTotal);
  assert.equal(new Set(entries.map(match => match[1])).size, entries.length);
  assert.ok(groups.length > 1 && groups.length <= 27);
  assert.match(html, /<div class="letter-entries">/);
});
