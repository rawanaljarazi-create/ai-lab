const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pieces = document.querySelectorAll(".card, footer");

if (!reduce) {
  document.documentElement.classList.add("js");
  const show = (el) => el.classList.add("shown");
  const scan = () => {
    const limit = window.innerHeight + 48;
    pieces.forEach((el) => {
      if (el.classList.contains("shown")) return;
      if (el.getBoundingClientRect().top < limit) show(el);
    });
  };

  pieces.forEach((el, index) => {
    el.style.setProperty("--d", `${(index % 3) * 90}ms`);
  });
  scan();
  document.addEventListener("scroll", scan, { passive: true });
  window.addEventListener("resize", scan);
}
