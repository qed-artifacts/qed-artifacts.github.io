import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const script = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'dictionary', 'glossary', 'search.js'), 'utf8');

function interfaceFixture() {
  const input = { value: '', addEventListener: (_, fn) => { input.search = fn; } };
  const cards = [{ textContent: 'LTPD lot tolerance percent defective', hidden: false },
    { textContent: 'Fitness for use', hidden: false }];
  const routes = [{ dataset: { headword: 'Fitness' }, hidden: true },
    { dataset: { headword: 'Error' }, hidden: true }];
  const status = { textContent: '' };
  const empty = { hidden: true };
  const nodes = { '#term-search': input, '#search-status': status, '#no-results': empty };
  const document = { querySelector: selector => nodes[selector],
    querySelectorAll: selector => selector === '.entry' ? cards : routes };
  vm.runInNewContext(script, { document });
  return { input, cards, routes, status, empty };
}

test('scoped term routes appear as navigation without becoming entry counts', () => {
  const view = interfaceFixture();
  view.input.value = 'fitness';
  view.input.search();
  assert.equal(view.routes[0].hidden, false);
  assert.equal(view.routes[1].hidden, true);
  assert.match(view.status.textContent, /^1 entry shown · 1 related term route$/);
});

test('routes do not appear by default or for unrelated queries', () => {
  const view = interfaceFixture();
  view.input.search();
  assert.equal(view.routes.every(route => route.hidden), true);
  view.input.value = 'unknown';
  view.input.search();
  assert.equal(view.empty.hidden, false);
  assert.equal(view.status.textContent, '0 entries shown');
});
