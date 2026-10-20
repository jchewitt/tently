export interface PathEdge { id: string; from: string; to: string }

/** One shortest directed path over displayed facts only; it does not add inferred edges. */
export function findEvidencePath(edges: readonly PathEdge[], start: string, target: string, maxVisited = 1000) {
  const queue = [start];
  const parents = new Map<string, { node: string; edge: string }>();
  const visited = new Set([start]);
  let truncated = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (current === target) {
      const edgeIds: string[] = [];
      let node = target;
      while (parents.has(node)) {
        const parent = parents.get(node)!;
        edgeIds.unshift(parent.edge);
        node = parent.node;
      }
      return { found: true, edgeIds, truncated };
    }
    for (const edge of edges.filter((item) => item.from === current)) {
      if (visited.has(edge.to)) continue;
      if (visited.size >= maxVisited) { truncated = true; continue; }
      visited.add(edge.to);
      parents.set(edge.to, { node: current, edge: edge.id });
      queue.push(edge.to);
    }
  }
  return { found: false, edgeIds: [] as string[], truncated };
}

export function viewerScript(): string {
  return `
    (() => {
      const findPath = ${findEvidencePath.toString()};
      const model = JSON.parse(document.getElementById('visual-model').textContent);
      const search = document.getElementById('graph-search');
      const cluster = document.getElementById('graph-cluster');
      const detail = document.getElementById('node-detail');
      const target = document.getElementById('path-target');
      const status = document.getElementById('path-status');
      const layers = [...document.querySelectorAll('[data-layer]')];
      const edges = [...document.querySelectorAll('[data-visual-edge]')];
      const nodes = [...document.querySelectorAll('[data-visual-node]')];
      const rows = [...document.querySelectorAll('[data-relationship-row]')];
      let selected;
      let pathIds = new Set();
      const enabledEdges = () => {
        const enabled = new Set(layers.filter(item => item.checked).map(item => item.dataset.layer));
        return model.edges.filter(edge => enabled.has(edge.authority));
      };
      const update = () => {
        const enabled = new Set(enabledEdges().map(edge => edge.id));
        const query = search.value.trim().toLowerCase();
        const clusterIds = new Set(model.nodes.filter(node => !cluster.value || node.cluster === cluster.value).map(node => node.id));
        const connected = new Set();
        let count = 0;
        for (const edge of edges) {
          const visible = enabled.has(edge.dataset.edgeId) && (!query || edge.dataset.search.includes(query)) &&
            (clusterIds.has(edge.dataset.from) || clusterIds.has(edge.dataset.to)) &&
            (!document.getElementById('neighbors-only').checked || !selected ||
              edge.dataset.from === selected || edge.dataset.to === selected);
          edge.classList.toggle('is-hidden', !visible);
          edge.classList.toggle('is-highlighted', pathIds.has(edge.dataset.edgeId));
          if (visible) { count++; connected.add(edge.dataset.from); connected.add(edge.dataset.to); }
        }
        for (const node of nodes) {
          node.classList.toggle('is-hidden', !connected.has(node.dataset.nodeId) && node.dataset.nodeId !== selected);
          node.classList.toggle('is-selected', node.dataset.nodeId === selected);
        }
        const visibleIds = new Set(edges.filter(edge => !edge.classList.contains('is-hidden')).map(edge => edge.dataset.edgeId));
        rows.forEach(row => row.classList.toggle('is-hidden', !visibleIds.has(row.dataset.edgeId)));
        document.getElementById('visible-count').textContent = count + ' visible relationships from this page';
      };
      const select = (id) => {
        selected = id; pathIds.clear(); status.textContent = '';
        detail.replaceChildren();
        const node = model.nodes.find(node => node.id === id);
        const heading = document.createElement('strong');
        heading.textContent = node.label + ' · ' + node.kind;
        detail.append(heading);
        const identifier = document.createElement('p'); identifier.textContent = id; detail.append(identifier);
        for (const edge of model.edges.filter(edge => edge.from === id || edge.to === id)) {
          const item = document.createElement('p');
          item.textContent = edge.authority + ': ' + edge.from + ' → ' + edge.label + ' → ' + edge.to + '\\n' + edge.detail;
          const source = document.createElement(edge.sourceUrl ? 'a' : 'code');
          source.textContent = edge.provenance + ' @ ' + edge.source.commitSha.slice(0,12);
          if (edge.sourceUrl) { source.href = edge.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; }
          item.append(document.createElement('br'), source);
          const focus = document.createElement('button'); focus.textContent = 'Show source relationships';
          focus.addEventListener('click', () => { search.value = edge.source.path; update(); });
          item.append(document.createElement('br'), focus); detail.append(item);
        }
        update();
      };
      nodes.forEach(node => {
        node.addEventListener('click', () => select(node.dataset.nodeId));
        node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.dataset.nodeId); } });
      });
      document.getElementById('highlight-path').addEventListener('click', () => {
        if (!selected) { status.textContent = 'Select a start node first.'; return; }
        const result = findPath(enabledEdges(), selected, target.value);
        pathIds = new Set(result.edgeIds);
        status.textContent = result.found ? 'One shortest directed path: ' + result.edgeIds.length + ' relationships.' :
          'No path found in this displayed page and authority selection. Check coverage and continuation.';
        if (result.truncated) status.textContent += ' Exploration limit reached.';
        search.value = ''; cluster.value = ''; document.getElementById('neighbors-only').checked = false;
        update();
      });
      search.addEventListener('input', update); cluster.addEventListener('change', update);
      document.getElementById('neighbors-only').addEventListener('change', update);
      layers.forEach(item => item.addEventListener('change', () => { pathIds.clear(); status.textContent = ''; update(); }));
      document.getElementById('reset-filters').addEventListener('click', () => {
        search.value = ''; cluster.value = ''; selected = undefined; pathIds.clear();
        document.getElementById('neighbors-only').checked = false;
        layers.forEach(item => { item.checked = true; });
        detail.textContent = 'Select a node to inspect its cited relationships.'; status.textContent = ''; update();
      });
      update();
    })();
  `;
}
