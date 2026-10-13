#!/usr/bin/env bun
import { run } from "./core.ts";
import { PandocTypstRenderer } from "./renderer.ts";
import { RmapiTransport } from "./rmapi.ts";

try {
  const code = await run(process.argv.slice(2), {
    env: process.env,
    cwd: process.cwd(),
    now: () => new Date(),
    transport: new RmapiTransport(),
    renderer: new PandocTypstRenderer(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line),
  });
  process.exit(code);
} catch (error) {
  console.error(`fly: ${(error as Error).message}`);
  process.exit(1);
}
