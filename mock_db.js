/**
 * FARMAKEIA — Local / Offline Mock Database Engine
 * Provides fully functional, realistic pharmacy data, POS sales processing,
 * FEFO batch inventory, and financial tracking when in Demo / Offline Mode.
 */

import { state } from './state.js';

const STORAGE_PREFIX = 'farmakeia_local_';

function getStorage(key, defaultVal) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function setStorage(key, val) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch (e) {
    console.warn('Storage save failed:', e);
  }
}

// Initial Seed Data
const SEED_CATEGORIES = [
  'Analgésicos & Antipiréticos',
  'Antibióticos',
  'Anti-inflamatórios',
  'Gastrointestinais',
  'Cardiovasculares',
  'Vitaminas & Suplementos',
  'Primeiros Socorros & Curativos'
];

const SEED_UNITS = [
  { id: 'unit-un', name: 'Unidade', symbol: 'un' },
  { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
  { id: 'unit-fr', name: 'Frasco', symbol: 'fr' },
  { id: 'unit-amp', name: 'Ampola', symbol: 'amp' },
  { id: 'unit-blist', name: 'Blister', symbol: 'blist' }
];

const SEED_SUPPLIERS = [
  { id: 'sup-1', name: 'MedPharma Distribuidora Lda', phone: '+258 84 100 2000', email: 'vendas@medpharma.co.mz', active: true },
  { id: 'sup-2', name: 'Farmacêutica Nacional SA', phone: '+258 82 300 4000', email: 'pedidos@farmacet.co.mz', active: true }
];

const SEED_PRODUCTS = [
  {
    id: 'prod-1',
    name: 'Paracetamol 500mg',
    generic_name: 'Paracetamol',
    code: 'MED-001',
    barcode: '7891001',
    category: 'Analgésicos & Antipiréticos',
    base_unit_id: 'unit-cx',
    cost_price: 30.00,
    sale_price: 50.00,
    min_stock_base: 20,
    current_stock_base: 85,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
    product_packages: [],
    batches: [
      { id: 'batch-1', batch_number: 'LOTE-2024-A', expiry_date: '2027-06-30', current_quantity_base: 50, status: 'ACTIVE' },
      { id: 'batch-2', batch_number: 'LOTE-2024-B', expiry_date: '2026-12-15', current_quantity_base: 35, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-2',
    name: 'Amoxicilina 500mg (21 Cáps)',
    generic_name: 'Amoxicilina Tri-hidratada',
    code: 'MED-002',
    barcode: '7891002',
    category: 'Antibióticos',
    base_unit_id: 'unit-cx',
    cost_price: 110.00,
    sale_price: 180.00,
    min_stock_base: 15,
    current_stock_base: 42,
    requires_prescription: true,
    active: true,
    product_units: { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
    product_packages: [],
    batches: [
      { id: 'batch-3', batch_number: 'AMX-9901', expiry_date: '2026-11-20', current_quantity_base: 42, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-3',
    name: 'Ibuprofeno 400mg (10 Comp)',
    generic_name: 'Ibuprofeno',
    code: 'MED-003',
    barcode: '7891003',
    category: 'Anti-inflamatórios',
    base_unit_id: 'unit-cx',
    cost_price: 45.00,
    sale_price: 75.00,
    min_stock_base: 15,
    current_stock_base: 60,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
    product_packages: [],
    batches: [
      { id: 'batch-4', batch_number: 'IBU-4412', expiry_date: '2027-03-10', current_quantity_base: 60, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-4',
    name: 'Omeprazol 20mg (14 Cáps)',
    generic_name: 'Omeprazol',
    code: 'MED-004',
    barcode: '7891004',
    category: 'Gastrointestinais',
    base_unit_id: 'unit-cx',
    cost_price: 70.00,
    sale_price: 120.00,
    min_stock_base: 10,
    current_stock_base: 28,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
    product_packages: [],
    batches: [
      { id: 'batch-5', batch_number: 'OMP-8821', expiry_date: '2026-09-30', current_quantity_base: 28, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-5',
    name: 'Dipirona Sódica Gotas 500mg/ml (20ml)',
    generic_name: 'Dipirona Sódica',
    code: 'MED-005',
    barcode: '7891005',
    category: 'Analgésicos & Antipiréticos',
    base_unit_id: 'unit-fr',
    cost_price: 35.00,
    sale_price: 60.00,
    min_stock_base: 20,
    current_stock_base: 55,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-fr', name: 'Frasco', symbol: 'fr' },
    product_packages: [],
    batches: [
      { id: 'batch-6', batch_number: 'DIP-1290', expiry_date: '2027-08-15', current_quantity_base: 55, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-6',
    name: 'Vitamina C 1000mg Efervescente',
    generic_name: 'Ácido Ascórbico',
    code: 'MED-006',
    barcode: '7891006',
    category: 'Vitaminas & Suplementos',
    base_unit_id: 'unit-cx',
    cost_price: 90.00,
    sale_price: 150.00,
    min_stock_base: 10,
    current_stock_base: 34,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-cx', name: 'Caixa', symbol: 'cx' },
    product_packages: [],
    batches: [
      { id: 'batch-7', batch_number: 'VIT-0019', expiry_date: '2026-10-31', current_quantity_base: 34, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-7',
    name: 'Soro Fisiológico 0.9% 500ml',
    generic_name: 'Cloreto de Sódio',
    code: 'MED-007',
    barcode: '7891007',
    category: 'Primeiros Socorros & Curativos',
    base_unit_id: 'unit-fr',
    cost_price: 25.00,
    sale_price: 45.00,
    min_stock_base: 25,
    current_stock_base: 70,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-fr', name: 'Frasco', symbol: 'fr' },
    product_packages: [],
    batches: [
      { id: 'batch-8', batch_number: 'SOR-5511', expiry_date: '2027-12-31', current_quantity_base: 70, status: 'ACTIVE' }
    ]
  },
  {
    id: 'prod-8',
    name: 'Álcool em Gel 70% 500ml',
    generic_name: 'Álcool Etílico 70%',
    code: 'MED-008',
    barcode: '7891008',
    category: 'Primeiros Socorros & Curativos',
    base_unit_id: 'unit-fr',
    cost_price: 65.00,
    sale_price: 110.00,
    min_stock_base: 15,
    current_stock_base: 40,
    requires_prescription: false,
    active: true,
    product_units: { id: 'unit-fr', name: 'Frasco', symbol: 'fr' },
    product_packages: [],
    batches: [
      { id: 'batch-9', batch_number: 'ALC-7700', expiry_date: '2028-01-01', current_quantity_base: 40, status: 'ACTIVE' }
    ]
  }
];

export const mockDb = {
  init() {
    if (!getStorage('products')) {
      setStorage('products', SEED_PRODUCTS);
    }
    if (!getStorage('categories')) {
      setStorage('categories', SEED_CATEGORIES);
    }
    if (!getStorage('units')) {
      setStorage('units', SEED_UNITS);
    }
    if (!getStorage('suppliers')) {
      setStorage('suppliers', SEED_SUPPLIERS);
    }
    if (!getStorage('sales')) {
      setStorage('sales', []);
    }
    if (!getStorage('cash_movements')) {
      setStorage('cash_movements', []);
    }
    if (!getStorage('purchases')) {
      setStorage('purchases', []);
    }
    if (!getStorage('capital')) {
      setStorage('capital', [
        {
          id: 'cap-1',
          transaction_type: 'INITIAL_CAPITAL',
          amount: 50000,
          description: 'Aporte Inicial de Capital Social',
          created_at: new Date(Date.now() - 86400000 * 30).toISOString()
        }
      ]);
    }
  },

  async getStores() {
    return [
      {
        id: 'demo-store-01',
        name: 'FARMAKEIA — Drogaria Central',
        cnpj_nif: '100234567',
        phone: '+258 84 123 4567',
        address: 'Av. Eduardo Mondlane, 123 - Maputo',
        receipt_header: 'FARMAKEIA - Drogaria & Farmácia Central',
        receipt_footer: 'Obrigado pela sua preferência! Volte sempre.',
        active: true
      }
    ];
  },

  async createStore(storeData) {
    const store = { id: `store-${Date.now()}`, ...storeData, active: true };
    return store;
  },

  async updateStore(storeId, updateData) {
    return { id: storeId, ...updateData };
  },

  async getCategories() {
    this.init();
    return getStorage('categories', SEED_CATEGORIES);
  },

  async createCategory(categoryName) {
    this.init();
    const cats = getStorage('categories', SEED_CATEGORIES);
    if (!cats.includes(categoryName)) {
      cats.push(categoryName);
      setStorage('categories', cats);
    }
    return { name: categoryName };
  },

  async getProductUnits() {
    this.init();
    return getStorage('units', SEED_UNITS);
  },

  async createProductUnit(unitData) {
    this.init();
    const units = getStorage('units', SEED_UNITS);
    const u = { id: `unit-${Date.now()}`, ...unitData };
    units.push(u);
    setStorage('units', units);
    return u;
  },

  async createProductPackage(pkgData) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const p = prods.find(x => x.id === pkgData.product_id);
    const newPkg = { id: `pkg-${Date.now()}`, ...pkgData };
    if (p) {
      p.product_packages = p.product_packages || [];
      p.product_packages.push(newPkg);
      setStorage('products', prods);
    }
    return newPkg;
  },

  async deleteProductPackage(pkgId) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    prods.forEach(p => {
      if (p.product_packages) {
        p.product_packages = p.product_packages.filter(x => x.id !== pkgId);
      }
    });
    setStorage('products', prods);
    return true;
  },

  async getSuppliers() {
    this.init();
    return getStorage('suppliers', SEED_SUPPLIERS);
  },

  async createSupplier(supplierData) {
    this.init();
    const sups = getStorage('suppliers', SEED_SUPPLIERS);
    const sup = { id: `sup-${Date.now()}`, ...supplierData, active: true };
    sups.push(sup);
    setStorage('suppliers', sups);
    return sup;
  },

  async getProducts({ search = '', category = '', activeOnly = true, limit = 100 } = {}) {
    this.init();
    let prods = getStorage('products', SEED_PRODUCTS);
    if (activeOnly) {
      prods = prods.filter(p => p.active !== false);
    }
    if (category) {
      prods = prods.filter(p => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      prods = prods.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.generic_name && p.generic_name.toLowerCase().includes(q))
      );
    }
    return prods.slice(0, limit);
  },

  async getTopSellingProducts({ limit = 12 } = {}) {
    return this.getProducts({ limit });
  },

  async getProductById(productId) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    return prods.find(p => p.id === productId) || null;
  },

  async createProduct(productData) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const units = getStorage('units', SEED_UNITS);
    const unit = units.find(u => u.id === productData.base_unit_id) || { id: 'unit-un', name: 'Unidade', symbol: 'un' };

    const newProd = {
      id: `prod-${Date.now()}`,
      ...productData,
      current_stock_base: 0,
      active: true,
      product_units: unit,
      product_packages: [],
      batches: []
    };
    prods.unshift(newProd);
    setStorage('products', prods);
    return newProd;
  },

  async updateProduct(productId, productData) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const idx = prods.findIndex(p => p.id === productId);
    if (idx !== -1) {
      prods[idx] = { ...prods[idx], ...productData };
      setStorage('products', prods);
      return prods[idx];
    }
    return null;
  },

  async getBatches({ productId = null, status = 'ACTIVE' } = {}) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    let batches = [];
    prods.forEach(p => {
      (p.batches || []).forEach(b => {
        if (!productId || p.id === productId) {
          if (!status || b.status === status) {
            batches.push({
              ...b,
              product_id: p.id,
              quantity_remaining_base: b.current_quantity_base,
              products: {
                name: p.name,
                code: p.code,
                product_units: p.product_units
              }
            });
          }
        }
      });
    });
    // FEFO: sort by expiry_date ascending
    batches.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
    return batches;
  },

  async registerPurchaseEntry({ supplierId, invoiceNumber, purchaseDate, notes, items }) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const purchases = getStorage('purchases', []);

    const purchaseRecord = {
      id: `purch-${Date.now()}`,
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      purchase_date: purchaseDate,
      notes,
      total_amount: items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0),
      created_at: new Date().toISOString(),
      items: []
    };

    items.forEach(item => {
      const prod = prods.find(p => p.id === item.productId);
      if (prod) {
        const qtyBase = Number(item.quantity) || 0;
        prod.current_stock_base = (Number(prod.current_stock_base) || 0) + qtyBase;
        prod.cost_price = Number(item.unitCost) || prod.cost_price;
        if (item.salePrice) prod.sale_price = Number(item.salePrice);

        const newBatch = {
          id: `batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          batch_number: item.batchNumber || `LOTE-${Date.now().toString().slice(-4)}`,
          expiry_date: item.expiryDate || '2027-12-31',
          current_quantity_base: qtyBase,
          status: 'ACTIVE'
        };
        prod.batches = prod.batches || [];
        prod.batches.push(newBatch);

        purchaseRecord.items.push({
          product_name: prod.name,
          quantity: qtyBase,
          unit_cost: item.unitCost,
          batch_number: newBatch.batch_number,
          expiry_date: newBatch.expiry_date
        });
      }
    });

    purchases.unshift(purchaseRecord);
    setStorage('purchases', purchases);
    setStorage('products', prods);
    return purchaseRecord;
  },

  async directRegisterPurchaseEntry(data) {
    return this.registerPurchaseEntry(data);
  },

  async getPurchasesHistory() {
    this.init();
    const sups = getStorage('suppliers', SEED_SUPPLIERS);
    const purchases = getStorage('purchases', []);
    return purchases.map(p => {
      const sup = sups.find(s => s.id === p.supplier_id);
      return {
        ...p,
        suppliers: sup ? { name: sup.name } : { name: 'Fornecedor Diversos' },
        purchase_items: p.items || []
      };
    });
  },

  async processAtomicSale({ sessionId, customerName, customerTaxId, paymentMethod, discountAmount = 0, items }) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const sales = getStorage('sales', []);

    let totalGross = 0;
    const saleItems = [];
    const chosenMethod = paymentMethod || 'CASH';

    (items || []).forEach(item => {
      const prodId = item.product_id || item.productId;
      const prod = prods.find(p => p.id === prodId);
      if (prod) {
        const mult = Number(item.multiplier_to_base || item.multiplier) || 1;
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price || item.unitPrice) || Number(prod.sale_price_base || prod.sale_price || 0) * mult;
        const itemSubtotal = Math.round((qty * unitPrice) * 100) / 100;
        totalGross += itemSubtotal;

        // Deduct from product stock
        const qtyBase = qty * mult;
        prod.current_stock_base = Math.max(0, (prod.current_stock_base || 0) - qtyBase);

        // Deduct from batches FEFO
        if (prod.batches && prod.batches.length > 0) {
          let needed = qtyBase;
          prod.batches.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
          for (const b of prod.batches) {
            if (needed <= 0) break;
            const available = Number(b.current_quantity_base) || 0;
            const take = Math.min(available, needed);
            b.current_quantity_base = available - take;
            if (b.current_quantity_base <= 0) b.status = 'EXHAUSTED';
            needed -= take;
          }
        }

        saleItems.push({
          id: `sitem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          product_id: prod.id,
          quantity: qty,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          total_price: itemSubtotal,
          multiplier: mult,
          products: {
            name: prod.name,
            code: prod.code,
            product_units: prod.product_units || { symbol: 'un', name: 'Unidade' }
          }
        });
      }
    });

    const discount = Number(discountAmount) || 0;
    const totalNet = Math.max(0, Math.round((totalGross - discount) * 100) / 100);
    const receiptNum = `REC-${Date.now().toString().slice(-6)}`;

    const saleRecord = {
      id: `sale-${Date.now()}`,
      receipt_number: receiptNum,
      customer_name: customerName || 'Consumidor Final',
      customer_tax_id: customerTaxId || null,
      payment_method: chosenMethod,
      total_gross: totalGross,
      discount_amount: discount,
      total_net: totalNet,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
      sale_items: saleItems,
      items: saleItems,
      profiles: { full_name: state.profile?.full_name || 'Operador de Caixa' }
    };

    sales.unshift(saleRecord);
    setStorage('sales', sales);
    setStorage('products', prods);

    // If active cash session and cash payment, update session expected cash
    if (chosenMethod === 'CASH' && state.activeCashSession) {
      state.activeCashSession.expected_cash = (Number(state.activeCashSession.expected_cash) || 0) + totalNet;
    }

    return {
      success: true,
      sale_id: saleRecord.id,
      receipt_number: receiptNum,
      total_net: totalNet,
      sale: saleRecord,
      fullSale: saleRecord
    };
  },

  async processDirectSale(payload) {
    return this.processAtomicSale(payload);
  },

  async getSales({ limit = 50 } = {}) {
    this.init();
    const sales = getStorage('sales', []);
    return sales.slice(0, limit);
  },

  async getSaleById(saleId) {
    this.init();
    const sales = getStorage('sales', []);
    const s = sales.find(x => x.id === saleId);
    if (!s) throw new Error('Venda não encontrada.');
    return s;
  },

  async reverseSale(saleId, reason) {
    this.init();
    const sales = getStorage('sales', []);
    const prods = getStorage('products', SEED_PRODUCTS);
    const s = sales.find(x => x.id === saleId);
    if (!s) throw new Error('Venda não encontrada.');
    if (s.status === 'CANCELLED') throw new Error('Venda já está cancelada.');

    s.status = 'CANCELLED';
    s.cancellation_reason = reason;

    // Restore stock
    (s.sale_items || []).forEach(item => {
      const prod = prods.find(p => p.id === item.product_id);
      if (prod) {
        prod.current_stock_base = (prod.current_stock_base || 0) + (Number(item.quantity) || 0);
      }
    });

    setStorage('sales', sales);
    setStorage('products', prods);
    return { success: true };
  },

  async directReverseSale(saleId, reason) {
    return this.reverseSale(saleId, reason);
  },

  async openCashSession(registerId, initialCash, notes = '') {
    const session = {
      id: `session-${Date.now()}`,
      store_id: state.activeStore?.id || 'demo-store-01',
      user_id: state.user?.id || 'demo-user-admin-01',
      status: 'OPEN',
      opened_at: new Date().toISOString(),
      initial_cash: Number(initialCash) || 0,
      notes,
      cash_registers: { name: 'Caixa 01 (Principal)', code: 'CX-01' },
      profiles: { full_name: state.profile?.full_name || 'Dr. Farmacêutico' }
    };
    state.setActiveCashSession(session);
    return session;
  },

  async closeCashSession(sessionId, countedCash, notes) {
    this.init();
    const counted = Number(countedCash) || 0;
    const currentSession = state.activeCashSession || {};
    const expected = Number(currentSession.expected_cash) || Number(currentSession.initial_cash) || 0;
    const diff = counted - expected;

    const closedSession = {
      id: sessionId || `session-${Date.now()}`,
      store_id: state.activeStore?.id || 'demo-store-01',
      user_id: state.user?.id || 'demo-user-admin-01',
      opened_at: currentSession.opened_at || new Date(Date.now() - 28800000).toISOString(),
      closed_at: new Date().toISOString(),
      initial_cash: Number(currentSession.initial_cash) || 0,
      expected_cash: expected,
      counted_cash: counted,
      difference: diff,
      reconciliation_status: diff === 0 ? 'BALANCED' : diff > 0 ? 'SURPLUS' : 'DEFICIT',
      status: 'CLOSED',
      notes: notes || currentSession.notes || '',
      cash_registers: currentSession.cash_registers || { name: 'Caixa Principal', code: 'CX-01' },
      profiles: { full_name: state.profile?.full_name || 'Operador de Caixa' }
    };

    const fallbackSeed = [
      {
        id: 'session-closed-01',
        store_id: state.activeStore?.id || 'demo-store-01',
        opened_at: new Date(Date.now() - 86400000).toISOString(),
        closed_at: new Date(Date.now() - 50400000).toISOString(),
        initial_cash: 500,
        expected_cash: 3450,
        counted_cash: 3450,
        difference: 0,
        reconciliation_status: 'BALANCED',
        status: 'CLOSED',
        notes: 'Fechamento normal sem divergência.',
        cash_registers: { name: 'Caixa Principal', code: 'CX-01' },
        profiles: { full_name: 'Dr. Farmacêutico (Admin)' }
      },
      {
        id: 'session-closed-02',
        store_id: state.activeStore?.id || 'demo-store-01',
        opened_at: new Date(Date.now() - 172800000).toISOString(),
        closed_at: new Date(Date.now() - 136800000).toISOString(),
        initial_cash: 500,
        expected_cash: 4200,
        counted_cash: 4250,
        difference: 50,
        reconciliation_status: 'SURPLUS',
        status: 'CLOSED',
        notes: 'Sobra de troco 50 MT apurada na conferência.',
        cash_registers: { name: 'Caixa Principal', code: 'CX-01' },
        profiles: { full_name: 'Dr. Farmacêutico (Admin)' }
      }
    ];

    const closed = getStorage('closed_sessions', fallbackSeed);
    closed.unshift(closedSession);
    setStorage('closed_sessions', closed);

    if (state.activeCashSession) {
      state.setActiveCashSession(null);
    }

    return {
      session_id: sessionId,
      counted_cash: counted,
      expected_cash: expected,
      difference: diff,
      status: 'CLOSED'
    };
  },

  async getClosedCashSessions(limit = 50) {
    this.init();
    const fallbackSeed = [
      {
        id: 'session-closed-01',
        store_id: state.activeStore?.id || 'demo-store-01',
        opened_at: new Date(Date.now() - 86400000).toISOString(),
        closed_at: new Date(Date.now() - 50400000).toISOString(),
        initial_cash: 500,
        expected_cash: 3450,
        counted_cash: 3450,
        difference: 0,
        reconciliation_status: 'BALANCED',
        status: 'CLOSED',
        notes: 'Fechamento normal sem divergência.',
        cash_registers: { name: 'Caixa Principal', code: 'CX-01' },
        profiles: { full_name: 'Dr. Farmacêutico (Admin)' }
      },
      {
        id: 'session-closed-02',
        store_id: state.activeStore?.id || 'demo-store-01',
        opened_at: new Date(Date.now() - 172800000).toISOString(),
        closed_at: new Date(Date.now() - 136800000).toISOString(),
        initial_cash: 500,
        expected_cash: 4200,
        counted_cash: 4250,
        difference: 50,
        reconciliation_status: 'SURPLUS',
        status: 'CLOSED',
        notes: 'Sobra de troco 50 MT apurada na conferência.',
        cash_registers: { name: 'Caixa Principal', code: 'CX-01' },
        profiles: { full_name: 'Dr. Farmacêutico (Admin)' }
      }
    ];
    const closed = getStorage('closed_sessions', fallbackSeed);
    return closed.slice(0, limit);
  },

  async registerSangria(sessionId, amount, destination, reason, notes) {
    this.init();
    const moves = getStorage('cash_movements', []);
    const m = {
      id: `mov-${Date.now()}`,
      session_id: sessionId,
      movement_type: 'SANGRIA',
      amount: Number(amount) || 0,
      destination,
      reason,
      notes,
      created_at: new Date().toISOString()
    };
    moves.unshift(m);
    setStorage('cash_movements', moves);
    return m;
  },

  async getCashMovements(sessionId) {
    this.init();
    return getStorage('cash_movements', []);
  },

  async getCashRegisters() {
    return [
      { id: 'reg-01', name: 'Caixa 01 (Principal)', code: 'CX-01', active: true },
      { id: 'reg-02', name: 'Caixa 02 (Balcão)', code: 'CX-02', active: true }
    ];
  },

  async registerLoss(productId, batchId, quantityBase, lossType, reason) {
    this.init();
    const prods = getStorage('products', SEED_PRODUCTS);
    const prod = prods.find(p => p.id === productId);
    if (prod) {
      prod.current_stock_base = Math.max(0, (prod.current_stock_base || 0) - Number(quantityBase));
      setStorage('products', prods);
    }
    return { success: true };
  },

  async getLossesHistory() {
    return [];
  },

  async getStockMovements() {
    return [];
  },

  async getCapitalTransactions() {
    this.init();
    return getStorage('capital', []);
  },

  async createCapitalTransaction(txData) {
    this.init();
    const caps = getStorage('capital', []);
    const item = { id: `cap-${Date.now()}`, ...txData, created_at: new Date().toISOString() };
    caps.unshift(item);
    setStorage('capital', caps);
    return item;
  },

  async getFinancialTransactions() {
    return [];
  },

  async createFinancialTransaction(transData) {
    return { id: `trans-${Date.now()}`, ...transData };
  },

  async getAdminDashboardMetrics() {
    this.init();
    const sales = getStorage('sales', []);
    const prods = getStorage('products', SEED_PRODUCTS);

    const activeSales = sales.filter(s => s.status !== 'CANCELLED');
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySales = activeSales.filter(s => s.created_at?.startsWith(todayStr));

    const totalSalesGross = activeSales.reduce((acc, s) => acc + (s.total_net || 0), 0);
    const todaySalesGross = todaySales.reduce((acc, s) => acc + (s.total_net || 0), 0);

    const lowStockCount = prods.filter(p => (p.current_stock_base || 0) <= (p.min_stock_base || 10)).length;

    // FEFO expiring within 60 days
    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 86400000);
    let expiringCount = 0;
    prods.forEach(p => {
      (p.batches || []).forEach(b => {
        if (b.status === 'ACTIVE' && new Date(b.expiry_date) <= in60Days) {
          expiringCount++;
        }
      });
    });

    return {
      today_sales_gross: todaySalesGross,
      today_sales_count: todaySales.length,
      total_sales_count: activeSales.length,
      total_sales_gross: totalSalesGross,
      low_stock_count: lowStockCount,
      expiring_batches_count: expiringCount,
      recent_sales: sales.slice(0, 10)
    };
  },

  async getCashierDashboardMetrics(sessionId) {
    return this.getAdminDashboardMetrics();
  },

  async getAuditLogs() {
    return [];
  }
};
