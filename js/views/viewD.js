import { COLOR, brickEdge } from "../theme.js";
import { sumPeriod } from "../data.js";
import { tooltip } from "../tooltip.js";
import { lightbox } from "../lightbox.js";
import { timeMode } from "./viewD-time.js";
import { profileMode } from "./viewD-profile.js";
import { vocabularyMode } from "./viewD-vocabulary.js";

const MODES = [
  timeMode,
  profileMode,
  vocabularyMode,
];

const N_ROWS = 13;

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + "th";
  const s = ["th", "st", "nd", "rd"];
  return n + (s[v % 10] || s[0]);
}

function drawPlates(g, cells, key, x, y, w, h) {
  const r = Math.min(w, h) * 0.17;
  g.selectAll("rect.viewd-plate-edge").data(cells, key).join("rect")
    .attr("class", "viewd-plate-edge")
    .attr("x", x).attr("y", d => y(d) + h - 3).attr("width", w).attr("height", 3).attr("rx", 1)
    .attr("fill", d => brickEdge(d.fill))
    .attr("opacity", d => d.dimmed ? 0.3 : 1);
  g.selectAll("circle.viewd-stud").data(cells.flatMap(d => [0, 1].map(i => ({ d, i }))), s => key(s.d) + s.i).join("circle")
    .attr("class", "viewd-stud")
    .attr("cx", s => x(s.d) + w * (s.i ? 0.82 : 0.18)).attr("cy", s => y(s.d) + h * 0.45).attr("r", r)
    .attr("fill", s => d3.color(s.d.fill).brighter(0.25)).attr("stroke", s => brickEdge(s.d.fill))
    .attr("opacity", s => s.d.dimmed ? 0.3 : 1);
}

function fitLabel(el, name, suffix, maxWidth) {
  el.textContent = name + suffix;
  let n = name.length;
  while (n > 1 && el.getComputedTextLength() > maxWidth) {
    el.textContent = name.slice(0, --n).trimEnd() + "…" + suffix;
  }
}

function buildRows(data, decade, state) {
  const ranked = decade != null
    ? data.rootDecade.filter(r => r.decade === decade)
        .sort((a, b) => a.rank_sets - b.rank_sets)
        .map(r => r.root_id)
    : data.roots
        .map(t => ({ id: t.node_id, n: sumPeriod(data.rootYearByNode.get(t.node_id) ?? [], state.period, ["n_sets"]).n_sets }))
        .filter(d => d.n > 0)
        .sort((a, b) => b.n - a.n)
        .map(d => d.id);

  const rankOf = new Map(ranked.map((id, i) => [id, i + 1]));

  const rows = ranked.slice(0, N_ROWS);

  const { focusTheme, compareTheme } = state;
  const selectedIds = [focusTheme, compareTheme].filter(id => id != null);
  for (const id of selectedIds.filter(id => !rows.includes(id))) {
    if (rows.length < N_ROWS) { rows.push(id); continue; }
    // replace the last row that isn't the other selected theme
    let slot = rows.length - 1;
    while (slot >= 0 && selectedIds.includes(rows[slot])) slot--;
    if (slot >= 0) rows[slot] = id;
  }

  const byRank = (a, b) => (rankOf.get(a) ?? Infinity) - (rankOf.get(b) ?? Infinity);
  const ordered = [...selectedIds.filter(id => rows.includes(id)), ...rows.filter(id => !selectedIds.includes(id)).sort(byRank)];

  return { rows: ordered, rankOf };
}

