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
run("npm", ["run", "build", "-w", "flappy", "--", "--base", "/flappy/"]);
run("npm", ["run", "build", "-w", "beats", "--", "--base", "/beats/"]);
run("npm", ["run", "build", "-w", "pixel", "--", "--base", "/pixel/"]);
run("npm", ["run", "build", "-w", "physics", "--", "--base", "/physics/"]);
run("npm", ["run", "build", "-w", "typing", "--", "--base", "/typing/"]);

cpSync(join(root, "aetherwell/dist"), join(dist, "aetherwell"), { recursive: true });
cpSync(join(root, "squishy/dist"), join(dist, "squishy"), { recursive: true });
cpSync(join(root, "flappy/dist"), join(dist, "flappy"), { recursive: true });
cpSync(join(root, "beats/dist"), join(dist, "beats"), { recursive: true });
cpSync(join(root, "pixel/dist"), join(dist, "pixel"), { recursive: true });
cpSync(join(root, "physics/dist"), join(dist, "physics"), { recursive: true });
cpSync(join(root, "typing/dist"), join(dist, "typing"), { recursive: true });
