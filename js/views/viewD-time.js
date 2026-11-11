import { COLOR, sequentialScale } from "../theme.js";

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  const s = ["th", "st", "nd", "rd"];
  return n + (s[v % 10] || s[0]);
}

function pct(v) { return v == null ? "—" : (v * 100).toFixed(1) + "%"; }

function indexByIdDecade(rootDecade) {
  const m = new Map();
  for (const r of rootDecade) m.set(`${r.root_id}|${r.decade}`, r);
  return m;
}

function othersOf(rootDecade, decade, rows) {
  const shown = new Set(rows);
  const inDecade = rootDecade.filter(r => r.decade === decade);
  const others = inDecade.filter(r => !shown.has(r.root_id));
  return {
    // so each decade column adds up to 100%
    share: Math.max(0, 1 - d3.sum(inDecade.filter(r => shown.has(r.root_id)), r => r.share_sets)),
    sets: d3.sum(others, r => r.n_sets),
    themes: others.length,
  };
}

export const timeMode = {
  id: "time",
  label: "Time",

  columns(rows, data, state) {
    const lastDecade = data.meta.decades[data.meta.decades.length - 1];
    return data.meta.decades.map(d => ({
      key: d,
      label: `${d}s`,
      isPartial: d === lastDecade,
    }));
  },

  cells(rows, data, state) {
    const idx = indexByIdDecade(data.rootDecade);
    const decades = data.meta.decades;
    const [y0, y1] = state.period || data.meta.years;

    const allShares = [];
    const raw = [];
    for (const id of rows) {
      for (const dec of decades) {
        const entry = idx.get(`${id}|${dec}`);
        const share = entry ? entry.share_sets : 0;
        const rank  = entry ? entry.rank_sets : null;
        allShares.push(share);
        raw.push({ rowId: id, colKey: dec, share, rank });
      }
    }

    const maxShare = d3.max(allShares) || 0.01;
    const scale = sequentialScale(maxShare);

    const inPeriod = dec => (dec + 9 >= y0 && dec <= y1);

    return raw.map(d => {
      const themeName = data.themeName(d.rowId);
      const dimmed = !inPeriod(d.colKey);

      return {
        rowId: d.rowId,
        colKey: d.colKey,
        value: d.share,
        fill: scale(d.share),
        text: null,
        dimmed,
        tooltip: `<b>${themeName}</b><br>${d.colKey}s: ${pct(d.share)} of sets`
                 + (d.rank != null ? ` · rank ${ordinal(d.rank)}` : "")
                 + (d.colKey === decades[decades.length - 1] ? "<br><i>(partial decade)</i>" : ""),
      };
    });
  },

  footer(rows, data, state) {
    const decades = data.meta.decades;
    const [y0, y1] = state.period || data.meta.years;
    const inPeriod = dec => (dec + 9 >= y0 && dec <= y1);
    const selectedDecade = state._selectedDecade;
    const rowsAreTop = selectedDecade != null &&
      rows.every(id => data.rootDecade.some(r => r.root_id === id && r.decade === selectedDecade && r.rank_sets <= rows.length));

    const greyScale = d3.scaleLinear().domain([0, 1]).range([COLOR.grid, COLOR.context]).clamp(true);

    return {
      label: "Others",
      cells: decades.map(dec => {
        const o = othersOf(data.rootDecade, dec, rows);
        const topNote = dec === selectedDecade && rowsAreTop ? `<br>= the share outside this decade's top ${rows.length}` : "";
        return {
          colKey: dec,
          fill: greyScale(o.share),
          text: pct(o.share),
          dimmed: !inPeriod(dec),
          tooltip: `<b>Others · ${dec}s</b><br>${pct(o.share)} of the decade's sets: ${o.sets.toLocaleString()} sets in ${o.themes} themes not shown above`
                   + topNote
                   + (dec === decades[decades.length - 1] ? "<br><i>(partial decade)</i>" : ""),
        };
      }),
    };
  },

  legend(rows, data, state) {
    const idx = indexByIdDecade(data.rootDecade);
    const decades = data.meta.decades;

    let maxShare = 0;
    for (const id of rows) {
      for (const dec of decades) {
        const entry = idx.get(`${id}|${dec}`);
        if (entry) maxShare = Math.max(maxShare, entry.share_sets);
      }
    }
    maxShare = maxShare || 0.01;

    return {
      title: "Share of the decade",
      scale: sequentialScale(maxShare),
      format: d3.format(".0%"),
    };
  },

  onColumnClick(colKey) {
    return { selectedDecade: colKey };
  },
};
