import { fitTrend } from "../stats.js";
import { COLOR, formatParts, brickEdge } from "../theme.js";
import { tooltip } from "../tooltip.js";

const Y_AXES = {
  colours:    { col: "color_diversity",    fit: "colours",    label: "Colours per set",         short: "colours" },
  categories: { col: "part_cat_diversity", fit: "categories", label: "Part categories per set", short: "part categories" },
};

const JITTER_X = 0.035;
const JITTER_Y = 0.3;
const R = 1.6;
const R_HIGHLIGHT = 2.4;
const ALPHA_CONTEXT = 0.45;
const ALPHA_ALONE = 0.55;
const HALO = 6;
const ALPHA_HIGHLIGHT = 0.75;
const HOVER_RADIUS = 10;

export function createView(el, store, data) {
  let yAxis = "colours";

  const root = d3.select(el).append("div").attr("class", "viewc-wrapper");
  const controls = root.append("div").attr("class", "viewc-controls");

  const toggle = controls.append("div").attr("class", "viewc-toggle")
    .attr("role", "group").attr("aria-label", "Y axis");
  toggle.selectAll("button").data(Object.keys(Y_AXES)).join("button")
    .attr("class", "toggle-btn")
    .text(k => (k === "colours" ? "Colours" : "Categories"))
    .on("click", (event, k) => {
      if (k === yAxis) return;
      yAxis = k;
      resetZoom();
    });

  const legend = controls.append("div").attr("class", "viewc-legend");
  const zoomHint = controls.append("span").attr("class", "viewc-hint").text("Drag a box to zoom");
  const resetBtn = controls.append("button").attr("class", "link-button viewc-reset").text("Reset zoom")
    .style("display", "none").on("click", () => resetZoom());

  const plot = root.append("div").attr("class", "viewc-plot");
  const canvas = plot.append("canvas").node();
  const ctx = canvas.getContext("2d");
  const svg = plot.append("svg").attr("class", "chart");

  const M = { t: 10, r: 84, b: 34, l: 46 };
  let W = 600, H = 400;

  const X_FULL = [0.8, 15000], Y_FULL = [0, 60];
  const x = d3.scaleLog().domain(X_FULL);
  const y = d3.scaleLinear().domain(Y_FULL);
  let zoomed = false;
  const xTicks = [1, 10, 100, 1000, 10000];

  const gGrid = svg.append("g").attr("class", "grid");
  const gAxisX = svg.append("g").attr("class", "axis");
  const gAxisY = svg.append("g").attr("class", "axis");
  const gTitles = svg.append("g").attr("class", "axis-label");
  const xTitle = gTitles.append("text").attr("text-anchor", "middle").text("Parts per set");
  const yTitle = gTitles.append("text").attr("text-anchor", "middle");
  const gZoom = svg.append("g").attr("class", "viewc-zoom");
  const gHalos = svg.append("g").attr("class", "trend-halos");
  const gLines = svg.append("g").attr("class", "trends");
  const gLabels = svg.append("g").attr("class", "trend-labels");
  const ring = svg.append("circle").attr("r", 4.5).attr("fill", "none")
    .attr("stroke", COLOR.ink).attr("stroke-width", 1.5).attr("pointer-events", "none").style("display", "none");

  // fixed seed so the jitter doesn't change on every redraw
  const rand = d3.randomLcg(19);
  const sets = data.sets
    .filter(s => s.color_diversity > 0)
    .map(s => {
      const jx = 10 ** ((rand() * 2 - 1) * JITTER_X), jy = (rand() * 2 - 1) * JITTER_Y;
      const vy = Object.fromEntries(Object.entries(Y_AXES).map(([k, a]) => [k, s[a.col] + jy]));
      return { s, vx: s.num_parts * jx, vy, series: "context", px: 0, py: 0 };
    });

  function seriesOf(rootId, state) {
    if (rootId === state.focusTheme) return "focus";
    if (rootId === state.compareTheme) return "compare";
    return "context";
  }

  function computeTrends(state, visible) {
    const out = [];
    const add = (key, nodeId, name, color, extentSets) => {
      if (nodeId == null) return;
      const fit = fitTrend(data.rootYearByNode.get(nodeId), state.period, Y_AXES[yAxis].fit);
      const ext = d3.extent(extentSets, d => d.s.num_parts);
      out.push({ key, nodeId, name, color, fit, ext, band: key !== "global" });
    };
    add("global", 0, "All sets", COLOR.ink, visible);
    add("compare", state.compareTheme, data.themeName(state.compareTheme), COLOR.compare,
        visible.filter(d => d.s.root_id === state.compareTheme));
    add("focus", state.focusTheme, data.themeName(state.focusTheme), COLOR.focus,
        visible.filter(d => d.s.root_id === state.focusTheme));
    return out;
  }

  function layout() {
    W = Math.max(200, plot.node().clientWidth);
    H = Math.max(150, plot.node().clientHeight);
    // at least 2x so the canvas stays sharp when the stage is scaled up
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    svg.attr("viewBox", `0 0 ${W} ${H}`);

    x.range([M.l, W - M.r]);
    y.range([H - M.b, M.t]);
    zoomBrush.extent([[M.l, M.t], [W - M.r, H - M.b]]);
    gZoom.call(zoomBrush);
    xTitle.attr("x", (M.l + W - M.r) / 2).attr("y", H - 4);
    yTitle.attr("transform", `translate(12, ${(M.t + H - M.b) / 2}) rotate(-90)`);

    drawAxes();
  }

  function ticksFor(scale, fixed) {
    const [a, b] = scale.domain();
    const inside = fixed.filter(v => v >= a && v <= b);
    if (inside.length >= 3) return inside;
    const fine = scale.ticks(6).filter(Number.isInteger);
    const round = fine.filter(v => "125".includes(String(v)[0]));
    if (round.length >= 3) return round;
    const step = Math.ceil(fine.length / 7);
    return fine.filter((_, i) => i % step === 0);
  }
  function drawAxes() {
    const xt = ticksFor(x, xTicks), yt = y.ticks(6).filter(Number.isInteger);
    gAxisX.attr("transform", `translate(0,${H - M.b})`)
      .call(d3.axisBottom(x).tickValues(xt).tickFormat(formatParts).tickSizeOuter(0));
    gAxisY.attr("transform", `translate(${M.l},0)`)
      .call(d3.axisLeft(y).tickValues(yt).tickFormat(d3.format("d")).tickSizeOuter(0));

    gGrid.selectAll("line.gx").data(xt).join("line").attr("class", "gx")
      .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", M.t).attr("y2", H - M.b)
      .attr("stroke", COLOR.grid);
    gGrid.selectAll("line.gy").data(yt).join("line").attr("class", "gy")
      .attr("x1", M.l).attr("x2", W - M.r).attr("y1", d => y(d)).attr("y2", d => y(d))
      .attr("stroke", COLOR.grid);
  }

  const zoomBrush = d3.brush()
    .on("end", ({ selection, sourceEvent }) => {
      if (!sourceEvent || !selection) return;
      const [[px0, py0], [px1, py1]] = selection;
      gZoom.call(zoomBrush.move, null);
      if (px1 - px0 < 8 || py1 - py0 < 8) return;
      x.domain([x.invert(px0), x.invert(px1)]);
      y.domain([y.invert(py1), y.invert(py0)]);
      setZoomed(true);
    });
  function setZoomed(on) {
    zoomed = on;
    zoomHint.style("display", on ? "none" : null);
    resetBtn.style("display", on ? null : "none");
    drawAxes();
    render(store.get());
  }
  function resetZoom() {
    x.domain(X_FULL);
    y.domain(Y_FULL);
    setZoomed(false);
  }
  gZoom.on("dblclick", () => { if (zoomed) resetZoom(); });

  let visible = [];
  let delaunay = null;

  function render(state) {
    const [y0, y1] = state.period;
    toggle.selectAll("button").classed("active", k => k === yAxis);
    yTitle.text(Y_AXES[yAxis].label);

    const bySeries = { context: [], compare: [], focus: [] };
    for (const d of sets) {
      if (d.s.year < y0 || d.s.year > y1) continue;
      d.series = seriesOf(d.s.root_id, state);
      d.px = x(d.vx);
      d.py = y(d.vy[yAxis]);
      if (zoomed && (d.px < M.l || d.px > W - M.r || d.py < M.t || d.py > H - M.b)) continue;
      bySeries[d.series].push(d);
    }
    visible = [...bySeries.context, ...bySeries.compare, ...bySeries.focus];
    delaunay = null;
    hideHover();

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(M.l, M.t, W - M.l - M.r, H - M.t - M.b);
    ctx.clip();
    const alone = state.focusTheme == null && state.compareTheme == null;
    for (const series of ["context", "compare", "focus"]) {
      ctx.fillStyle = series !== "context" ? COLOR[series] : alone ? COLOR.contextDark : COLOR.context;
      ctx.globalAlpha = series !== "context" ? ALPHA_HIGHLIGHT : alone ? ALPHA_ALONE : ALPHA_CONTEXT;
      const r = series === "context" ? R : R_HIGHLIGHT;
      ctx.beginPath();
      for (const d of bySeries[series]) {
        ctx.moveTo(d.px + r, d.py);
        ctx.arc(d.px, d.py, r, 0, 2 * Math.PI);
      }
      ctx.fill();
      if (series !== "context") {
        ctx.strokeStyle = brickEdge(COLOR[series]);
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.restore();

    drawTrends(computeTrends(state, visible), state);
  }

  function drawTrends(trends, state) {
    trends.forEach(t => { if (t.fit && t.ext[0] != null) t.ext = clipToPlot(t.fit, t.ext); });
    const drawn = trends.filter(t => t.fit && t.ext && t.ext[1] > t.ext[0]);
    const pathFor = (t, offset) => {
      const xs = d3.range(0, 41).map(i => 10 ** (Math.log10(t.ext[0]) + i / 40 * Math.log10(t.ext[1] / t.ext[0])));
      return d3.line()(xs.map(v => {
        const lx = Math.log10(v);
        return [x(v), y(t.fit.predict(lx) + offset * t.fit.halfBand(lx))];
      }));
    };

    const g = gLines.selectAll("g.trend").data(drawn, t => t.key).join(enter => {
      const g = enter.append("g").attr("class", "trend");
      g.append("path").attr("class", "band-lo");
      g.append("path").attr("class", "band-hi");
      g.append("path").attr("class", "line");
      g.append("path").attr("class", "hit");
      return g;
    });
    g.selectAll("path").attr("fill", "none");
    g.select(".line").attr("d", t => pathFor(t, 0)).attr("stroke", t => t.color).attr("stroke-width", 3);

    const halos = drawn.flatMap(t => [
      { key: `${t.key}-line`, d: pathFor(t, 0), w: HALO },
      ...(t.band ? [-1, 1].map(side => ({ key: `${t.key}-${side}`, d: pathFor(t, side), w: HALO / 2 })) : []),
    ]);
    gHalos.selectAll("path").data(halos, h => h.key).join("path")
      .attr("d", h => h.d).attr("fill", "none").attr("stroke", COLOR.panel).attr("stroke-width", h => h.w)
      .attr("stroke-opacity", 0.85).attr("stroke-linecap", "round").attr("pointer-events", "none");
    for (const [cls, side] of [[".band-lo", -1], [".band-hi", 1]]) {
      g.select(cls).attr("d", t => (t.band ? pathFor(t, side) : null))
        .attr("stroke", t => t.color).attr("stroke-width", 1).attr("stroke-dasharray", "4 3");
    }
    g.select(".hit").attr("d", t => pathFor(t, 0)).attr("stroke", "transparent").attr("stroke-width", 12)
      .on("mousemove", (event, t) => { hideRing(); tooltip.show(event, trendTooltip(t, state)); })
      .on("mouseleave", tooltip.hide);

    const labels = drawn.map(t => ({ t, ly: y(t.fit.predict(Math.log10(t.ext[1]))) }))
      .sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < labels.length; i++) labels[i].ly = Math.max(labels[i].ly, labels[i - 1].ly + 12);
    gLabels.selectAll("text").data(labels, d => d.t.key).join("text")
      .attr("x", d => x(d.t.ext[1]) + 5).attr("y", d => d.ly).attr("dy", "0.35em")
      .attr("font-size", 11).attr("font-weight", 800).attr("fill", d => d.t.color)
      .text(d => short(d.t.name, 14));

    const items = trends.map(t => ({ ...t, ok: drawn.includes(t) }));
    if (drawn.some(t => t.band)) items.push({ key: "band", name: "95 % band", color: COLOR.ink2, ok: true, dashed: true });
    const li = legend.selectAll("span.item").data(items, d => d.key).join(enter => {
      const s = enter.append("span").attr("class", "item");
      s.append("svg").attr("width", 18).attr("height", 8).append("line")
        .attr("x1", 1).attr("x2", 17).attr("y1", 4).attr("y2", 4);
      s.append("span").attr("class", "name");
      return s;
    });
    li.select("line").attr("stroke", d => d.color).attr("stroke-width", d => (d.dashed ? 1 : 2))
      .attr("stroke-dasharray", d => (d.dashed ? "4 3" : null));
    li.select(".name").text(d => (d.ok ? short(d.name, 22) : `${short(d.name, 18)} (too few sets)`));
    li.classed("disabled", d => !d.ok);
  }

  function clipToPlot(fit, [a, b]) {
    const [lo, hi] = y.domain();
    const la = Math.log10(a), lb = Math.log10(b), steps = 200;
    const inside = d3.range(steps + 1).map(i => la + (i / steps) * (lb - la))
      .filter(lx => { const v = fit.predict(lx); return v >= lo && v <= hi; });
    return inside.length > 1 ? [10 ** inside[0], 10 ** inside[inside.length - 1]] : null;
  }

  const fmt = d3.format(",d");
  const pct = d3.format(".0%");

  function setTooltip(d) {
    const s = d.s;
    const theme = s.theme_name === s.root_theme_name ? s.root_theme_name : `${s.root_theme_name} › ${s.theme_name}`;
    return `<b>${esc(s.name)}</b> <span style="color:${COLOR.muted}">${esc(s.set_num)} · ${s.year}</span><br>` +
      `${esc(theme)}<br>` +
      `${fmt(s.num_parts)} parts · ${s.color_diversity} colours · ${s.part_cat_diversity} part categories<br>` +
      `Most used part: ${esc(s.top_part_name)} (${pct(s.top_part_share)} of the parts)<br>` +
      `Most used colour: ${esc(s.top_color_name)}`;
  }

  function trendTooltip(t, state) {
    const [y0, y1] = state.period;
    const what = Y_AXES[yAxis].short;
    const sizes = [10, 100, 1000, 5000].filter(p => p >= t.ext[0] && p <= t.ext[1]);
    const typical = sizes.map(p => `${fmt(p)} parts → ${Math.round(t.fit.predict(Math.log10(p)))}`).join(" · ");
    const slope = d3.format("+.1f")(t.fit.slope);
    return `<b>${esc(t.name)}</b> · trend ${y0}–${y1}<br>` +
      `${fmt(t.fit.n)} sets with an inventory<br>` +
      (typical ? `Typical ${what}: ${typical}<br>` : "") +
      `Every 10× more parts: ${slope} ${what}`;
  }

  gZoom
    .on("mousemove.tip", event => {
      if (event.buttons) return hideHover();
      if (!visible.length) return;
      if (!delaunay) delaunay = d3.Delaunay.from(visible, d => d.px, d => d.py);
      const [mx, my] = d3.pointer(event, svg.node());
      const d = visible[delaunay.find(mx, my)];
      if (Math.hypot(d.px - mx, d.py - my) > HOVER_RADIUS) return hideHover();
      ring.style("display", null).attr("cx", d.px).attr("cy", d.py)
        .attr("stroke", d.series === "context" ? COLOR.ink : COLOR[d.series]);
      tooltip.show(event, setTooltip(d));
    })
    .on("mouseleave.tip", hideHover);

  function hideRing() { ring.style("display", "none"); }
  function hideHover() { hideRing(); tooltip.hide(); }

  const USED = ["period", "focusTheme", "compareTheme"];
  store.subscribe((state, changed, source) => {
    if (source === "clearAll" || changed.has("clearAll")) {
      resetZoom();
      return;
    }
    if (USED.some(k => changed.has(k))) render(state);
  });

  layout();
  render(store.get());

  new ResizeObserver(() => { layout(); render(store.get()); }).observe(plot.node());

  return { render };
}

function short(text, n) {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
