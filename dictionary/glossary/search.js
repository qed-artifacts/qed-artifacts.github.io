const input = document.querySelector('#term-search');
const cards = [...document.querySelectorAll('.entry')];
const routes = [...document.querySelectorAll('.term-route')];
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const normalize = value => value.normalize('NFKD').toLocaleLowerCase().replace(/\p{Diacritic}/gu, '').trim();
const indexed = cards.map(card => [card, normalize(card.textContent)]);
input.addEventListener('input', () => {
  const query = normalize(input.value);
  let shown = 0;
  for (const [card, content] of indexed) {
    const matches = !query || content.includes(query);
    card.hidden = !matches;
    if (matches) shown += 1;
  }
  let routed = 0;
  for (const route of routes) {
    const headword = normalize(route.dataset.headword);
    const matches = !!query && headword.includes(query);
    route.hidden = !matches;
    if (matches) routed += 1;
  }
  status.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'} shown${routed ? ` · ${routed} related ${routed === 1 ? 'term route' : 'term routes'}` : ''}`;
  empty.hidden = shown !== 0 || routed !== 0;
});
