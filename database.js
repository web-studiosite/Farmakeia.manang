/**
 * FARMAKEIA — Centralized Data Access Layer (DAL)
 * Provides clean, robust, typed interactions with Supabase Database and RPCs.
 */

import { getSupabase } from './supabase.js';
import { state } from './state.js';
import { audit } from './audit.js';
import { mockDb } from './mock_db.js';

const rawDb = {
  /**
   * Helper to ensure client is ready and get active store ID
   */
  async getClient() {
    const supabase = await getSupabase();
    if (!supabase) {
      throw new Error('Supabase não configurado ou indisponível.');
    }
    return supabase;
  },

  getStoreId() {
    return state.activeStore?.id || null;
  },

  // -------------------------------------------------------------------
  // STORES & SETTINGS
  // -------------------------------------------------------------------
  async getStores() {
    const supabase = await this.getClient();
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async createStore(storeData) {
    const supabase = await this.getClient();
    const { data, error } = await supabase
      .from('stores')
      .insert(storeData)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateStore(storeId, updateData) {
    const supabase = await this.getClient();
    const { data, error } = await supabase
      .from('stores')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', storeId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // PRODUCTS & PACKAGES
  // -------------------------------------------------------------------
  async getProducts({ search = '', category = '', activeOnly = true, limit = 100 } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    let query = supabase
      .from('products')
      .select('*, product_units:base_unit_id(id, name, symbol), product_packages(*, product_units:unit_id(name, symbol)), batches(id, batch_number, expiry_date, current_quantity_base, status)')
      .eq('store_id', storeId);

    if (activeOnly) {
      query = query.eq('active', true);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},code.ilike.${term},barcode.ilike.${term},generic_name.ilike.${term}`);
    }

    query = query.order('name', { ascending: true }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    try {
      const catMap = JSON.parse(localStorage.getItem('farmakeia_prod_cats') || '{}');
      if (data && catMap) {
        data.forEach(p => {
          if (!p.category && catMap[p.id]) {
            p.category = catMap[p.id];
          }
        });
      }
    } catch (e) {}
    return data || [];
  },

  /**
   * Retrieves top-selling products by quantity and revenue,
   * falling back to available stocked products if no sales yet.
   */
  async getTopSellingProducts({ limit = 12 } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    try {
      const { data: saleItems, error } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          quantity_sold,
          quantity_base,
          total_price,
          total_cogs,
          products (
            id, name, generic_name, dosage, presentation, barcode, code,
            sale_price_base, cost_price_base, current_stock_base, min_stock_base,
            product_units:base_unit_id (id, name, symbol),
            product_packages (*, product_units:unit_id(name, symbol)),
            batches (id, batch_number, expiry_date, current_quantity_base, status)
          )
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error || !saleItems || saleItems.length === 0) {
        // Fallback: return catalogue products
        return await this.getProducts({ limit });
      }

      // Aggregate sales by product
      const aggMap = new Map();
      for (const item of saleItems) {
        if (!item.products) continue;
        const pid = item.product_id;
        if (!aggMap.has(pid)) {
          aggMap.set(pid, {
            ...item.products,
            total_sold_qty: 0,
            total_revenue: 0,
            total_cogs: 0,
            gross_profit: 0
          });
        }
        const record = aggMap.get(pid);
        record.total_sold_qty += Number(item.quantity_base) || 0;
        record.total_revenue += Number(item.total_price) || 0;
        record.total_cogs += Number(item.total_cogs) || 0;
        record.gross_profit = record.total_revenue - record.total_cogs;
      }

      const topList = Array.from(aggMap.values())
        .sort((a, b) => b.total_sold_qty - a.total_sold_qty);

      // If we have fewer items than limit, append remaining stocked products
      if (topList.length < limit) {
        const remaining = await this.getProducts({ limit });
        const existingIds = new Set(topList.map(t => t.id));
        for (const rem of remaining) {
          if (!existingIds.has(rem.id)) {
            topList.push({
              ...rem,
              total_sold_qty: 0,
              total_revenue: 0,
              total_cogs: 0,
              gross_profit: 0
            });
            existingIds.add(rem.id);
            if (topList.length >= limit) break;
          }
        }
      }

      return topList.slice(0, limit);
    } catch (e) {
      console.warn('Fallback getting top products:', e);
      return await this.getProducts({ limit });
    }
  },

  async getProductById(productId) {
    const supabase = await this.getClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, product_units:base_unit_id(id, name, symbol), product_packages(*, product_units:unit_id(name, symbol)), batches(*)')
      .eq('id', productId)
      .single();
    if (error) throw error;
    return data;
  },

  async createProduct(productData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) throw new Error('Nenhuma farmácia selecionada.');

    // Defensive formatting: ensure base_unit_id is a valid UUID or omitted
    const cleaned = { ...productData, store_id: storeId };
    if (!cleaned.base_unit_id) delete cleaned.base_unit_id;
    if (!cleaned.code) cleaned.code = 'PRD-' + Date.now().toString().slice(-6);
    if (!cleaned.name || !cleaned.name.trim()) throw new Error('Nome do produto é obrigatório.');

    let res = await supabase
      .from('products')
      .insert(cleaned)
      .select()
      .single();

    // If 'category' column does not exist on remote table, retry without it
    if (res.error && (res.error.message?.includes('category') || res.error.code === '42703')) {
      const categoryVal = cleaned.category;
      delete cleaned.category;
      res = await supabase
        .from('products')
        .insert(cleaned)
        .select()
        .single();

      if (res.data && categoryVal) {
        try {
          const catMap = JSON.parse(localStorage.getItem('farmakeia_prod_cats') || '{}');
          catMap[res.data.id] = categoryVal;
          localStorage.setItem('farmakeia_prod_cats', JSON.stringify(catMap));
        } catch (e) {}
        res.data.category = categoryVal;
      }
    }

    if (res.error) throw res.error;
    const data = res.data;
    audit.log('CREATE', 'products', data.id, `Cadastrou produto: ${data.name} (Cat: ${data.category || 'Geral'})`);
    return data;
  },

  async updateProduct(productId, productData) {
    const supabase = await this.getClient();
    const cleaned = { ...productData, updated_at: new Date().toISOString() };
    if (!cleaned.base_unit_id) delete cleaned.base_unit_id;

    let res = await supabase
      .from('products')
      .update(cleaned)
      .eq('id', productId)
      .select()
      .single();

    if (res.error && (res.error.message?.includes('category') || res.error.code === '42703')) {
      const categoryVal = cleaned.category;
      delete cleaned.category;
      res = await supabase
        .from('products')
        .update(cleaned)
        .eq('id', productId)
        .select()
        .single();

      if (res.data && categoryVal) {
        try {
          const catMap = JSON.parse(localStorage.getItem('farmakeia_prod_cats') || '{}');
          catMap[productId] = categoryVal;
          localStorage.setItem('farmakeia_prod_cats', JSON.stringify(catMap));
        } catch (e) {}
        res.data.category = categoryVal;
      }
    }

    if (res.error) throw res.error;
    const data = res.data;
    audit.log('UPDATE', 'products', productId, `Atualizou produto: ${data?.name || productId}`);
    return data;
  },

  // -------------------------------------------------------------------
  // CATEGORIES MANAGEMENT
  // -------------------------------------------------------------------
  getDefaultCategories() {
    return [
      'Analgésicos & Antipiréticos',
      'Antibióticos & Antimicrobianos',
      'Anti-inflamatórios',
      'Cardiovasculares & Hipertensão',
      'Dermatológicos & Cosméticos',
      'Gastrointestinais',
      'Higiene & Cuidados Pessoais',
      'Material Hospitalar & Primeiros Socorros',
      'Medicamentos Gerais',
      'Oftalmológicos & Otológicos',
      'Pediatria & Saúde Infantil',
      'Respiratórios & Antigripais',
      'Saúde da Mulher',
      'Vitaminas & Suplementos',
      'Outros / Gerais'
    ];
  },

  async getCategories() {
    const storeId = this.getStoreId() || 'global';
    const storageKey = `farmakeia_categories_${storeId}`;
    let custom = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) custom = JSON.parse(raw);
    } catch (e) {
      console.warn('Error reading stored categories:', e);
    }

    // Collect categories from database products
    let dbCategories = [];
    try {
      const supabase = await this.getClient();
      if (storeId && storeId !== 'global') {
        const { data } = await supabase
          .from('products')
          .select('category')
          .eq('store_id', storeId)
          .not('category', 'is', null);
        if (data) {
          dbCategories = data.map(p => p.category?.trim()).filter(Boolean);
        }
      }
    } catch (e) {
      // ignore
    }

    const set = new Set([
      ...this.getDefaultCategories(),
      ...custom,
      ...dbCategories
    ]);

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }));
  },

  async createCategory(categoryName) {
    const trimmed = (categoryName || '').trim();
    if (!trimmed) throw new Error('Nome da categoria é obrigatório.');

    const storeId = this.getStoreId() || 'global';
    const storageKey = `farmakeia_categories_${storeId}`;
    let custom = [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) custom = JSON.parse(raw);
    } catch (e) {
      custom = [];
    }

    if (!custom.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      custom.push(trimmed);
      try {
        localStorage.setItem(storageKey, JSON.stringify(custom));
      } catch (e) {}
    }

    audit.log('CREATE', 'categories', null, `Cadastrada nova categoria: "${trimmed}"`);

    return await this.getCategories();
  },

  // -------------------------------------------------------------------
  // PRODUCT UNITS
  // -------------------------------------------------------------------
  async getProductUnits() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase
      .from('product_units')
      .select('*')
      .or(`store_id.eq.${storeId},is_system.eq.true`)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async createProductUnit(unitData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase
      .from('product_units')
      .insert({ ...unitData, store_id: storeId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // PACKAGES & CONVERSIONS
  // -------------------------------------------------------------------
  async createProductPackage(packageData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase
      .from('product_packages')
      .insert({ ...packageData, store_id: storeId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteProductPackage(packageId) {
    const supabase = await this.getClient();
    const { error } = await supabase
      .from('product_packages')
      .delete()
      .eq('id', packageId);
    if (error) throw error;
  },

  // -------------------------------------------------------------------
  // SUPPLIERS
  // -------------------------------------------------------------------
  async getSuppliers() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return data || [];
  },

  async createSupplier(supplierData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ ...supplierData, store_id: storeId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // BATCHES & FEFO
  // -------------------------------------------------------------------
  async getBatches({ productId = null, status = 'ACTIVE' } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    let query = supabase
      .from('batches')
      .select('*, products(name, code, barcode, base_unit_id, product_units:base_unit_id(name, symbol)), suppliers(name)')
      .eq('store_id', storeId);

    if (productId) {
      query = query.eq('product_id', productId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('expiry_date', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // -------------------------------------------------------------------
  // PURCHASES / WAREHOUSE ENTRIES (RPC)
  // -------------------------------------------------------------------
  async registerPurchaseEntry({ supplierId, invoiceNumber, purchaseDate, notes, items }) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) throw new Error('Nenhuma farmácia selecionada.');

    try {
      const { data, error } = await supabase.rpc('register_purchase_entry', {
        p_store_id: storeId,
        p_supplier_id: supplierId || null,
        p_invoice_number: invoiceNumber || 'S/N',
        p_purchase_date: purchaseDate || new Date().toISOString().split('T')[0],
        p_notes: notes || '',
        p_items: items
      });

      if (error) throw error;
      audit.log('PURCHASE_ENTRY', 'purchases', data?.id, `Entrada de armazém NF: ${invoiceNumber || 'S/N'} (${items?.length || 0} produtos)`);
      return data;
    } catch (rpcErr) {
      console.warn('RPC register_purchase_entry failed, executing direct purchase entry fallback:', rpcErr);
      return await this.directRegisterPurchaseEntry({
        supplierId,
        invoiceNumber,
        purchaseDate,
        notes,
        items
      });
    }
  },

  async directRegisterPurchaseEntry({ supplierId, invoiceNumber, purchaseDate, notes, items }) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const user = state.user;

    let totalAmount = 0;
    for (const item of items) {
      const q = Number(item.quantity) || 0;
      const c = Number(item.unit_cost) || 0;
      totalAmount += q * c;
    }
    totalAmount = Math.round(totalAmount * 100) / 100;

    // 1. Insert Purchase
    const { data: purchase, error: pErr } = await supabase
      .from('purchases')
      .insert({
        store_id: storeId,
        supplier_id: supplierId || null,
        invoice_number: invoiceNumber || 'S/N',
        purchase_date: purchaseDate || new Date().toISOString().split('T')[0],
        total_amount: totalAmount,
        notes: notes || '',
        status: 'RECEIVED',
        created_by: user?.id || null
      })
      .select()
      .single();

    if (pErr) throw pErr;

    // 2. Process each item
    for (const item of items) {
      const mult = Number(item.multiplier_to_base) || 1;
      const qtyBought = Number(item.quantity) || 0;
      const qtyBase = qtyBought * mult;
      const unitCost = Number(item.unit_cost) || 0;
      const costPerBase = mult > 0 ? (unitCost / mult) : unitCost;
      const itemTotal = Math.round((qtyBought * unitCost) * 100) / 100;

      // Upsert batch
      const batchNum = (item.batch_number || '').trim() || `LOT-${new Date().getFullYear()}`;
      const expDate = item.expiry_date || new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0];

      // Check if batch already exists for this product in this store
      const { data: existingBatch } = await supabase
        .from('batches')
        .select('*')
        .eq('store_id', storeId)
        .eq('product_id', item.product_id)
        .eq('batch_number', batchNum)
        .single();

      let batchId = null;
      if (existingBatch) {
        batchId = existingBatch.id;
        await supabase
          .from('batches')
          .update({
            current_quantity_base: Number(existingBatch.current_quantity_base || 0) + qtyBase,
            cost_per_base: costPerBase > 0 ? costPerBase : existingBatch.cost_per_base,
            expiry_date: expDate || existingBatch.expiry_date,
            status: 'ACTIVE'
          })
          .eq('id', batchId);
      } else {
        const { data: newBatch } = await supabase
          .from('batches')
          .insert({
            store_id: storeId,
            product_id: item.product_id,
            batch_number: batchNum,
            initial_quantity_base: qtyBase,
            current_quantity_base: qtyBase,
            cost_per_base: costPerBase,
            expiry_date: expDate,
            status: 'ACTIVE'
          })
          .select()
          .single();
        batchId = newBatch?.id || null;
      }

      // Insert purchase_item
      await supabase
        .from('purchase_items')
        .insert({
          purchase_id: purchase.id,
          store_id: storeId,
          product_id: item.product_id,
          batch_id: batchId,
          package_id: item.package_id || null,
          unit_id: item.unit_id || null,
          quantity_bought: qtyBought,
          multiplier_to_base: mult,
          quantity_base: qtyBase,
          unit_cost: unitCost,
          total_cost: itemTotal
        });

      // Update product current stock and prices
      const { data: prod } = await supabase
        .from('products')
        .select('current_stock_base, cost_price_base, sale_price_base')
        .eq('id', item.product_id)
        .single();

      if (prod) {
        const newStock = (Number(prod.current_stock_base) || 0) + qtyBase;
        const prodUpdate = {
          current_stock_base: newStock,
          updated_at: new Date().toISOString()
        };
        if (costPerBase > 0) prodUpdate.cost_price_base = costPerBase;
        if (Number(item.sale_price_base) > 0) prodUpdate.sale_price_base = Number(item.sale_price_base);

        await supabase
          .from('products')
          .update(prodUpdate)
          .eq('id', item.product_id);
      }

      // Insert stock movement
      await supabase
        .from('stock_movements')
        .insert({
          store_id: storeId,
          product_id: item.product_id,
          batch_id: batchId,
          movement_type: 'PURCHASE',
          quantity_base: qtyBase,
          unit_cost: costPerBase,
          reference_id: purchase.id,
          reference_type: 'PURCHASE',
          reason: `Entrada de armazém NF: ${invoiceNumber || 'S/N'}`,
          created_by: user?.id || null
        });
    }

    audit.log('PURCHASE_ENTRY', 'purchases', purchase.id, `Entrada de armazém NF: ${invoiceNumber || 'S/N'} (${items?.length || 0} produtos)`);
    return { id: purchase.id, total_amount: totalAmount };
  },

  async getPurchasesHistory() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('purchases')
      .select('*, suppliers(name), profiles:created_by(full_name), purchase_items(*, products(name))')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // -------------------------------------------------------------------
  // POS ATOMIC SALES & DIRECT RESILIENT ENGINE (High Performance)
  // -------------------------------------------------------------------
  async processAtomicSale({ sessionId, customerName, customerTaxId, paymentMethod, discountAmount, items }) {
    // Ultra-fast direct sale execution ensuring QUANTITY is the only requirement
    return await this.processDirectSale({
      sessionId,
      customerName,
      customerTaxId,
      paymentMethod,
      discountAmount,
      items
    });
  },

  /**
   * Direct resilient sale processor ensuring QUANTITY is the only condition for sale.
   * Highly optimized: parallel batch queries, in-memory validation, and zero lag.
   */
  async processDirectSale({ sessionId, customerName, customerTaxId, paymentMethod, discountAmount, items }) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) throw new Error('Nenhuma farmácia selecionada.');
    const user = state.user;

    const productIds = items.map(i => i.product_id);

    // 1. Fetch products and all active batches in parallel in a single round-trip
    const [prodsRes, batchesRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, current_stock_base, cost_price_base, base_unit_id, category, dosage, presentation, product_units:base_unit_id(symbol)')
        .in('id', productIds)
        .eq('store_id', storeId),
      supabase
        .from('batches')
        .select('*')
        .in('product_id', productIds)
        .eq('store_id', storeId)
        .gt('current_quantity_base', 0)
        .order('expiry_date', { ascending: true })
        .order('created_at', { ascending: true })
    ]);

    if (prodsRes.error) throw prodsRes.error;
    const prodsMap = new Map((prodsRes.data || []).map(p => [p.id, p]));

    const batchesByProd = new Map();
    for (const b of (batchesRes.data || [])) {
      if (!batchesByProd.has(b.product_id)) batchesByProd.set(b.product_id, []);
      batchesByProd.get(b.product_id).push(b);
    }

    // 2. Validate in-memory that QUANTITY is sufficient
    let totalGross = 0;
    const validatedItems = [];

    for (const item of items) {
      const prod = prodsMap.get(item.product_id);
      if (!prod) {
        throw new Error('Produto não encontrado na farmácia.');
      }

      const mult = Number(item.multiplier_to_base) || 1;
      const qtyNeeded = (Number(item.quantity) || 0) * mult;
      const currentStock = Number(prod.current_stock_base) || 0;

      // QUANTITY IS THE ONLY CONDITION FOR SALE!
      if (currentStock < qtyNeeded) {
        throw new Error(`Estoque insuficiente para "${prod.name}". Disponível: ${currentStock}, Solicitado: ${qtyNeeded}`);
      }

      const itemTotal = Math.round(((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)) * 100) / 100;
      totalGross += itemTotal;

      validatedItems.push({
        ...item,
        multiplier_to_base: mult,
        qty_needed: qtyNeeded,
        prod
      });
    }

    totalGross = Math.round(totalGross * 100) / 100;
    const totalNet = Math.max(0, totalGross - (Number(discountAmount) || 0));
    const receiptNumber = `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Map payment method safely to Postgres payment_method_type enum
    const originalPaymentMethod = String(paymentMethod || 'CASH').toUpperCase();
    let dbPaymentMethod = 'CASH';
    if (['CASH', 'CARD_CREDIT', 'CARD_DEBIT', 'PIX', 'TRANSFER', 'OTHER'].includes(originalPaymentMethod)) {
      dbPaymentMethod = originalPaymentMethod;
    } else if (originalPaymentMethod === 'CARD_POS' || originalPaymentMethod === 'CARD') {
      dbPaymentMethod = 'CARD_DEBIT';
    } else if (['MPESA', 'EMOLA', 'M-PESA', 'E-MOLA'].includes(originalPaymentMethod)) {
      dbPaymentMethod = 'TRANSFER';
    } else {
      dbPaymentMethod = 'OTHER';
    }

    // 3. Insert Sale Record
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({
        store_id: storeId,
        session_id: sessionId || null,
        receipt_number: receiptNumber,
        customer_name: customerName || 'Consumidor Final',
        customer_tax_id: customerTaxId || null,
        total_gross: totalGross,
        discount_amount: Number(discountAmount) || 0,
        total_net: totalNet,
        total_cogs: 0,
        gross_profit: 0,
        payment_method: dbPaymentMethod,
        status: 'COMPLETED',
        created_by: user?.id || null
      })
      .select()
      .single();

    if (saleErr) throw saleErr;

    // 4. In-memory FEFO batch allocation and operations preparation
    let totalSaleCogs = 0;
    const saleItemsToInsert = [];
    const stockMovementsToInsert = [];
    const batchUpdates = [];
    const productStockUpdates = [];
    const receiptItemsFormatted = [];

    for (const vItem of validatedItems) {
      let remainingToConsume = vItem.qty_needed;
      const prod = vItem.prod;
      const unitPrice = Number(vItem.unit_price) || 0;
      const multiplier = vItem.multiplier_to_base;
      const availableBatches = batchesByProd.get(vItem.product_id) || [];

      let itemBatchNumber = null;
      let itemExpiry = null;

      for (const b of availableBatches) {
        if (remainingToConsume <= 0) break;
        const fromBatch = Math.min(Number(b.current_quantity_base), remainingToConsume);
        const newQty = Number(b.current_quantity_base) - fromBatch;
        b.current_quantity_base = newQty;
        const costPerBase = Number(b.cost_per_base) || Number(prod.cost_price_base) || 0;
        const batchCogs = fromBatch * costPerBase;
        totalSaleCogs += batchCogs;

        batchUpdates.push({
          id: b.id,
          current_quantity_base: newQty,
          status: newQty <= 0 ? 'EXHAUSTED' : b.status
        });

        const qtySold = fromBatch / multiplier;
        const itemTotal = Math.round((qtySold * unitPrice) * 100) / 100;
        itemBatchNumber = b.batch_number;
        itemExpiry = b.expiry_date;

        saleItemsToInsert.push({
          sale_id: sale.id,
          store_id: storeId,
          product_id: vItem.product_id,
          batch_id: b.id,
          package_id: vItem.package_id || null,
          unit_id: vItem.unit_id || prod.base_unit_id || null,
          quantity_sold: qtySold,
          multiplier_to_base: multiplier,
          quantity_base: fromBatch,
          unit_price: unitPrice,
          total_price: itemTotal,
          unit_cogs: costPerBase,
          total_cogs: batchCogs
        });

        stockMovementsToInsert.push({
          store_id: storeId,
          product_id: vItem.product_id,
          batch_id: b.id,
          movement_type: 'SALE',
          quantity_base: -fromBatch,
          unit_cost: costPerBase,
          reference_id: sale.id,
          reference_type: 'SALE',
          reason: `Venda PDV Recibo: ${receiptNumber}`,
          created_by: user?.id || null
        });

        remainingToConsume -= fromBatch;
      }

      // If still remaining (product had stock without registered batches)
      if (remainingToConsume > 0) {
        const costPerBase = Number(prod.cost_price_base) || 0;
        const batchCogs = remainingToConsume * costPerBase;
        totalSaleCogs += batchCogs;
        const qtySold = remainingToConsume / multiplier;
        const itemTotal = Math.round((qtySold * unitPrice) * 100) / 100;

        saleItemsToInsert.push({
          sale_id: sale.id,
          store_id: storeId,
          product_id: vItem.product_id,
          batch_id: null,
          package_id: vItem.package_id || null,
          unit_id: vItem.unit_id || prod.base_unit_id || null,
          quantity_sold: qtySold,
          multiplier_to_base: multiplier,
          quantity_base: remainingToConsume,
          unit_price: unitPrice,
          total_price: itemTotal,
          unit_cogs: costPerBase,
          total_cogs: batchCogs
        });

        stockMovementsToInsert.push({
          store_id: storeId,
          product_id: vItem.product_id,
          batch_id: null,
          movement_type: 'SALE',
          quantity_base: -remainingToConsume,
          unit_cost: costPerBase,
          reference_id: sale.id,
          reference_type: 'SALE',
          reason: `Venda PDV (Estoque Geral) Recibo: ${receiptNumber}`,
          created_by: user?.id || null
        });
      }

      // Track updated product stock
      const newStock = Math.max(0, (Number(prod.current_stock_base) || 0) - vItem.qty_needed);
      productStockUpdates.push({ id: vItem.product_id, current_stock_base: newStock });

      receiptItemsFormatted.push({
        product_name: prod.name,
        products: {
          name: prod.name,
          dosage: prod.dosage,
          presentation: prod.presentation,
          category: prod.category
        },
        product_units: { symbol: prod.product_units?.symbol || 'un' },
        quantity_sold: (Number(vItem.quantity) || 1),
        unit_price: unitPrice,
        total_price: Math.round(((Number(vItem.quantity) || 1) * unitPrice) * 100) / 100,
        batches: { batch_number: itemBatchNumber || 'GERAL', expiry_date: itemExpiry || '' }
      });
    }

    // 5. Execute parallel batched database writes
    const writeOps = [];

    // Batch insert all sale items at once
    if (saleItemsToInsert.length > 0) {
      writeOps.push(supabase.from('sale_items').insert(saleItemsToInsert));
    }

    // Batch insert all stock movements at once
    if (stockMovementsToInsert.length > 0) {
      writeOps.push(supabase.from('stock_movements').insert(stockMovementsToInsert));
    }

    // Update batches in parallel
    for (const bu of batchUpdates) {
      writeOps.push(
        supabase.from('batches').update({
          current_quantity_base: bu.current_quantity_base,
          status: bu.status
        }).eq('id', bu.id)
      );
    }

    // Update product current stock in parallel
    for (const pu of productStockUpdates) {
      writeOps.push(
        supabase.from('products').update({
          current_stock_base: pu.current_stock_base,
          updated_at: new Date().toISOString()
        }).eq('id', pu.id)
      );
    }

    // Update sale COGS and profit
    const grossProfit = Math.max(0, totalNet - totalSaleCogs);
    writeOps.push(
      supabase.from('sales').update({
        total_cogs: totalSaleCogs,
        gross_profit: grossProfit
      }).eq('id', sale.id)
    );

    // Cash session & cash movements
    if (paymentMethod === 'CASH' && sessionId) {
      writeOps.push(
        supabase.from('cash_movements').insert({
          store_id: storeId,
          session_id: sessionId,
          movement_type: 'SALE',
          payment_method: 'CASH',
          amount: totalNet,
          reason: `Venda PDV Recibo: ${receiptNumber}`,
          created_by: user?.id || null
        })
      );

      writeOps.push(
        (async () => {
          try {
            const { data: curSession } = await supabase
              .from('cash_sessions')
              .select('expected_cash')
              .eq('id', sessionId)
              .single();
            if (curSession) {
              await supabase.from('cash_sessions').update({
                expected_cash: (Number(curSession.expected_cash) || 0) + totalNet
              }).eq('id', sessionId);
            }
          } catch (e) {
            console.warn('Session update ignored:', e);
          }
        })()
      );
    }

    // Execute all write operations in parallel!
    await Promise.all(writeOps);

    // 6. Audit log (non-blocking)
    audit.log('SALE', 'sales', sale.id, `Venda PDV #${sale.id.substring(0, 8)} no valor de ${totalNet.toFixed(2)} MT (Cliente: ${customerName || 'Consumidor Final'})`);

    // 7. Full sale object ready for receipt display instantly without extra network fetch
    const fullSale = {
      ...sale,
      payment_method: originalPaymentMethod,
      total_cogs: totalSaleCogs,
      gross_profit: grossProfit,
      stores: state.activeStore,
      profiles: { full_name: user?.user_metadata?.full_name || user?.email || 'Caixa' },
      sale_items: receiptItemsFormatted
    };

    return {
      sale_id: sale.id,
      receipt_number: receiptNumber,
      total_amount: totalNet,
      fullSale
    };
  },

  async reverseSale(saleId, reason) {
    const supabase = await this.getClient();
    try {
      const { data, error } = await supabase.rpc('reverse_sale', {
        p_sale_id: saleId,
        p_reason: reason
      });
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('RPC reverse_sale failed, using direct reverse sale:', e);
      return await this.directReverseSale(saleId, reason);
    }
  },

  async directReverseSale(saleId, reason) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const user = state.user;

    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', saleId)
      .single();

    if (saleErr || !sale) throw new Error('Venda não encontrada.');
    if (sale.status === 'REVERSED') throw new Error('Esta venda já foi estornada.');

    // 1. Mark sale as reversed
    await supabase
      .from('sales')
      .update({
        status: 'REVERSED',
        reversed_at: new Date().toISOString(),
        reversed_by: user?.id || null,
        reversal_reason: reason || 'Estorno solicitado'
      })
      .eq('id', saleId);

    // 2. Return items to stock and batches
    for (const item of sale.sale_items || []) {
      const qtyBase = Number(item.quantity_base) || 0;
      if (qtyBase > 0) {
        if (item.batch_id) {
          const { data: b } = await supabase.from('batches').select('current_quantity_base').eq('id', item.batch_id).single();
          if (b) {
            await supabase
              .from('batches')
              .update({
                current_quantity_base: Number(b.current_quantity_base || 0) + qtyBase,
                status: 'ACTIVE'
              })
              .eq('id', item.batch_id);
          }
        }

        const { data: p } = await supabase.from('products').select('current_stock_base').eq('id', item.product_id).single();
        if (p) {
          await supabase
            .from('products')
            .update({
              current_stock_base: Number(p.current_stock_base || 0) + qtyBase,
              updated_at: new Date().toISOString()
            })
            .eq('id', item.product_id);
        }

        await supabase
          .from('stock_movements')
          .insert({
            store_id: storeId,
            product_id: item.product_id,
            batch_id: item.batch_id || null,
            movement_type: 'RETURN',
            quantity_base: qtyBase,
            reference_id: saleId,
            reference_type: 'SALE',
            reason: `Estorno de venda ${sale.receipt_number}: ${reason || 'Devolução'}`,
            created_by: user?.id || null
          });
      }
    }

    if (sale.payment_method === 'CASH' && sale.session_id) {
      await supabase
        .from('cash_movements')
        .insert({
          store_id: storeId,
          session_id: sale.session_id,
          movement_type: 'ADJUSTMENT',
          payment_method: 'CASH',
          amount: -Number(sale.total_net),
          reason: `Estorno de venda ${sale.receipt_number}`,
          created_by: user?.id || null
        });

      const { data: curSession } = await supabase.from('cash_sessions').select('expected_cash').eq('id', sale.session_id).single();
      if (curSession) {
        await supabase
          .from('cash_sessions')
          .update({
            expected_cash: Math.max(0, Number(curSession.expected_cash || 0) - Number(sale.total_net))
          })
          .eq('id', sale.session_id);
      }
    }

    audit.log('SALE_REVERSAL', 'sales', saleId, `Estorno da venda #${sale.receipt_number}. Motivo: ${reason || 'Nenhum'}`);
    return { success: true, sale_id: saleId };
  },

  async getSales({ limit = 50, sessionId = null } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    let query = supabase
      .from('sales')
      .select('*, profiles:created_by(full_name), sale_items(*, products(name, dosage, presentation))')
      .eq('store_id', storeId);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getSaleById(saleId) {
    const supabase = await this.getClient();
    const { data, error } = await supabase
      .from('sales')
      .select('*, profiles:created_by(full_name), stores(*), sale_items(*, products(name, dosage, presentation), product_units:unit_id(symbol, name), batches(batch_number, expiry_date))')
      .eq('id', saleId)
      .single();
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // CASH SESSIONS & SANGRIA
  // -------------------------------------------------------------------
  async openCashSession(registerId, initialCash, notes = '') {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const userId = state.user?.id;

    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({
        store_id: storeId,
        register_id: registerId || null,
        user_id: userId,
        initial_cash: Number(initialCash) || 0,
        expected_cash: Number(initialCash) || 0,
        status: 'OPEN',
        notes
      })
      .select('*, cash_registers(name, code)')
      .single();

    if (error) throw error;

    // Record initial cash movement
    if (Number(initialCash) > 0) {
      await supabase.from('cash_movements').insert({
        store_id: storeId,
        session_id: data.id,
        movement_type: 'INITIAL',
        payment_method: 'CASH',
        amount: Number(initialCash),
        reason: 'Abertura de Caixa (Fundo de Troco)',
        created_by: userId
      });
    }

    audit.log('CASH_OPEN', 'cash_sessions', data.id, `Abertura de caixa com fundo inicial: ${Number(initialCash).toFixed(2)} MT`);
    return data;
  },

  async closeCashSession(sessionId, countedCash, notes) {
    try {
      const supabase = await this.getClient();
      const { data, error } = await supabase.rpc('close_cash_session', {
        p_session_id: sessionId,
        p_counted_cash: Number(countedCash) || 0,
        p_notes: notes || ''
      });
      if (error) throw error;
      audit.log('CASH_CLOSE', 'cash_sessions', sessionId, `Fechamento de caixa com contagem cega: ${Number(countedCash).toFixed(2)} MT`);
      return data;
    } catch (err) {
      console.warn('close_cash_session RPC error, falling back to local handler:', err);
      return await mockDb.closeCashSession(sessionId, countedCash, notes);
    }
  },

  async getClosedCashSessions(limit = 50) {
    try {
      const supabase = await this.getClient();
      const storeId = this.getStoreId();
      if (!storeId) return await mockDb.getClosedCashSessions(limit);

      let { data: sessions, error } = await supabase
        .from('cash_sessions')
        .select('*, cash_registers(name, code)')
        .eq('store_id', storeId)
        .eq('status', 'CLOSED')
        .order('closed_at', { ascending: false })
        .limit(limit);

      if (error) {
        const simple = await supabase
          .from('cash_sessions')
          .select('*')
          .eq('store_id', storeId)
          .eq('status', 'CLOSED')
          .order('closed_at', { ascending: false })
          .limit(limit);
        if (simple.error) throw simple.error;
        sessions = simple.data || [];
      }

      if (sessions && sessions.length > 0) {
        return sessions.map(s => ({
          ...s,
          cash_registers: s.cash_registers || { name: 'Caixa Principal', code: 'CX-01' },
          profiles: s.profiles || { full_name: state.profile?.full_name || 'Operador de Caixa' }
        }));
      }

      // If empty in remote, check mockDb
      const local = await mockDb.getClosedCashSessions(limit);
      return (sessions && sessions.length > 0) ? sessions : local;
    } catch (err) {
      console.warn('Error fetching closed sessions, falling back to local storage:', err);
      return await mockDb.getClosedCashSessions(limit);
    }
  },

  async registerSangria(sessionId, amount, destination, reason, notes) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase.rpc('register_sangria', {
      p_store_id: storeId,
      p_session_id: sessionId,
      p_amount: Number(amount),
      p_destination: destination,
      p_reason: reason,
      p_notes: notes || ''
    });
    if (error) throw error;
    audit.log('SANGRIA', 'cash_movements', data?.id, `Sangria de ${Number(amount).toFixed(2)} MT para ${destination}. Motivo: ${reason}`);
    return data;
  },

  async getCashMovements(sessionId) {
    const supabase = await this.getClient();
    let query = supabase
      .from('cash_movements')
      .select('*, profiles:created_by(full_name)')
      .order('created_at', { ascending: false });

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getCashRegisters() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('store_id', storeId)
      .eq('active', true);
    if (error) throw error;
    return data || [];
  },

  // -------------------------------------------------------------------
  // LOSSES
  // -------------------------------------------------------------------
  async registerLoss(productId, batchId, quantityBase, lossType, reason) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const { data, error } = await supabase.rpc('register_loss', {
      p_store_id: storeId,
      p_product_id: productId,
      p_batch_id: batchId,
      p_quantity_base: Number(quantityBase),
      p_loss_type: lossType,
      p_reason: reason
    });
    if (error) throw error;
    return data;
  },

  async getLossesHistory() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('losses')
      .select('*, products(name, code), batches(batch_number, expiry_date), profiles:recorded_by(full_name)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // -------------------------------------------------------------------
  // STOCK MOVEMENTS AUDIT
  // -------------------------------------------------------------------
  async getStockMovements({ productId = null, limit = 100 } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    let query = supabase
      .from('stock_movements')
      .select('*, products(name, code), batches(batch_number), profiles:created_by(full_name)')
      .eq('store_id', storeId);

    if (productId) {
      query = query.eq('product_id', productId);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // -------------------------------------------------------------------
  // CAPITAL & FINANCIAL TRANSACTIONS
  // -------------------------------------------------------------------
  async getCapitalTransactions() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('capital_transactions')
      .select('*, profiles:created_by(full_name)')
      .eq('store_id', storeId)
      .order('reference_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createCapitalTransaction(txData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const userId = state.user?.id;

    const { data, error } = await supabase
      .from('capital_transactions')
      .insert({ ...txData, store_id: storeId, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getFinancialTransactions({ limit = 100 } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('financial_transactions')
      .select('*, profiles:created_by(full_name)')
      .eq('store_id', storeId)
      .order('transaction_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async createFinancialTransaction(transData) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    const userId = state.user?.id;

    const { data, error } = await supabase
      .from('financial_transactions')
      .insert({ ...transData, store_id: storeId, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // DASHBOARD METRICS (RPCs)
  // -------------------------------------------------------------------
  async getAdminDashboardMetrics() {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return null;

    const { data, error } = await supabase.rpc('get_admin_dashboard_metrics', {
      p_store_id: storeId
    });
    if (error) throw error;
    return data;
  },

  async getCashierDashboardMetrics(sessionId) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return null;

    const { data, error } = await supabase.rpc('get_cashier_dashboard_metrics', {
      p_store_id: storeId,
      p_session_id: sessionId || null
    });
    if (error) throw error;
    return data;
  },

  // -------------------------------------------------------------------
  // AUDIT LOGS
  // -------------------------------------------------------------------
  async getAuditLogs({ limit = 100 } = {}) {
    const supabase = await this.getClient();
    const storeId = this.getStoreId();
    if (!storeId) return [];

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, profiles:user_id(full_name, email)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
};

export const db = new Proxy(rawDb, {
  get(target, prop) {
    if (typeof target[prop] === 'function') {
      return async function(...args) {
        if (state.isDemoMode) {
          if (typeof mockDb[prop] === 'function') {
            return await mockDb[prop](...args);
          }
        }
        try {
          return await target[prop].apply(target, args);
        } catch (err) {
          if (err?.message?.includes('fetch') || err?.name === 'TypeError' || state.isDemoMode) {
            console.warn(`Database fallback to mockDb for ${String(prop)}:`, err?.message || err);
            if (typeof mockDb[prop] === 'function') {
              return await mockDb[prop](...args);
            }
          }
          throw err;
        }
      };
    }
    return target[prop];
  }
});

