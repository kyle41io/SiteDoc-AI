import { readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ArtifactStore } from "@/lib/store/artifact-types";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * S3-backed {@link ArtifactStore}.
 *
 * Staging happens in `/tmp` because a Lambda's deployment directory is
 * read-only; `publish` then uploads. Screenshots are immutable once written —
 * an audit id is never reused — so they get a one-year immutable cache header
 * and are served from CloudFront's edge rather than through any compute.
 */
export class S3ArtifactStore implements ArtifactStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly stagingRoot: string;

  constructor(options: { bucket: string; client?: S3Client; stagingRoot?: string }) {
    this.bucket = options.bucket;
    this.client = options.client ?? new S3Client({});
    this.stagingRoot = options.stagingRoot ?? "/tmp";
  }

  stagingDirectory(auditId: string): string {
    return path.join(this.stagingRoot, auditId);
  }

  async publish(auditId: string, files: string[]): Promise<void> {
    const dir = this.stagingDirectory(auditId);

    for (const file of files) {
      const body = await readFile(path.join(dir, file));

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: `audits/${auditId}/${file}`,
          Body: body,
          ContentType: CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    }
  }

  urlFor(auditId: string, file: string): string {
    return `/artifacts/${auditId}/${file}`;
  }
}
