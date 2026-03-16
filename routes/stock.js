/**
 * ============================================================================
 * STOCK ROUTES - Backend API for Stock & Invoice Management
 * ============================================================================
 * 
 * Handles:
 * - Stock invoice CRUD (with Draft/Approve workflow)
 * - Stock invoice items
 * - Legacy single stock entry APIs
 * 
 * Author: Arwa Enterprises
 * Last Updated: March 2026
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { verifyToken } = require('./auth');

// Apply verifyToken middleware to all routes
router.use(verifyToken);


// ============================================================================
// INVOICE MANAGEMENT APIs
// ============================================================================

/**
 * CREATE NEW INVOICE WITH MULTIPLE ITEMS
 * POST /api/stock/invoices
 * 
 * Body: {
 *   invoice_number, supplier_id, invoice_date, notes, status,
 *   items: [{ medicine_id, quantity, batch_number, expiry_date, 
 *             manufacturing_date, serial_number, purchase_price, gtin, barcode_type }]
 * }
 */
router.post('/invoices', async (req, res) => {
  const { 
    invoice_number, 
    supplier_id, 
    invoice_date,
    notes,
    status,
    items
  } = req.body;

  try {
    // Validate items array
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and must not be empty'
      });
    }

    // Calculate total amount from items
    const total_amount = items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.purchase_price) || 0;
      return sum + (qty * price);
    }, 0);

    // Calculate total items count
    const total_items = items.length;

    // Determine if this is an approval (stock should be updated)
    const isApproved = status === 'approved';

    // Step 1: Create invoice header
    const invoiceInsertData = {
      invoice_number,
      supplier_id: supplier_id || null,
      invoice_date: invoice_date || new Date().toISOString().split('T')[0],
      total_amount,
      total_items,
      status: status || 'draft',
      notes: notes || '',
      client_id: req.clientId
    };

    // Add approval info if approved
    if (isApproved) {
      invoiceInsertData.approved_at = new Date().toISOString();
      invoiceInsertData.approved_by = req.userId || null;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('stock_invoices')
      .insert(invoiceInsertData)
      .select()
      .single();

    if (invoiceError) {
      console.error('Invoice insert error:', invoiceError);
      throw invoiceError;
    }

    // Step 2: Prepare items for insertion
    const itemsToInsert = items.map(item => ({
      invoice_id: invoice.id,
      medicine_id: item.medicine_id,
      quantity: parseInt(item.quantity) || 1,
      batch_number: item.batch_number || '',
      expiry_date: item.expiry_date || null,
      manufacturing_date: item.manufacturing_date || null,
      serial_number: item.serial_number || '',
      purchase_price: parseFloat(item.purchase_price) || 0,
      mrp: parseFloat(item.mrp) || parseFloat(item.purchase_price) || 0,
      gtin: item.gtin || '',
      barcode_type: item.barcode_type || 'manual',
      line_total: (parseInt(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0),
      client_id: req.clientId
    }));

    // Step 3: Insert all invoice items
    const { data: invoiceItems, error: itemsError } = await supabase
      .from('stock_invoice_items')
      .insert(itemsToInsert)
      .select();

    if (itemsError) {
      console.error('Items insert error:', itemsError);
      // Rollback: delete the invoice header
      await supabase.from('stock_invoices').delete().eq('id', invoice.id);
      throw itemsError;
    }

    // Step 4: If APPROVED, update stock table
    if (isApproved) {
      for (const item of itemsToInsert) {
        const { error: stockError } = await supabase
          .from('stock')
          .insert({
            medicine_id: item.medicine_id,
            quantity: item.quantity,
            batch_number: item.batch_number,
            expiry_date: item.expiry_date,
            manufacturing_date: item.manufacturing_date,
            serial_number: item.serial_number,
            purchase_price: item.purchase_price,
            mrp: item.mrp,
            gtin: item.gtin,
            barcode_type: item.barcode_type,
            invoice_id: invoice.id,
            client_id: req.clientId
          });

        if (stockError) {
          console.error('Stock insert error for item:', stockError);
          // Continue with other items, don't fail entire operation
        }
      }
    }

    res.json({
      success: true,
      message: `Invoice ${invoice_number} ${isApproved ? 'approved' : 'saved as draft'} with ${items.length} items`,
      data: {
        ...invoice,
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


/**
 * GET ALL INVOICES
 * GET /api/stock/invoices
 * 
 * Returns all invoices for the client with item counts
 */
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
      .eq('client_id', req.clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: invoices || [],
      count: invoices?.length || 0
    });

  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * GET SINGLE INVOICE WITH ITEMS
 * GET /api/stock/invoices/:id
 * 
 * Returns invoice details with all items
 */
router.get('/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get invoice header
    const { data: invoice, error: invoiceError } = await supabase
      .from('stock_invoices')
      .select(`
        *,
        suppliers (
          id,
          name,
          company,
          contact_person,
          phone,
          gst_number
        )
      `)
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();

    if (invoiceError) throw invoiceError;

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Get items with medicine details
    const { data: items, error: itemsError } = await supabase
      .from('stock_invoice_items')
      .select(`
        *,
        medicines (
          id,
          name,
          generic_name,
          category,
          company
        )
      `)
      .eq('invoice_id', id)
      .eq('client_id', req.clientId)
      .order('created_at', { ascending: false });

    if (itemsError) throw itemsError;

    res.json({
      success: true,
      data: {
        ...invoice,
        items: items || []
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


/**
 * UPDATE INVOICE (Draft to Approved, or update notes/items)
 * PUT /api/stock/invoices/:id
 * 
 * Body: {
 *   notes, status,
 *   items: [...] (optional - for draft updates)
 * }
 */
router.put('/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const { notes, status, items } = req.body;

  try {
    // Get existing invoice
    const { data: existingInvoice, error: fetchError } = await supabase
      .from('stock_invoices')
      .select('*')
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();

    if (fetchError || !existingInvoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Prevent editing approved invoices
    if (existingInvoice.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Cannot edit approved invoice'
      });
    }

    // Prepare update data
    const updateData = {
      notes: notes !== undefined ? notes : existingInvoice.notes,
      updated_at: new Date().toISOString()
    };

    // If status is changing to approved
    const isApproving = status === 'approved' && existingInvoice.status !== 'approved';
    
    if (status) {
      updateData.status = status;
    }

    if (isApproving) {
      updateData.approved_at = new Date().toISOString();
      updateData.approved_by = req.userId || null;
    }

    // If items are provided, update them
    if (items && Array.isArray(items) && items.length > 0) {
      // Delete existing items
      await supabase
        .from('stock_invoice_items')
        .delete()
        .eq('invoice_id', id)
        .eq('client_id', req.clientId);

      // Calculate new totals
      const total_amount = items.reduce((sum, item) => {
        return sum + ((parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0));
      }, 0);

      updateData.total_amount = total_amount;
      updateData.total_items = items.length;

      // Insert new items
      const itemsToInsert = items.map(item => ({
        invoice_id: id,
        medicine_id: item.medicine_id,
        quantity: parseInt(item.quantity) || 1,
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || null,
        manufacturing_date: item.manufacturing_date || null,
        serial_number: item.serial_number || '',
        purchase_price: parseFloat(item.purchase_price) || 0,
        mrp: parseFloat(item.mrp) || parseFloat(item.purchase_price) || 0,
        gtin: item.gtin || '',
        barcode_type: item.barcode_type || 'manual',
        line_total: (parseInt(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0),
        client_id: req.clientId
      }));

      const { error: itemsError } = await supabase
        .from('stock_invoice_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // If approving, add to stock
      if (isApproving) {
        for (const item of itemsToInsert) {
          await supabase
            .from('stock')
            .insert({
              medicine_id: item.medicine_id,
              quantity: item.quantity,
              batch_number: item.batch_number,
              expiry_date: item.expiry_date,
              manufacturing_date: item.manufacturing_date,
              serial_number: item.serial_number,
              purchase_price: item.purchase_price,
              mrp: item.mrp,
              gtin: item.gtin,
              barcode_type: item.barcode_type,
              invoice_id: id,
              client_id: req.clientId
            });
        }
      }
    }

    // Update invoice header
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('stock_invoices')
      .update(updateData)
      .eq('id', id)
      .eq('client_id', req.clientId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: isApproving ? 'Invoice approved successfully' : 'Invoice updated successfully',
      data: updatedInvoice
    });

  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * DELETE INVOICE
 * DELETE /api/stock/invoices/:id
 * 
 * Deletes invoice, items, and related stock entries
 * Only drafts can be deleted
 */
router.delete('/invoices/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Get invoice to check status
    const { data: invoice, error: fetchError } = await supabase
      .from('stock_invoices')
      .select('id, status')
      .eq('id', id)
      .eq('client_id', req.clientId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Prevent deleting approved invoices
    if (invoice.status === 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete approved invoice'
      });
    }

    // Delete stock entries (if any)
    await supabase
      .from('stock')
      .delete()
      .eq('invoice_id', id)
      .eq('client_id', req.clientId);

    // Delete invoice items
    await supabase
      .from('stock_invoice_items')
      .delete()
      .eq('invoice_id', id)
      .eq('client_id', req.clientId);

    // Delete invoice header
    const { error: deleteError } = await supabase
      .from('stock_invoices')
      .delete()
      .eq('id', id)
      .eq('client_id', req.clientId);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Invoice deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// ============================================================================
// LEGACY STOCK APIs (Single item operations)
// ============================================================================

/**
 * GET ALL STOCK
 * GET /api/stock
 */
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
      .eq('client_id', req.clientId)
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


/**
 * ADD SINGLE STOCK ENTRY (Legacy)
 * POST /api/stock
 */
router.post('/', async (req, res) => {
  try {
    const stockData = {
      ...req.body,
      client_id: req.clientId
    };

    const { data, error } = await supabase
      .from('stock')
      .insert(stockData)
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


/**
 * UPDATE STOCK ENTRY
 * PUT /api/stock/:id
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('stock')
      .update(req.body)
      .eq('id', id)
      .eq('client_id', req.clientId)
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


/**
 * DELETE STOCK ENTRY
 * DELETE /api/stock/:id
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('stock')
      .delete()
      .eq('id', id)
      .eq('client_id', req.clientId);

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
