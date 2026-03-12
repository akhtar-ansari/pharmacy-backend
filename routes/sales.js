const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');
const { verifyToken } = require('./auth');

// Apply verifyToken middleware to all routes
router.use(verifyToken);

// GET all sales (filtered by client_id)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        sale_items (
          *,
          medicines (
            name,
            generic_name
          )
        )
      `)
      .eq('client_id', req.clientId)
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

// GET single sale by ID (filtered by client_id)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        sale_items (
          *,
          medicines (
            name,
            generic_name,
            company
          )
        )
      `)
      .eq('id', req.params.id)
      .eq('client_id', req.clientId)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found'
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

// POST create new sale (with items and client_id)
router.post('/', async (req, res) => {
  try {
    const { items, ...saleData } = req.body;

    // Insert sale with client_id
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert([{ ...saleData, client_id: req.clientId }])
      .select()
      .single();

    if (saleError) throw saleError;

    // Insert sale items with client_id
    if (items && items.length > 0) {
      const saleItems = items.map(item => ({
        ...item,
        sale_id: sale.id,
        client_id: req.clientId
      }));

      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update stock quantities - filtered by client_id
      for (const item of items) {
        // Get the stock item for this client
        const { data: stockItem, error: fetchError } = await supabase
          .from('stock')
          .select('*')
          .eq('medicine_id', item.medicine_id)
          .eq('batch_number', item.batch_number)
          .eq('client_id', req.clientId)
          .single();

        if (fetchError) {
          console.error('Stock fetch error:', fetchError);
          continue;
        }

        if (stockItem) {
          // Update the stock quantity
          const newQuantity = stockItem.quantity - item.quantity;
          
          const { error: updateError } = await supabase
            .from('stock')
            .update({ quantity: newQuantity })
            .eq('id', stockItem.id)
            .eq('client_id', req.clientId);

          if (updateError) {
            console.error('Stock update error:', updateError);
          } else {
            console.log(`✅ Stock updated: ${stockItem.id}, Old: ${stockItem.quantity}, New: ${newQuantity}`);
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Sale completed successfully',
      data: sale
    });
  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET sales by date range (filtered by client_id)
router.get('/date-range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('client_id', req.clientId)
      .gte('sale_date', startDate)
      .lte('sale_date', endDate)
      .order('sale_date', { ascending: false });

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

// GET sales summary/statistics (filtered by client_id)
router.get('/stats/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's sales for this client
    const { data: todaySales, error: todayError } = await supabase
      .from('sales')
      .select('final_amount')
      .eq('client_id', req.clientId)
      .eq('sale_date', today);

    if (todayError) throw todayError;

    const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.final_amount || 0), 0);
    const todayCount = todaySales.length;

    // This month's sales for this client
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const { data: monthSales, error: monthError } = await supabase
      .from('sales')
      .select('final_amount')
      .eq('client_id', req.clientId)
      .gte('sale_date', monthStartStr);

    if (monthError) throw monthError;

    const monthTotal = monthSales.reduce((sum, sale) => sum + parseFloat(sale.final_amount || 0), 0);
    const monthCount = monthSales.length;

    res.json({
      success: true,
      data: {
        today: {
          total: todayTotal,
          count: todayCount
        },
        thisMonth: {
          total: monthTotal,
          count: monthCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
