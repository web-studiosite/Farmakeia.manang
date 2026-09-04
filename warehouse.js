/**
 * FARMAKEIA — Warehouse & Stock Entry Module
 * Unified purchase receiving flow with inline supplier/product creation,
 * packaging multipliers, batch expiry tracking, and financial sync.
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, formatDate, formatDateTime, escapeHtml, debounce } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';
import { t } from './i18n.js';

export const warehouseView = {
  entryItems: [],
  suppliers: [],
  units: [],

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>${t('no_pharmacy_title')}</h3></div>`;
      return;
    }

    if (!state.isAdmin()) {
      container.innerHTML = `<div class="empty-state" style="color:var(--color-danger);"><h3>${t('unauthorized')}</h3></div>`;
      return;
    }

    this.entryItems = [];

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">${t('warehouse_entry_title')}</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">${t('warehouse_subtitle')}</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary" id="btn-view-purchases-history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            ${t('btn_entry_history')}
          </button>
        </div>
      </div>

      <!-- New Purchase Entry Form -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <div class="card-title">${t('new_stock_entry_title')}</div>
        </div>

        <div class="form-row" style="margin-bottom: 1.25rem;">
          <div class="form-group">
            <label class="form-label">${t('supplier_lbl')}</label>
            <div style="display: flex; gap: 0.5rem;">
              <select id="entry-supplier-select" class="form-select">
                <option value="">${t('select_supplier_opt')}</option>
              </select>
              <button class="btn btn-secondary btn-sm" id="btn-add-supplier-inline" title="${t('btn_save_supplier')}">+</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">${t('invoice_no_lbl')}</label>
            <input type="text" id="entry-invoice-number" class="form-control" placeholder="NF-12345" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('purchase_date_lbl')}</label>
            <input type="date" id="entry-purchase-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" />
          </div>
        </div>

        <!-- Add Item Row Trigger -->
        <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <strong style="font-size: 0.9rem;">${t('entry_items_section_title')}</strong>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-primary btn-sm" id="btn-add-existing-prod">${t('btn_add_existing_prod')}</button>
              <button class="btn btn-secondary btn-sm" id="btn-create-prod-inline">${t('btn_create_prod_inline')}</button>
            </div>
          </div>

          <!-- Items Table -->
          <div class="table-responsive">
            <table class="data-table" id="warehouse-entry-items-table">
              <thead>
                <tr>
                  <th>${t('th_item_prod')}</th>
                  <th>${t('th_item_batch')}</th>
                  <th>${t('th_item_exp')}</th>
                  <th>${t('th_item_presentation')}</th>
                  <th>${t('th_item_qty_bought')}</th>
                  <th>${t('th_item_unit_cost')}</th>
                  <th>${t('th_item_sale_price')}</th>
                  <th>${t('th_item_total')}</th>
                  <th>${t('th_item_remove')}</th>
                </tr>
              </thead>
              <tbody id="warehouse-items-body">
                <tr>
                  <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    ${t('empty_entry_items_desc')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Notes and Total Confirmation -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem;">
          <div class="form-group" style="flex: 1; min-width: 250px; margin-bottom: 0;">
            <label class="form-label">${t('entry_notes_lbl')}</label>
            <input type="text" id="entry-notes" class="form-control" placeholder="${t('entry_notes_placeholder')}" />
          </div>

          <div style="text-align: right;">
            <div style="font-size: 0.875rem; color: var(--text-muted);">${t('purchase_invoice_total_lbl')}</div>
            <div style="font-size: 1.75rem; font-weight: 800; color: var(--color-primary);" id="entry-total-cost-display">0,00 MT</div>
            <button class="btn btn-primary btn-lg" id="btn-confirm-warehouse-entry" style="margin-top: 0.5rem;">
              ${t('btn_confirm_entry')}
            </button>
          </div>
        </div>
      </div>
    `;

    await this.loadSuppliersAndUnits(container);
    this.initEvents(container);
  },

  async loadSuppliersAndUnits(container) {
    try {
      const [suppliers, units] = await Promise.all([
        db.getSuppliers(),
        db.getProductUnits()
      ]);
      this.suppliers = suppliers;
      this.units = units;

      const select = container.querySelector('#entry-supplier-select');
      if (select) {
        select.innerHTML = `
          <option value="">${t('select_supplier_opt')}</option>
          ${suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        `;
      }
    } catch (e) {
      console.error('Error loading suppliers or units:', e);
    }
  },

  initEvents(container) {
    const addSupplierBtn = container.querySelector('#btn-add-supplier-inline');
    const addExistingBtn = container.querySelector('#btn-add-existing-prod');
    const createNewProdBtn = container.querySelector('#btn-create-prod-inline');
    const confirmEntryBtn = container.querySelector('#btn-confirm-warehouse-entry');
    const historyBtn = container.querySelector('#btn-view-purchases-history');

    addSupplierBtn?.addEventListener('click', () => this.openSupplierCreateModal(container));
    addExistingBtn?.addEventListener('click', () => this.openAddExistingProductModal());
    createNewProdBtn?.addEventListener('click', () => this.openCreateProductModal());

    confirmEntryBtn?.addEventListener('click', () => this.confirmWarehouseEntry(container));
    historyBtn?.addEventListener('click', () => this.openPurchasesHistoryModal());
  },

  renderItemsTable() {
    const tbody = document.getElementById('warehouse-items-body');
    const totalDisplay = document.getElementById('entry-total-cost-display');
    if (!tbody) return;

    if (this.entryItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            ${t('empty_entry_items_desc')}
          </td>
        </tr>
      `;
      if (totalDisplay) totalDisplay.textContent = formatCurrency(0);
      return;
    }

    let total = 0;

    tbody.innerHTML = this.entryItems.map((item, idx) => {
      const itemTotal = Number(item.quantity) * Number(item.unit_cost);
      total += itemTotal;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(item.product_name)}</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.dosage || '')} ${escapeHtml(item.presentation || '')}</div>
          </td>
          <td><strong>${escapeHtml(item.batch_number)}</strong></td>
          <td>${formatDate(item.expiry_date)}</td>
          <td>${escapeHtml(item.unit_name)} (x${item.multiplier_to_base})</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.unit_cost)}</td>
          <td>${formatCurrency(item.sale_price_base)}</td>
          <td><strong>${formatCurrency(itemTotal)}</strong></td>
          <td>
            <button class="btn btn-danger btn-sm btn-remove-entry-item" data-index="${idx}">×</button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalDisplay) totalDisplay.textContent = formatCurrency(total);

    tbody.querySelectorAll('.btn-remove-entry-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'), 10);
        this.entryItems.splice(index, 1);
        this.renderItemsTable();
      });
    });
  },

  openAddExistingProductModal() {
    const modalContent = `
      <div class="form-group">
        <label class="form-label">🔍 Pesquisar para Selecionar Produto</label>
        <input type="text" id="modal-search-prod-input" class="form-control" placeholder="${t('search_prod_placeholder')}" />
      </div>

      <!-- Preview e Lista de Produtos do Catálogo -->
      <div id="modal-prod-results" style="max-height: 250px; overflow-y: auto; margin-bottom: 1rem;">
        <div class="skeleton" style="height: 60px;"></div>
      </div>

      <div id="modal-selected-prod-preview" style="display: none; margin-bottom: 1rem;"></div>

      <div id="modal-entry-item-fields" style="display: none; border-top: 1px solid var(--border-color); padding-top: 1rem;">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('batch_num_lbl')}</label>
            <input type="text" id="m-item-batch" class="form-control" value="LOT-${new Date().getFullYear()}" placeholder="Ex: LOT-2026-A" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('expiry_date_lbl')}</label>
            <input type="date" id="m-item-expiry" class="form-control" value="${new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0]}" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('presentation_form')}</label>
            <select id="m-item-package-select" class="form-select"></select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('bought_qty_lbl')}</label>
            <input type="number" id="m-item-qty" class="form-control" min="1" value="1" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('pkg_unit_cost_lbl')}</label>
            <input type="number" id="m-item-cost" class="form-control" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('new_sale_price_lbl')}</label>
            <input type="number" id="m-item-sale-price" class="form-control" step="0.01" min="0" placeholder="0.00" />
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-item">${t('cancel')}</button>
      <button class="btn btn-primary" id="m-btn-add-item-confirm" disabled>${t('btn_add_to_entry_list')}</button>
    `;

    const overlay = modal.open({
      title: 'Pesquisar e Selecionar Produto para Entrada',
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    const searchInput = overlay.querySelector('#modal-search-prod-input');
    const resultsContainer = overlay.querySelector('#modal-prod-results');
    const previewContainer = overlay.querySelector('#modal-selected-prod-preview');
    const fieldsBox = overlay.querySelector('#modal-entry-item-fields');
    const packageSelect = overlay.querySelector('#m-item-package-select');
    const batchInput = overlay.querySelector('#m-item-batch');
    const expiryInput = overlay.querySelector('#m-item-expiry');
    const qtyInput = overlay.querySelector('#m-item-qty');
    const costInput = overlay.querySelector('#m-item-cost');
    const salePriceInput = overlay.querySelector('#m-item-sale-price');
    const confirmBtn = overlay.querySelector('#m-btn-add-item-confirm');
    const cancelBtn = overlay.querySelector('#m-btn-cancel-item');

    let selectedProd = null;

    cancelBtn?.addEventListener('click', () => modal.close());

    const renderSelectedPreview = (prod) => {
      const baseUnitSym = prod.product_units?.symbol || 'un';
      previewContainer.style.display = 'block';
      previewContainer.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: var(--radius-sm); padding: 0.85rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
            <div>
              <span class="badge badge-success" style="font-size: 0.675rem; margin-bottom: 0.25rem;">PRODUTO SELECIONADO</span>
              <div style="font-size: 1rem; font-weight: 700; color: var(--text-main);">${escapeHtml(prod.name)}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                ${escapeHtml(prod.category || 'Geral')} • ${escapeHtml(prod.dosage || '')} ${escapeHtml(prod.presentation || '')}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-reselect-prod" style="font-size: 0.75rem; white-space: nowrap;">
              🔄 Trocar Produto
            </button>
          </div>
          <div style="display: flex; gap: 1rem; margin-top: 0.5rem; font-size: 0.775rem; color: var(--text-dim); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.45rem;">
            <div><strong>Estoque Atual:</strong> ${prod.current_stock_base} ${baseUnitSym}</div>
            <div><strong>Preço Venda Atual:</strong> ${formatCurrency(prod.sale_price_base)}</div>
            <div><strong>Custo Base Atual:</strong> ${formatCurrency(prod.cost_price_base)}</div>
          </div>
        </div>
      `;

      previewContainer.querySelector('#btn-reselect-prod')?.addEventListener('click', () => {
        selectedProd = null;
        previewContainer.style.display = 'none';
        fieldsBox.style.display = 'none';
        confirmBtn.disabled = true;
        resultsContainer.style.display = 'block';
        loadProducts(searchInput.value);
      });
    };

    const loadProducts = async (q = '') => {
      resultsContainer.innerHTML = `<div class="skeleton" style="height: 60px;"></div>`;
      try {
        const prods = await db.getProducts({ search: q, limit: 30 });
        if (prods.length === 0) {
          resultsContainer.innerHTML = `
            <div class="empty-state" style="padding: 1.25rem 1rem;">
              <p>${t('no_prods_found_term')}</p>
              <button class="btn btn-primary btn-sm" id="btn-create-from-not-found" style="margin-top: 0.5rem;">
                + Cadastrar Novo Produto
              </button>
            </div>
          `;
          resultsContainer.querySelector('#btn-create-from-not-found')?.addEventListener('click', () => {
            modal.close();
            this.openCreateProductModal();
          });
          return;
        }

        resultsContainer.innerHTML = `
          <div style="font-size: 0.75rem; color: var(--text-dim); margin-bottom: 0.4rem; font-weight: 600; display: flex; justify-content: space-between;">
            <span>${q.trim() ? `${prods.length} ${t('prods_found_lbl')}:` : `${t('catalog_prods_lbl')} (Clique para selecionar):`}</span>
            <span>Estoque / Preço</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.35rem;">
            ${prods.map(p => `
              <div class="prod-search-result-item" data-id="${p.id}" style="padding: 0.6rem 0.75rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; transition: background 0.1s ease, border-color 0.1s ease; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="font-size: 0.88rem; color: var(--text-main);">${escapeHtml(p.name)}</strong>
                  <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 1px;">
                    ${escapeHtml(p.category || 'Geral')} • ${escapeHtml(p.dosage || '')} ${escapeHtml(p.presentation || '')}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="text-align: right;">
                    <span class="badge ${p.current_stock_base > 0 ? 'badge-success' : 'badge-danger'}" style="font-size: 0.7rem;">
                      ${t('stock')}: ${p.current_stock_base} ${p.product_units?.symbol || 'un'}
                    </span>
                    <div style="font-size: 0.75rem; color: var(--color-primary); font-weight: 700; margin-top: 2px;">
                      ${formatCurrency(p.sale_price_base)}
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; pointer-events: none;">
                    Selecionar
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        resultsContainer.querySelectorAll('.prod-search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            selectedProd = prods.find(p => p.id === id);
            resultsContainer.style.display = 'none';
            renderSelectedPreview(selectedProd);
            fieldsBox.style.display = 'block';
            confirmBtn.disabled = false;

            // Populate packages
            const baseUnitSym = selectedProd.product_units?.symbol || 'un';
            const pkgs = selectedProd.product_packages || [];
            packageSelect.innerHTML = `
              <option value="base" data-multiplier="1" data-unit-id="${selectedProd.base_unit_id}">${t('base_unit_lbl')} (${baseUnitSym}) - Multiplicador 1</option>
              ${pkgs.map(pkg => `
                <option value="${pkg.id}" data-multiplier="${pkg.multiplier_to_base}" data-unit-id="${pkg.unit_id}">
                  ${escapeHtml(pkg.package_name)} (x${pkg.multiplier_to_base} ${baseUnitSym})
                </option>
              `).join('')}
            `;

            salePriceInput.value = selectedProd.sale_price_base || '0.00';
            costInput.value = selectedProd.cost_price_base || '0.00';
          });
        });
      } catch (err) {
        resultsContainer.innerHTML = `<div class="empty-state" style="padding: 1rem; color: var(--color-danger);"><p>Error searching products.</p></div>`;
      }
    };

    // Eagerly load existing products right away so the user sees existing items immediately!
    loadProducts('');

    searchInput?.addEventListener('input', debounce((e) => {
      loadProducts(e.target.value);
    }, 250));

    confirmBtn?.addEventListener('click', () => {
      if (!selectedProd) return;
      const batchNum = batchInput.value.trim() || `LOT-${new Date().getFullYear()}`;
      const expiry = expiryInput.value || new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const qty = Number(qtyInput.value) || 1;
      const cost = Number(costInput.value) || 0;
      const salePrice = Number(salePriceInput.value) || 0;

      if (qty <= 0) {
        notify.error('Informe uma quantidade válida (mínimo 1).');
        return;
      }

      const selectedOpt = packageSelect.selectedOptions[0];
      const multiplier = Number(selectedOpt.getAttribute('data-multiplier')) || 1;
      const unitId = selectedOpt.getAttribute('data-unit-id');
      const unitName = selectedOpt.textContent.trim();

      this.entryItems.push({
        product_id: selectedProd.id,
        product_name: selectedProd.name,
        dosage: selectedProd.dosage,
        presentation: selectedProd.presentation,
        batch_number: batchNum,
        expiry_date: expiry,
        unit_id: unitId,
        unit_name: unitName,
        quantity: qty,
        multiplier_to_base: multiplier,
        unit_cost: cost,
        sale_price_base: salePrice
      });

      modal.close();
      this.renderItemsTable();
      notify.success(`Item adicionado à lista.`);
    });
  },

  async openCreateProductModal() {
    const categories = await db.getCategories();

    const modalContent = `
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label">${t('prod_name')}</label>
          <input type="text" id="m-new-prod-name" class="form-control" placeholder="Ex: Paracetamol" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">${t('category')} *</label>
            <button type="button" id="btn-toggle-new-cat" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 2px 8px; color: var(--color-primary); border-color: rgba(16, 185, 129, 0.3);">
              ${t('btn_new_category')}
            </button>
          </div>
          <select id="m-new-prod-category" class="form-select">
            <option value="">${t('select_category')}</option>
            ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>

          <!-- Inline Category Creator -->
          <div id="inline-cat-creator" style="display: none; background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--color-primary);">${t('new_category_title')}</div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="inline-cat-name-input" class="form-control" placeholder="${t('new_category_placeholder')}" style="flex: 1; font-size: 0.85rem;" />
              <button type="button" id="btn-inline-cat-save" class="btn btn-sm btn-primary">${t('save')}</button>
              <button type="button" id="btn-inline-cat-cancel" class="btn btn-sm btn-secondary">${t('cancel')}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('active_substance')}</label>
          <input type="text" id="m-new-prod-generic" class="form-control" placeholder="Ex: Paracetamol" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('dosage_concentration')}</label>
          <input type="text" id="m-new-prod-dosage" class="form-control" placeholder="Ex: 500mg, 10mg/ml" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('presentation_form')}</label>
          <input type="text" id="m-new-prod-pres" class="form-control" placeholder="Ex: Comprimidos, Xarope" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('base_unit_select')}</label>
          <select id="m-new-prod-base-unit" class="form-select">
            ${this.units.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.symbol)})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('barcode')}</label>
          <input type="text" id="m-new-prod-barcode" class="form-control" placeholder="789..." />
        </div>
        <div class="form-group">
          <label class="form-label">${t('manufacturer_lab')}</label>
          <input type="text" id="m-new-prod-manufacturer" class="form-control" placeholder="Ex: EMS, Medley" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('cost_price_base')}</label>
          <input type="number" id="m-new-prod-cost-price" class="form-control" step="0.01" min="0" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('sale_price_base')}</label>
          <input type="number" id="m-new-prod-sale-price" class="form-control" step="0.01" min="0" placeholder="0.00" />
        </div>
      </div>

      <!-- Live Profit Margin Indicator -->
      <div id="m-new-prod-margin-box" style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; border: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text-muted);">${t('gross_margin_projection')}</span>
        <strong id="m-new-prod-margin-text" style="color: var(--color-success); font-size: 0.9rem;">0,00 MT (0.0%)</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('min_stock')}</label>
          <input type="number" id="m-new-prod-min-stock" class="form-control" min="0" value="10" />
        </div>
      </div>

      <!-- Dados do Lote & Entrada de Estoque Imediata -->
      <div style="background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm); padding: 0.85rem; margin-top: 0.75rem; margin-bottom: 0.5rem;">
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-primary); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
          <span>📦</span> Informações do Lote & Entrada Imediata
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Número do Lote</label>
            <input type="text" id="m-new-prod-batch-num" class="form-control" value="LOT-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}" placeholder="Ex: LOT-2026-001" />
          </div>
          <div class="form-group">
            <label class="form-label">Data de Validade</label>
            <input type="date" id="m-new-prod-expiry" class="form-control" value="${new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0]}" />
          </div>
          <div class="form-group">
            <label class="form-label">Quantidade Comprada *</label>
            <input type="number" id="m-new-prod-qty" class="form-control" min="1" step="1" value="10" />
          </div>
        </div>
      </div>

      <!-- Live Preview em Tempo Real Antes de Criar -->
      <div id="m-new-prod-live-preview-box" style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.85rem; margin-top: 0.75rem;">
        <div style="font-size: 0.725rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.45rem; display: flex; align-items: center; gap: 0.4rem;">
          <span>👁️</span> Preview do Produto (Antes de Criar)
        </div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <div>
            <strong id="preview-prod-name" style="font-size: 0.95rem; color: var(--text-main);">Novo Medicamento</strong>
            <div id="preview-prod-details" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
              Geral • Dosagem / Apresentação
            </div>
            <div id="preview-prod-batch" style="font-size: 0.75rem; color: var(--color-primary); margin-top: 3px;">
              Lote: LOT-2026 | Validade: 2028
            </div>
          </div>
          <div style="text-align: right;">
            <div id="preview-prod-price" style="font-size: 1.1rem; font-weight: 800; color: var(--color-primary);">0,00 MT</div>
            <div id="preview-prod-qty" style="font-size: 0.75rem; color: var(--text-muted);">Qtd: 10 un</div>
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-new-prod">${t('cancel')}</button>
      <button class="btn btn-primary" id="m-btn-save-new-prod">Cadastrar e Adicionar à Entrada</button>
    `;

    const overlay = modal.open({
      title: t('create_new_prod_modal_title'),
      contentHtml: modalContent,
      footerHtml,
      size: 'lg'
    });

    const costInput = overlay.querySelector('#m-new-prod-cost-price');
    const saleInput = overlay.querySelector('#m-new-prod-sale-price');
    const marginText = overlay.querySelector('#m-new-prod-margin-text');

    const updateMargin = () => {
      const c = Number(costInput.value) || 0;
      const s = Number(saleInput.value) || 0;
      const profit = s - c;
      const pct = s > 0 ? ((profit / s) * 100).toFixed(1) : '0.0';
      marginText.textContent = `${formatCurrency(profit)} (${pct}%)`;
      marginText.style.color = profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
    };

    costInput?.addEventListener('input', updateMargin);
    saleInput?.addEventListener('input', updateMargin);

    const catSelect = overlay.querySelector('#m-new-prod-category');
    const toggleCatBtn = overlay.querySelector('#btn-toggle-new-cat');
    const inlineCreator = overlay.querySelector('#inline-cat-creator');
    const catInput = overlay.querySelector('#inline-cat-name-input');
    const saveCatBtn = overlay.querySelector('#btn-inline-cat-save');
    const cancelCatBtn = overlay.querySelector('#btn-inline-cat-cancel');

    if (toggleCatBtn && inlineCreator) {
      toggleCatBtn.addEventListener('click', () => {
        const isHidden = inlineCreator.style.display === 'none';
        inlineCreator.style.display = isHidden ? 'block' : 'none';
        if (isHidden && catInput) catInput.focus();
      });

      cancelCatBtn?.addEventListener('click', () => {
        inlineCreator.style.display = 'none';
        if (catInput) catInput.value = '';
      });

      saveCatBtn?.addEventListener('click', async () => {
        const catName = catInput.value.trim();
        if (!catName) {
          notify.error(t('fill_category_name_alert'));
          return;
        }
        try {
          const updated = await db.createCategory(catName);
          catSelect.innerHTML = `
            <option value="">${t('select_category')}</option>
            ${updated.map(c => `<option value="${escapeHtml(c)}" ${c.toLowerCase() === catName.toLowerCase() ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          `;
          catSelect.value = catName;
          inlineCreator.style.display = 'none';
          catInput.value = '';
          notify.success(t('category_saved_success'));
        } catch (err) {
          notify.error(err.message || 'Error saving category');
        }
      });
    }

    const cancelBtn = overlay.querySelector('#m-btn-cancel-new-prod');
    const saveBtn = overlay.querySelector('#m-btn-save-new-prod');

    const nameInput = overlay.querySelector('#m-new-prod-name');
    const genericInput = overlay.querySelector('#m-new-prod-generic');
    const dosageInput = overlay.querySelector('#m-new-prod-dosage');
    const presInput = overlay.querySelector('#m-new-prod-pres');
    const baseUnitSelect = overlay.querySelector('#m-new-prod-base-unit');
    const batchInput = overlay.querySelector('#m-new-prod-batch-num');
    const expiryInput = overlay.querySelector('#m-new-prod-expiry');
    const qtyInput = overlay.querySelector('#m-new-prod-qty');

    const updateLivePreview = () => {
      const pName = overlay.querySelector('#preview-prod-name');
      const pDetails = overlay.querySelector('#preview-prod-details');
      const pBatch = overlay.querySelector('#preview-prod-batch');
      const pPrice = overlay.querySelector('#preview-prod-price');
      const pQty = overlay.querySelector('#preview-prod-qty');

      if (pName) pName.textContent = nameInput?.value.trim() || 'Novo Medicamento';
      if (pDetails) {
        const cat = catSelect?.value || 'Geral';
        const d = dosageInput?.value.trim() || '';
        const pr = presInput?.value.trim() || '';
        pDetails.textContent = `${cat}${d ? ` • ${d}` : ''}${pr ? ` ${pr}` : ''}`;
      }
      if (pBatch) {
        const b = batchInput?.value.trim() || 'LOTE';
        const e = expiryInput?.value || 'Sem data';
        pBatch.textContent = `Lote: ${b} | Validade: ${e}`;
      }
      if (pPrice) {
        const s = Number(saleInput?.value) || 0;
        pPrice.textContent = formatCurrency(s);
      }
      if (pQty) {
        const q = Number(qtyInput?.value) || 1;
        const u = baseUnitSelect?.options[baseUnitSelect.selectedIndex]?.text || 'un';
        pQty.textContent = `Qtd: ${q} (${u})`;
      }
    };

    [nameInput, genericInput, dosageInput, presInput, baseUnitSelect, batchInput, expiryInput, qtyInput, saleInput, catSelect].forEach(el => {
      el?.addEventListener('input', updateLivePreview);
      el?.addEventListener('change', updateLivePreview);
    });
    updateLivePreview();

    cancelBtn?.addEventListener('click', () => modal.close());

    saveBtn?.addEventListener('click', async () => {
      const name = overlay.querySelector('#m-new-prod-name').value.trim();
      const category = catSelect ? catSelect.value.trim() : '';
      const generic = overlay.querySelector('#m-new-prod-generic').value.trim();
      const dosage = overlay.querySelector('#m-new-prod-dosage').value.trim();
      const pres = overlay.querySelector('#m-new-prod-pres').value.trim();
      const baseUnitId = overlay.querySelector('#m-new-prod-base-unit').value;
      const barcode = overlay.querySelector('#m-new-prod-barcode').value.trim();
      const manufacturer = overlay.querySelector('#m-new-prod-manufacturer').value.trim();
      const costPrice = Number(overlay.querySelector('#m-new-prod-cost-price').value) || 0;
      const salePrice = Number(overlay.querySelector('#m-new-prod-sale-price').value) || 0;
      const minStock = Number(overlay.querySelector('#m-new-prod-min-stock').value) || 0;

      if (!name) {
        notify.error(t('fill_product_name_alert'));
        return;
      }

      const batchNum = overlay.querySelector('#m-new-prod-batch-num')?.value.trim() || `LOT-${new Date().getFullYear()}`;
      const expiry = overlay.querySelector('#m-new-prod-expiry')?.value || new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
      const qty = Number(overlay.querySelector('#m-new-prod-qty')?.value) || 1;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Cadastrando e adicionando...';

      try {
        const newProd = await db.createProduct({
          name,
          category: category || 'Geral',
          generic_name: generic || null,
          dosage: dosage || null,
          presentation: pres || null,
          base_unit_id: baseUnitId || null,
          barcode: barcode || null,
          manufacturer: manufacturer || null,
          cost_price_base: costPrice,
          sale_price_base: salePrice,
          min_stock_base: minStock,
          current_stock_base: 0
        });

        const selectedUnit = this.units.find(u => u.id === baseUnitId);
        const unitName = selectedUnit ? `${selectedUnit.name} (${selectedUnit.symbol})` : 'Unidade (un)';

        // Add directly to warehouse entry items!
        if (qty > 0) {
          this.entryItems.push({
            product_id: newProd.id,
            product_name: newProd.name,
            dosage: newProd.dosage,
            presentation: newProd.presentation,
            batch_number: batchNum,
            expiry_date: expiry,
            unit_id: baseUnitId || null,
            unit_name: unitName,
            quantity: qty,
            multiplier_to_base: 1,
            unit_cost: costPrice,
            sale_price_base: salePrice
          });
          this.renderItemsTable();
        }

        modal.close();
        notify.success(`Produto "${name}" cadastrado e adicionado à entrada com sucesso!`);
      } catch (err) {
        notify.error(err.message || 'Erro ao cadastrar produto');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Cadastrar e Adicionar à Entrada';
      }
    });
  },

  openSupplierCreateModal(parentContainer) {
    const modalContent = `
      <div class="form-group">
        <label class="form-label">${t('supplier_name_lbl')}</label>
        <input type="text" id="m-supp-name" class="form-control" placeholder="Distribuidora Farmacêutica Moçambique" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('supplier_nuit_lbl')}</label>
          <input type="text" id="m-supp-tax" class="form-control" placeholder="400012345" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('supplier_phone_lbl')}</label>
          <input type="text" id="m-supp-phone" class="form-control" placeholder="+258 84 123 4567" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${t('supplier_email_lbl')}</label>
        <input type="email" id="m-supp-email" class="form-control" placeholder="pedidos@distribuidora.co.mz" />
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-supp">${t('cancel')}</button>
      <button class="btn btn-primary" id="m-btn-save-supp">${t('btn_save_supplier')}</button>
    `;

    const overlay = modal.open({
      title: t('btn_save_supplier'),
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    const cancelBtn = overlay.querySelector('#m-btn-cancel-supp');
    const saveBtn = overlay.querySelector('#m-btn-save-supp');

    cancelBtn?.addEventListener('click', () => modal.close());

    saveBtn?.addEventListener('click', async () => {
      const name = overlay.querySelector('#m-supp-name').value.trim();
      const tax = overlay.querySelector('#m-supp-tax').value.trim();
      const phone = overlay.querySelector('#m-supp-phone').value.trim();
      const email = overlay.querySelector('#m-supp-email').value.trim();

      if (!name) {
        notify.error('Informe a razão social ou nome.');
        return;
      }

      saveBtn.disabled = true;

      try {
        const supp = await db.createSupplier({
          name,
          tax_id: tax || null,
          phone: phone || null,
          email: email || null
        });

        modal.close();
        notify.success(t('supplier_saved_success'));
        await this.loadSuppliersAndUnits(parentContainer);
        const sel = parentContainer.querySelector('#entry-supplier-select');
        if (sel) sel.value = supp.id;
      } catch (e) {
        notify.error(e.message || 'Error saving supplier');
        saveBtn.disabled = false;
      }
    });
  },

  async confirmWarehouseEntry(container) {
    const supplierId = container.querySelector('#entry-supplier-select').value;
    const invoiceNumber = container.querySelector('#entry-invoice-number').value.trim();
    const purchaseDate = container.querySelector('#entry-purchase-date').value;
    const notes = container.querySelector('#entry-notes').value.trim();
    const confirmBtn = container.querySelector('#btn-confirm-warehouse-entry');

    if (this.entryItems.length === 0) {
      notify.error('Adicione pelo menos um item à entrada de estoque.');
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = t('confirm_entry_processing');

    try {
      const payloadItems = this.entryItems.map(item => ({
        product_id: item.product_id,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        unit_id: item.unit_id,
        quantity: item.quantity,
        multiplier_to_base: item.multiplier_to_base,
        unit_cost: item.unit_cost,
        sale_price_base: item.sale_price_base
      }));

      const res = await db.registerPurchaseEntry({
        supplierId,
        invoiceNumber,
        purchaseDate,
        notes,
        items: payloadItems
      });

      notify.success(`${t('entry_confirmed_success')} Total: ${formatCurrency(res.total_amount)}`);

      // Reset form
      this.entryItems = [];
      this.renderItemsTable();
      container.querySelector('#entry-invoice-number').value = '';
      container.querySelector('#entry-notes').value = '';
      confirmBtn.disabled = false;
      confirmBtn.textContent = t('btn_confirm_entry');
    } catch (err) {
      console.error('Purchase entry error:', err);
      notify.error(err.message || 'Erro ao registrar entrada.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = t('btn_confirm_entry');
    }
  },

  async openPurchasesHistoryModal() {
    try {
      const history = await db.getPurchasesHistory();

      const modalContent = `
        ${history.length === 0 ? `
          <div class="empty-state"><p>${t('empty_list')}</p></div>
        ` : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t('date')}</th>
                  <th>${t('invoice_no_lbl')}</th>
                  <th>${t('supplier_lbl')}</th>
                  <th>${t('quantity')}</th>
                  <th>${t('total')}</th>
                  <th>${t('cashier')}</th>
                </tr>
              </thead>
              <tbody>
                ${history.map(p => `
                  <tr>
                    <td>${formatDate(p.purchase_date)}</td>
                    <td><strong>${escapeHtml(p.invoice_number || 'S/N')}</strong></td>
                    <td>${escapeHtml(p.suppliers?.name || '—')}</td>
                    <td>${p.purchase_items?.length || 0} ${t('th_item_prod')}</td>
                    <td><strong>${formatCurrency(p.total_amount)}</strong></td>
                    <td>${escapeHtml(p.profiles?.full_name || 'Admin')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      `;

      modal.open({
        title: t('purchases_history_title'),
        contentHtml: modalContent,
        size: 'lg'
      });
    } catch (e) {
      notify.error('Erro ao consultar histórico de compras.');
    }
  }
};

