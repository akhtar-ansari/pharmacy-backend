const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// GET all payments
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        suppliers (
          name,
          contact_person
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

// GET single payment by ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        suppliers (
          name,
          contact_person,
          phone
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
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

// POST create new payment
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert([req.body])
      .select();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update payment
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .update(req.body)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment updated successfully',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE payment
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .delete()
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET pending payments
router.get('/status/pending', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        suppliers (
          name
        )
      `)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

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

// GET overdue payments
router.get('/status/overdue', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        suppliers (
          name,
          contact_person,
          phone
        )
      `)
      .eq('status', 'pending')
      .lt('due_date', today)
      .order('due_date', { ascending: true });

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

// GET payments by supplier
router.get('/supplier/:supplierId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('supplier_id', req.params.supplierId)
      .order('due_date', { ascending: false });

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