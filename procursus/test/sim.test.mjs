import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG } from "../src/catalog.js";
import { confirmQueue, queueInstall } from "../src/queue.js";
import { complete, createSession, promptText, runLine } from "../src/shell.js";

function boot() {
  return createSession();
}

function run(session, line) {
  return runLine(session, line);
}

test("the bootstrap looks like a rootless Procursus iPhone", () => {
  const session = boot();
  assert.match(promptText(session), /^mobile@iPhone ~ %$/);
  assert.match(run(session, "ls -ld /var").stdout, /\/var -> \/private\/var/);
  assert.match(run(session, "ls /var").stdout, /\bjb\b/);
  assert.match(run(session, "ls /var").stdout, /\bmobile\b/);
  assert.match(run(session, "ls -ld /var/jb").stdout, /\/var\/jb -> \/private\/preboot\//);
  assert.match(run(session, "cat /var/jb/etc/apt/sources.list.d/procursus.sources").stdout, /apt\.procurs\.us/);
  assert.match(run(session, "cat /var/jb/etc/os-release").stdout, /Procursus/);
  assert.match(run(session, "uname -a").stdout, /Darwin/);
  assert.match(run(session, "uname -a").stdout, /iPhone17,2/);
  assert.match(run(session, "uname -a").stdout, /arm64/);
  assert.match(run(session, "sw_vers").stdout, /18\.1/);
  assert.match(run(session, "whoami").stdout, /mobile/);
  assert.equal(run(session, "pwd").stdout.trim(), "/var/mobile");
});

test("sudo switches to root and exit returns", () => {
  const session = boot();
  run(session, "sudo -i");
  assert.match(promptText(session), /^root@iPhone ~ #$/);
  assert.equal(run(session, "whoami").stdout.trim(), "root");
  assert.equal(run(session, "pwd").stdout.trim(), "/var/root");
  run(session, "exit");
  assert.equal(run(session, "whoami").stdout.trim(), "mobile");
});

test("files, pipes, and permissions stay inside the virtual filesystem", () => {
  const session = boot();
  assert.match(run(session, "touch /var/jb/nope").stderr, /Permission denied/);
  assert.equal(run(session, "echo hi > /var/mobile/note.txt").code, 0);
  assert.match(run(session, "cat /var/mobile/note.txt").stdout, /hi/);
  assert.equal(run(session, "mkdir -p /var/mobile/work/src").code, 0);
  assert.equal(run(session, "cp /var/mobile/note.txt /var/mobile/work/copy.txt").code, 0);
  assert.equal(run(session, "mv /var/mobile/work/copy.txt /var/mobile/work/src/moved.txt").code, 0);
  assert.match(run(session, "ls /var/mobile/work/src").stdout, /moved\.txt/);
  assert.equal(run(session, "rm /var/mobile/note.txt").code, 0);
  assert.match(run(session, "cat /var/mobile/note.txt").stderr, /No such file/);
  assert.match(run(session, "echo hello | grep ell").stdout, /hello/);
  assert.match(run(session, "wc -l /var/mobile/.zshrc").stdout, /zshrc/);
  assert.match(run(session, "head -n 1 /var/mobile/.zshrc").stdout, /Procursus/);
  run(session, "sudo touch /var/jb/etc/marker");
  assert.equal(run(session, "cat /var/jb/etc/marker").code, 0);
});

test("apt installs dependencies and the new command works", () => {
  const session = boot();
  assert.equal(run(session, "cowsay hi").code, 127);
  assert.match(run(session, "apt install cowsay").stderr, /Permission denied/);
  const installed = run(session, "sudo apt install cowsay");
  assert.match(installed.stdout, /Get:/);
  assert.match(installed.stdout, /Unpacking/);
  assert.match(installed.stdout, /Setting up/);
  assert.match(installed.stdout, /perl/);
  assert.match(run(session, "cowsay hello from procursus").stdout, /\^__\^/);
  assert.match(run(session, "apt list --installed").stdout, /cowsay/);
  assert.match(run(session, "dpkg -l").stdout, /cowsay/);
  assert.match(run(session, "sudo apt update").stdout, /Get:/);
  assert.match(run(session, "apt search cow").stdout, /cowsay/);
  assert.equal(run(session, "sudo apt remove cowsay").code, 0);
  assert.equal(run(session, "cowsay hi").code, 127);
});

test("dpkg can install a downloaded archive after dependencies are present", () => {
  const session = boot();
  assert.equal(run(session, "sudo apt install perl").code, 0);
  assert.equal(run(session, "apt download cowsay").code, 0);
  assert.match(run(session, "ls").stdout, /cowsay_3\.04-1_iphoneos-arm64\.deb/);
  const installed = run(session, "sudo dpkg -i cowsay_3.04-1_iphoneos-arm64.deb");
  assert.match(installed.stdout, /Unpacking cowsay/);
  assert.match(installed.stdout, /Setting up cowsay/);
  assert.equal(run(session, "cowsay dpkg").code, 0);
});

test("Sileo confirm uses apt and can add a tweak", () => {
  const session = boot();
  const queued = queueInstall(session, "cowsay");
  assert.equal(queued.ok, true);
  assert.ok(session.queue.some((item) => item.name === "perl"));
  const result = confirmQueue(session);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Setting up cowsay/);
  assert.match(run(session, "cowsay queued").stdout, /queued/);
  queueInstall(session, "snowboard");
  const tweak = confirmQueue(session);
  assert.equal(tweak.respring, true);
  assert.match(
    run(session, "ls /var/jb/Library/MobileSubstrate/DynamicLibraries").stdout,
    /Snowboard\.dylib/,
  );
});

test("jailbreak helpers, history, and completion stay local", () => {
  const session = boot();
  assert.match(run(session, "dopamine").stdout, /rootless/);
  assert.match(run(session, "jbctl status").stdout, /iPhone17,2/);
  assert.match(run(session, "uicache").stdout, /Sileo\.app/);
  assert.equal(run(session, "ldid -S /var/jb/usr/bin/zsh").code, 0);
  assert.equal(run(session, "curl https://apt.procurs.us").code, 127);
  assert.equal(run(session, "sudo apt install curl").code, 0);
  assert.match(run(session, "curl https://apt.procurs.us").stderr, /no network/);
  assert.match(run(session, "neofetch").stdout, /Procursus/);
  run(session, "echo one");
  run(session, "echo two");
  assert.match(run(session, "history").stdout, /echo one/);
  const names = complete(session, "cow", 3);
  assert.deepEqual(names.matches, []);
  run(session, "sudo apt install cowsay");
  const done = complete(session, "cow", 3);
  assert.equal(done.line, "cowsay ");
  const path = complete(session, "ls /var/m", "ls /var/m".length);
  assert.equal(path.line, "ls /var/mobile/");
  run(session, "reset-env");
  assert.match(run(session, "ls /var/mobile").stdout, /Documents/);
  assert.equal(run(session, "cowsay hi").code, 127);
  assert.ok(CATALOG.length >= 30);
});

test("sl is a train after it is installed", () => {
  const session = boot();
  assert.equal(run(session, "sudo apt install sl").code, 0);
  const train = run(session, "sl");
  assert.ok(train.effects.frames.length > 1);
  assert.match(train.stdout, /====/);
});
