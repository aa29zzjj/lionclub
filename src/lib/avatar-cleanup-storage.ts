import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { AvatarCleanupStorage } from "./account-deletion";

/** Explicit trusted-worker adapter, not invoked during deletion or tests. */
export function createAvatarCleanupStorage(): AvatarCleanupStorage {
  const clients = new Map<string, S3Client>();
  const client = (region: string) => {
    let existing = clients.get(region);
    if (!existing) { existing = new S3Client({ region }); clients.set(region, existing); }
    return existing;
  };
  return {
    async listKeys({ bucket, region, prefix }) {
      const response = await client(region).send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 }));
      return (response.Contents ?? []).flatMap(object => object.Key ? [object.Key] : []);
    },
    async deleteKeys({ bucket, region, keys }) {
      if (!keys.length) return;
      const response = await client(region).send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true } }));
      if (response.Errors?.length) throw new Error("S3_DELETE_PARTIAL_FAILURE");
    },
  };
}
