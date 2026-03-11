const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'al_naeima_pharmacy_secret_key_2024_very_secure_random_string';

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, is_active')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'User account is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin only.' });
  }
  next();
};

// ==========================================
// PUBLIC ROUTES (No authentication required)
// ==========================================

// LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'Account is inactive. Contact administrator.' 
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user data without password
    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed' 
    });
  }
});

// ==========================================
// PROTECTED ROUTES (Require authentication)
// ==========================================

// GET CURRENT USER INFO
router.get('/me', verifyToken, async (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// CHANGE PASSWORD (Any authenticated user)
router.post('/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    // Get user's current password hash
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', req.user.id);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to change password' 
    });
  }
});

// ==========================================
// ADMIN ONLY ROUTES
// ==========================================

// GET ALL USERS
router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, is_active, phone, created_at, last_login')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: users,
      count: users.length
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// CREATE NEW USER
router.post('/', async (req, res) => {
  console.log('========================================');
  console.log('📥 CREATE USER REQUEST RECEIVED');
  console.log('📦 Request Body:', req.body);
  console.log('========================================');
  
  const { username, email, password, full_name, role, phone } = req.body;

  console.log('📝 Extracted Fields:');
  console.log('  - username:', username);
  console.log('  - email:', email);
  console.log('  - password:', password ? `${password.substring(0, 3)}***` : 'MISSING!');
  console.log('  - full_name:', full_name);
  console.log('  - role:', role);
  console.log('  - phone:', phone);

  try {
    // Validate required fields
    if (!username || !email || !password || !full_name) {
      console.log('❌ Validation failed - missing required fields');
      return res.status(400).json({ 
        success: false, 
        error: 'Username, email, password, and full name are required' 
      });
    }

    if (password.length < 6) {
      console.log('❌ Validation failed - password too short');
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    console.log('🔐 Hashing password...');
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed:', password_hash.substring(0, 20) + '...');

    const insertData = {
      username,
      email,
      password_hash,
      full_name,
      role: role || 'pharmacist',
      phone,
      is_active: true
    };

    console.log('💾 Inserting into database:', {
      ...insertData,
      password_hash: password_hash.substring(0, 20) + '...'
    });

    // Create user
    const { data, error } = await supabase
      .from('users')
      .insert(insertData)
      .select('id, username, email, full_name, role, is_active, phone, created_at')
      .single();

    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }

    console.log('✅ User created successfully:', data);
    console.log('========================================');

    res.json({
      success: true,
      message: 'User created successfully',
      data
    });

  } catch (error) {
    console.error('❌ Error creating user:', error);
    console.log('========================================');
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create user'
    });
  }
});

// UPDATE USER
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { email, full_name, role, phone, is_active } = req.body;

  try {
    const updateData = {
      email,
      full_name,
      role,
      phone,
      is_active
    };

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, username, email, full_name, role, is_active, phone')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User updated successfully',
      data
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// RESET USER PASSWORD (Admin only)
router.post('/:id/reset-password', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const password_hash = await bcrypt.hash(newPassword, 10);

    await supabase
      .from('users')
      .update({ password_hash })
      .eq('id', id);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// DELETE USER
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Prevent deleting self
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete your own account' 
      });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = { router, verifyToken, isAdmin };
