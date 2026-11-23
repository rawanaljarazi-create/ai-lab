const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pieces = document.querySelectorAll(".card, footer");

if (!reduce && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("shown");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "48px" },
  );
  pieces.forEach((el, index) => {
    el.style.setProperty("--d", `${(index % 3) * 90}ms`);
    observer.observe(el);
  });
}

const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const bento = document.querySelector(".bento");
if (fine && bento) {
  let card = null;
  let left = 0;
  let top = 0;
  let frame = 0;
  let x = 0;
  let y = 0;
  const paint = () => {
    frame = 0;
    if (!card) return;
    card.style.setProperty("--sx", `${x - left}px`);
    card.style.setProperty("--sy", `${y - top}px`);
  };
  bento.addEventListener(
    "pointermove",
    (event) => {
      const next = event.target.closest(".card");
      if (!next) return;
      if (next !== card) {
        card = next;
        const rect = card.getBoundingClientRect();
        left = rect.left;
        top = rect.top;
      }
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    },
    { passive: true },
  );
  bento.addEventListener("pointerleave", () => {
    card = null;
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

document.querySelectorAll("[data-copy]").forEach((button) => {
  const label = button.textContent;
  const text = button.getAttribute("data-copy");
  button.setAttribute("aria-label", `Copy ${text}`);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    button.textContent = "Copied";
    button.classList.add("copied");
    button.setAttribute("aria-label", `Copied ${text}`);
    window.setTimeout(() => {
      button.textContent = label;
      button.classList.remove("copied");
      button.setAttribute("aria-label", `Copy ${text}`);
    }, 1400);
  });
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
