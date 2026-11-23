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

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
if (fine) {
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener(
      "pointermove",
      (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--sx", `${event.clientX - rect.left}px`);
        card.style.setProperty("--sy", `${event.clientY - rect.top}px`);
      },
      { passive: true },
    );
  });
}

const jump = document.querySelector("#jump");
const query = document.querySelector("#jump-q");
const rows = [...document.querySelectorAll("#jump-list a")];
const empty = document.querySelector(".jump-empty");

function visibleRows() {
  return rows.filter((link) => !link.parentElement.hidden);
}

function filterJump() {
  const needle = query.value.trim().toLowerCase();
  rows.forEach((link) => {
    link.parentElement.hidden = needle.length > 0 && !link.textContent.toLowerCase().includes(needle);
  });
  const any = visibleRows().length > 0;
  empty.hidden = any;
}

function openJump() {
  if (!jump || jump.open) return;
  query.value = "";
  filterJump();
  if (typeof jump.showModal === "function") jump.showModal();
  else jump.setAttribute("open", "");
  query.focus();
}

document.querySelectorAll("[data-jump]").forEach((opener) => {
  opener.addEventListener("click", (event) => {
    event.preventDefault();
    openJump();
  });
});

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  const typing = tag === "INPUT" || tag === "TEXTAREA";
  if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
    event.preventDefault();
    openJump();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !typing) {
    event.preventDefault();
    if (jump.open) jump.close();
    else openJump();
  }
});

if (jump && query) {
  query.addEventListener("input", filterJump);
  jump.addEventListener("click", (event) => {
    if (event.target === jump) jump.close();
  });
  jump.addEventListener("keydown", (event) => {
    const links = visibleRows();
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && links.length) {
      event.preventDefault();
      const current = links.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (current + 1) % links.length : (current <= 0 ? links.length - 1 : current - 1);
      links[next]?.focus();
    }
    if (event.key === "Enter" && document.activeElement === query) {
      const first = links[0];
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
}
