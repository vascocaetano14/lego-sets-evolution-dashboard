import { sumPeriod } from "./data.js";

const FIT_COLUMNS = {
  colours:    ["n_fit", "sum_x", "sum_xx", "sum_c", "sum_cc", "sum_xc"],
  categories: ["n_fit", "sum_x", "sum_xx", "sum_k", "sum_kk", "sum_xk"],
};
const MIN_FIT = 10;

export function fitTrend(rows, period, yAxis = "colours") {
  const [n, sx, sxx, sy, syy, sxy] = Object.values(sumPeriod(rows, period, FIT_COLUMNS[yAxis]));
  if (n < MIN_FIT) return null;

  // least squares on u = log10(parts) - mean, from the precomputed sums
  const m = sx / n;
  const u2 = sxx - n * m * m;
  if (!(u2 > 1e-12)) return null;
  const uy = sxy - m * sy;
  const a = sy / n, b = uy / u2;
  const s2 = Math.max(0, (syy - a * sy - b * uy) / (n - 2));

  return {
    n,
    predict: x => a + b * (x - m),
    halfBand: x => 1.96 * Math.sqrt(s2 * (1 / n + (x - m) ** 2 / u2)),
    slope: b,
  };
}

export function profile(rows, period) {
  const s = sumPeriod(rows, period, ["n_sets", "n_minifig_sets", "n_fit", "sum_x", "sum_yc", "sum_yk"]);
  if (!s.n_sets) return null;
  return {
    parts: s.n_fit ? 10 ** (s.sum_x / s.n_fit) : null,
    colours: s.n_fit ? 10 ** (s.sum_yc / s.n_fit) : null,
    categories: s.n_fit ? 10 ** (s.sum_yk / s.n_fit) : null,
    minifigShare: s.n_minifig_sets / s.n_sets,
  };
}

export function percentiles(values) {
  const sorted = values.filter(v => v != null).sort(d3.ascending);
  return values.map(v => (v == null || sorted.length < 2 ? null : d3.bisectLeft(sorted, v) / (sorted.length - 1)));
}
