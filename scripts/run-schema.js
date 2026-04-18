#!/usr/bin/env node
/**
 * One-shot helper for applying `supabase/schema.sql` to the live Supabase
 * database via the session pooler. Reads credentials from environment
 * variables — never hard-code a password here.
 *
 * Required env vars:
 *   SUPABASE_PROJECT_REF   e.g. "abcdefghijklmnop" (from your project URL)
 *   SUPABASE_DB_PASSWORD   the database password from Supabase → Settings → Database
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs)   # or use `dotenv-cli`
 *   node scripts/run-schema.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;

if (!PROJECT_REF || !PASSWORD) {
  console.error(
    'Missing required environment variables.\n' +
      '  Set SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD before running.\n' +
      '  See .env.local.example for the expected names.'
  );
  process.exit(1);
}

// Try every region where Supabase hosts poolers — the first reachable one wins.
const regions = [
  'eu-central-1', 'eu-west-1', 'us-east-1', 'eu-west-2', 'eu-west-3',
  'ap-southeast-1', 'us-west-1', 'us-east-2', 'sa-east-1', 'ap-south-1',
  'ap-northeast-1', 'ap-southeast-2',
];

const connectionStrings = [];
// Session mode (port 5432)
for (const r of regions) {
  connectionStrings.push(
    `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@aws-0-${r}.pooler.supabase.com:5432/postgres`
  );
}
// Transaction mode (port 6543)
for (const r of regions) {
  connectionStrings.push(
    `postgresql://postgres.${PROJECT_REF}:${PASSWORD}@aws-0-${r}.pooler.supabase.com:6543/postgres`
  );
}

async function tryConnect(connStr) {
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return client;
}

async function main() {
  let client = null;

  for (const connStr of connectionStrings) {
    const region = connStr.match(/aws-0-([^.]+)/)?.[1] || 'unknown';
    try {
      console.log(`Trying region: ${region}...`);
      client = await tryConnect(connStr);
      console.log(`Connected via ${region}!`);
      break;
    } catch (err) {
      console.log(`  Failed: ${err.message.substring(0, 80)}`);
    }
  }

  if (!client) {
    console.error('Could not connect to any region.');
    process.exit(1);
  }

  try {
    const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema SQL...');
    await client.query(sql);
    console.log('Schema executed successfully!');

    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('\nTables created:');
    result.rows.forEach((r) => console.log('  -', r.table_name));

    const connectors = await client.query(
      'SELECT id, name, category, is_active FROM supported_connectors ORDER BY id;'
    );
    console.log('\nSeeded connectors:');
    connectors.rows.forEach((r) =>
      console.log(`  - ${r.name} (${r.category}) active=${r.is_active}`)
    );
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

main();
