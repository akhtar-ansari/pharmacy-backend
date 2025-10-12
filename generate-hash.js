// Generate correct bcrypt hash for admin123
const bcrypt = require('bcryptjs');

const password = 'admin123';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log('========================================');
  console.log('✅ BCRYPT HASH GENERATED');
  console.log('========================================');
  console.log('Password:', password);
  console.log('Hash:', hash);
  console.log('========================================');
  console.log('\nRun this SQL in Supabase:\n');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = 'admin';`);
  console.log('========================================');
});