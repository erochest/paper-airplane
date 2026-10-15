import type { Renderer, RenderRequest, Tool, Toolchain, Transport } from "../src/core.ts";
import { NotLoggedInError } from "../src/errors.ts";

export interface Upload {
  folder: string;
  name: string;
  content: Uint8Array;
}

/** Ways the fake device can be told to fail, each as rmapi would. */
export type DeviceFailure = "no-login" | "network-down";

const FAILURE_MESSAGES: Record<DeviceFailure, string> = {
  "no-login": "rmapi exited with 1: ERROR: 2026/10/13 09:05:00 auth.go:30: missing token, not asking, aborting",
  "network-down": "rmapi exited with 1: dial tcp: lookup internal.cloud.remarkable.com: no such host",
};

/** An in-memory reMarkable: records folders and every document uploaded. */
export class FakeDevice implements Transport {
  folders = new Set<string>();
  uploads: Upload[] = [];
  /** When set, every call fails this way until it's cleared. */
  failure: DeviceFailure | null = null;
  /** Documents already in a folder that `fly` didn't upload in this test, e.g. from another machine. */
  private placed: { folder: string; name: string }[] = [];

  /** Puts a document in `folder` as if something other than this `fly` had sent it. */
  place(folder: string, name: string): void {
    this.folders.add(folder);
    this.placed.push({ folder, name });
  }

  private check(): void {
    if (this.failure === "no-login") throw new NotLoggedInError(FAILURE_MESSAGES[this.failure]);
    if (this.failure !== null) throw new Error(FAILURE_MESSAGES[this.failure]);
  }

  async checkLogin(): Promise<void> {
    this.check();
  }

  async ensureFolder(folder: string): Promise<void> {
    this.check();
    this.folders.add(folder);
  }

  async documentNames(folder: string): Promise<string[]> {
    this.check();
    return [...this.placed, ...this.uploads].filter((d) => d.folder === folder).map((d) => d.name);
  }

  async upload(folder: string, name: string, pdf: Uint8Array): Promise<void> {
    this.check();
    if (!this.folders.has(folder)) {
      throw new Error(`no such folder on device: ${folder}`);
    }
    // What rmapi does with a name that's taken is unknown, so the fake refuses outright.
    if ((await this.documentNames(folder)).includes(name)) {
      throw new Error(`a document named ${name} already exists in ${folder}`);
    }
    this.uploads.push({ folder, name, content: pdf });
  }
}

/** Captures what would be typeset and returns a stand-in PDF. */
export class FakeRenderer implements Renderer {
  requests: RenderRequest[] = [];

  async render(request: RenderRequest): Promise<Uint8Array> {
    this.requests.push(request);
    return new TextEncoder().encode(`%PDF-fake\n${request.markdown}`);
  }
}

/**
 * Reports tool versions as if they were installed, unless a test removes them (null) or makes
 * asking for the version fail (an Error).
 */
export class FakeToolchain implements Toolchain {
  versions: Record<Tool, string | null | Error> = { pandoc: "3.12.1", typst: "0.15.1", rmapi: "v0.0.35" };

  async version(tool: Tool): Promise<string | null> {
    const version = this.versions[tool];
    if (version instanceof Error) throw version;
    return version;
  }
}
