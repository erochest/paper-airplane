// Runs the `fly` CLI core in its own process with the fake device and renderer, so tests can run
// several `fly` processes at once. Usage: bun test/fly-with-fakes.ts <cwd> <data-dir> <fly args...>
import { run } from "../src/core.ts";
import { FakeDevice, FakeRenderer, FakeToolchain } from "./fakes.ts";

const [cwd, dataDir, ...args] = process.argv.slice(2);
if (cwd === undefined || dataDir === undefined) throw new Error("usage: fly-with-fakes.ts <cwd> <data-dir> <args...>");
const code = await run(args, {
  env: { HOME: cwd, FLY_DATA_DIR: dataDir },
  cwd,
  now: () => new Date(),
  transport: new FakeDevice(),
  renderer: new FakeRenderer(),
  toolchain: new FakeToolchain(),
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
});
process.exit(code);
