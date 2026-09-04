/**
 * FARMAKEIA — POS Shopping Cart State Manager
 * Handles multi-unit conversions (Caixa -> Carteira -> Comprimido),
 * price recalculations, and checkout validations.
 */

class CartManager {
  constructor() {
    this.items = [];
    this.discountAmount = 0;
    this.customerName = 'Consumidor Final';
    this.customerTaxId = '';
    this.paymentMethod = 'CASH';
    this.cashGiven = 0;
    this.listeners = new Set();
  }

  /**
   * Adds product with chosen unit/package to cart
   */
  addItem(product, chosenPackage = null) {
    // Determine unit details and multiplier
    const packageId = chosenPackage?.id || null;
    const unitId = chosenPackage?.unit_id || product.base_unit_id;
    const unitSymbol = chosenPackage?.product_units?.symbol || product.product_units?.symbol || 'un';
    const packageName = chosenPackage?.package_name || product.product_units?.name || 'Unidade Base';
    const multiplier = Number(chosenPackage?.multiplier_to_base) || 1;
    const unitPrice = Number(chosenPackage?.sale_price) || Number(product.sale_price_base) * multiplier;

    // Check if identical item already in cart
    const existingIndex = this.items.findIndex(
      i => i.product.id === product.id && i.packageId === packageId
    );

    if (existingIndex > -1) {
      this.items[existingIndex].quantity += 1;
    } else {
      this.items.push({
        id: `cart_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        product,
        packageId,
        packageName,
        unitId,
        unitSymbol,
        multiplier,
        unitPrice,
        quantity: 1
      });
    }

    this.notify();
  }

  updateQuantity(cartItemId, newQuantity) {
    const qty = Number(newQuantity);
    if (qty <= 0) {
      this.removeItem(cartItemId);
      return;
    }

    const item = this.items.find(i => i.id === cartItemId);
    if (item) {
      item.quantity = qty;
      this.notify();
    }
  }

  removeItem(cartItemId) {
    this.items = this.items.filter(i => i.id !== cartItemId);
    this.notify();
  }

  setDiscount(amount) {
    this.discountAmount = Math.max(0, Number(amount) || 0);
    this.notify();
  }

  setCustomer(name, taxId = '') {
    this.customerName = name || 'Consumidor Final';
    this.customerTaxId = taxId || '';
    this.notify();
  }

  setPaymentMethod(method) {
    this.paymentMethod = method;
    this.notify();
  }

  setCashGiven(amount) {
    this.cashGiven = Math.max(0, Number(amount) || 0);
    this.notify();
  }

  getSubtotal() {
    return this.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  }

  getTotal() {
    return Math.max(0, this.getSubtotal() - this.discountAmount);
  }

  getChange() {
    if (this.paymentMethod !== 'CASH') return 0;
    return Math.max(0, this.cashGiven - this.getTotal());
  }

  clear() {
    this.items = [];
    this.discountAmount = 0;
    this.customerName = 'Consumidor Final';
    this.customerTaxId = '';
    this.paymentMethod = 'CASH';
    this.cashGiven = 0;
    this.notify();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => {
      try { cb(this); } catch (e) { console.error('Cart listener error:', e); }
    });
  }

  /**
   * Prepares payload for Supabase atomic sale RPC
   */
  getRpcPayload() {
    return this.items.map(item => ({
      product_id: item.product.id,
      package_id: item.packageId,
      unit_id: item.unitId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      multiplier_to_base: item.multiplier
    }));
  }
}

export const cart = new CartManager();
