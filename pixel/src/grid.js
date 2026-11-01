export const PALETTE = ["#1a1c2c","#5d275d","#b13e53","#ef7d57","#ffcd75","#a7f070","#38b764","#257179","#29366f","#3b5dc9","#41a6f6","#73eff7","#f4f4f4","#94b0c2","#566c86","#333c57"];
export const EMPTY = -1;

export function createGrid(size = 16) {
  return { size, cells: new Array(size * size).fill(EMPTY) };
}

export function inside(grid, x, y) {
  return x >= 0 && y >= 0 && x < grid.size && y < grid.size;
}

export function get(grid, x, y) {
  return inside(grid, x, y) ? grid.cells[y * grid.size + x] : undefined;
}

export function paint(grid, x, y, color) {
  if (!inside(grid, x, y)) return grid;
  const cells = grid.cells.slice();
  cells[y * grid.size + x] = color;
  return { ...grid, cells };
}

export function fill(grid, x, y, color) {
  if (!inside(grid, x, y)) return grid;
  const target = get(grid, x, y);
  if (target === color) return grid;
  const cells = grid.cells.slice();
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (!inside(grid, cx, cy) || cells[cy * grid.size + cx] !== target) continue;
    cells[cy * grid.size + cx] = color;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return { ...grid, cells };
}

export function mirrorX(x, size) {
  return size - 1 - x;
}

export function encode(grid) {
  return grid.size + ":" + grid.cells.map((c) => (c === EMPTY ? "." : c.toString(16))).join("");
}

export function decode(text) {
  const [sizeText, body] = String(text).split(":");
  const size = Number(sizeText);
  if (!Number.isInteger(size) || size < 1 || !body || body.length !== size * size) return null;
  const cells = [...body].map((ch) => (ch === "." ? EMPTY : parseInt(ch, 16)));
  if (cells.some((c) => Number.isNaN(c))) return null;
  return { size, cells };
}
