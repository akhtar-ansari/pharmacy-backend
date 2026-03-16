const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const supabase = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'arwa_pharmacy_secret_key_2026';

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
    
    // Get user from database (using Attendance table structure)
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, name, role, status, client_id')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'User account is inactive' });
    }

    req.user = user;
    req.clientId = decoded.clientId || user.client_id;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

// Check if user is admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Access denied. Admin only.' });
  }
  next();
};

// ==========================================
// PUBLIC ROUTES (No authentication required)
// ==========================================

// LOGIN WITH CLIENT CODE
router.post('/login', async (req, res) => {
  const { clientCode, username, password } = req.body;

  console.log('Login attempt:', { clientCode, username });

  try {
    // Step 1: Find client by code
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, business_name, logo_url, subscription_status, pharmacy_tier, subscription_end_date, is_active, subscribed_apps')
      .eq('client_code', clientCode?.toUpperCase().trim())
      .single();

    if (clientError || !client) {
      console.log('Client not found:', clientCode);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid client code' 
      });
    }

    console.log('Client found:', client.business_name);

    if (!client.is_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'This account has been deactivated. Contact Arwa Enterprises: +91 7021229209' 
      });
    }

    // Step 2: Check if client has pharmacy app access
    let apps = [];
    if (client.subscribed_apps) {
      if (typeof client.subscribed_apps === 'string') {
        try {
          apps = JSON.parse(client.subscribed_apps);
        } catch (e) {
          apps = [];
        }
      } else if (Array.isArray(client.subscribed_apps)) {
        apps = client.subscribed_apps;
      }
    }

    if (!apps.includes('pharmacy')) {
      return res.status(403).json({ 
        success: false, 
        error: 'Pharmacy app not enabled for this account. Contact Arwa Enterprises.' 
      });
    }

    // Step 3: Check subscription status
    if (client.subscription_status === 'expired') {
      return res.status(403).json({ 
        success: false, 
        error: 'Subscription expired. Contact Arwa Enterprises: +91 7021229209' 
      });
    }

    if (client.subscription_end_date) {
      const endDate = new Date(client.subscription_end_date);
      if (new Date() > endDate) {
        return res.status(403).json({ 
          success: false, 
          error: 'Subscription expired. Contact Arwa Enterprises: +91 7021229209' 
        });
      }
    }

    // Step 4: Find user belonging to this client
    // Using Attendance table structure: username, password_hash (plain), name, role, status
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username?.toLowerCase().trim())
      .eq('client_id', client.id)
      .single();

    if (userError || !user) {
      console.log('User not found:', username, 'for client:', client.id);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    console.log('User found:', user.username);

    if (user.status !== 'active') {
      return res.status(403).json({ 
        success: false, 
        error: 'Account is inactive. Contact administrator.' 
      });
    }

    // Step 5: Verify password (PLAIN TEXT comparison - Attendance style)
    // password_hash in Attendance table stores plain text password
    if (user.password_hash !== password) {
      console.log('Password mismatch');
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    console.log('Password verified');

    // Step 6: Update last login (if column exists)
    try {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', user.id);
    } catch (e) {
      // Ignore if last_login column doesn't exist
    }

    // Step 7: Generate JWT token with client info
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role,
        clientId: client.id,
        clientCode: clientCode.toUpperCase().trim()
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user and client data
    const { password_hash, ...userData } = user;

    console.log('Login successful for:', user.username);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: userData.id,
        username: userData.username,
        name: userData.name,
        role: userData.role,
        status: userData.status
      },
      client: {
        id: client.id,
        code: clientCode.toUpperCase().trim(),
        name: client.business_name,
        logo: client.logo_url,
        tier: client.pharmacy_tier || 'basic',
        status: client.subscription_status
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed: ' + error.message 
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
    // Get user's current password
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    // Verify current password (plain text comparison)
    if (user.password_hash !== currentPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // Update password (store as plain text - same as Attendance)
    await supabase
      .from('users')
      .update({ password_hash: newPassword })
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

// GET ALL USERS (filtered by client_id)
router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, name, role, status, created_at')
      .eq('client_id', req.clientId)
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

// CREATE NEW USER (with client_id)
router.post('/', verifyToken, isAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;

  try {
    if (!username || !password || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, password, and name are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    const insertData = {
      username: username.toLowerCase().trim(),
      password_hash: password,  // Plain text - same as Attendance
      name,
      role: role || 'pharmacist',
      status: 'active',
      client_id: req.clientId
    };

    const { data, error } = await supabase
      .from('users')
      .insert(insertData)
      .select('id, username, name, role, status, created_at')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User created successfully',
      data
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create user'
    });
  }
});

// UPDATE USER
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, role, status } = req.body;

  try {
    const updateData = {
      name,
      role,
      status
    };

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .eq('client_id', req.clientId)
      .select('id, username, name, role, status')
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
    await supabase
      .from('users')
      .update({ password_hash: newPassword })  // Plain text
      .eq('id', id)
      .eq('client_id', req.clientId);

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
    if (id === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete your own account' 
      });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)
      .eq('client_id', req.clientId);

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
