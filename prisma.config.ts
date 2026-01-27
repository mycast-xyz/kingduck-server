import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env['DATABASE_URL'],
  },
  migrations: {
    seed: 'npx ts-node-dev --transpile-only prisma/seed.ts',
  },
});
