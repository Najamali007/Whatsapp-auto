import db from './backend/db.js';

async function test() {
  try {
    console.log('Testing db.prepare...');
    const result = db.prepare('SELECT 1 as test').get();
    console.log('Result:', await result);
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
