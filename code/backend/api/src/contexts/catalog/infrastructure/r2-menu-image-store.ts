import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

export interface MenuImageStore {
  get(objectKey: string): Promise<{ body: Readable; contentType: string }>;
}

export class R2MenuImageStore implements MenuImageStore {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: { endpoint: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: options.endpoint,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async get(objectKey: string): Promise<{ body: Readable; contentType: string }> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error('R2 returned an empty menu image.');
    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }
}