export function createView(el, store, data) {
  let activeMode = MODES[0];
  let selectedDecade = null;

  const wrapper = d3.select(el).append("div").attr("class", "viewd-wrapper");

  const tabBar = wrapper.append("div").attr("class", "viewd-tabs");
  MODES.forEach(mode => {
    tabBar.append("button")
      .attr("class", "viewd-tab")
      .classed("active", mode.id === activeMode.id)
      .text(mode.label)
      .on("click", () => {
        activeMode = mode;
        tabBar.selectAll(".viewd-tab").classed("active", (_, i) => MODES[i].id === activeMode.id);
        render(store.get());
      });
  });

  const W = 520, H = 427;
  const M = { t: 26, r: 12, b: 56, l: 168 };
  const svg = wrapper.append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("class", "chart viewd-chart");

  const gGrid         = svg.append("g").attr("class", "viewd-grid");
  const gCells        = svg.append("g").attr("class", "viewd-cells");
  const gFooter       = svg.append("g").attr("class", "viewd-footer");
  const gDecadeOutline = svg.append("g").attr("class", "viewd-decade-outline");
  const gOutlines     = svg.append("g").attr("class", "viewd-outlines");
  const gLabelsY      = svg.append("g").attr("class", "viewd-labels-y");
  const gLabelsX      = svg.append("g").attr("class", "viewd-labels-x");
  const gPicsX        = svg.append("g").attr("class", "viewd-pics-x");
  const gLegend       = svg.append("g").attr("class", "viewd-legend");
  const rowsCaption   = svg.append("text").attr("class", "viewd-rows-caption").attr("text-anchor", "end");

  const xScale = d3.scaleBand().range([M.l, W - M.r]).paddingInner(0.06);
  const yScale = d3.scaleBand().range([M.t, H - M.b]).paddingInner(0.1);

  function selectTheme(id, state) {
    tooltip.hide();
    if (id === state.focusTheme) {
      store.set({ focusTheme: null }, "viewD");
    } else if (id === state.compareTheme) {
      store.set({ compareTheme: null }, "viewD");
    } else if (state.focusTheme == null) {
      store.set({ focusTheme: id }, "viewD");
    } else if (state.compareTheme == null) {
      store.set({ compareTheme: id }, "viewD");
    } else {
      store.set({ compareTheme: id }, "viewD");
    }
  }

  function render(state) {
    const augState = { ...state, _selectedDecade: selectedDecade };

    const { rows, rankOf } = buildRows(data, selectedDecade, state);
    const [p0, p1] = state.period;
    const rankScope = selectedDecade != null ? `the ${selectedDecade}s` : `${p0}–${p1}`;

    const cols = activeMode.columns(rows, data, augState);
    const hasFooter = typeof activeMode.footer === "function";
    const footerInfo = hasFooter ? activeMode.footer(rows, data, augState) : null;

    const footerH = 24, footerGap = 10, HEADER = 4, HEADER_ANGLED = 60;
    xScale.domain(cols.map(c => c.key));
    const pics = cols.some(c => "image" in c);
    const PIC_TOP = 6, PIC_GAP = 4, picSize = xScale.bandwidth();
    const themeCols = activeMode.columnsAreThemes === true;
    const colLabels = gLabelsX.selectAll("text").data(pics ? [] : cols, d => d.key).join("text")
      .attr("class", d => {
        if (themeCols && d.key === state.focusTheme) return "viewd-col-label viewd-label-focus";
        if (themeCols && d.key === state.compareTheme) return "viewd-col-label viewd-label-compare";
        return d.key === selectedDecade && activeMode.id === "time" ? "viewd-col-label viewd-col-selected" : "viewd-col-label";
      })
      .style("cursor", activeMode.onColumnClick || themeCols ? "pointer" : null)
      .text(d => d.label);
    const tooWide = colLabels.nodes().some(n => n.getComputedTextLength() > xScale.bandwidth() - 2);
    colLabels.classed("viewd-col-label-angled", tooWide);

    const rowsTop = pics ? PIC_TOP + picSize + PIC_GAP : M.t + (tooWide ? HEADER_ANGLED : HEADER);
    yScale.range([rowsTop, H - M.b - footerH - footerGap]);
    yScale.domain([...rows, ...d3.range(Math.max(0, N_ROWS - rows.length)).map(i => `__empty${i}`)]);
    const rowsBottom = rows.length ? yScale(rows[rows.length - 1]) + yScale.bandwidth() : M.t;
    const footerY = rowsBottom + footerGap;

    colLabels.each(function (d) {
      const cx = xScale(d.key) + xScale.bandwidth() / 2, cy = rowsTop - 6;
      const t = d3.select(this);
      if (tooWide) {
        fitLabel(this, d.label, "", (rowsTop - 8) / Math.SQRT1_2 - 4);
        t.attr("x", cx).attr("y", cy).attr("text-anchor", "end").attr("transform", `rotate(45, ${cx}, ${cy})`);
      } else {
        t.attr("x", cx).attr("y", cy).attr("text-anchor", "middle").attr("transform", null);
      }
    });
    colLabels
      .on("mousemove", (event, d) => {
        if (d.tooltip) { tooltip.show(event, d.tooltip); return; }
        if (themeCols) {
          const hint = d.key === state.focusTheme ? "unselect"
            : d.key === state.compareTheme ? "remove comparison"
            : state.focusTheme != null ? "compare" : "theme in focus";
          tooltip.show(event, `<b>${d.label}</b><br><i>Click: ${hint}</i>`);
          return;
        }
        const partial = d.isPartial ? `<br><i>Partial decade (data up to ${data.meta.years[1]})</i>` : "";
        const hint = !activeMode.onColumnClick ? ""
          : d.key === selectedDecade ? `<br><i>Click: rows = the top ${N_ROWS} of ${p0}–${p1} again</i>`
          : `<br><i>Click: rows = this decade's top ${N_ROWS}</i>`;
        if (partial || hint) tooltip.show(event, `<b>${d.label}</b>${partial}${hint}`);
      })
      .on("mouseleave", tooltip.hide)
      .on("click", (event, d) => {
        if (themeCols) { selectTheme(d.key, state); return; }
        if (activeMode.onColumnClick) {
          tooltip.hide();
          const patch = activeMode.onColumnClick(d.key, rows, data, augState);
          if (patch && "selectedDecade" in patch) {
            selectedDecade = patch.selectedDecade === selectedDecade ? null : patch.selectedDecade;
            render(store.get());
          }
        }
      });

    const picY = rowsTop - PIC_GAP - picSize;
    const tiles = gPicsX.selectAll("g.viewd-pic").data(pics ? cols : [], d => d.key).join(enter => {
      const g = enter.append("g").attr("class", "viewd-pic");
      g.append("rect").attr("class", "viewd-pic-tile").attr("rx", 3);
      g.append("image").attr("preserveAspectRatio", "xMidYMid meet");
      g.append("text").attr("class", "viewd-pic-none").attr("text-anchor", "middle").attr("dy", "0.35em").text("…");
      return g;
    });
    tiles.attr("transform", d => `translate(${xScale(d.key)},${picY})`)
      .style("cursor", d => (d.enlarge ? "zoom-in" : null));
    tiles.select("rect").attr("width", picSize).attr("height", picSize);
    tiles.select("image").attr("href", d => d.image).style("display", d => (d.image ? null : "none"))
      .attr("x", 2).attr("y", 2).attr("width", picSize - 4).attr("height", picSize - 4);
    tiles.select("text").attr("x", picSize / 2).attr("y", picSize / 2).style("display", d => (d.image ? "none" : null));
    tiles
      .on("mousemove", (event, d) => tooltip.show(event, d.tooltip))
      .on("mouseleave", tooltip.hide)
      .on("click", (event, d) => { if (d.enlarge) { tooltip.hide(); lightbox.show(d.enlarge); } });

    rowsCaption.attr("x", M.l - 6).attr("y", rowsTop - 6)
      .text(`Top ${N_ROWS} · ${selectedDecade != null ? `${selectedDecade}s` : `${p0}–${p1}`}`)
      .on("mousemove", event => tooltip.show(event, `<b>Rows</b><br>The ${N_ROWS} themes with the most sets in ${rankScope}` +
        (selectedDecade != null ? `<br><i>Click the ${selectedDecade}s header again: back to the period</i>`
          : `<br><i>Time tab: click a decade header for that decade's top ${N_ROWS}</i>`)))
      .on("mouseleave", tooltip.hide);

    const labelData = rows.map(id => ({ id, name: data.themeName(id) }));

    const rowExtra = typeof activeMode.rowTooltip === "function" ? activeMode.rowTooltip(rows, data, augState) : null;

    gLabelsY.selectAll("text").data(labelData, d => d.id).join("text")
      .attr("x", M.l - 6)
      .attr("y", d => yScale(d.id) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("class", d => {
        if (d.id === state.focusTheme) return "viewd-row-label viewd-label-focus";
        if (d.id === state.compareTheme) return "viewd-row-label viewd-label-compare";
        return "viewd-row-label";
      })
      .each(function (d) { fitLabel(this, d.name, "", M.l - 12); })
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => {
        const hint = d.id === state.focusTheme ? "unselect"
          : d.id === state.compareTheme ? "remove comparison"
          : state.focusTheme != null ? "compare" : "theme in focus";
        tooltip.show(event,
        `<b>${d.name}</b><br>${rankOf.has(d.id) ? `${ordinal(rankOf.get(d.id))} in ${rankScope} (sets)` : `No sets in ${rankScope}`}` +
        (rowExtra?.get(d.id) ? `<br>${rowExtra.get(d.id)}` : "") +
        `<br><i>Click: ${hint}</i>`);
      })
      .on("mouseleave", tooltip.hide)
      .on("click", (event, d) => selectTheme(d.id, state));

    gGrid.selectAll("line.viewd-hline").data(rows, d => d).join("line")
      .attr("class", "viewd-hline")
      .attr("x1", M.l).attr("x2", W - M.r)
      .attr("y1", d => yScale(d) + yScale.bandwidth())
      .attr("y2", d => yScale(d) + yScale.bandwidth());

    const cellData = activeMode.cells(rows, data, augState);
    gCells.selectAll("rect.viewd-cell").data(cellData, d => `${d.rowId}-${d.colKey}`).join("rect")
      .attr("class", "viewd-cell")
      .attr("x", d => xScale(d.colKey))
      .attr("y", d => yScale(d.rowId))
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("rx", 2)
      .attr("fill", d => d.fill)
      .attr("stroke", d => brickEdge(d.fill))
      .attr("opacity", d => d.dimmed ? 0.3 : 1)
      .on("mousemove", (event, d) => {
        if (d.tooltip) tooltip.show(event, d.tooltip);
      })
      .on("mouseleave", tooltip.hide);

    drawPlates(gCells, cellData, d => `${d.rowId}-${d.colKey}`, d => xScale(d.colKey), d => yScale(d.rowId),
      xScale.bandwidth(), yScale.bandwidth());

    const textCells = cellData.filter(d => d.text);
    gCells.selectAll("text.viewd-cell-text").data(textCells, d => `t-${d.rowId}-${d.colKey}`).join("text")
      .attr("class", "viewd-cell-text")
      .attr("x", d => xScale(d.colKey) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.rowId) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("opacity", d => d.dimmed ? 0.3 : 1)
      .style("fill", d => (d3.lab(d.fill).l < 55 ? COLOR.onColor : null))
      .text(d => d.text)
      .raise();

    if (activeMode.id === "time" && xScale(selectedDecade) != null) {
      const sx = xScale(selectedDecade) - 1;
      const sw = xScale.bandwidth() + 2;
      gDecadeOutline.selectAll("rect.viewd-decade-rect").data([selectedDecade]).join("rect")
        .attr("class", "viewd-decade-rect")
        .attr("x", sx)
        .attr("y", rowsTop - 2)
        .attr("width", sw)
        .attr("height", (footerInfo ? footerY + footerH : rowsBottom) - rowsTop + 4)
        .attr("rx", 3)
        .attr("fill", "none")
        .attr("stroke", COLOR.ink2)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5 3");
    } else {
      gDecadeOutline.selectAll("rect.viewd-decade-rect").data([]).join("rect");
    }

    gFooter.selectAll("*").remove();
    if (footerInfo) {
      gFooter.append("text")
        .attr("x", M.l - 6)
        .attr("y", footerY + footerH / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .attr("class", "viewd-footer-label")
        .text(footerInfo.label);

      gFooter.selectAll("rect.viewd-footer-cell").data(footerInfo.cells, d => d.colKey).join("rect")
        .attr("class", "viewd-footer-cell")
        .attr("x", d => xScale(d.colKey))
        .attr("y", footerY)
        .attr("width", xScale.bandwidth())
        .attr("height", footerH)
        .attr("rx", 2)
        .attr("fill", d => d.fill)
        .attr("stroke", d => brickEdge(d.fill))
        .attr("opacity", d => d.dimmed ? 0.3 : 1)
        .on("mousemove", (event, d) => {
          if (d.tooltip) tooltip.show(event, d.tooltip);
        })
        .on("mouseleave", tooltip.hide);

      drawPlates(gFooter, footerInfo.cells, d => d.colKey, d => xScale(d.colKey), () => footerY, xScale.bandwidth(), footerH);

      gFooter.selectAll("text.viewd-footer-text").data(footerInfo.cells, d => d.colKey).join("text")
        .attr("class", "viewd-footer-text")
        .attr("x", d => xScale(d.colKey) + xScale.bandwidth() / 2)
        .attr("y", footerY + footerH / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .attr("opacity", d => d.dimmed ? 0.3 : 1)
        .text(d => d.text);
    }

    const selectedIds = rows.filter(id => id === state.focusTheme || id === state.compareTheme);
    const outlineData = [
      ...selectedIds.map(id => ({ id, key: `row-${id}`, x: M.l, y: yScale(id) - 1, w: W - M.l - M.r, h: yScale.bandwidth() + 2 })),
      ...(themeCols ? selectedIds.filter(id => xScale(id) != null).map(id => ({
        id, key: `col-${id}`, x: xScale(id) - 1, y: rowsTop - 1, w: xScale.bandwidth() + 2, h: rowsBottom - rowsTop + 2 })) : []),
    ];
    gOutlines.selectAll("rect.viewd-outline").data(outlineData, d => d.key).join("rect")
      .attr("class", d => `viewd-outline ${d.id === state.focusTheme ? "viewd-outline-focus" : "viewd-outline-compare"}`)
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 2)
      .attr("fill", "none")
      .attr("stroke", d => d.id === state.focusTheme ? COLOR.focus : COLOR.compare)
      .attr("stroke-width", 2);

    const legendInfo = activeMode.legend(rows, data, augState);
    gLegend.selectAll("*").remove();
    if (legendInfo && legendInfo.scale) {
      const lx = M.l, ly = H - 26, lw = 140, lh = 10;
      const defs = svg.select("defs").empty() ? svg.append("defs") : svg.select("defs");
      const gradId = `viewd-grad-${activeMode.id}`;

      const nStops = 20;
      const dom = legendInfo.scale.domain();
      const seg = dom.length - 1;
      const valueAt = f => { const k = Math.min(seg - 1, Math.floor(f * seg)); return dom[k] + (dom[k + 1] - dom[k]) * (f * seg - k); };
      const stops = d3.range(nStops + 1).map(i => ({ offset: `${(i / nStops) * 100}%`, color: legendInfo.scale(valueAt(i / nStops)) }));

      const grad = defs.selectAll(`#${gradId}`).data([0]).join("linearGradient")
        .attr("id", gradId);
      grad.selectAll("stop").data(stops).join("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color);

      gLegend.append("text")
        .attr("x", lx).attr("y", ly - 3)
        .attr("class", "viewd-legend-title")
        .text(legendInfo.title);

      gLegend.append("rect")
        .attr("x", lx).attr("y", ly).attr("width", lw).attr("height", lh)
        .attr("rx", 2)
        .attr("fill", `url(#${gradId})`);

      const fmt = legendInfo.format || (v => v);
      gLegend.selectAll("text.viewd-legend-label").data(dom).join("text")
        .attr("class", "viewd-legend-label")
        .attr("x", (d, i) => lx + lw * i / seg).attr("y", ly + lh + 10)
        .attr("text-anchor", (d, i) => (i === 0 ? "start" : i === seg ? "end" : "middle"))
        .text((d, i) => fmt(d) + (seg === 2 && i === 1 && legendInfo.midLabel ? ` ${legendInfo.midLabel}` : ""));
    }
  }

  const USED = ["period", "focusTheme", "compareTheme"];
  store.subscribe((state, changed) => {
    if (changed.has("clearAll")) selectedDecade = null;
    if (USED.some(k => changed.has(k)) || changed.has("clearAll")) render(state);
  });
  render(store.get());

  return {
    render,
    setDecade(decade) {
      selectedDecade = decade;
      render(store.get());
    },
  };
}
