const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/database');

// POST login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Get user from database
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('status', 'active')
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      });
    }

    // Compare password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
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

    // Create JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Don't send password back
    delete user.password;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user,
        token: token
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;

    // Check if username already exists
    const { data: existing } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const { data, error } = await supabase
      .from('users')
      .insert([{
        username,
        password: hashedPassword,
        full_name,
        email,
        phone,
        role: role || 'Cashier',
        status: 'active'
      }])
      .select();

    if (error) throw error;

    // Don't send password back
    delete data[0].password;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET all users
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, email, phone, role, status, created_date, last_login')
      .order('id', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET single user by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name, email, phone, role, status, created_date, last_login')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
  try {
    const updateData = { ...req.body };

    // If password is being updated, hash it
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, username, full_name, email, phone, role, status, created_date, last_login');

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT change password
router.put('/:id/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    // Get user with password
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify old password
    const validPassword = await bcrypt.compare(oldPassword, user.password);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', req.params.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;