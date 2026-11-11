import { COLOR, formatParts, brickEdge } from "../theme.js";
import { tooltip } from "../tooltip.js";

export function createView(el, store, data) {
  const M = { t: 12, r: 16, b: 28, l: 64 };
  let W = 1000, H = 250;
  const [FIRST_YEAR, LAST_YEAR] = data.meta.years;
  const MIN_TOP = 10000;
  const DURATION = 300;

  const svg = d3.select(el).append("svg").attr("class", "chart");

  const x = d3.scaleLinear().domain([FIRST_YEAR - 0.5, LAST_YEAR + 0.5]);
  let scaleMode = "log";
  const yLog = d3.scaleLog().domain([1, MIN_TOP]).clamp(true);
  const yLin = d3.scaleLinear().domain([0, 1000]).clamp(true);
  let y = yLog;

  const header = d3.select(el.parentNode).select("header");
  const toggle = (header.empty() ? d3.select(el).append("div") : header.append("div"))
    .attr("class", "viewa-toggle")
    .attr("role", "group").attr("aria-label", "Y scale");
  toggle.selectAll("button").data(["log", "linear"]).join("button")
    .attr("class", "toggle-btn")
    .text(m => (m === "log" ? "Log" : "Linear"))
    .on("click", (event, m) => {
      if (m === scaleMode) return;
      scaleMode = m;
      y = m === "log" ? yLog : yLin;
      render(store.get(), DURATION);
    });

  const xTicks = [FIRST_YEAR, ...d3.range(1950, LAST_YEAR + 1, 10), LAST_YEAR];

  const gGrid = svg.append("g").attr("class", "grid");

  const gAxisX = svg.append("g").attr("class", "axis");

  const gAxisY = svg.append("g").attr("class", "axis").attr("transform", `translate(${M.l},0)`);

  const yTitle = svg.append("g").attr("class", "axis-label").append("text")
    .attr("text-anchor", "middle")
    .text("Parts per set");

  const gBoxes = svg.append("g").attr("class", "boxes");

  const label = svg.append("text").attr("class", "view-label")
    .attr("x", M.l + 10).attr("y", M.t + 16)
    .attr("pointer-events", "none")
    .attr("font-size", 13).attr("font-weight", 900).attr("letter-spacing", "0.06em")
    .style("text-transform", "uppercase");

  function layout() {
    W = Math.max(300, el.clientWidth);
    H = Math.max(150, el.clientHeight);
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    x.range([M.l, W - M.r]);
    yLog.range([H - M.b, M.t]);
    yLin.range([H - M.b, M.t]);

    brush.extent([[M.l, M.t], [W - M.r, H - M.b]]);
    gBrush.call(brush);
    yTitle.attr("transform", `translate(14, ${(M.t + H - M.b) / 2}) rotate(-90)`);

    gAxisX.attr("transform", `translate(0,${H - M.b})`)
      .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format("d")));
    gAxisX.selectAll(".tick text")
      .attr("text-anchor", d => d === FIRST_YEAR ? "end" : d === 1950 ? "start" : "middle")
      .attr("dx", d => d === FIRST_YEAR ? "-2px" : d === 1950 ? "2px" : null);
  }

  function seriesFor(state) {
    const catalogue = { role: "catalogue", nodeId: 0, name: "All sets", color: COLOR.context, edge: COLOR.ink2, median: COLOR.ink };
    const theme = (role, id) => ({ role, nodeId: id, name: data.themeName(id) || `Theme ${id}`,
      color: COLOR[role], edge: brickEdge(COLOR[role]), median: COLOR.onColor });
    const first = state.focusTheme != null ? theme("focus", state.focusTheme) : catalogue;
    return state.compareTheme != null ? [first, theme("compare", state.compareTheme)] : [first];
  }

  function compute(state) {
    const series = seriesFor(state);
    return series.flatMap((sr, slot) => (data.rootYearByNode.get(sr.nodeId) ?? [])
      .filter(r => r.p_median != null && r.p_median > 0)
      .map(r => ({
        key: `${slot}-${r.year}`,
        slot, nSlots: series.length, series: sr,
        year: r.year,
        n_sets: r.n_sets,
        q1: r.p_q1,
        median: r.p_median,
        q3: r.p_q3,
        whiskLo: r.p_whisk_lo ?? r.p_q1,
        whiskHi: r.p_whisk_hi ?? r.p_q3,
      })))
      .sort((a, b) => a.year - b.year || a.slot - b.slot);
  }

  function yTopFor(rows) {
    if (scaleMode === "linear") {
      const hi = d3.max(rows, d => d.q3) ?? 1;
      return d3.scaleLinear().domain([0, hi * 1.05]).nice(5).domain()[1];
    }
    const hi = d3.max(rows, d => d.whiskHi) ?? 1;
    return Math.max(MIN_TOP, 10 ** Math.ceil(Math.log10(Math.max(hi, 1))));
  }

  function inPeriod(year, period) {
    const [y0, y1] = period ?? [FIRST_YEAR, LAST_YEAR];
    return (y0 <= FIRST_YEAR && y1 >= LAST_YEAR) || (year >= y0 && year <= y1);
  }
  const opacityFor = (d, state) => (inPeriod(d.year, state.period) ? 1 : 0.25);

  const fmt = v => (v == null ? "—" : Number.isInteger(v) ? v : v.toFixed(1));

  const swatch = c => `<span style="display:inline-block;width:9px;height:9px;margin-right:4px;background:${c};vertical-align:baseline"></span>`;

  function tooltipContent(year, rowsOfYear) {
    const several = rowsOfYear.length > 1;
    return `<b>${year}</b>` + rowsOfYear.map(d =>
      `<br>${several ? swatch(d.series.color) : ""}<b>${d.series.name}</b> · ${d.n_sets} ${d.n_sets === 1 ? "set" : "sets"}<br>` +
      `Median: <b>${fmt(d.median)}</b> parts · Q1–Q3: ${fmt(d.q1)}–${fmt(d.q3)}<br>` +
      `Whiskers: ${fmt(d.whiskLo)}–${fmt(d.whiskHi)}`).join("<br>");
  }

  const yv = v => y(scaleMode === "log" ? Math.max(1, v) : v);
  let lastSelection = undefined;

  function render(state, duration) {
    const rows = compute(state);
    const series = seriesFor(state);
    const selection = `${state.focusTheme}|${state.compareTheme}`;
    const themeChanged = lastSelection !== selection;
    lastSelection = selection;
    const animDuration = duration ?? (themeChanged ? DURATION : 120);
    const t = svg.transition().duration(animDuration);

    const [y0, y1] = state.period ?? [FIRST_YEAR, LAST_YEAR];
    const isFull = y0 <= FIRST_YEAR && y1 >= LAST_YEAR;

    gBrush.call(brush.move, isFull ? null : [x(y0 - 0.5), x(y1 + 0.5)]);
    currentRows = rows;

    toggle.selectAll("button").classed("active", m => m === scaleMode);
    const top = yTopFor(rows);
    y.domain([scaleMode === "log" ? 1 : 0, top]);
    const yTicks = scaleMode === "log"
      ? d3.range(0, Math.round(Math.log10(top)) + 1).map(i => 10 ** i)
      : y.ticks(5);
    gAxisY.transition(t).call(d3.axisLeft(y).tickValues(yTicks).tickFormat(formatParts));

    gGrid.selectAll("line").data(yTicks, d => d).join(
      enter => enter.append("line")
        .attr("x1", M.l).attr("x2", W - M.r)
        .attr("y1", d => y(d)).attr("y2", d => y(d))
        .attr("stroke", COLOR.grid).attr("stroke-width", 1),
      update => update.attr("x2", W - M.r)
        .call(u => u.transition(t).attr("y1", d => y(d)).attr("y2", d => y(d))),
      exit => exit.remove()
    );

    label.selectAll("tspan").data(series.flatMap((sr, i) => (i ? [{ text: " vs ", fill: COLOR.ink2 }] : [])
      .concat({ text: sr.name, fill: sr.role === "catalogue" ? COLOR.ink : sr.color }))).join("tspan")
      .text(d => d.text).attr("fill", d => d.fill);

    const step = x(2) - x(1);
    const boxW = series.length > 1 ? step * 0.38 : step * 0.6;
    const half = boxW / 2;
    const capHalf = half / 2;
    const centre = d => x(d.year) + (d.nSlots > 1 ? (d.slot === 0 ? -1 : 1) * step * 0.21 : 0);

    function paint(sel, animate) {
      sel.each(function (d) {
        const g = d3.select(this);
        const s = name => (animate ? g.select(name).transition(t) : g.select(name));
        const cx = centre(d);
        const stroke = d.series.edge;

        const yTop = Math.min(yv(d.whiskHi), yv(d.q3));
        const yBot = Math.max(yv(d.whiskLo), yv(d.q1));

        s(".hit")
          .attr("x", cx - half)
          .attr("width", boxW)
          .attr("y", yTop - 2)
          .attr("height", Math.max(8, yBot - yTop + 4));

        s(".whisk-lo").attr("x1", cx).attr("x2", cx)
          .attr("y1", yv(d.whiskLo)).attr("y2", yv(d.q1)).attr("stroke", stroke);
        s(".whisk-hi").attr("x1", cx).attr("x2", cx)
          .attr("y1", yv(d.q3)).attr("y2", yv(d.whiskHi)).attr("stroke", stroke);

        s(".cap-lo").attr("x1", cx - capHalf).attr("x2", cx + capHalf)
          .attr("y1", yv(d.whiskLo)).attr("y2", yv(d.whiskLo)).attr("stroke", stroke);
        s(".cap-hi").attr("x1", cx - capHalf).attr("x2", cx + capHalf)
          .attr("y1", yv(d.whiskHi)).attr("y2", yv(d.whiskHi)).attr("stroke", stroke);

        const clipped = scaleMode === "linear" && d.whiskHi > top;
        g.select(".cap-hi").attr("display", clipped ? "none" : null);
        g.select(".clip-mark").attr("display", clipped ? null : "none")
          .attr("d", `M${cx - 3.5},${M.t + 6}L${cx},${M.t}L${cx + 3.5},${M.t + 6}Z`).attr("fill", stroke);

        s(".iqr").attr("x", cx - half).attr("width", boxW)
          .attr("y", yv(d.q3)).attr("height", Math.max(0, yv(d.q1) - yv(d.q3)))
          .attr("fill", d.series.color).attr("stroke", stroke);

        s(".median").attr("x1", cx - half).attr("x2", cx + half)
          .attr("y1", yv(d.median)).attr("y2", yv(d.median)).attr("stroke", d.series.median);
      });
    }

    gBoxes.selectAll("g.box").data(rows, d => d.key).join(
      enter => {
        const g = enter.append("g").attr("class", "box").attr("opacity", 0);
        g.append("rect").attr("class", "hit").attr("fill", "transparent");
        g.append("line").attr("class", "whisk-lo").attr("stroke-width", 1);
        g.append("line").attr("class", "whisk-hi").attr("stroke-width", 1);
        g.append("line").attr("class", "cap-lo").attr("stroke-width", 1);
        g.append("line").attr("class", "cap-hi").attr("stroke-width", 1);
        g.append("rect").attr("class", "iqr").attr("stroke-width", 1);
        g.append("line").attr("class", "median").attr("stroke-width", 2.5);
        g.append("path").attr("class", "clip-mark").attr("pointer-events", "none").attr("display", "none");

        paint(g, false);
        g.transition(t).attr("opacity", d => opacityFor(d, state));
        return g;
      },
      update => {
        paint(update, true);
        update.transition(t).attr("opacity", d => opacityFor(d, state));
        return update;
      },
      exit => exit.transition(t).attr("opacity", 0).remove()
    );
  }

  let currentRows = [];
  const brush = d3.brushX()
    .on("brush end", ({ selection, sourceEvent }) => {
      if (!sourceEvent) return;
      const toYear = px => x.invert(px) + 0.5;
      const period = selection
        ? [Math.round(toYear(selection[0])), Math.round(toYear(selection[1])) - 1]
        : [FIRST_YEAR, LAST_YEAR];
      period[0] = Math.max(FIRST_YEAR, period[0]);
      period[1] = Math.min(LAST_YEAR, Math.max(period[0], period[1]));
      store.set({ period }, "viewA");
    });
  const gBrush = svg.append("g").attr("class", "viewa-brush");

  let hovered = null, hoveredYear = null;
  function unhover() {
    if (hovered) hovered.attr("opacity", d => opacityFor(d, store.get()));
    hovered = null; hoveredYear = null;
    tooltip.hide();
  }
  gBrush
    .on("mousemove.tip", event => {
      if (event.buttons) return unhover();
      const [mx] = d3.pointer(event, svg.node());
      const year = Math.round(x.invert(mx));
      const rowsOfYear = currentRows.filter(r => r.year === year);
      if (!rowsOfYear.length) return unhover();
      if (hoveredYear !== year) { unhover(); hoveredYear = year; hovered = gBoxes.selectAll("g.box").filter(r => r.year === year).attr("opacity", 1); }
      tooltip.show(event, tooltipContent(year, rowsOfYear));
    })
    .on("mouseleave.tip", unhover);

  const USED = ["period", "focusTheme", "compareTheme"];
  store.subscribe((state, changed) => {
    if (USED.some(k => changed.has(k))) render(state);
  });
  layout();
  render(store.get());

  new ResizeObserver(() => {
    layout();
    render(store.get(), 0);
  }).observe(el);

  return { render };
}
