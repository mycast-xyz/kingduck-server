import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();

  const tables = [
    'games',
    'elements',
    'characters',
    'items',
    'videos',
    'users',
    'calendar_events',
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const res = await client.query(`SELECT COUNT(*) FROM "${table}"`);
      counts[table] = parseInt(res.rows[0].count);
    } catch (e: any) {
      console.error(`Error counting ${table}:`, e.message);
    }
  }

  console.log('Database Counts:', counts);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
