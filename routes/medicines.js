const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// GET all medicines
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
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

// GET single medicine by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
      .eq('id', req.params.id)
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

// POST create new medicine
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .insert([req.body])
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

// PUT update medicine
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .update(req.body)
      .eq('id', req.params.id)
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

// DELETE medicine
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('medicines')
      .delete()
      .eq('id', req.params.id)
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

// SEARCH medicines
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = req.params.term;
    
    const { data, error } = await supabase
      .from('medicines')
      .select('*')
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