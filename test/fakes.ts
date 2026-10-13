import type { Renderer, RenderRequest, Transport } from "../src/core.ts";

export interface Upload {
  folder: string;
  name: string;
  content: Uint8Array;
}

/** An in-memory reMarkable: records folders and every document uploaded. */
export class FakeDevice implements Transport {
  folders = new Set<string>();
  uploads: Upload[] = [];

  async ensureFolder(folder: string): Promise<void> {
    this.folders.add(folder);
  }

  async upload(folder: string, name: string, pdf: Uint8Array): Promise<void> {
    if (!this.folders.has(folder)) {
      throw new Error(`no such folder on device: ${folder}`);
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
