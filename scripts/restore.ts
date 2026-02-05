import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const args = process.argv.slice(2);
  let backupFile = args[0];

  if (!backupFile) {
    // Find latest backup
    const backupDir = path.join(process.cwd(), 'backups');
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('backup_direct_') && f.endsWith('.json'));
    if (files.length === 0) {
      console.error('No backup files found.');
      process.exit(1);
    }
    // Sort by name (timestamp) descending
    files.sort((a, b) => b.localeCompare(a));
    backupFile = path.join(backupDir, files[0]);
  }

  console.log(`Restoring from ${backupFile}...`);
  const data = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));

  await client.connect();
  console.log('Connected to database.');

  // Order matters for Foreign Keys
  const tableOrder = [
    'games',
    'elements',
    'items',
    'characters',
    'users',
    'videos',
  ];

  for (const table of tableOrder) {
    const rows = data[table];
    if (!rows || rows.length === 0) {
      console.log(`Skipping ${table} (no data)`);
      continue;
    }

    console.log(`Restoring ${table} (${rows.length} rows)...`);

    // Construct INSERT query dynamically
    // We assume all rows have same keys, taking keys from first row
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const columns = keys.map((k) => `"${k}"`).join(', ');

      for (const row of rows) {
        const values = keys.map((k, i) => `$${i + 1}`);
        const query = `
          INSERT INTO "${table}" (${columns}) 
          VALUES (${values.join(', ')})
          ON CONFLICT (id) DO NOTHING
        `;
        const rowValues = keys.map((k) => {
          const val = row[k];
          // Handle JSON stringify if object/array but not null
          if (
            val !== null &&
            typeof val === 'object' &&
            !(val instanceof Date)
          ) {
            return JSON.stringify(val);
          }
          return val;
        });

        try {
          await client.query(query, rowValues);
        } catch (e) {
          console.error(`Failed to insert into ${table} id=${row.id}`, e);
        }
      }

      // Reset sequence
      try {
        await client.query(
          `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT MAX(id) FROM "${table}") + 1);`,
        );
      } catch (e) {
        // Some tables might not have serial id or sequence, ignore
        // console.warn(`Could not reset sequence for ${table}`, e.message);
      }
    }
  }

  console.log('Restore completed.');
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
