const pool = require('./db');

async function test() {
  try {
    const result = await pool.query('SELECT * FROM users');
    console.log(result.rows);
  } catch (err) {
    console.error(err);
  }
}

test();