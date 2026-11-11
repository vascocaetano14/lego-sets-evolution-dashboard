import { sumPeriod } from "../data.js";
import { COLOR, themeColor, brickEdge } from "../theme.js";
import { tooltip } from "../tooltip.js";

const TOP_N = 15;

export function createView(el, store, data) {
  let sizeMetric = "n_sets";
  let zoomNodeId = null;
  let zoomSkip = 0;
  let zoomPath = [];

  const wrapper = d3.select(el)
    .style("display", "flex")
    .style("flex-direction", "column");

  const flexWrapper = wrapper.append("div").attr("class", "viewb-wrapper");

  const controls = flexWrapper.append("div").attr("class", "viewb-controls");

  const toggle = controls.append("div").attr("class", "viewb-toggle");
  toggle.append("button")
    .attr("class", "toggle-btn active").attr("data-metric", "n_sets").text("Sets");
  toggle.append("button")
    .attr("class", "toggle-btn").attr("data-metric", "n_parts").text("Parts");

  const breadcrumb = controls.append("div").attr("class", "viewb-breadcrumb");

  const plot = flexWrapper.append("div").attr("class", "viewb-plot");
  const svg = plot.append("svg").attr("class", "chart");
  const gMap = svg.append("g").attr("class", "treemap-cells");

  const defs = svg.append("defs");
  for (const [role, angle] of [["focus", 45], ["compare", -45]]) {
    defs.append("pattern").attr("id", `viewb-hatch-${role}`)
      .attr("patternUnits", "userSpaceOnUse").attr("width", 9).attr("height", 9)
      .attr("patternTransform", `rotate(${angle})`)
      .append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 9)
      .attr("stroke", COLOR[role]).attr("stroke-width", 3);
  }

  const emptyMsg = plot.append("div").attr("class", "viewb-empty").style("display", "none");

  let W = 300, H = 500;
  function layout() {
    W = Math.max(100, plot.node().clientWidth);
    H = Math.max(100, plot.node().clientHeight);
    svg.attr("viewBox", `0 0 ${W} ${H}`);
  }

  toggle.selectAll(".toggle-btn").on("click", function () {
    const metric = d3.select(this).attr("data-metric");
    if (metric === sizeMetric) return;
    sizeMetric = metric;
    toggle.selectAll(".toggle-btn").classed("active", false);
    d3.select(this).classed("active", true);
    render(store.get());
  });

  function computeItems(state) {
    const all = zoomNodeId === null
      ? themeList(data.roots, state.period)
      : themeList(data.childrenOf.get(zoomNodeId) || [], state.period);
    return groupOthers(all.slice(zoomSkip), state);
  }

  function groupOthers(list, state) {
    if (list.length <= TOP_N + 1) return list;
    const rest = list.slice(TOP_N);
    const holds = zoomNodeId === null
      ? ["focus", "compare"].filter(k => rest.some(t => t.id === state[`${k}Theme`]))
      : [];
    const incl = holds.map(k => data.themeName(state[`${k}Theme`]));
    return [...list.slice(0, TOP_N), {
      id: "__others__", name: `Others (${rest.length})${incl.length ? ` · incl. ${incl.join(", ")}` : ""}`,
      value: d3.sum(rest, d => d.value), rootId: null, isOthers: true, holds,
    }];
  }

  function themeList(nodes, period) {
    return nodes
      .map(t => {
        const s = sumPeriod(
          data.treeYearByNode.get(t.node_id), period, ["n_sets", "n_parts"]);
        return {
          id: t.node_id, name: t.name,
          value: s[sizeMetric], rootId: t.root_id,
        };
      })
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }

  function render(state) {
    layout();
    const items = computeItems(state);
    const total = d3.sum(items, d => d.value);

    if (items.length === 0) {
      gMap.selectAll("g.cell").data([]).join(
        enter => enter,
        update => update,
        exit => exit.transition().duration(200).attr("opacity", 0).remove(),
      );
      emptyMsg.style("display", null)
        .text(`No ${sizeMetric === "n_sets" ? "sets" : "parts"} in this period`);
      updateBreadcrumb(state);
      return;
    }
    emptyMsg.style("display", "none");

    const leaves = layoutCells(items, total);

    gMap.selectAll("g.cell")
      .data(leaves, d => d.data.id)
      .join(
        enter => {
          const g = enter.append("g").attr("class", "cell").attr("opacity", 0);
          g.append("rect");
          g.append("rect").attr("class", "brick-edge").attr("pointer-events", "none");
          g.append("rect").attr("class", "hatch hatch-0").attr("pointer-events", "none");
          g.append("rect").attr("class", "hatch hatch-1").attr("pointer-events", "none");
          g.append("text").attr("class", "cell-name");
          g.append("text").attr("class", "cell-value");
          g.append("rect").attr("class", "outline outline-0").attr("pointer-events", "none").attr("fill", "none");
          g.append("rect").attr("class", "outline outline-1").attr("pointer-events", "none").attr("fill", "none");
          return g;
        },
        update => update,
        exit => exit.transition().duration(250).attr("opacity", 0).remove(),
      )
      .call(updateCells, state, total);

    updateBreadcrumb(state);
  }

  function layoutCells(items, total) {
    const PAD = 3, GAP = 2;
    const others = items.find(d => d.isOthers);
    const themes = items.filter(d => !d.isOthers);
    const hOthers = others ? Math.round((H - 2 * PAD) * others.value / total) : 0;
    const hTop = H - hOthers;

    const root = d3.hierarchy({ children: themes })
      .sum(d => d.value || 0)
      .sort((a, b) => b.value - a.value);
    d3.treemap().size([W, hTop]).paddingInner(GAP).paddingOuter(PAD).round(true)(root);
    const leaves = themes.length ? root.leaves() : [];

    if (others) {
      leaves.push({ data: others, x0: PAD, x1: W - PAD, y0: themes.length ? hTop - PAD + GAP : PAD, y1: H - PAD });
    }
    return leaves;
  }

  function updateCells(sel, state, total) {
    sel.transition().duration(400).attr("opacity", 1);

    sel.select("rect")
      .on("mousemove", (event, d) => {
        const pct = total > 0 ? (d.data.value / total * 100).toFixed(1) : "0.0";
        const label = sizeMetric === "n_sets" ? "sets" : "parts";
        tooltip.show(event,
          `<b>${d.data.name}</b><br>` +
          `${d.data.value.toLocaleString()} ${label}<br>` +
          `${pct}% of ${zoomPath.length ? zoomPath[zoomPath.length - 1].name : "the catalogue"}`);
      })
      .on("mouseleave", tooltip.hide)
      .on("click", (event, d) => handleCellClick(d.data, state))
      .style("cursor", d => canDrill(d.data) || rootOf(d.data) !== state.focusTheme ? "pointer" : "default")
      .transition().duration(400)
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("rx", 2)
        .attr("fill", d => cellFill(d.data, state))
        .attr("stroke", COLOR.panel)
        .attr("stroke-width", 1);

    sel.select(".brick-edge")
      .transition().duration(400)
        .attr("x", d => d.x0)
        .attr("y", d => Math.max(d.y0, d.y1 - 4))
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.min(4, Math.max(0, d.y1 - d.y0)))
        .attr("fill", d => brickEdge(cellFill(d.data, state)));

    for (const i of [0, 1]) {
      sel.select(`.hatch-${i}`)
        .style("display", d => (hatchesOf(d.data)[i] ? null : "none"))
        .attr("fill", d => (hatchesOf(d.data)[i] ? `url(#viewb-hatch-${hatchesOf(d.data)[i]})` : "none"))
        .attr("opacity", 0.75)
        .transition().duration(400)
          .attr("x", d => d.x0 + 3).attr("y", d => d.y0 + 3)
          .attr("width", d => Math.max(0, d.x1 - d.x0 - 6))
          .attr("height", d => Math.max(0, d.y1 - d.y0 - 6));
    }

    for (const i of [0, 1]) {
      sel.select(`.outline-${i}`)
        .style("display", d => (outlinesOf(d.data, state)[i] ? null : "none"))
        .transition().duration(400)
          .attr("x", d => d.x0 + 1.5 + 3 * i)
          .attr("y", d => d.y0 + 1.5 + 3 * i)
          .attr("width", d => Math.max(0, d.x1 - d.x0 - 3 - 6 * i))
          .attr("height", d => Math.max(0, d.y1 - d.y0 - 3 - 6 * i))
          .attr("rx", 2)
          .attr("stroke", d => outlinesOf(d.data, state)[i] ?? "none")
          .attr("stroke-width", 2.5);
    }

    sel.select(".cell-name")
      .attr("pointer-events", "none")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .transition().duration(400)
        .attr("x", d => d.x0 + 6)
        .attr("y", d => d.y0 + 15)
        .attr("fill", d => textFill(d.data, state))
        .attr("stroke", d => cellFill(d.data, state)).attr("stroke-width", 3)
        .attr("stroke-linejoin", "round").attr("paint-order", "stroke")
        .tween("text", function (d) {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          const label = (w > 36 && h > 18) ? truncate(d.data.name, w - 12) : "";
          return () => { this.textContent = label; };
        });

    sel.select(".cell-value")
      .attr("pointer-events", "none")
      .attr("font-size", "10px")
      .transition().duration(400)
        .attr("x", d => d.x0 + 6)
        .attr("y", d => d.y0 + 28)
        .attr("fill", d => valueFill(d.data, state))
        .attr("stroke", d => cellFill(d.data, state)).attr("stroke-width", 3)
        .attr("stroke-linejoin", "round").attr("paint-order", "stroke")
        .tween("text", function (d) {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          const label = (w > 46 && h > 32) ? d.data.value.toLocaleString() : "";
          return () => { this.textContent = label; };
        });
  }

  function canDrill(d) {
    if (d.isOthers) return true;
    const children = data.childrenOf.get(d.id);
    return children && children.length > 0;
  }

  function cellFill(d, state) {
    if (d.isOthers || zoomNodeId !== null) return COLOR.context;
    const rootId = d.rootId ?? data.themeById.get(d.id)?.root_id ?? d.id;
    return themeColor(rootId, state);
  }

  const hatchesOf = d => (d.isOthers ? d.holds || [] : []);

  function outlinesOf(d, state) {
    if (zoomNodeId !== null) {
      const c = themeColor(data.themeById.get(zoomNodeId)?.root_id ?? zoomNodeId, state);
      return c === COLOR.context ? [] : [c];
    }
    return d.isOthers ? (d.holds || []).map(k => COLOR[k]) : [];
  }

  function textFill(d, state) {
    const bg = cellFill(d, state);
    return (bg === COLOR.focus || bg === COLOR.compare) ? COLOR.onColor : COLOR.ink;
  }

  function valueFill(d, state) {
    const bg = cellFill(d, state);
    return (bg === COLOR.focus || bg === COLOR.compare)
      ? COLOR.onColorMuted : COLOR.ink2;
  }

  function truncate(text, maxWidth, fontSize = 11) {
    const charW = fontSize * 0.58;
    const maxChars = Math.floor(maxWidth / charW);
    if (text.length <= maxChars) return text;
    if (maxChars <= 1) return "";
    return text.slice(0, maxChars - 1) + "…";
  }

  const rootOf = d => (d.isOthers ? null : d.rootId ?? data.themeById.get(d.id)?.root_id ?? d.id);

  function handleCellClick(d, state) {
    tooltip.hide();
    if (d.isOthers) {
      zoomSkip += TOP_N;
      zoomPath.push({ id: zoomNodeId, skip: zoomSkip, name: `Others (#${zoomSkip + 1}+)` });
      render(state);
      return;
    }
    if (canDrill(d)) {
      zoomNodeId = d.id;
      zoomSkip = 0;
      zoomPath.push({ id: d.id, skip: 0, name: d.name });
    }
    const root = rootOf(d);
    if (root !== state.focusTheme) {
      store.set(root === state.compareTheme ? { focusTheme: root, compareTheme: null } : { focusTheme: root }, "viewB");
    } else {
      render(state);
    }
  }

  function zoomTo(index, state) {
    tooltip.hide();
    if (index < 0) {
      zoomNodeId = null;
      zoomSkip = 0;
      zoomPath = [];
    } else {
      zoomNodeId = zoomPath[index].id;
      zoomSkip = zoomPath[index].skip;
      zoomPath = zoomPath.slice(0, index + 1);
    }
    render(state);
  }

  function updateBreadcrumb(state) {
    breadcrumb.selectAll("*").remove();

    const atTop = zoomPath.length === 0;
    breadcrumb.append("span")
      .attr("class", atTop ? "crumb crumb-all current" : "crumb crumb-all link")
      .text("All")
      .style("cursor", atTop ? "default" : "pointer")
      .on("click", () => { if (!atTop) zoomTo(-1, state); });

    zoomPath.forEach((item, i) => {
      breadcrumb.append("span").attr("class", "crumb-sep").text(" › ");
      const isLast = i === zoomPath.length - 1;
      breadcrumb.append("span")
        .attr("class", isLast ? "crumb current" : "crumb link")
        .text(item.name)
        .style("cursor", isLast ? "default" : "pointer")
        .on("click", () => { if (!isLast) zoomTo(i, state); });
    });
  }

  const USED = ["period", "focusTheme", "compareTheme"];
  store.subscribe((state, changed, source) => {
    if (source === "clearAll" || changed.has("clearAll")) {
      zoomNodeId = null;
      zoomSkip = 0;
      zoomPath = [];
      render(state);
      return;
    }
    if (USED.some(k => changed.has(k))) render(state);
  });

  layout();
  render(store.get());

  new ResizeObserver(() => {
    layout();
    render(store.get());
  }).observe(plot.node());

  return { render };
}
