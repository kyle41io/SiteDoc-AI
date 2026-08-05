/**
 * Storage abstraction for audit screenshots. The scanner writes PNGs into
 * `stagingDirectory()` and then calls `publish()` once; where the bytes end up
 * is the implementation's business. `urlFor()` returns the path the browser
 * uses, which is why both implementations agree on one URL shape.
 */
export interface ArtifactStore {
  /** Directory the scanner writes PNGs into. Must exist after `mkdir`. */
  stagingDirectory(auditId: string): string;
  /** Move staged files to their durable home. Called once, after capture. */
  publish(auditId: string, files: string[]): Promise<void>;
  /** Public URL for a published artifact. */
  urlFor(auditId: string, file: string): string;
}
