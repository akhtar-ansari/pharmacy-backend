const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// GET all stock items
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .select(`
        *,
        medicines (
          name,
          generic_name,
          company,
          barcode
        ),
        suppliers (
          name
        )
      `)
      .order('id', { ascending: false });

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

// GET stock by medicine ID
router.get('/medicine/:medicineId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .select('*')
      .eq('medicine_id', req.params.medicineId);

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

// POST add new stock
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .insert([req.body])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Stock added successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update stock
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE stock
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .delete()
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Stock item not found'
      });
    }

    res.json({
      success: true,
      message: 'Stock deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET expiring stock (next 30 days)
router.get('/expiring/soon', async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    const { data, error } = await supabase
      .from('stock')
      .select(`
        *,
        medicines (
          name,
          generic_name,
          company
        )
      `)
      .gte('quantity', 1)
      .order('expiry_date', { ascending: true });

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