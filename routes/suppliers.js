const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { verifyToken } = require('./auth');

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// GET all suppliers (filtered by client_id)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('client_id', req.clientId)
      .order('name', { ascending: true });

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

// GET single supplier by ID (filtered by client_id)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
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

// POST create new supplier (with client_id)
router.post('/', async (req, res) => {
  try {
    const supplierData = {
      ...req.body,
      client_id: req.clientId
    };

    const { data, error } = await supabase
      .from('suppliers')
      .insert([supplierData])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Supplier added successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update supplier (filtered by client_id)
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      message: 'Supplier updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE supplier (filtered by client_id)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      });
    }

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET active suppliers only (filtered by client_id)
router.get('/status/active', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('client_id', req.clientId)
      .eq('status', 'active')
      .order('name', { ascending: true });

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

// SEARCH suppliers (filtered by client_id)
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;
    
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('client_id', req.clientId)
      .or(`name.ilike.%${searchTerm}%,contact_person.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%`);

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

module.exports = router;
