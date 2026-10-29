import { cpSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, "site"), dist, { recursive: true });

run("npm", ["run", "build", "-w", "aetherwell", "--", "--base", "/aetherwell/"]);
run("npm", ["run", "build", "-w", "squishy", "--", "--base", "/squishy/"]);

cpSync(join(root, "aetherwell/dist"), join(dist, "aetherwell"), { recursive: true });
cpSync(join(root, "squishy/dist"), join(dist, "squishy"), { recursive: true });
