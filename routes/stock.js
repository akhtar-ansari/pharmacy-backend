const express = require('express');
const router = express.Router();
const { supabase } = require('../config/database');

// ==========================================
// INVOICE MANAGEMENT APIs
// ==========================================

// CREATE NEW INVOICE WITH MULTIPLE ITEMS
router.post('/invoices', async (req, res) => {
  const { 
    invoice_number, 
    supplier_id, 
    invoice_date, 
    payment_status,
    notes,
    items
  } = req.body;

  try {
    // Calculate total amount
    const invoice_amount = items.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) * parseFloat(item.purchase_price));
    }, 0);

    // Step 1: Create invoice header
    const { data: invoice, error: invoiceError } = await supabase
      .from('stock_invoices')
      .insert({
        invoice_number,
        supplier_id: supplier_id || null,
        invoice_date,
        invoice_amount,
        payment_status: payment_status || 'pending',
        notes: notes || ''
      })
      .select()
      .single();

    if (invoiceError) throw invoiceError;

    // Step 2: Prepare items for insertion
    const itemsWithInvoiceId = items.map(item => ({
      invoice_id: invoice.id,
      medicine_id: item.medicine_id,
      quantity: parseInt(item.quantity),
      batch_number: item.batch_number || '',
      expiry_date: item.expiry_date || null,
      purchase_price: parseFloat(item.purchase_price || 0),
      line_total: parseInt(item.quantity) * parseFloat(item.purchase_price || 0)
    }));

    // Step 3: Insert all invoice items
    const { data: invoiceItems, error: itemsError } = await supabase
      .from('stock_invoice_items')
      .insert(itemsWithInvoiceId)
      .select();

    if (itemsError) throw itemsError;

    // Step 4: Update stock table for each item
    for (const item of itemsWithInvoiceId) {
      const { error: stockError } = await supabase
        .from('stock')
        .insert({
          medicine_id: item.medicine_id,
          quantity: item.quantity,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          purchase_price: item.purchase_price,
          mrp: 0,
          invoice_id: invoice.id
        });

      if (stockError) throw stockError;
    }

    res.json({
      success: true,
      message: `Invoice ${invoice_number} created with ${items.length} items`,
      data: {
        invoice,
        items: invoiceItems
      }
    });

  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET ALL INVOICES
router.get('/invoices', async (req, res) => {
  try {
    const { data: invoices, error } = await supabase
      .from('stock_invoices')
      .select(`
        *,
        suppliers (
          id,
          name,
          company
        )
      `)
      .order('invoice_date', { ascending: false });

    if (error) throw error;

    // Get item count for each invoice
    const invoicesWithCounts = await Promise.all(
      invoices.map(async (invoice) => {
        const { count } = await supabase
          .from('stock_invoice_items')
          .select('*', { count: 'exact', head: true })
          .eq('invoice_id', invoice.id);

        return {
          ...invoice,
          item_count: count || 0
        };
      })
    );

    res.json({
      success: true,
      data: invoicesWithCounts,
      count: invoicesWithCounts.length
    });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET SINGLE INVOICE WITH ITEMS
router.get('/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('stock_invoices')
      .select(`
        *,
        suppliers (
          id,
          name,
          company,
          contact_person,
          phone
        )
      `)
      .eq('id', id)
      .single();

    if (invoiceError) throw invoiceError;

    // Get items
    const { data: items, error: itemsError } = await supabase
      .from('stock_invoice_items')
      .select(`
        *,
        medicines (
          id,
          name,
          generic_name,
          category
        )
      `)
      .eq('invoice_id', id);

    if (itemsError) throw itemsError;

    res.json({
      success: true,
      data: {
        ...invoice,
        items
      }
    });

  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// UPDATE INVOICE
router.put('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const { payment_status, notes } = req.body;

  try {
    const { data, error } = await supabase
      .from('stock_invoices')
      .update({
        payment_status,
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data
    });

  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE INVOICE
router.delete('/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Step 1: Get all items to remove from stock
    const { data: items } = await supabase
      .from('stock_invoice_items')
      .select('*')
      .eq('invoice_id', id);

    // Step 2: Delete stock entries
    const { error: stockError } = await supabase
      .from('stock')
      .delete()
      .eq('invoice_id', id);

    if (stockError) throw stockError;

    // Step 3: Delete invoice (items auto-delete via CASCADE)
    const { error: invoiceError } = await supabase
      .from('stock_invoices')
      .delete()
      .eq('id', id);

    if (invoiceError) throw invoiceError;

    res.json({
      success: true,
      message: 'Invoice and related stock removed successfully'
    });

  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==========================================
// LEGACY APIs (Keep for backward compatibility)
// ==========================================

// Get all stock
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .select(`
        *,
        medicines (
          id,
          name,
          generic_name,
          category
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });

  } catch (error) {
    console.error('Error fetching stock:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add single stock entry (legacy)
router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('stock')
      .insert(req.body)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Stock added successfully',
      data
    });

  } catch (error) {
    console.error('Error adding stock:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update stock
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('stock')
      .update(req.body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data
    });

  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete stock
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('stock')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Stock deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting stock:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;