// Shared PostgreSQL connection pool helper (Checklist #20 - parameterized queries)
const { Pool } = require('pg');

const pools = {};

function getPool(dbName) {
  if (!pools[dbName]) {
    pools[dbName] = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432', 10),
      user: process.env.PG_USER || 'sweetscoop',
      password: process.env.PG_PASSWORD || 'sweetscoop',
      database: dbName,
      max: 10,
      idleTimeoutMillis: 30000
    });
  }
  return pools[dbName];
}

// Parameterized query helper
async function query(dbName, text, params = []) {
  const pool = getPool(dbName);
  return pool.query(text, params);
}

module.exports = { getPool, query };
