import { dirNode, linkNode, lookup, mkdirp, writeFile } from "./fs.js";
import { DEVICE, OS_RELEASE, SOURCES_TEXT, STATUS_PATH } from "./system.js";

const ZSHRC = `# Procursus rootless
export PATH="/var/jb/usr/bin:/var/jb/usr/games:/var/jb/bin:/var/jb/usr/sbin:/var/jb/sbin:$PATH"
`;

export function seedFilesystem() {
  const root = dirNode();
  mkdirp(root, DEVICE.jb);
  mkdirp(root, "/private/var/tmp");
  mkdirp(root, "/private/etc");
  const privateVar = lookup(root, "/private/var").node;
  root.children.var = linkNode("/private/var");
  root.children.tmp = linkNode("/private/var/tmp");
  root.children.etc = linkNode("/private/etc");
  root.children.bin = dirNode();
  root.children.usr = dirNode();
  privateVar.children.jb = linkNode(DEVICE.jb);
  privateVar.children.mobile = dirNode({ owner: "mobile", group: "mobile", mode: 0o755 });
  privateVar.children.root = dirNode({ mode: 0o750 });

  writeFile(root, "/var/jb/etc/apt/sources.list.d/procursus.sources", SOURCES_TEXT, { mode: 0o644 });
  writeFile(root, "/var/jb/etc/os-release", OS_RELEASE, { mode: 0o644 });
  writeFile(
    root,
    "/var/jb/etc/passwd",
    "root:*:0:0:System Administrator:/var/root:/var/jb/usr/bin/zsh\nmobile:*:501:501:Mobile User:/var/mobile:/var/jb/usr/bin/zsh\n",
    { mode: 0o644 },
  );
  writeFile(
    root,
    "/var/jb/etc/sudoers",
    "mobile ALL=(ALL) NOPASSWD: ALL\n",
    { mode: 0o440 },
  );
  writeFile(root, "/etc/passwd", "root:*:0:0:System Administrator:/var/root:/bin/sh\nmobile:*:501:501:Mobile User:/var/mobile:/bin/sh\n", {
    mode: 0o644,
  });
  writeFile(root, "/var/mobile/.zshrc", ZSHRC, { mode: 0o644, owner: "mobile", group: "mobile" });
  writeFile(root, "/var/mobile/.profile", ZSHRC, { mode: 0o644, owner: "mobile", group: "mobile" });
  writeFile(
    root,
    "/var/mobile/Documents/Notes.txt",
    "Procursus suite 3000 from https://apt.procurs.us/\nSileo installs those packages through apt.\n",
    { mode: 0o644, owner: "mobile", group: "mobile" },
  );
  writeFile(root, "/var/root/.zshrc", ZSHRC, { mode: 0o644 });
  mkdirp(root, "/var/mobile/Library");
  mkdirp(root, "/bin");
  const bin = lookup(root, "/bin").node;
  bin.children.sh = linkNode("/var/jb/usr/bin/zsh");
  writeFile(root, STATUS_PATH, "", { mode: 0o644 });
  return root;
}
