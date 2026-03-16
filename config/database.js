// Pharmacy PMS - Database Configuration
// NOW POINTING TO ARWA SUPABASE (Single Database)

const { createClient } = require('@supabase/supabase-js');

// ARWA SUPABASE CREDENTIALS (same as Attendance)
const SUPABASE_URL = 'https://kyktwzwiraipwyglkhva.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5a3R3endpcmFpcHd5Z2xraHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTA2MTcsImV4cCI6MjA4NzU4NjYxN30.acOQWJkfE6Ew9PVyEKNeGxs7ri7QH_AarpPcoT34RBY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = supabase;
