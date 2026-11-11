import { COLOR } from "../theme.js";

export function createPeriodControl(el, store, data) {
  const rows = data.rootYearByNode.get(0);
  const [first, last] = data.meta.years;
  const W = 380, H = 46, M = { l: 14, r: 14, t: 4, b: 16 };

  const x = d3.scaleLinear([first, last + 1], [M.l, W - M.r]);
  const y = d3.scaleLinear([0, d3.max(rows, d => d.n_sets)], [H - M.b, M.t]);

  const root = d3.select(el).attr("class", "period-control");
  const label = root.append("div").attr("class", "control-label");
  label.append("span").text("Period ");
  const yearInput = (which, aria) => label.append("input")
    .attr("type", "number").attr("min", first).attr("max", last).attr("step", 1)
    .attr("class", "year-input").attr("aria-label", aria)
    .on("change", function () { commit(which, this); })
    .on("keydown", function (event) {
      if (event.key === "Escape") { render(store.get()); this.blur(); }
      if (event.key === "Enter") this.blur();
    });
  const input0 = yearInput(0, "First year of the period");
  label.append("span").text("–");
  const input1 = yearInput(1, "Last year of the period");

  function commit(which, input) {
    const v = Math.round(+input.value);
    if (input.value === "" || !Number.isFinite(v)) return render(store.get());
    const period = [...store.get().period];
    period[which] = Math.max(first, Math.min(last, v));
    if (period[0] > period[1]) period[1 - which] = period[which];
    store.set({ period }, "period");
    render({ ...store.get(), period });
  }
  const svg = root.append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H)
    .attr("role", "img").attr("aria-label", "Sets per year; drag to choose a period");

  const bars = svg.append("g").selectAll("rect").data(rows).join("rect")
    .attr("x", d => x(d.year) + 0.5).attr("width", Math.max(1, x(first + 1) - x(first) - 1))
    .attr("y", d => y(d.n_sets)).attr("height", d => y(0) - y(d.n_sets));

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).tickValues(d3.range(1950, last + 1, 10)).tickFormat(d3.format("d")).tickSize(3));

  const brush = d3.brushX().extent([[M.l, M.t], [W - M.r, H - M.b]])
    .on("brush end", ({ selection, sourceEvent }) => {
      if (!sourceEvent) return;
      const period = selection
        ? [Math.round(x.invert(selection[0])), Math.round(x.invert(selection[1])) - 1]
        : [first, last];
      if (period[1] < period[0]) period[1] = period[0];
      store.set({ period }, "period");
    });
  const gBrush = svg.append("g").attr("class", "brush").call(brush);

  function render(state) {
    const [y0, y1] = state.period;
    input0.property("value", y0);
    input1.property("value", y1);
    bars.attr("fill", d => (d.year >= y0 && d.year <= y1 ? COLOR.ink2 : COLOR.context));
    const full = y0 === first && y1 === last;
    gBrush.call(brush.move, full ? null : [x(y0), x(y1 + 1)]);
  }

  store.subscribe((state, changed) => { if (changed.has("period") || changed.has("clearAll")) render(state); });
  render(store.get());
}
