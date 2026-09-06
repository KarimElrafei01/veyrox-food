import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes schema migrations to drizzle/. Hand-written SQL that
// Drizzle cannot express (uuid_generate_v7, RLS, append-only triggers, grants)
// lives in drizzle/pre/ and drizzle/post/ and is applied by src/migrate.ts.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/veyrox_food',
  },
});
