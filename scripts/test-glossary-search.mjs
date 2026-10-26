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
  const routes = [{ dataset: { headword: 'Fitness' }, hidden: true },
    { dataset: { headword: 'Error' }, hidden: true }];
  const nodes = { '#term-search': input, '#search-status': { textContent: '' },
    '#no-results': { hidden: true }, '#cluster-filter': control(),
    '#predicate-filter': control(), '#term-filter': control(), '#connected-only': control(),
    '#relation-status': { textContent: '' }, '#relation-count': { textContent: '' },
    '#relation-empty': { hidden: true }, '#graph-stage': { replaceChildren() {} },
    '#graph-caption': { textContent: '' },
    '#graph-data': { textContent: JSON.stringify({ clusters: [], relations: [], terms: {} }) } };
  const document = { querySelector: selector => nodes[selector],
    querySelectorAll: selector => selector === '.entry' ? cards : selector === '.term-route' ? routes : [] };
  const location = { href: 'https://example.test/dictionary/glossary/', search: '' };
  vm.runInNewContext(script, { document, location, history: { replaceState() {} },
    URL, URLSearchParams, Option: function (label, value) { return { label, value }; } });
  return { input, cards, routes, status: nodes['#search-status'], empty: nodes['#no-results'],
    cluster: nodes['#cluster-filter'], connected: nodes['#connected-only'] };
}

test('scoped term routes appear as navigation without becoming entry counts', () => {
  const view = interfaceFixture();
  view.input.value = 'fitness';
  view.input.input();
  assert.equal(view.routes[0].hidden, false);
  assert.equal(view.routes[1].hidden, true);
  assert.match(view.status.textContent, /^1 entry shown · 1 related term route$/);
});

test('all-entry search remains available when no relation cluster is selected', () => {
  const view = interfaceFixture();
  assert.equal(view.cards.every(card => !card.hidden), true);
  assert.equal(view.connected.disabled, true);
  view.input.value = 'unknown';
  view.input.input();
  assert.equal(view.empty.hidden, false);
  assert.equal(view.status.textContent, '0 entries shown');
});
