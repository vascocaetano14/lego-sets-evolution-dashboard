import { tooltip } from "./tooltip.js";

const HELP = {
  A: `<b>Time</b> — how big sets are, year by year<br>
    Each box holds the middle half of that year's sets (parts per set); the line inside is the median,
    the whiskers the usual range. With a theme selected, its boxes (blue) and the comparison's (orange)
    stand side by side.
    <ul>
      <li>Drag across the years to choose the period; click outside it to go back to all years.</li>
      <li>Log | Linear changes the vertical scale.</li>
    </ul>`,
  B: `<b>Theme hierarchy</b> — which themes hold the most sets<br>
    Each block is a theme, sized by its sets (or parts) in the period; the smallest themes are grouped in
    Others, hatched when they hide the selected theme.
    <ul>
      <li>Click a theme: it becomes the theme in focus in every view and opens its sub-themes.</li>
      <li>All (top right) goes back up; Sets | Parts changes what the sizes mean.</li>
    </ul>`,
  C: `<b>Parts × colours</b> — do bigger sets use more colours?<br>
    One dot per set in the period. The lines are the trends of all sets, the theme in focus and the
    comparison, with their 95 % band (dashed); hover a line for its numbers.
    <ul>
      <li>Drag a box to zoom in; Reset zoom or a double-click goes back.</li>
      <li>Colours | Categories changes the vertical axis.</li>
    </ul>`,
  D: `<b>Theme matrix</b> — the largest themes compared<br>
    One row per theme: the 13 with the most sets in the period.
    <ul>
      <li><b>Time</b>: each theme's share of every decade's sets. Click a decade header for that decade's
        top 13; click it again to go back.</li>
      <li><b>Profile</b>: typical parts, colours, part categories and minifigures, ranked among the rows
        (purple = low, red = high).</li>
      <li><b>Vocabulary</b>: how much more (red) or less (purple) than the whole catalogue each theme uses
        each part category; each column shows one piece of its category (click it to enlarge).</li>
      <li>Click a theme name: theme in focus; with one in focus, another click sets the comparison.</li>
    </ul>`,
};

export function mountHelp() {
  for (const [id, html] of Object.entries(HELP)) {
    d3.select(`[data-view="${id}"] > header`).append("span")
      .attr("class", "help").attr("role", "img").attr("aria-label", "How to read this view")
      .text("?")
      .on("mousemove", event => tooltip.show(event, `<div class="help-text">${html}</div>`))
      .on("mouseleave", tooltip.hide);
  }
}
