import "./stage.js";
import { loadData } from "./data.js";
import { createStore, INITIAL_STATE } from "./store.js";
import { createPeriodControl } from "./controls/periodControl.js";
import { createThemeControl } from "./controls/themeControl.js";
import { mountHelp } from "./help.js";
import * as viewA from "./views/viewA.js";
import * as viewB from "./views/viewB.js";
import * as viewC from "./views/viewC.js";
import * as viewD from "./views/viewD.js";

const VIEWS = { A: viewA, B: viewB, C: viewC, D: viewD };

async function main() {
  const data = await loadData();
  const store = createStore({ ...INITIAL_STATE, period: data.meta.years });

  createPeriodControl(document.querySelector("#period-control"), store, data);
  createThemeControl(document.querySelector("#theme-control"), store, data);

  for (const [id, module] of Object.entries(VIEWS)) {
    const el = document.querySelector(`[data-view="${id}"] .view-body`);
    try {
      module.createView(el, store, data);
    } catch (err) {
      console.error(`View ${id} failed:`, err);
      el.textContent = `View ${id} failed to load — see the console.`;
    }
  }

  mountHelp();

  window.dashboard = { data, store };
  document.body.classList.remove("loading");
}

main().catch(err => {
  console.error(err);
  document.body.innerHTML = `<p class="fatal">Could not load the data. Start a local server in the project folder
    (<code>python -m http.server</code>) and open <code>http://localhost:8000</code>.</p>`;
});
