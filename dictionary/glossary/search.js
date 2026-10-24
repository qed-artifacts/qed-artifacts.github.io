const input = document.querySelector('#term-search');
const cards = [...document.querySelectorAll('.entry')];
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
  status.textContent = `${shown} ${shown === 1 ? 'entry' : 'entries'} shown`;
  empty.hidden = shown !== 0;
});
