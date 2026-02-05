import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  console.log('Connected to database.');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // List of tables to backup
  // Note: CalendarEvent table might not exist yet, so we skip it or try/catch
  const tables = [
    'games',
    'elements',
    'characters',
    'items',
    'videos',
    'users',
  ];
  // We can query information_schema to find all tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);

  const existingTables = res.rows.map((r) => r.table_name);
  console.log('Found tables:', existingTables);

  const backupData: any = {};

  for (const table of existingTables) {
    if (table === '_prisma_migrations') continue; // Skip migrations table or keep it? Maybe keep it for reference but not restore
    try {
      console.log(`Backing up ${table}...`);
      const tableData = await client.query(`SELECT * FROM "${table}"`);
      backupData[table] = tableData.rows;
      console.log(`  -> ${tableData.rows.length} rows.`);
    } catch (e) {
      console.error(`Failed to backup ${table}`, e);
    }
  }

  const backupFile = path.join(backupDir, `backup_direct_${timestamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`Backup saved to ${backupFile}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
