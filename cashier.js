/**
 * FARMAKEIA — POS Frente de Caixa Module
 * High-speed cashier checkout, FEFO integration, barcode search,
 * unit conversions and atomic receipt generation.
 */

import { db } from './database.js';
import { state } from './state.js';
import { cart } from './cart.js';
import { receipts } from './receipts.js';
import { formatCurrency, debounce, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';
import { t } from './i18n.js';

export const cashierView = {
  products: [],
  selectedProduct: null,
  currentTab: 'TOP', // 'TOP', 'ALL', 'EXPIRY'

  /**
   * Helper to check batch expiry status for non-blocking alerts
   */
  getProductExpiryInfo(product) {
    const batches = product.batches || [];
    if (!batches || batches.length === 0) {
      return { hasAlert: false, isExpired: false, isNear: false, daysLeft: null };
    }

    const now = new Date();
    let minDays = Infinity;
    let hasExpired = false;
    let hasNear = false;

    for (const b of batches) {
      if (!b.expiry_date || Number(b.current_quantity_base) <= 0) continue;
      const exp = new Date(b.expiry_date + 'T00:00:00');
      const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
      if (diffDays < minDays) minDays = diffDays;
      if (diffDays <= 0) hasExpired = true;
      else if (diffDays <= 30) hasNear = true;
    }

    if (minDays === Infinity) {
      return { hasAlert: false, isExpired: false, isNear: false, daysLeft: null };
    }

    return {
      hasAlert: hasExpired || hasNear,
      isExpired: hasExpired,
      isNear: hasNear,
      daysLeft: minDays
    };
  },

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>${t('no_pharmacy_title')}</h3></div>`;
      return;
    }

    const session = state.activeCashSession;

    container.innerHTML = `
      <div class="pos-layout">
        <!-- Catalog & Search Panel -->
        <div class="pos-catalog card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 0.75rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 250px; position: relative;">
              <input 
                type="text" 
                id="pos-search-input" 
                class="form-control" 
                placeholder="${t('pos_search_placeholder')}" 
                autofocus
                autocomplete="off"
              />
            </div>
            ${!session ? `
              <div class="badge badge-warning" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.4);">
                ⚡ ${t('auto_session_active')}
              </div>
            ` : `
              <div class="badge badge-success">
                ${t('active_session_lbl')}: ${escapeHtml(session.cash_registers?.name || 'Caixa')}
              </div>
            `}
          </div>

          <!-- Quick Navigation Tabs / Auto Visibility -->
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-sm btn-primary" id="pos-tab-top" style="display: flex; align-items: center; gap: 0.35rem;">
              <span>${t('tab_top_sellers')}</span>
            </button>
            <button class="btn btn-sm btn-secondary" id="pos-tab-all" style="display: flex; align-items: center; gap: 0.35rem;">
              <span>${t('tab_all')}</span>
            </button>
            <button class="btn btn-sm btn-secondary" id="pos-tab-expiry" style="display: flex; align-items: center; gap: 0.35rem;">
              <span>${t('tab_expiry')}</span>
            </button>
            <span id="pos-catalog-status" style="margin-left: auto; font-size: 0.8rem; color: var(--text-muted);">
              ...
            </span>
          </div>

          <!-- Products Grid / Results List (Populated immediately!) -->
          <div id="pos-products-list" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 0.75rem; align-content: start;">
            <div class="skeleton" style="height: 120px; grid-column: 1/-1;"></div>
          </div>
        </div>

        <!-- POS Cart Panel -->
        <div class="pos-cart">
          <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
            <h3 style="font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              ${t('cart_title')}
            </h3>
            <button class="btn btn-secondary btn-sm" id="btn-clear-cart" title="${t('btn_clear_cart')}">${t('btn_clear_cart')}</button>
          </div>

          <!-- Cart Items Container -->
          <div class="cart-items-list" id="cart-items-container">
            <!-- Rendered dynamically -->
          </div>

          <!-- Totals and Checkout -->
          <div class="cart-totals">
            <div class="cart-total-row">
              <span>${t('cart_subtotal')}</span>
              <strong id="cart-subtotal-display">${formatCurrency(0)}</strong>
            </div>
            <div class="cart-total-row">
              <span>${t('cart_discount')}</span>
              <input type="number" id="cart-discount-input" class="form-control" style="width: 100px; padding: 0.2rem 0.5rem; text-align: right;" min="0" step="0.50" value="0.00" />
            </div>
            <div class="cart-total-row grand-total">
              <span>${t('cart_total')}</span>
              <span id="cart-total-display">${formatCurrency(0)}</span>
            </div>

            <button class="btn btn-primary btn-lg" id="btn-open-payment" style="width: 100%; margin-top: 1rem;">
              ${t('btn_checkout')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.initEvents(container);
    this.renderCartItems();
    // Automatically load Top-Selling products immediately without requiring search!
    await this.loadCatalog('TOP');
  },

  catalogCache: {},

  async loadCatalog(tab = 'TOP', searchQuery = '', forceRefresh = false) {
    const productsList = document.getElementById('pos-products-list');
    const statusText = document.getElementById('pos-catalog-status');
    const tabTop = document.getElementById('pos-tab-top');
    const tabAll = document.getElementById('pos-tab-all');
    const tabExp = document.getElementById('pos-tab-expiry');

    if (!productsList) return;

    this.currentTab = tab;

    if (tabTop && tabAll && tabExp) {
      tabTop.className = `btn btn-sm ${tab === 'TOP' && !searchQuery ? 'btn-primary' : 'btn-secondary'}`;
      tabAll.className = `btn btn-sm ${tab === 'ALL' && !searchQuery ? 'btn-primary' : 'btn-secondary'}`;
      tabExp.className = `btn btn-sm ${tab === 'EXPIRY' && !searchQuery ? 'btn-primary' : 'btn-secondary'}`;
    }

    // Use in-memory cached products if available for instant tab switching
    const isCleanTab = !searchQuery.trim();
    if (isCleanTab && !forceRefresh && this.catalogCache[tab]) {
      const list = this.catalogCache[tab];
      this.products = list;
      if (statusText) {
        if (tab === 'TOP') statusText.textContent = `${t('showing_lbl')} ${list.length} ${t('most_sold_frequent_lbl')}`;
        else if (tab === 'EXPIRY') statusText.textContent = `${list.length} ${t('with_expiry_alert_lbl')}`;
        else statusText.textContent = `${list.length} ${t('catalog_prods_lbl')} (${t('grouped_by_category')})`;
      }
      if (tab === 'ALL') {
        this.renderCategorizedProductCards(list, productsList);
      } else {
        this.renderProductCards(list, productsList);
      }
      return;
    }

    productsList.innerHTML = `<div class="skeleton" style="height: 120px; grid-column: 1/-1;"></div>`;

    try {
      let list = [];
      if (searchQuery.trim()) {
        list = await db.getProducts({ search: searchQuery, limit: 40 });
        if (statusText) statusText.textContent = `${list.length} ${t('prods_found_lbl')}`;
      } else if (tab === 'TOP') {
        list = await db.getTopSellingProducts({ limit: 24 });
        if (statusText) statusText.textContent = `${t('showing_lbl')} ${list.length} ${t('most_sold_frequent_lbl')}`;
        this.catalogCache['TOP'] = list;
      } else if (tab === 'EXPIRY') {
        const all = await db.getProducts({ limit: 100 });
        list = all.filter(p => this.getProductExpiryInfo(p).hasAlert);
        if (statusText) statusText.textContent = `${list.length} ${t('with_expiry_alert_lbl')}`;
        this.catalogCache['EXPIRY'] = list;
      } else {
        list = await db.getProducts({ limit: 300 });
        if (statusText) statusText.textContent = `${list.length} ${t('catalog_prods_lbl')} (${t('grouped_by_category')})`;
        this.catalogCache['ALL'] = list;
      }

      this.products = list;
      if (tab === 'ALL' && !searchQuery.trim()) {
        this.renderCategorizedProductCards(list, productsList);
      } else {
        this.renderProductCards(list, productsList);
      }
    } catch (err) {
      console.error('Error loading POS catalog:', err);
      productsList.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; color: var(--color-danger);">
          <p>${escapeHtml(err.message || 'Error')}</p>
        </div>
      `;
    }
  },

  initEvents(container) {
    const searchInput = container.querySelector('#pos-search-input');
    const discountInput = container.querySelector('#cart-discount-input');
    const clearCartBtn = container.querySelector('#btn-clear-cart');
    const checkoutBtn = container.querySelector('#btn-open-payment');
    const tabTop = container.querySelector('#pos-tab-top');
    const tabAll = container.querySelector('#pos-tab-all');
    const tabExp = container.querySelector('#pos-tab-expiry');

    tabTop?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.loadCatalog('TOP');
    });

    tabAll?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.loadCatalog('ALL');
    });

    tabExp?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      this.loadCatalog('EXPIRY');
    });

    // Live search with automatic fallback to popular items on clear (fast 120ms debounce)
    const doSearch = debounce(async (query) => {
      if (!query.trim()) {
        this.loadCatalog(this.currentTab);
        return;
      }
      this.loadCatalog(this.currentTab, query);
    }, 120);

    searchInput?.addEventListener('input', (e) => doSearch(e.target.value));

    // Handle Barcode enter or Keyboard shortcuts
    searchInput?.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        const val = searchInput.value.trim();
        const found = this.products.find(p => p.barcode === val || p.code === val);
        if (found) {
          this.promptAddToCart(found);
          searchInput.value = '';
          this.loadCatalog(this.currentTab);
        }
      }
    });

    // Global keyboard shortcuts in POS
    const keyHandler = (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInput?.focus();
        searchInput?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        checkoutBtn?.click();
      }
    };
    window.addEventListener('keydown', keyHandler);

    discountInput?.addEventListener('input', (e) => {
      cart.setDiscount(e.target.value);
    });

    clearCartBtn?.addEventListener('click', () => {
      cart.clear();
      this.renderCartItems();
    });

    checkoutBtn?.addEventListener('click', () => {
      this.openPaymentModal();
    });

    // Subscribe cart changes
    cart.subscribe(() => {
      this.renderCartItems();
    });
  },

  renderSingleProductCardHtml(prod) {
    const stock = Number(prod.current_stock_base) || 0;
    const unitSym = prod.product_units?.symbol || 'un';
    const hasStock = stock > 0;
    const expiry = this.getProductExpiryInfo(prod);

    return `
      <div class="card product-card-item" data-product-id="${prod.id}" style="cursor: pointer; padding: 0.85rem; display: flex; flex-direction: column; justify-content: space-between; border-color: ${hasStock ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'}; position: relative; transition: transform 0.1s ease, border-color 0.15s ease;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem;">
            <strong style="font-size: 0.875rem; color: var(--text-color); line-height: 1.25;">${escapeHtml(prod.name)}</strong>
            ${expiry.hasAlert ? `
              <span class="badge ${expiry.isExpired ? 'badge-danger' : 'badge-warning'}" style="font-size: 0.65rem; padding: 2px 5px; white-space: nowrap;" title="${expiry.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expiry.daysLeft}d`}">
                ${expiry.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expiry.daysLeft}d`}
              </span>
            ` : ''}
          </div>

          ${prod.dosage || prod.presentation ? `
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">
              ${escapeHtml(prod.dosage || '')} ${escapeHtml(prod.presentation || '')}
            </div>
          ` : ''}

          ${prod.total_sold_qty ? `
            <div style="font-size: 0.7rem; color: var(--color-primary); margin-bottom: 0.25rem;">
              🔥 ${prod.total_sold_qty} ${t('units_sold')}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 0.65rem; padding-top: 0.45rem; border-top: 1px solid rgba(255,255,255,0.05);">
          <div>
            <span class="badge ${hasStock ? 'badge-success' : 'badge-danger'}" style="font-size: 0.725rem;">
              ${stock} ${unitSym}
            </span>
          </div>
          <div style="text-align: right;">
            <strong style="color: var(--color-primary); font-size: 1rem;">
              ${formatCurrency(prod.sale_price_base)}
            </strong>
            <div style="font-size: 0.675rem; color: var(--text-muted);">/${unitSym}</div>
          </div>
        </div>
      </div>
    `;
  },

  bindProductCardClicks(container) {
    container.querySelectorAll('.product-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const prodId = card.getAttribute('data-product-id');
        const prod = this.products.find(p => p.id === prodId);
        if (prod) {
          this.promptAddToCart(prod);
        }
      });
    });
  },

  renderProductCards(products, container) {
    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <p>${t('prod_not_found')}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(prod => this.renderSingleProductCardHtml(prod)).join('');
    this.bindProductCardClicks(container);
  },

  renderCategorizedProductCards(products, container) {
    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <p>${t('prod_not_found')}</p>
        </div>
      `;
      return;
    }

    // Group products by category
    const groups = {};
    for (const prod of products) {
      const cat = (prod.category || '').trim() || t('uncategorized');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(prod);
    }

    // Sort categories alphabetically (A-Z)
    const sortedCategories = Object.keys(groups).sort((a, b) => 
      a.localeCompare(b, 'pt', { sensitivity: 'base' })
    );

    // Sort products inside each category alphabetically (A-Z)
    sortedCategories.forEach(cat => {
      groups[cat].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }));
    });

    let html = `
      <div style="grid-column: 1/-1; display: flex; flex-direction: column; gap: 1.25rem; width: 100%;">
        <!-- Category Filter & Jump Bar -->
        <div style="display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.5rem; -webkit-overflow-scrolling: touch; border-bottom: 1px solid var(--border-color); align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: 700; white-space: nowrap; text-transform: uppercase;">${t('categories')}:</span>
          ${sortedCategories.map((cat, idx) => `
            <a href="#cat-sec-${idx}" class="btn btn-sm btn-secondary" style="white-space: nowrap; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: var(--radius-full); text-decoration: none;">
              ${escapeHtml(cat)} (${groups[cat].length})
            </a>
          `).join('')}
        </div>
    `;

    sortedCategories.forEach((cat, idx) => {
      const catProds = groups[cat];
      html += `
        <div id="cat-sec-${idx}" class="pos-category-section" style="display: flex; flex-direction: column; gap: 0.65rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255, 255, 255, 0.04); border-left: 4px solid var(--color-primary); padding: 0.5rem 0.85rem; border-radius: var(--radius-sm);">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>
              <strong style="font-size: 0.95rem; color: var(--text-main); font-weight: 700;">${escapeHtml(cat)}</strong>
              <span style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">• Ordem Alfabética (A-Z)</span>
            </div>
            <span class="badge badge-secondary" style="font-size: 0.75rem; padding: 2px 8px;">
              ${catProds.length} ${t('products_count')}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 0.75rem;">
            ${catProds.map(prod => this.renderSingleProductCardHtml(prod)).join('')}
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    this.bindProductCardClicks(container);
  },

  /**
   * Prompts package/presentation choice if product has conversions, or adds base unit directly
   * Rule: Expiry does NOT block adding or selling. Only stock insufficiency restricts.
   */
  promptAddToCart(product) {
    const packages = product.product_packages || [];
    const stock = Number(product.current_stock_base) || 0;

    if (stock <= 0) {
      notify.error(`${t('no_stock_alert')} (${product.name})`);
      return;
    }

    const expInfo = this.getProductExpiryInfo(product);

    if (packages.length === 0) {
      // Direct add base unit
      cart.addItem(product, null);
      if (expInfo.hasAlert) {
        notify.info(`${t('item_added')} ${product.name} (${expInfo.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expInfo.daysLeft}d`})`);
      } else {
        notify.success(`${t('item_added')} ${product.name}`);
      }
      return;
    }

    // Modal to choose unit presentation
    const baseUnitSym = product.product_units?.symbol || 'un';
    const modalContent = `
      <p style="margin-bottom: 1rem; color: var(--text-muted);">${t('select_package_for')} <strong>${escapeHtml(product.name)}</strong>:</p>
      
      ${expInfo.hasAlert ? `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-sm); padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.8rem; color: #f59e0b;">
          ⚠️ <strong>${t('expiry_warning_box_title')}:</strong> ${expInfo.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expInfo.daysLeft}d`}.
        </div>
      ` : ''}

      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button class="btn btn-secondary btn-select-package" data-package-id="base" style="justify-content: space-between; text-align: left; padding: 0.85rem;">
          <div>
            <strong>${escapeHtml(product.product_units?.name || t('base_unit_lbl'))} (${baseUnitSym})</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">1 ${baseUnitSym}</div>
          </div>
          <strong style="color: var(--color-primary);">${formatCurrency(product.sale_price_base)}</strong>
        </button>

        ${packages.map(pkg => `
          <button class="btn btn-secondary btn-select-package" data-package-id="${pkg.id}" style="justify-content: space-between; text-align: left; padding: 0.85rem;">
            <div>
              <strong>${escapeHtml(pkg.package_name)}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${pkg.multiplier_to_base} ${baseUnitSym}</div>
            </div>
            <strong style="color: var(--color-primary);">${formatCurrency(pkg.sale_price)}</strong>
          </button>
        `).join('')}
      </div>
    `;

    const overlay = modal.open({
      title: t('package_options'),
      contentHtml: modalContent,
      size: 'sm'
    });

    overlay.querySelectorAll('.btn-select-package').forEach(btn => {
      btn.addEventListener('click', () => {
        const pkgId = btn.getAttribute('data-package-id');
        const chosenPkg = pkgId === 'base' ? null : packages.find(p => p.id === pkgId);
        cart.addItem(product, chosenPkg);
        modal.close();
        if (expInfo.hasAlert) {
          notify.info(`${t('item_added')} ${product.name} (${expInfo.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expInfo.daysLeft}d`})`);
        } else {
          notify.success(`${t('item_added')} ${product.name} (${chosenPkg?.package_name || baseUnitSym})`);
        }
      });
    });
  },

  renderCartItems() {
    const container = document.getElementById('cart-items-container');
    const subtotalDisplay = document.getElementById('cart-subtotal-display');
    const totalDisplay = document.getElementById('cart-total-display');
    if (!container) return;

    if (cart.items.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 2rem 1rem;">
          <p>${t('cart_empty')}</p>
        </div>
      `;
      if (subtotalDisplay) subtotalDisplay.textContent = formatCurrency(0);
      if (totalDisplay) totalDisplay.textContent = formatCurrency(0);
      return;
    }

    container.innerHTML = cart.items.map(item => {
      const expInfo = this.getProductExpiryInfo(item.product);

      return `
        <div class="cart-item-row">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <strong style="font-size: 0.85rem;">${escapeHtml(item.product.name)}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">
                ${escapeHtml(item.packageName)} • ${formatCurrency(item.unitPrice)}
              </div>
              ${expInfo.hasAlert ? `
                <div style="font-size: 0.7rem; color: ${expInfo.isExpired ? '#ef4444' : '#f59e0b'}; display: flex; align-items: center; gap: 0.25rem; margin-top: 0.2rem;">
                  <span>${expInfo.isExpired ? t('alert_expired_batch') : `${t('alert_expiring_in')} ${expInfo.daysLeft}d`}</span>
                </div>
              ` : ''}
            </div>
            <button class="btn-remove-item" data-item-id="${item.id}" style="background: none; border: none; color: var(--color-danger); cursor: pointer; padding: 2px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem;">
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <button class="btn btn-secondary btn-sm btn-qty-minus" data-item-id="${item.id}" style="padding: 0.1rem 0.45rem;">-</button>
              <input type="number" class="form-control cart-qty-input" data-item-id="${item.id}" value="${item.quantity}" style="width: 50px; text-align: center; padding: 0.15rem;" min="1" />
              <button class="btn btn-secondary btn-sm btn-qty-plus" data-item-id="${item.id}" style="padding: 0.1rem 0.45rem;">+</button>
            </div>
            <strong style="color: var(--color-primary); font-size: 0.95rem;">
              ${formatCurrency(item.quantity * item.unitPrice)}
            </strong>
          </div>
        </div>
      `;
    }).join('');

    if (subtotalDisplay) subtotalDisplay.textContent = formatCurrency(cart.getSubtotal());
    if (totalDisplay) totalDisplay.textContent = formatCurrency(cart.getTotal());

    // Hook quantity events
    container.querySelectorAll('.btn-remove-item').forEach(btn => {
      btn.addEventListener('click', () => {
        cart.removeItem(btn.getAttribute('data-item-id'));
      });
    });

    container.querySelectorAll('.btn-qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-item-id');
        const item = cart.items.find(i => i.id === id);
        if (item) cart.updateQuantity(id, item.quantity - 1);
      });
    });

    container.querySelectorAll('.btn-qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-item-id');
        const item = cart.items.find(i => i.id === id);
        if (item) cart.updateQuantity(id, item.quantity + 1);
      });
    });

    container.querySelectorAll('.cart-qty-input').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.getAttribute('data-item-id');
        cart.updateQuantity(id, input.value);
      });
    });
  },

  /**
   * Opens Payment and Customer Checkout Dialog
   * Non-blocking: Validade não impede venda. Apenas quantidade e estoque importam.
   */
  openPaymentModal() {
    if (cart.items.length === 0) {
      notify.error(t('add_item_first'));
      return;
    }

    const total = cart.getTotal();

    // Check if any items in cart trigger expiry warning
    const itemsWithExpiryAlert = cart.items.filter(i => this.getProductExpiryInfo(i.product).hasAlert);

    const contentHtml = `
      <div style="margin-bottom: 1.25rem;">
        ${itemsWithExpiryAlert.length > 0 ? `
          <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: var(--radius-sm); padding: 0.65rem 0.85rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.6rem;">
            <span style="font-size: 1.3rem;">⚠️</span>
            <div style="font-size: 0.8rem; line-height: 1.3;">
              <strong style="color: #f59e0b; display: block;">${t('expiry_warning_box_title')}</strong>
              <span style="color: var(--text-muted);">
                ${t('expiry_warning_box_desc')} (${itemsWithExpiryAlert.map(i => escapeHtml(i.product.name)).join(', ')}).
              </span>
            </div>
          </div>
        ` : ''}

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('customer_name')}</label>
            <input type="text" id="modal-customer-name" class="form-control" value="${escapeHtml(cart.customerName)}" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('customer_tax')}</label>
            <input type="text" id="modal-customer-tax" class="form-control" placeholder="100.000.000" value="${escapeHtml(cart.customerTaxId)}" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${t('payment_method')}</label>
          <select id="modal-payment-method" class="form-select">
            <option value="CASH">${t('pay_cash')}</option>
            <option value="MPESA">${t('pay_mpesa')}</option>
            <option value="EMOLA">${t('pay_emola')}</option>
            <option value="CARD_POS">${t('pay_pos')}</option>
            <option value="TRANSFER">${t('pay_transfer')}</option>
            <option value="OTHER">${t('pay_other')}</option>
          </select>
        </div>

        <div id="cash-calculation-box" style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); margin-top: 1rem;">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${t('cash_given')}</label>
              <input type="number" id="modal-cash-given" class="form-control" step="0.50" value="${total}" />
            </div>
            <div class="form-group">
              <label class="form-label">${t('change_due')}</label>
              <div id="modal-change-display" style="font-size: 1.25rem; font-weight: 700; color: var(--color-primary); padding-top: 0.35rem;">
                ${formatCurrency(0)}
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 1.5rem; text-align: right;">
          <div style="font-size: 0.875rem; color: var(--text-muted);">${t('total_sale_lbl')}</div>
          <div style="font-size: 1.75rem; font-weight: 800; color: var(--color-primary);">${formatCurrency(total)}</div>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="btn-cancel-checkout">${t('btn_cancel')}</button>
      <button class="btn btn-primary btn-lg" id="btn-confirm-sale">${t('btn_confirm_sale')}</button>
    `;

    const overlay = modal.open({
      title: t('checkout_title'),
      contentHtml,
      footerHtml,
      size: 'md'
    });

    const paymentMethodSelect = overlay.querySelector('#modal-payment-method');
    const cashBox = overlay.querySelector('#cash-calculation-box');
    const cashGivenInput = overlay.querySelector('#modal-cash-given');
    const changeDisplay = overlay.querySelector('#modal-change-display');
    const customerNameInput = overlay.querySelector('#modal-customer-name');
    const customerTaxInput = overlay.querySelector('#modal-customer-tax');
    const confirmBtn = overlay.querySelector('#btn-confirm-sale');
    const cancelBtn = overlay.querySelector('#btn-cancel-checkout');

    cancelBtn?.addEventListener('click', () => modal.close());

    if (paymentMethodSelect) {
      if (cart.paymentMethod) {
        paymentMethodSelect.value = cart.paymentMethod;
      }
      if (paymentMethodSelect.value === 'CASH') {
        if (cashBox) cashBox.style.display = 'block';
      } else {
        if (cashBox) cashBox.style.display = 'none';
      }
    }

    paymentMethodSelect?.addEventListener('change', () => {
      const selectedMethod = paymentMethodSelect.value;
      cart.setPaymentMethod(selectedMethod);
      if (selectedMethod === 'CASH') {
        if (cashBox) cashBox.style.display = 'block';
      } else {
        if (cashBox) cashBox.style.display = 'none';
      }
    });

    const updateChange = () => {
      const given = Number(cashGivenInput?.value) || 0;
      const change = Math.max(0, given - total);
      if (changeDisplay) changeDisplay.textContent = formatCurrency(change);
    };

    cashGivenInput?.addEventListener('input', updateChange);
    updateChange();

    confirmBtn?.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = t('sale_processing');

      try {
        const selectedMethod = paymentMethodSelect?.value || 'CASH';
        const saleResult = await db.processAtomicSale({
          sessionId: state.activeCashSession?.id,
          customerName: customerNameInput.value.trim() || 'Consumidor Final',
          customerTaxId: customerTaxInput.value.trim() || null,
          paymentMethod: selectedMethod,
          discountAmount: cart.discountAmount,
          items: cart.getRpcPayload()
        });

        modal.close();
        notify.success(`${t('sale_completed')} (#${saleResult.receipt_number})`);

        // Instant full sale with items and store details for receipt (zero extra network wait)
        const fullSale = saleResult.fullSale || await db.getSaleById(saleResult.sale_id);

        // Show receipt dialog with print, WhatsApp, SMS and Copy options immediately
        modal.open({
          title: `${t('receipt_modal_title')} #${saleResult.receipt_number}`,
          contentHtml: receipts.generateReceiptHtml(fullSale, state.activeStore),
          footerHtml: `
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; width: 100%;">
              <button class="btn btn-secondary" id="btn-rec-close">${t('btn_close')}</button>
              <button class="btn btn-secondary" id="btn-rec-copy" title="Copiar recibo para a área de transferência">📋 ${t('copy_receipt') || 'Copiar Recibo'}</button>
              <button class="btn btn-secondary" id="btn-rec-sms" title="Partilhar por SMS">💬 ${t('share_sms') || 'Partilhar por SMS'}</button>
              <button class="btn btn-secondary" id="btn-rec-wa" title="Enviar pelo WhatsApp">📱 ${t('share_whatsapp')}</button>
              <button class="btn btn-primary" id="btn-rec-print">🖨️ ${t('print_receipt')}</button>
            </div>
          `
        });

        document.getElementById('btn-rec-close')?.addEventListener('click', () => modal.close());
        document.getElementById('btn-rec-copy')?.addEventListener('click', () => {
          receipts.copyReceipt(fullSale, state.activeStore);
        });
        document.getElementById('btn-rec-sms')?.addEventListener('click', () => {
          receipts.shareSMS(fullSale, state.activeStore);
        });
        document.getElementById('btn-rec-wa')?.addEventListener('click', () => {
          receipts.shareWhatsApp(fullSale, state.activeStore);
        });
        document.getElementById('btn-rec-print')?.addEventListener('click', () => {
          receipts.printReceipt(fullSale, state.activeStore);
        });

        // Clear cart and refresh catalog in background
        cart.clear();
        this.catalogCache = {};
        this.loadCatalog(this.currentTab, '', true);
      } catch (err) {
        console.error('Sale error:', err);
        notify.error(err.message || 'Error processing sale');
        confirmBtn.disabled = false;
        confirmBtn.textContent = t('btn_confirm_sale');
      }
    });
  }
};
