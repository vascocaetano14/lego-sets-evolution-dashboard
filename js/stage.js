export const STAGE = { width: 1920, height: 1080 };

const stage = document.querySelector(".stage");

function fit() {
  // everything is laid out at 1920x1080 and scaled as one picture
  const s = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  const dx = Math.round((window.innerWidth - STAGE.width * s) / 2);
  const dy = Math.round((window.innerHeight - STAGE.height * s) / 2);
  stage.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
  document.documentElement.style.setProperty("--stage-scale", s);
}

window.addEventListener("resize", fit);
fit();
