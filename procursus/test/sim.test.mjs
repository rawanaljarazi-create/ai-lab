import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";
import { setDebFetcher } from "../src/apt.js";
import { buildDeb } from "../src/deb.js";
import { loadPackagesZst, packageByName, packageCount, setIndexFetcher } from "../src/repo.js";
import { confirmQueue, queueInstall } from "../src/queue.js";
import { bannerText, complete, createSession, promptText, runLine } from "../src/shell.js";

const cowsayDeb = new Uint8Array(readFileSync(new URL("./fixtures/cowsay.deb", import.meta.url)));
const slDeb = new Uint8Array(readFileSync(new URL("./fixtures/sl.deb", import.meta.url)));

function stubDeb(name) {
  return buildDeb([{ path: `/var/jb/usr/bin/${name}`, text: `#!/bin/sh\n# ${name}\n`, mode: 0o755 }]);
}

before(() => {
  loadPackagesZst(readFileSync(new URL("../public/apt/Packages.zst", import.meta.url)));
  setIndexFetcher(async () => null);
  setDebFetcher(async (pkg) => {
    if (pkg.name === "cowsay") return cowsayDeb;
    if (pkg.name === "sl") return slDeb;
    return stubDeb(pkg.name);
  });
});

function boot() {
  return createSession();
}

function run(session, line) {
  return runLine(session, line);
}

