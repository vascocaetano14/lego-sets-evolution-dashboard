import { sumPeriod } from "../data.js";
import { COLOR, divergingScale } from "../theme.js";

const RANGE = 2;
const N_COLUMNS = 10;
// ignore tiny categories, their ratios get huge
const MIN_SHARE = 0.01;
const OTHER = "__other";

const times = v => (v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(1) : +v.toFixed(2)) + "×";
const pct = v => (v * 100).toFixed(1) + "%";

function categoryShares(data, nodeId, period) {
  const keys = data.meta.part_categories.map(c => c.key);
  const sums = sumPeriod(data.rootYearByNode.get(nodeId), period, keys);
  const total = d3.sum(keys, k => sums[k]);
  return total ? { total, share: Object.fromEntries(keys.map(k => [k, sums[k] / total])) } : null;
}

function shownCategories(data, state, period) {
  const all = data.meta.part_categories;
  const cat = categoryShares(data, 0, period);
  const focus = state.focusTheme != null ? categoryShares(data, state.focusTheme, period) : null;
  let cols = all.slice(0, N_COLUMNS);
  if (focus && cat) {
    cols = all.filter(c => focus.share[c.key] >= MIN_SHARE && cat.share[c.key] > 0)
      .sort((a, b) => focus.share[b.key] / cat.share[b.key] - focus.share[a.key] / cat.share[a.key])
      .slice(0, N_COLUMNS);
  }
  return [...cols, { key: OTHER, name: "Other" }];
}

const shareOf = (shares, key, cols) =>
  key === OTHER ? Math.max(0, 1 - d3.sum(cols.filter(c => c.key !== OTHER), c => shares.share[c.key])) : shares.share[key];

function swatch(rgb) {
  return `<span style="display:inline-block;width:8px;height:8px;background:#${rgb};border-radius:2px;margin-right:3px;border:1px solid ${COLOR.edge};vertical-align:middle"></span>`;
}

export const vocabularyMode = {
  id: "vocabulary",
  label: "Vocabulary",

  columns(rows, data, state) {
    const period = state.period || data.meta.years;
    const cat = categoryShares(data, 0, period);
    const cols = shownCategories(data, state, period);
    const why = state.focusTheme != null
      ? `<br><i>Columns: the categories ${data.themeName(state.focusTheme)} uses most above the catalogue</i>`
      : "<br><i>Columns: the largest categories of the catalogue (select a theme to see its own)</i>";
    return cols.map(c => ({
      key: c.key,
      label: c.name,
      image: c.piece?.img ?? null,
      enlarge: c.piece?.img ? { img: c.piece.img, title: c.name,
        lines: [`${c.piece.name} · ${c.piece.colour}`] } : null,
      tooltip: `<b>${c.name}</b><br>` + (c.key === OTHER ? "Every part category not shown" : "Rebrickable part category") +
        (c.piece?.img ? `<br>Pictured: ${c.piece.name} · ${c.piece.colour}` : "") +
        (cat ? `<br>${pct(shareOf(cat, c.key, cols))} of the catalogue's parts in the period` : "") + why +
        (c.piece?.img ? "<br><i>Click: enlarge the piece</i>" : ""),
    }));
  },

  cells(rows, data, state) {
    const period = state.period || data.meta.years;
    const cat = categoryShares(data, 0, period);
    if (!cat) return [];
    const scale = divergingScale(-RANGE, 0, RANGE);
    const cols = shownCategories(data, state, period);
    const out = [];
    for (const id of rows) {
      const th = categoryShares(data, id, period);
      if (!th) continue;
      const name = data.themeName(id);
      for (const c of cols) {
        const thShare = shareOf(th, c.key, cols), catShare = shareOf(cat, c.key, cols);
        const ratio = thShare / catShare;
        out.push({
          rowId: id,
          colKey: c.key,
          value: ratio,
          fill: scale(ratio > 0 ? Math.log2(ratio) : -RANGE),
          text: null,
          tooltip: `<b>${name}</b> · ${c.name}`
            + `<br>${pct(thShare)} of its parts (catalogue: ${pct(catShare)})`
            + `<br><b>${ratio > 0 ? times(ratio) : "none"}</b>${ratio > 0 ? " the catalogue's share" : ""}`
            + `<br><i>${period[0]}–${period[1]}</i>`,
        });
      }
    }
    return out;
  },

  legend(rows, data, state) {
    return {
      title: "Use of the category vs the catalogue",
      scale: divergingScale(-RANGE, 0, RANGE),
      format: v => (v < 0 ? `1/${2 ** -v}×` : times(2 ** v)),
      midLabel: "(same)",
    };
  },

  rowTooltip(rows, data, state) {
    const lines = new Map();
    for (const id of rows) {
      const sig = data.signatureByRoot.get(id);
      lines.set(id, sig
        ? `Characteristic element: ${swatch(sig.rgb)}${sig.part_name} · ${sig.color_name}`
        : "No characteristic element");
    }
    return lines;
  },
};
