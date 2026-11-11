const FILES = {
  sets: "data/sets.csv",
  themes: "data/themes.csv",
  treeYear: "data/tree_year.csv",
  rootYear: "data/root_year.csv",
  rootDecade: "data/root_decade.csv",
  signature: "data/theme_signature.csv",
};

export async function loadData() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, url]) => [key, await d3.csv(url, d3.autoType)])
  );
  const raw = Object.fromEntries(entries);
  const meta = await d3.json("data/metadata.json");

  const themeById = new Map(raw.themes.map(t => [t.node_id, t]));
  const childrenOf = d3.group(raw.themes.filter(t => t.parent_id !== null), t => t.parent_id);
  const roots = raw.themes.filter(t => t.depth === 0).sort((a, b) => d3.ascending(a.name, b.name));

  const treeYearByNode = d3.group(raw.treeYear, d => d.node_id);
  const rootYearByNode = d3.group(raw.rootYear, d => d.node_id);

  const signatureByRoot = new Map(raw.signature.map(s => [s.root_id, s]));

  return {
    meta,
    sets: raw.sets,
    themes: raw.themes,
    themeById,
    childrenOf,
    roots,
    treeYearByNode,
    rootYearByNode,
    rootDecade: raw.rootDecade,
    signatureByRoot,
    themeName: id => themeById.get(id)?.name ?? "",
  };
}

// adds up the given columns over the years of the period
export function sumPeriod(rows = [], [y0, y1], columns) {
  const out = Object.fromEntries(columns.map(c => [c, 0]));
  for (const r of rows) {
    if (r.year < y0 || r.year > y1) continue;
    for (const c of columns) out[c] += r[c];
  }
  return out;
}
