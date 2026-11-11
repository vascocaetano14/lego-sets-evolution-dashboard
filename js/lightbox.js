const MAX_SIZE = 640;

const box = d3.select(".stage").append("div").attr("class", "lightbox").style("display", "none")
  .on("click", () => lightbox.hide());
const figure = box.append("figure");
const picture = figure.append("img").attr("alt", "");
const title = figure.append("figcaption").attr("class", "lightbox-title");
const lines = figure.append("div").attr("class", "lightbox-lines");
figure.append("div").attr("class", "lightbox-hint").text("Click anywhere or press Esc to close");

picture.on("load", function () {
  const size = Math.min(MAX_SIZE, 2 * Math.max(this.naturalWidth, this.naturalHeight));
  d3.select(this).style("width", `${size}px`).style("height", `${size}px`);
});

d3.select(window).on("keydown.lightbox", event => { if (event.key === "Escape") lightbox.hide(); });

export const lightbox = {
  show({ img, title: name, lines: rows = [] }) {
    picture.attr("src", img);
    title.text(name);
    lines.selectAll("div").data(rows).join("div").text(d => d);
    box.style("display", null);
  },
  hide() {
    box.style("display", "none");
  },
};
