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
      .select('id, username, email, full_name, role, is_active, client_id')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    if (!user.is_active) {
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
  if (req.user.role !== 'admin') {
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

  try {
    // Step 1: Find client by code
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, business_name, logo_url, subscription_status, subscription_tier, subscription_end_date, is_active')
      .eq('client_code', clientCode?.toUpperCase().trim())
      .single();

    if (clientError || !client) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid client code' 
      });
    }

    if (!client.is_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'This account has been deactivated. Contact Arwa Enterprises: +91 7021229209' 
      });
    }

    // Step 2: Check subscription status
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

    // Step 3: Find user belonging to this client
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username?.toLowerCase().trim())
      .eq('client_id', client.id)
      .single();

    if (userError || !user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ 
        success: false, 
        error: 'Account is inactive. Contact administrator.' 
      });
    }

    // Step 4: Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }

    // Step 5: Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    // Step 6: Generate JWT token with client info
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

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userData,
      client: {
        id: client.id,
        code: clientCode.toUpperCase().trim(),
        name: client.business_name,
        logo: client.logo_url,
        tier: client.subscription_tier,
        status: client.subscription_status
      }
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

// GET ALL USERS (filtered by client_id)
router.get('/', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, full_name, role, is_active, phone, created_at, last_login')
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
  const { username, email, password, full_name, role, phone } = req.body;

  try {
    if (!username || !email || !password || !full_name) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username, email, password, and full name are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const insertData = {
      username: username.toLowerCase().trim(),
      email,
      password_hash,
      full_name,
      role: role || 'pharmacist',
      phone,
      is_active: true,
      client_id: req.clientId
    };

    const { data, error } = await supabase
      .from('users')
      .insert(insertData)
      .select('id, username, email, full_name, role, is_active, phone, created_at')
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
      .eq('client_id', req.clientId)
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
