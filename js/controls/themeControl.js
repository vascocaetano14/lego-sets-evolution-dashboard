export function createThemeControl(el, store, data) {
  const root = d3.select(el).attr("class", "theme-control");

  const makeSelect = (key, labelText, cls) => {
    const wrap = root.append("label").attr("class", `select ${cls}`);
    wrap.append("span").attr("class", "swatch");
    wrap.append("span").text(labelText);
    const select = wrap.append("select").on("change", function () {
      const id = this.value === "" ? null : +this.value;
      const other = store.get()[key === "focusTheme" ? "compareTheme" : "focusTheme"];
      if (id !== null && id === other) return render(store.get());
      store.set({ [key]: id }, "themeControl");
    });
    select.selectAll("option")
      .data([{ node_id: "", name: "—" }, ...data.roots])
      .join("option").attr("value", d => d.node_id).text(d => d.name);
    return select;
  };

  const focus = makeSelect("focusTheme", "Theme", "focus");
  const compare = makeSelect("compareTheme", "Compare with", "compare");

  root.append("button").attr("class", "link-button").text("Clear all")
    .on("click", () => store.set(
      { focusTheme: null, compareTheme: null, element: null, period: [...data.meta.years] }, "clearAll"));

  function render(state) {
    focus.property("value", state.focusTheme ?? "");
    compare.property("value", state.compareTheme ?? "");
    focus.selectAll("option").property("disabled", d => d.node_id !== "" && d.node_id === state.compareTheme);
    compare.selectAll("option").property("disabled", d => d.node_id !== "" && d.node_id === state.focusTheme);
  }
  store.subscribe((state, changed) => {
    if (changed.has("focusTheme") || changed.has("compareTheme") || changed.has("clearAll")) render(state);
  });
  render(store.get());
}