test("the bootstrap looks like a rootless Procursus iPhone", async () => {
  const session = boot();
  assert.match(promptText(session), /^mobile@iPhone ~ %$/);
  assert.match((await run(session, "ls -ld /var")).stdout, /\/var -> \/private\/var/);
  assert.match((await run(session, "ls /var")).stdout, /\bjb\b/);
  assert.match((await run(session, "ls /var")).stdout, /\bmobile\b/);
  assert.match((await run(session, "ls -ld /var/jb")).stdout, /\/var\/jb -> \/private\/preboot\//);
  assert.match((await run(session, "cat /var/jb/etc/apt/sources.list.d/procursus.sources")).stdout, /apt\.procurs\.us/);
  assert.match((await run(session, "cat /var/jb/etc/apt/sources.list.d/procursus.sources")).stdout, /\nSuites: 3000\n/);
  assert.match((await run(session, "uname -a")).stdout, /Darwin/);
  assert.match((await run(session, "uname -a")).stdout, /iPhone17,2/);
  assert.match((await run(session, "uname -a")).stdout, /arm64/);
  assert.match((await run(session, "whoami")).stdout, /mobile/);
  assert.equal((await run(session, "pwd")).stdout.trim(), "/var/mobile");
  assert.match(bannerText(), /apt\.procurs\.us/);
  assert.ok(packageCount() > 1000);
  assert.equal(packageByName("cowsay").version, "3.04-1");
  assert.match(packageByName("cowsay").filename, /iphoneos-arm64-rootless\/3000\/cowsay/);
});

test("sudo switches to root and exit returns", async () => {
  const session = boot();
  await run(session, "sudo -i");
  assert.match(promptText(session), /^root@iPhone ~ #$/);
  assert.equal((await run(session, "whoami")).stdout.trim(), "root");
  assert.equal((await run(session, "pwd")).stdout.trim(), "/var/root");
  await run(session, "exit");
  assert.equal((await run(session, "whoami")).stdout.trim(), "mobile");
});

test("files, pipes, and permissions stay inside the virtual filesystem", async () => {
  const session = boot();
  assert.match((await run(session, "touch /var/jb/nope")).stderr, /Permission denied/);
  assert.equal((await run(session, "echo hi > /var/mobile/note.txt")).code, 0);
  assert.match((await run(session, "cat /var/mobile/note.txt")).stdout, /hi/);
  assert.equal((await run(session, "mkdir -p /var/mobile/work/src")).code, 0);
  assert.equal((await run(session, "cp /var/mobile/note.txt /var/mobile/work/copy.txt")).code, 0);
  assert.equal((await run(session, "mv /var/mobile/work/copy.txt /var/mobile/work/src/moved.txt")).code, 0);
  assert.match((await run(session, "ls /var/mobile/work/src")).stdout, /moved\.txt/);
  assert.equal((await run(session, "rm /var/mobile/note.txt")).code, 0);
  assert.match((await run(session, "cat /var/mobile/note.txt")).stderr, /No such file/);
  assert.match((await run(session, "echo hello | grep ell")).stdout, /hello/);
  await run(session, "sudo touch /var/jb/etc/marker");
  assert.equal((await run(session, "cat /var/jb/etc/marker")).code, 0);
});

test("apt installs the real cowsay deb and its dependency", async () => {
  const session = boot();
  assert.equal((await run(session, "cowsay hi")).code, 127);
  assert.match((await run(session, "apt install cowsay")).stderr, /Permission denied/);
  const installed = await run(session, "sudo apt install cowsay");
  assert.equal(installed.code, 0);
  assert.match(installed.stdout, /Get:/);
  assert.match(installed.stdout, /Unpacking/);
  assert.match(installed.stdout, /Setting up/);
  assert.match(installed.stdout, /perl/);
  assert.match(installed.stdout, /3\.04-1/);
  const script = await run(session, "cat /var/jb/usr/games/cowsay");
  assert.match(script.stdout, /Tony Monroe/);
  assert.match((await run(session, "cowsay hello from procursus")).stdout, /\^__\^/);
  assert.match((await run(session, "apt list --installed")).stdout, /cowsay/);
  assert.match((await run(session, "dpkg -l")).stdout, /cowsay/);
  assert.match((await run(session, "sudo apt update")).stdout, /Get:/);
  assert.match((await run(session, "apt search cow")).stdout, /cowsay/);
  assert.equal((await run(session, "sudo apt remove cowsay")).code, 0);
  assert.equal((await run(session, "cowsay hi")).code, 127);
});

test("dpkg installs a real downloaded cowsay archive", async () => {
  const session = boot();
  assert.equal((await run(session, "sudo apt install perl")).code, 0);
  assert.equal((await run(session, "apt download cowsay")).code, 0);
  assert.match((await run(session, "ls")).stdout, /cowsay_3\.04-1_iphoneos-arm64\.deb/);
  const installed = await run(session, "sudo dpkg -i cowsay_3.04-1_iphoneos-arm64.deb");
  assert.match(installed.stdout, /Unpacking cowsay/);
  assert.match(installed.stdout, /Setting up cowsay/);
  assert.equal((await run(session, "cowsay dpkg")).code, 0);
});

test("Sileo confirm installs the same real package apt would", async () => {
  const session = boot();
  const queued = queueInstall(session, "cowsay");
  assert.equal(queued.ok, true);
  assert.ok(session.queue.some((item) => item.name === "perl"));
  const result = await confirmQueue(session);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Setting up cowsay/);
  assert.match((await run(session, "cowsay queued")).stdout, /queued/);
  queueInstall(session, "org.coolstar.sileo");
  const tweak = await confirmQueue(session);
  assert.equal(tweak.code, 0);
  assert.match(tweak.stdout, /Setting up org.coolstar.sileo/);
  assert.match(tweak.stdout, /2\.5\.1/);
});

test("history, completion, and the real index stay available", async () => {
  const session = boot();
  assert.match((await run(session, "dopamine")).stdout, /apt\.procurs\.us/);
  assert.match((await run(session, "jbctl status")).stdout, /iPhone17,2/);
  assert.equal((await run(session, "ldid -S /var/jb/usr/bin/zsh")).code, 127);
  await run(session, "echo one");
  await run(session, "echo two");
  assert.match((await run(session, "history")).stdout, /echo one/);
  const names = complete(session, "cow", 3);
  assert.deepEqual(names.matches, []);
  await run(session, "sudo apt install cowsay");
  const done = complete(session, "cows", 4);
  assert.equal(done.line, "cowsay ");
  const path = complete(session, "ls /var/m", "ls /var/m".length);
  assert.equal(path.line, "ls /var/mobile/");
  await run(session, "reset-env");
  assert.match((await run(session, "ls /var/mobile")).stdout, /Documents/);
  assert.equal((await run(session, "cowsay hi")).code, 127);
});

test("the real sl binary is unpacked and cannot run as iphoneos code", async () => {
  const session = boot();
  assert.equal((await run(session, "sudo apt install sl")).code, 0);
  const listed = await run(session, "dpkg -L sl");
  assert.match(listed.stdout, /sl/);
  const train = await run(session, "sl");
  assert.equal(train.code, 126);
  assert.match(train.stderr, /Exec format error/);
});
