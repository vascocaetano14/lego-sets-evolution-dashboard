export const COLOR = {
  focus: "#078bc9",
  compare: "#a95500",
  context: "#a0a5a9",
  contextDark: "#6c6e68",

  ink: "#05131d",
  ink2: "#4b5157",
  muted: "#868b90",
  grid: "#e1e4e6",
  panel: "#ffffff",
  surface: "#dde0e2",
  edge: "#b0b5b9",
  brick: "#f2cd37",

  onColor: "#ffffff",
  onColorMuted: "rgba(255,255,255,0.7)",

  divLow: "#3f3691",
  divLowMid: "#ac78ba",
  seqStart: "#f4f4f4",
  seqLight: "#e1d5ed",
  divMid: "#e6e3e0",
  divHighMid: "#ff698f",
  divHigh: "#720e0f",
};

export const FONT = "system-ui, -apple-system, sans-serif";

export const divergingScale = (low, mid, high) =>
  d3.scaleDiverging([low, mid, high],
    d3.piecewise(d3.interpolateLab, [COLOR.divLow, COLOR.divLowMid, COLOR.divMid, COLOR.divHighMid, COLOR.divHigh])).clamp(true);

export const sequentialScale = (max) =>
  d3.scaleSequential([0, max],
    d3.piecewise(d3.interpolateLab, [COLOR.seqStart, COLOR.seqLight, COLOR.divLowMid, COLOR.divLow])).clamp(true);

export const formatParts = d3.format(",d");

export const brickEdge = c => d3.color(c).darker(0.7).formatHex();

export function themeColor(rootId, state) {
  if (rootId === state.focusTheme) return COLOR.focus;
  if (rootId === state.compareTheme) return COLOR.compare;
  return COLOR.context;
}
