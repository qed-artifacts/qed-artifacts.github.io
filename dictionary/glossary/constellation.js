(() => {
  const SVG = 'http://www.w3.org/2000/svg';
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svgElement = (tag, attributes = {}) => {
    const node = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
    return node;
  };
  const endpoints = edge => edge.direction === 'target-to-source'
    ? [edge.target.object_id, edge.source.object_id]
    : [edge.source.object_id, edge.target.object_id];

  function createMap(stage, graph, selectTerm) {
    const { size, nodes } = graph.constellation;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const shell = element('div', 'constellation-shell');
    const svg = svgElement('svg', { viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true',
      class: 'constellation-svg', preserveAspectRatio: 'xMidYMid meet' });
    const background = svgElement('g', { class: 'constellation-background' });
    background.append(svgElement('circle', { cx: size / 2, cy: size / 2, r: 591, class: 'constellation-disc' }));
    for (const radius of [130, 250, 365, 446, 585])
      background.append(svgElement('circle', { cx: size / 2, cy: size / 2, r: radius, class: 'constellation-ring' }));
    const lines = svgElement('g', { class: 'constellation-lines' });
    const dots = svgElement('g', { class: 'constellation-dots' });
    const lineById = new Map();
    for (const edge of graph.relations) {
      const [from, to] = endpoints(edge);
      const a = byId.get(from), b = byId.get(to);
      if (!a || !b) continue;
      const line = svgElement('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: `constellation-line${edge.modality === 'possible' ? ' possible' : ''}` });
      lines.append(line);
      lineById.set(edge.relation_id, line);
    }
    const dotById = new Map();
    for (const point of nodes) {
      const term = graph.terms[point.id];
      const dot = svgElement('circle', { cx: point.x, cy: point.y,
        r: point.connected ? 4 : 3.2,
        class: `constellation-dot ${point.connected ? 'connected' : 'unlinked'}` });
      dot.append(svgElement('title'));
      dot.firstChild.textContent = `${term.headword} · ${term.scope}${point.connected ? '' : ' · no displayed working relationship'}`;
      dot.addEventListener('click', () => selectTerm(point.id));
      dots.append(dot);
      dotById.set(point.id, dot);
    }
    svg.append(background, lines, dots);
    const detail = element('div', 'constellation-detail');
    shell.append(svg, detail);
    stage.replaceChildren(shell);
    let zoom = 1;
    let focusId = '';
    let activeEdges = graph.relations;
    const zoomOut = document.querySelector('#map-zoom-out');
    const zoomIn = document.querySelector('#map-zoom-in');
    const showAll = document.querySelector('#map-reset');

    function setViewBox() {
      const extent = size / zoom;
      const center = zoom > 1 && focusId ? byId.get(focusId) : { x: size / 2, y: size / 2 };
      const x = Math.max(0, Math.min(size - extent, center.x - extent / 2));
      const y = Math.max(0, Math.min(size - extent, center.y - extent / 2));
      svg.setAttribute('viewBox', `${x} ${y} ${extent} ${extent}`);
      zoomOut.disabled = zoom <= 1;
      zoomIn.disabled = zoom >= 3.2;
    }

    function distancesFrom(focus, edges) {
      const adjacency = new Map();
      for (const edge of edges) {
        const [a, b] = endpoints(edge);
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
      }
      const distances = new Map([[focus, 0]]);
      const queue = [focus];
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        for (const next of adjacency.get(id) ?? []) {
          if (distances.has(next)) continue;
          distances.set(next, distances.get(id) + 1);
          queue.push(next);
        }
      }
      return distances;
    }

    function renderDetail(focus, directEdges) {
      detail.replaceChildren();
      if (!focus) {
        detail.append(element('strong', '', 'The whole collection'),
          element('p', '', 'Select a dot or use Map focus to reveal a term’s connections. The outer band contains terms with no displayed working relation.'));
        return;
      }
      const term = graph.terms[focus];
      const heading = element('div', 'constellation-detail-heading');
      heading.append(element('strong', '', term.headword));
      const link = element('a', '', 'Read definition');
      link.href = `#${focus}`;
      heading.append(link);
      detail.append(heading);
      if (!directEdges.length) {
        detail.append(element('p', '', 'No displayed relationship for this term in the current filters. This does not mean that no conceptual connection exists.'));
        return;
      }
      detail.append(element('p', '', `${directEdges.length} direct working ${directEdges.length === 1 ? 'relationship' : 'relationships'} in the current filters.`));
      const list = element('ul', 'constellation-neighbors');
      for (const edge of directEdges) {
        const [from, to] = endpoints(edge);
        const other = from === focus ? to : from;
        const item = element('li');
        const button = element('button', '', graph.terms[other].headword);
        button.type = 'button';
        button.setAttribute('aria-label', `Focus map on ${graph.terms[other].headword}`);
        button.addEventListener('click', () => selectTerm(other));
        item.append(element('span', '', from === focus ? `→ ${edge.label}` : `← ${edge.label}`), button);
        list.append(item);
      }
      detail.append(list);
    }

    function update(focus, visibleEdges) {
      focusId = focus;
      activeEdges = visibleEdges;
      const visibleIds = new Set(visibleEdges.map(edge => edge.relation_id));
      const distance = focus ? distancesFrom(focus, visibleEdges) : new Map();
      const direct = visibleEdges.filter(edge => edge.source.object_id === focus || edge.target.object_id === focus);
      for (const point of nodes) {
        const dot = dotById.get(point.id);
        const hops = distance.get(point.id);
        const radius = point.id === focus ? 11 : hops === 1 ? 7 : hops === 2 ? 5 : point.connected ? 4 : 3.2;
        const opacity = !focus ? point.connected ? .88 : .55
          : hops === 0 ? 1 : hops === 1 ? .96 : hops === 2 ? .7 : hops === 3 ? .5 : .34;
        dot.setAttribute('r', radius);
        dot.setAttribute('opacity', opacity);
        dot.classList.toggle('selected', point.id === focus);
        dot.classList.toggle('near', hops === 1);
      }
      for (const edge of graph.relations) {
        const line = lineById.get(edge.relation_id);
        if (!line) continue;
        const [a, b] = endpoints(edge);
        const active = focus && (a === focus || b === focus);
        line.setAttribute('opacity', !visibleIds.has(edge.relation_id) ? 0 :
          !focus ? .14 : active ? .9 : distance.has(a) && distance.has(b) ? .055 : .025);
        line.classList.toggle('selected', Boolean(active));
      }
      if (focus) dots.append(dotById.get(focus));
      renderDetail(focus, direct);
      stage.setAttribute('aria-label', focus ?
        `Constellation of ${graph.constellation.summary.total} terms focused on ${graph.terms[focus].headword}; ${direct.length} direct working relationships` :
        `Constellation of all ${graph.constellation.summary.total} released terms`);
      setViewBox();
    }
    zoomOut.addEventListener('click', () => { zoom = Math.max(1, Math.round(zoom / 1.45 * 100) / 100); setViewBox(); });
    zoomIn.addEventListener('click', () => { zoom = Math.min(3.2, Math.round(zoom * 1.45 * 100) / 100); setViewBox(); });
    showAll.addEventListener('click', () => { zoom = 1; setViewBox(); selectTerm(''); });
    update('', activeEdges);
    return { update };
  }

  window.GlossaryMap = { createMap };
})();
