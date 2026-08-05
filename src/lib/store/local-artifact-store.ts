import path from "node:path";
import type { ArtifactStore } from "@/lib/store/artifact-types";

/**
 * Filesystem-backed {@link ArtifactStore}. Screenshots live under `.data/`
 * (NOT `public/`): Next's production server only serves files that existed in
 * `public/` at build time, so runtime-written screenshots there 404.
 *
 * `publish` is a no-op — the scanner has already written the bytes to their
 * final location, which is exactly the property S3 does not have.
 */
export class LocalArtifactStore implements ArtifactStore {
  private readonly root: string;

  constructor(root: string = path.join(process.cwd(), ".data", "audit-artifacts")) {
    this.root = root;
  }

  stagingDirectory(auditId: string): string {
    return path.join(this.root, auditId);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match ArtifactStore for callers holding the concrete class
  async publish(auditId: string, files: string[]): Promise<void> {
    // Nothing to do: staged files are already final.
  }

  urlFor(auditId: string, file: string): string {
    return `/artifacts/${auditId}/${file}`;
  }
}
