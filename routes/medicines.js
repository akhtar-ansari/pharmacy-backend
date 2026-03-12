const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { verifyToken } = require('./auth');

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// GET all medicines (filtered by client_id)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .eq('client_id', req.clientId)
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

// GET single medicine by ID (filtered by client_id)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Medicine not found'
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

// POST create new medicine (with client_id)
router.post('/', async (req, res) => {
  try {
    const medicineData = {
      ...req.body,
      client_id: req.clientId
    };

    const { data, error } = await supabase
      .from('medicines')
      .insert([medicineData])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Medicine added successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update medicine (filtered by client_id)
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Medicine not found'
      });
    }

    res.json({
      success: true,
      message: 'Medicine updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE medicine (filtered by client_id)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .delete()
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Medicine not found'
      });
    }

    res.json({
      success: true,
      message: 'Medicine deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// SEARCH medicines (filtered by client_id)
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;
    
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .eq('client_id', req.clientId)
      .or(`name.ilike.%${searchTerm}%,generic_name.ilike.%${searchTerm}%,company.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`);

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
