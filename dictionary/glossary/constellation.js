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
  const lineEnds = (a, b) => {
    const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance;
    return { x1: a.x + dx * 8, y1: a.y + dy * 8,
      x2: b.x - dx * 12, y2: b.y - dy * 12 };
  };

  function createMap(stage, graph, selectTerm) {
    const { size, nodes } = graph.constellation;
    const navigation = graph.navigation ?? { definition_routes: [], coverage_ids: [], quality_anchor: '' };
    const quality = navigation.quality_anchor;
    const coverage = new Set(navigation.coverage_ids);
    const referenceIds = new Set(navigation.definition_routes.flatMap(edge =>
      [edge.source.object_id, edge.target.object_id]));
    const byId = new Map(nodes.map(node => [node.id, node]));
    const shell = element('div', 'constellation-shell');
    const svg = svgElement('svg', { viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true',
      class: 'constellation-svg', preserveAspectRatio: 'xMidYMid meet' });
    const defs = svgElement('defs');
    for (const [id, fill] of [['glossary-meaning-arrow', '#f5bc72'],
      ['glossary-reference-arrow', '#a9ccef']]) {
      const marker = svgElement('marker', { id, viewBox: '0 0 10 10', refX: 9,
        refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' });
      marker.append(svgElement('path', { d: 'M 1 1 L 9 5 L 1 9 z', fill }));
      defs.append(marker);
    }
    const background = svgElement('g', { class: 'constellation-background' });
    background.append(svgElement('circle', { cx: size / 2, cy: size / 2, r: 591, class: 'constellation-disc' }));
    for (const radius of [130, 250, 365, 446, 585])
      background.append(svgElement('circle', { cx: size / 2, cy: size / 2, r: radius, class: 'constellation-ring' }));
    const lines = svgElement('g', { class: 'constellation-lines' });
    const referenceLines = svgElement('g', { class: 'constellation-reference-lines' });
    const dots = svgElement('g', { class: 'constellation-dots' });
    const labels = svgElement('g', { class: 'constellation-labels' });
    const lineById = new Map();
    for (const edge of graph.relations) {
      const [from, to] = endpoints(edge);
      const a = byId.get(from), b = byId.get(to);
      if (!a || !b) continue;
      const line = svgElement('line', { ...lineEnds(a, b),
        class: `constellation-line${edge.modality === 'possible' ? ' possible' : ''}` });
      lines.append(line);
      lineById.set(edge.relation_id, line);
    }
    const dotById = new Map();
    for (const point of nodes) {
      const term = graph.terms[point.id];
      const dot = svgElement('circle', { cx: point.x, cy: point.y,
        r: point.id === quality ? 10 : point.connected ? 4 : 3.2,
        class: `constellation-dot ${point.connected ? 'connected' : 'unlinked'}${point.id === quality ? ' quality-anchor' : ''}` });
      dot.append(svgElement('title'));
      dot.firstChild.textContent = `${term.headword} · ${term.scope}${point.id === quality ? ' · collection anchor' :
        point.connected ? '' : referenceIds.has(point.id) ? ' · Studio reference route only' :
          ' · no displayed working relationship or reference route'}`;
      dot.addEventListener('click', () => selectTerm(point.id));
      dots.append(dot);
      dotById.set(point.id, dot);
    }
    svg.append(defs, background, lines, referenceLines, dots, labels);
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

    function renderDetail(focus, directEdges, layer) {
      detail.replaceChildren();
      if (!focus) {
        detail.append(element('strong', '', 'The whole collection'),
          element('p', '', 'Quality anchors the collection map. Select a dot or use Map focus to reveal a term’s connections. The outer band contains terms with no displayed working relation.'));
        return;
      }
      const term = graph.terms[focus];
      const heading = element('div', 'constellation-detail-heading');
      heading.append(element('strong', '', term.headword));
      if (term.scope) heading.append(element('span', 'focus-scope', term.scope));
      const link = element('a', '', 'Read definition');
      link.href = `#${focus}`;
      heading.append(link);
      detail.append(heading);
      if (layer === 'navigation' && focus === quality) {
        detail.append(element('p', '', `${coverage.size} collection coverage candidates are marked in gold. Coverage is an editorial facet, not a semantic link to Quality.`));
      }
      if (!directEdges.length) {
        detail.append(element('p', '', layer === 'navigation' ?
          'No Studio draft reference route for this term in the current filters.' :
          'No displayed relationship for this term in the current filters. This does not mean that no conceptual connection exists.'));
        return;
      }
      detail.append(element('p', '', layer === 'navigation' ?
        `${directEdges.length} direct Studio draft ${directEdges.length === 1 ? 'reference route' : 'reference routes'} in the current filters. A route does not assert a conceptual relationship.` :
        `${directEdges.length} direct working ${directEdges.length === 1 ? 'relationship' : 'relationships'} in the current filters.`));
      const visibleDirect = directEdges.slice(0, 40);
      for (const [outgoing, title] of [[true, 'From this term'], [false, 'To this term']]) {
        const group = visibleDirect.filter(edge => (endpoints(edge)[0] === focus) === outgoing);
        if (!group.length) continue;
        const section = element('section', 'relation-direction-group');
        section.append(element('h4', '', title));
        const list = element('ul', 'constellation-neighbors');
        for (const edge of group) {
          const [from, to] = endpoints(edge);
          const other = outgoing ? to : from;
          const item = element('li');
          const button = element('button', '', graph.terms[other].headword);
          button.type = 'button';
          button.setAttribute('aria-label', `Focus map on ${graph.terms[other].headword}`);
          button.addEventListener('click', () => selectTerm(other));
          item.append(element('span', 'neighbor-relation', `${outgoing ? '→' : '←'} ${edge.label}`), button);
          if (graph.terms[other].scope) item.append(element('small', 'neighbor-scope', graph.terms[other].scope));
          if (layer === 'meaning' && edge.modality === 'possible') {
            item.append(element('em', 'possibility', 'possible in Studio'));
          }
          list.append(item);
        }
        section.append(list);
        detail.append(section);
      }
      if (directEdges.length > 40) detail.append(element('p', '',
        `Showing 40 links here; all ${directEdges.length} remain in the searchable list below.`));
    }

    function renderLabels(focus, directEdges) {
      labels.replaceChildren();
      if (!focus && !quality) return;
      const neighbors = [...new Set(directEdges.flatMap(edge =>
        [edge.source.object_id, edge.target.object_id]).filter(id => id !== focus))]
        .sort((a, b) => graph.terms[b].headword.length - graph.terms[a].headword.length ||
          graph.terms[a].headword.localeCompare(graph.terms[b].headword, 'en'));
      const occupied = [];
      const labelIds = [...new Set([focus || quality, quality, ...neighbors.slice(0, 12)].filter(Boolean))];
      for (const id of labelIds) {
        const point = byId.get(id);
        if (!point) continue;
        const selected = id === focus;
        const label = svgElement('text', { class: `constellation-label ${selected ? 'selected' : id === quality ? 'anchor' : 'neighbor'}` });
        label.textContent = graph.terms[id].headword;
        if (!selected) label.addEventListener('click', () => selectTerm(id));
        labels.append(label);
        const measure = label.getBBox();
        const width = measure.width;
        const height = measure.height;
        const inwardX = point.x > size / 2 ? -1 : 1;
        const inwardY = point.y > size / 2 ? -1 : 1;
        const side = direction => direction > 0 ? point.x + 16 : point.x - 16 - width;
        const above = point.y - 13;
        const below = point.y + height + 13;
        const middle = point.y - measure.y - height / 2;
        const candidates = [];
        for (const direction of [inwardX, -inwardX]) {
          for (const offset of [0, -1, 1, -2, 2, -3, 3])
            candidates.push([side(direction), middle + offset * (height + 12)]);
        }
        candidates.push([point.x - width / 2, inwardY > 0 ? below : above],
          [point.x - width / 2, inwardY > 0 ? above : below]);
        let best;
        candidates.forEach(([x, y], index) => {
          const box = { left: x + measure.x - 5, top: y + measure.y - 4,
            right: x + measure.x + width + 5, bottom: y + measure.y + height + 4 };
          const squareOverflow = Math.max(0, 12 - box.left) + Math.max(0, box.right - size + 12) +
            Math.max(0, 12 - box.top) + Math.max(0, box.bottom - size + 12);
          const corners = [[box.left, box.top], [box.right, box.top],
            [box.left, box.bottom], [box.right, box.bottom]];
          const discOverflow = corners.reduce((sum, [cx, cy]) =>
            sum + Math.max(0, Math.hypot(cx - size / 2, cy - size / 2) - 580), 0);
          const overlap = occupied.reduce((sum, prior) => sum +
            Math.max(0, Math.min(box.right, prior.right) - Math.max(box.left, prior.left)) *
            Math.max(0, Math.min(box.bottom, prior.bottom) - Math.max(box.top, prior.top)), 0);
          const score = squareOverflow * 1000 + discOverflow * 200 + overlap * 10 + index;
          if (!best || score < best.score) best = { x, y, box, score };
        });
        label.setAttribute('x', best.x);
        label.setAttribute('y', best.y);
        occupied.push(best.box);
      }
    }

    function update(focus, visibleEdges, layer = 'meaning') {
      focusId = focus;
      activeEdges = visibleEdges;
      const inNavigation = layer === 'navigation';
      const visibleIds = new Set(visibleEdges.map(edge => edge.relation_id));
      const distance = focus ? distancesFrom(focus, visibleEdges) : new Map();
      const direct = visibleEdges.filter(edge => edge.source.object_id === focus || edge.target.object_id === focus);
      for (const point of nodes) {
        const dot = dotById.get(point.id);
        const hops = distance.get(point.id);
        const radius = point.id === focus ? 11 : point.id === quality ? 10 : hops === 1 ? 7 : hops === 2 ? 5 : point.connected ? 4 : 3.2;
        const opacity = point.id === quality ? 1 : !focus ? point.connected ? .88 : .55
          : hops === 0 ? 1 : hops === 1 ? .96 : hops === 2 ? .7 : hops === 3 ? .5 : .34;
        dot.setAttribute('r', radius);
        dot.setAttribute('opacity', opacity);
        dot.classList.toggle('selected', point.id === focus);
        dot.classList.toggle('near', hops === 1);
        dot.classList.toggle('navigation-only', inNavigation && !point.connected && referenceIds.has(point.id));
        dot.classList.toggle('coverage-candidate', inNavigation && coverage.has(point.id));
      }
      for (const edge of graph.relations) {
        const line = lineById.get(edge.relation_id);
        if (!line) continue;
        const [a, b] = endpoints(edge);
        const active = focus && (a === focus || b === focus);
        line.setAttribute('opacity', inNavigation || !visibleIds.has(edge.relation_id) ? 0 :
          !focus ? .14 : active ? .9 : distance.has(a) && distance.has(b) ? .055 : .025);
        line.setAttribute('marker-end', !inNavigation && active && visibleIds.has(edge.relation_id) ?
          'url(#glossary-meaning-arrow)' : 'none');
        line.classList.toggle('selected', Boolean(active));
      }
      referenceLines.replaceChildren();
      if (inNavigation && focus) {
        for (const edge of direct.slice(0, 60)) {
          const [from, to] = endpoints(edge);
          const a = byId.get(from), b = byId.get(to);
          if (a && b) referenceLines.append(svgElement('line', { ...lineEnds(a, b),
            class: 'constellation-reference-line', 'marker-end': 'url(#glossary-reference-arrow)' }));
        }
      }
      if (focus) dots.append(dotById.get(focus));
      renderLabels(focus, direct);
      renderDetail(focus, direct, layer);
      stage.setAttribute('aria-label', focus ?
        `Constellation of ${graph.constellation.summary.total} terms focused on ${graph.terms[focus].headword}; ${direct.length} direct ${inNavigation ? 'Studio reference routes' : 'working relationships'}` :
        `Constellation of all ${graph.constellation.summary.total} released terms`);
      setViewBox();
    }
    zoomOut.addEventListener('click', () => { zoom = Math.max(1, Math.round(zoom / 1.45 * 100) / 100); setViewBox(); });
    zoomIn.addEventListener('click', () => { zoom = Math.min(3.2, Math.round(zoom * 1.45 * 100) / 100); setViewBox(); });
    showAll.addEventListener('click', () => { zoom = 1; setViewBox(); selectTerm(''); });
    update('', activeEdges, 'meaning');
    return { update };
  }

  window.GlossaryMap = { createMap };
})();
