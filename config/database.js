const { createClient } = require('@supabase/supabase-js');

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY  // Changed from SUPABASE_KEY to SUPABASE_ANON_KEY
);

// Test connection
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('count');
    
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Database connected successfully!');
    return true;
  } catch (err) {
    console.error('❌ Database connection error:', err.message);
    return false;
  }
}

module.exports = { supabase, testConnection };