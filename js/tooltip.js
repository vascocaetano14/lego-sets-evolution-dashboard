const box = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0);

export const tooltip = {
  show(event, html) {
    box.html(html).style("opacity", 1);
    const { width, height } = box.node().getBoundingClientRect();
    const x = Math.min(event.clientX + 14, window.innerWidth - width - 8);
    const y = event.clientY + 14 + height > window.innerHeight ? event.clientY - height - 10 : event.clientY + 14;
    box.style("left", `${x}px`).style("top", `${y}px`);
  },
  hide() {
    box.style("opacity", 0);
  },
};
