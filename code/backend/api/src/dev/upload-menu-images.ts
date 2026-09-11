import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createDatabase, createPool, eq, tables } from '@veyroxai/db';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const images = [
  ['Americano', 'americano.png'],
  ['Baladi Date Bread Pudding', 'baladi-date-bread-pudding.png'],
  ['Cardamom Baladi Latte', 'cardamom-baladi-latte.png'],
  ['Cold Brew Hibiscus (Karkadeh)', 'cold-brew-hibiscus.png'],
  ['Flat White', 'flat-white.png'],
  ['Iced Honey Latte', 'iced-honey-latte.png'],
  ['Pistachio Baklava Bite', 'pistachio-baklava-bite.png'],
  ['Tahina Sea Salt Cookie', 'tahina-sea-salt-cookie.png'],
  ['Butter Croissant', 'butter-croissant.png'],
] as const;

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!adminUrl || !bucket || !endpoint || !accessKeyId || !secretAccessKey)
    throw new Error('DATABASE_ADMIN_URL and R2 credentials are required.');
  const pool = createPool(adminUrl);
  const db = createDatabase(pool);
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    const [tenant] = await db
      .select()
      .from(tables.tenants)
      .where(eq(tables.tenants.slug, 'brew-and-baladi'));
    if (!tenant) throw new Error('Run pnpm db:seed before uploading menu images.');
    for (const [nameEn, filename] of images) {
      const [item] = await db
        .select()
        .from(tables.menuItems)
        .where(eq(tables.menuItems.nameEn, nameEn));
      if (!item) throw new Error(`Seed item not found: ${nameEn}`);
      const objectKey = `tenants/${tenant.id}/menu/${filename}`;
      if (item.imageObjectKey === objectKey) continue;
      const source = path.resolve(
        import.meta.dirname,
        '../../../../frontends/order/src/assets/menu',
        filename,
      );
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: await readFile(source),
          ContentType: 'image/png',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      await db
        .update(tables.menuItems)
        .set({ imageObjectKey: objectKey })
        .where(eq(tables.menuItems.id, item.id));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
