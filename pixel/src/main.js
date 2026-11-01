import { createGrid, decode, EMPTY, encode, fill, mirrorX, paint, PALETTE } from "./grid.js";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const SIZE = 16;
const CELL = canvas.width / SIZE;

let grid = decode(location.hash.slice(1)) ?? createGrid(SIZE);
let color = 0;
let tool = "pen";
let history = [];
let drawing = false;

function draw() {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const c = grid.cells[y * SIZE + x];
      ctx.fillStyle = c === EMPTY ? ((x + y) % 2 ? "#2a2d40" : "#33374d") : PALETTE[c];
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }
  location.replace("#" + encode(grid));
}

function cellAt(event) {
  const r = canvas.getBoundingClientRect();
  return [Math.floor(((event.clientX - r.left) / r.width) * SIZE), Math.floor(((event.clientY - r.top) / r.height) * SIZE)];
}

function apply(event) {
  const [x, y] = cellAt(event);
  const value = tool === "erase" ? EMPTY : color;
  const mirror = document.getElementById("mirror").checked;
  const op = tool === "fill" ? fill : paint;
  grid = op(grid, x, y, value);
  if (mirror) grid = op(grid, mirrorX(x, SIZE), y, value);
  draw();
}

canvas.addEventListener("pointerdown", (e) => {
  history.push(grid);
  drawing = tool !== "fill";
  canvas.setPointerCapture(e.pointerId);
  apply(e);
});
canvas.addEventListener("pointermove", (e) => drawing && apply(e));
canvas.addEventListener("pointerup", () => (drawing = false));

const palette = document.getElementById("palette");
PALETTE.forEach((hex, i) => {
  const b = document.createElement("button");
  b.style.background = hex;
  b.setAttribute("aria-label", "Color " + hex);
  if (i === color) b.classList.add("on");
  b.onclick = () => {
    color = i;
    palette.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  };
  palette.append(b);
});

document.querySelectorAll("[data-tool]").forEach((b) => {
  b.onclick = () => {
    tool = b.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((x) => x.classList.toggle("on", x === b));
  };
});
document.getElementById("undo").onclick = () => {
  if (history.length) { grid = history.pop(); draw(); }
};
document.getElementById("clear").onclick = () => {
  history.push(grid);
  grid = createGrid(SIZE);
  draw();
};
document.getElementById("save").onclick = () => {
  const out = document.createElement("canvas");
  out.width = out.height = SIZE * 16;
  const o = out.getContext("2d");
  grid.cells.forEach((c, i) => {
    if (c === EMPTY) return;
    o.fillStyle = PALETTE[c];
    o.fillRect((i % SIZE) * 16, Math.floor(i / SIZE) * 16, 16, 16);
  });
  const a = document.createElement("a");
  a.download = "pixel.png";
  a.href = out.toDataURL("image/png");
  a.click();
};

draw();
