import { beforeEach, expect, test } from "bun:test";
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer, FakeToolchain } from "./fakes.ts";

let device: FakeDevice;
let toolchain: FakeToolchain;
let out: string[];
let err: string[];

beforeEach(() => {
  device = new FakeDevice();
  toolchain = new FakeToolchain();
  out = [];
  err = [];
});

function fly(...args: string[]) {
  return run(args, {
    env: {},
    cwd: "/",
    now: () => new Date(2026, 9, 13, 9, 5),
    transport: device,
    renderer: new FakeRenderer(),
    toolchain,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
}

const printed = () => JSON.parse(out.join("\n"));

test("fly doctor reports each tool's version and the login when everything is set up", async () => {
  const code = await fly("doctor");

  expect(err).toEqual([]);
  expect(code).toBe(0);
  expect(printed()).toEqual({
    ok: true,
    checks: [
      { name: "pandoc", ok: true, version: "3.12.1" },
      { name: "typst", ok: true, version: "0.15.1" },
      { name: "rmapi", ok: true, version: "v0.0.35" },
      { name: "rmapi login", ok: true },
    ],
  });
});

test("fly doctor gives the exact install command for each missing tool and exits non-zero", async () => {
  toolchain.versions.pandoc = null;
  toolchain.versions.typst = null;

  const code = await fly("doctor");

  expect(code).toBe(1);
  expect(printed()).toEqual({
    ok: false,
    checks: [
      { name: "pandoc", ok: false, problem: "pandoc is not installed", fix: "brew install pandoc" },
      { name: "typst", ok: false, problem: "typst is not installed", fix: "brew install typst" },
      { name: "rmapi", ok: true, version: "v0.0.35" },
      { name: "rmapi login", ok: true },
    ],
  });
  expect(err).toEqual([
    "fly: pandoc is not installed; to fix it: brew install pandoc",
    "fly: typst is not installed; to fix it: brew install typst",
  ]);
});

test("fly doctor tells the user to pair rmapi themselves when it isn't logged in", async () => {
  device.failure = "no-login";

  const code = await fly("doctor");

  expect(code).toBe(1);
  const { ok, checks } = printed();
  expect(ok).toBe(false);
  expect(checks[3]).toEqual({
    name: "rmapi login",
    ok: false,
    problem: "rmapi is not logged in to the reMarkable cloud, or its login has expired",
    fix: "run `! rmapi` and enter the code from my.remarkable.com",
  });
  // Nothing rmapi said about its token reaches the output.
  expect(out.join("\n")).not.toContain("token");
  expect(err.join("\n")).not.toContain("token");
});

test("fly doctor asks for rmapi to be installed before its login can be checked", async () => {
  toolchain.versions.rmapi = null;

  const code = await fly("doctor");

  expect(code).toBe(1);
  expect(printed().checks.slice(2)).toEqual([
    { name: "rmapi", ok: false, problem: "rmapi is not installed", fix: "go install github.com/ddvk/rmapi@v0.0.35" },
    {
      name: "rmapi login",
      ok: false,
      problem: "the login can't be checked until rmapi is installed",
      fix: "go install github.com/ddvk/rmapi@v0.0.35",
    },
  ]);
});

test("fly doctor reports a login it couldn't check, such as with the network down", async () => {
  device.failure = "network-down";

  expect(await fly("doctor")).toBe(1);

  expect(printed().checks[3]).toEqual({
    name: "rmapi login",
    ok: false,
    problem:
      "the login couldn't be checked (rmapi exited with 1: dial tcp: lookup internal.cloud.remarkable.com: no such host)",
    fix: "check the network connection, then run fly doctor again",
  });
});

test("fly doctor reports a tool that is installed but can't say its version", async () => {
  toolchain.versions.typst = new Error("typst exited with 1: dyld: Library not loaded");

  expect(await fly("doctor")).toBe(1);

  expect(printed().checks[1]).toEqual({
    name: "typst",
    ok: false,
    problem: "typst is installed but doesn't run (typst exited with 1: dyld: Library not loaded)",
    fix: "brew install typst",
  });
});

test("fly doctor rejects arguments", async () => {
  expect(await fly("doctor", "--bogus")).toBe(2);
  expect(err).toEqual(["usage: fly doctor"]);
});
