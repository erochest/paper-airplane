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
  /** Documents already in a folder that `fly` didn't upload in this test, e.g. from another machine. */
  private placed: { folder: string; name: string }[] = [];

  /** Puts a document in `folder` as if something other than this `fly` had sent it. */
  place(folder: string, name: string): void {
    this.folders.add(folder);
    this.placed.push({ folder, name });
  }

  async ensureFolder(folder: string): Promise<void> {
    this.folders.add(folder);
  }

  async documentNames(folder: string): Promise<string[]> {
    return [...this.placed, ...this.uploads].filter((d) => d.folder === folder).map((d) => d.name);
  }

  async upload(folder: string, name: string, pdf: Uint8Array): Promise<void> {
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
