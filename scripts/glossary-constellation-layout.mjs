const SIZE = 1200;
const CENTER = SIZE / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const endpoints = edge => edge.direction === 'target-to-source'
  ? [edge.target.object_id, edge.source.object_id]
  : [edge.source.object_id, edge.target.object_id];

function components(adjacency) {
  const seen = new Set();
  const result = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (seen.has(start)) continue;
    const members = [start];
    seen.add(start);
    for (let index = 0; index < members.length; index++) {
      for (const neighbor of [...adjacency.get(members[index])].sort()) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        members.push(neighbor);
      }
    }
    result.push(members.sort());
  }
  return result.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
}

function positionMainComponent(members, links, adjacency) {
  const hub = [...members].sort((a, b) => adjacency.get(b).size - adjacency.get(a).size || a.localeCompare(b))[0];
  const ordered = [hub, ...members.filter(id => id !== hub).sort()];
  const indexById = new Map(ordered.map((id, index) => [id, index]));
  const points = ordered.map((id, index) => {
    const radius = index === 0 ? 0 : 35 + 270 * Math.sqrt(index / ordered.length);
    const angle = index * GOLDEN_ANGLE;
    return { id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
  });
  const localLinks = links.map(([a, b]) => [indexById.get(a), indexById.get(b)])
    .filter(([a, b]) => a !== undefined && b !== undefined);
  for (let tick = 0; tick < 240; tick++) {
    const forces = points.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const pressure = 1150 / Math.max(80, distance * distance);
        const x = dx / distance * pressure;
        const y = dy / distance * pressure;
        forces[i].x -= x; forces[i].y -= y;
        forces[j].x += x; forces[j].y += y;
      }
    }
    for (const [i, j] of localLinks) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const pull = (distance - 58) * .018;
      const x = dx / distance * pull;
      const y = dy / distance * pull;
      forces[i].x += x; forces[i].y += y;
      forces[j].x -= x; forces[j].y -= y;
    }
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      point.vx = (point.vx + forces[i].x - point.x * .0015) * .72;
      point.vy = (point.vy + forces[i].y - point.y * .0015) * .72;
      point.x += point.vx;
      point.y += point.vy;
      const radius = Math.hypot(point.x, point.y);
      if (radius > 355) {
        point.x *= 355 / radius;
        point.y *= 355 / radius;
      }
    }
  }
  return points.map(point => ({ id: point.id, x: Math.round((CENTER + point.x) * 10) / 10,
    y: Math.round((CENTER + point.y) * 10) / 10 }));
}

export function buildConstellationLayout(terms, relations) {
  const ids = Object.keys(terms).sort();
  const adjacency = new Map();
  const links = [];
  const unique = new Set();
  for (const edge of relations) {
    const [a, b] = endpoints(edge);
    if (!terms[a] || !terms[b]) throw Error(`Constellation endpoint is absent: ${edge.relation_id}`);
    if (a === b) continue;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
    const key = [a, b].sort().join('\u0000');
    if (!unique.has(key)) { unique.add(key); links.push([a, b]); }
  }
  const groups = components(adjacency);
  const positions = [];
  if (groups.length) positions.push(...positionMainComponent(groups[0], links.filter(([a]) => groups[0].includes(a)), adjacency)
    .map(point => ({ ...point, connected: true, component: 0 })));
  const smaller = groups.slice(1);
  smaller.forEach((group, componentIndex) => {
    const angle = -Math.PI / 2 + componentIndex * Math.PI * 2 / Math.max(1, smaller.length);
    const x = CENTER + Math.cos(angle) * 410;
    const y = CENTER + Math.sin(angle) * 410;
    group.forEach((id, index) => {
      const offset = (index - (group.length - 1) / 2) * 18;
      positions.push({ id, x: Math.round((x - Math.sin(angle) * offset) * 10) / 10,
        y: Math.round((y + Math.cos(angle) * offset) * 10) / 10,
        connected: true, component: componentIndex + 1 });
    });
  });
  const isolated = ids.filter(id => !adjacency.has(id)).sort((a, b) =>
    terms[a].headword.localeCompare(terms[b].headword, 'en') || a.localeCompare(b));
  const ringCount = 5;
  const perRing = Math.ceil(isolated.length / ringCount);
  isolated.forEach((id, index) => {
    const ring = Math.floor(index / perRing);
    const slot = index % perRing;
    const count = Math.min(perRing, isolated.length - ring * perRing);
    const angle = -Math.PI / 2 + (slot + ring * .23) * Math.PI * 2 / count;
    const radius = 465 + ring * 27;
    positions.push({ id, x: Math.round((CENTER + Math.cos(angle) * radius) * 10) / 10,
      y: Math.round((CENTER + Math.sin(angle) * radius) * 10) / 10,
      connected: false, component: null });
  });
  positions.sort((a, b) => a.id.localeCompare(b.id));
  return { size: SIZE, nodes: positions, summary: { total: ids.length, connected: adjacency.size,
    unlinked: isolated.length, components: groups.length, largest_component: groups[0]?.length ?? 0 } };
}
