import { profile, percentiles } from "../stats.js";
import { divergingScale } from "../theme.js";

const DIMS = [
  { key: "parts",        label: "Parts",     format: v => Math.round(v).toLocaleString(), title: "Typical set size",             unit: v => `${Math.round(v).toLocaleString()} parts` },
  { key: "colours",      label: "Colours",   format: v => Math.round(v).toLocaleString(), title: "Colours in a typical set",     unit: v => `${Math.round(v)} colours` },
  { key: "categories",   label: "Part cat.", format: v => Math.round(v).toLocaleString(), title: "Part categories in a typical set", unit: v => `${Math.round(v)} categories` },
  { key: "minifigShare", label: "Minifigs",  format: v => (v * 100).toFixed(0) + "%",     title: "Sets with minifigures",        unit: v => `${(v * 100).toFixed(0)}% of sets` },
];

const times = v => (v >= 10 ? Math.round(v) : v >= 1 ? +v.toFixed(1) : +v.toFixed(2)) + "×";

export const profileMode = {
  id: "profile",
  label: "Profile",

  columns(rows, data, state) {
    return DIMS.map(d => ({ key: d.key, label: d.label }));
  },

  cells(rows, data, state) {
    const period = state.period || data.meta.years;

    const cat = profile(data.rootYearByNode.get(0), period);
    const profiles = new Map();
    for (const id of rows) {
      const p = profile(data.rootYearByNode.get(id), period);
      if (p) profiles.set(id, p);
    }

    const scale = divergingScale(0, 0.5, 1);
    const result = [];

    for (const dim of DIMS) {
      const values = rows.map(id => {
        const p = profiles.get(id);
        return p ? p[dim.key] : null;
      });

      const pcts = percentiles(values);

      for (let i = 0; i < rows.length; i++) {
        const id = rows[i];
        const val = values[i];
        const pct = pcts[i];
        if (val == null) continue;

        const themeName = data.themeName(id);
        const fmtVal = dim.format(val);
        const catVal = cat ? cat[dim.key] : null;

        result.push({
          rowId: id,
          colKey: dim.key,
          value: val,
          fill: scale(pct),
          text: fmtVal,
          tooltip: `<b>${themeName}</b> · ${dim.title}`
            + `<br>${themeName}: <b>${dim.unit(val)}</b>`
            + (catVal ? `<br>Whole catalogue: ${dim.unit(catVal)}<br><b>${times(val / catVal)}</b> the catalogue` : "")
            + `<br><i>${period[0]}–${period[1]}</i>`,
        });
      }
    }

    return result;
  },

  legend(rows, data, state) {
    return {
      title: "Percentile among shown themes",
      midLabel: "(median)",
      scale: divergingScale(0, 0.5, 1),
      format: v => d3.format(".0%")(v),
    };
  },
};
