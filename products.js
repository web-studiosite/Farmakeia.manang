/**
 * FARMAKEIA — Products & Presentations Catalog Module
 */

import { db } from './database.js';
import { state } from './state.js';
import { formatCurrency, debounce, escapeHtml } from './utils.js';
import { notify } from './notifications.js';
import { modal } from './modal.js';
import { t } from './i18n.js';

export const productsView = {
  products: [],
  units: [],

  async render(container) {
    if (!state.activeStore) {
      container.innerHTML = `<div class="empty-state"><h3>${t('no_pharmacy_title')}</h3></div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 700;">${t('prod_catalog_title')}</h2>
          <p style="font-size: 0.875rem; color: var(--text-muted);">
            ${t('prod_catalog_subtitle')}
          </p>
        </div>
        ${state.isAdmin() ? `
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-primary" id="btn-create-new-product">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              ${t('new_product_btn')}
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Search Bar -->
      <div class="card" style="margin-bottom: 1.5rem; padding: 1rem;">
        <input 
          type="text" 
          id="products-catalog-search" 
          class="form-control" 
          placeholder="${t('search_prod_placeholder')}" 
        />
      </div>

      <!-- Products Table -->
      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t('th_product_dcb')}</th>
                <th>${t('th_pres_dos')}</th>
                <th>${t('th_code_ean')}</th>
                <th>${t('th_current_stock')}</th>
                ${state.isAdmin() ? `<th>${t('th_cost_base')}</th>` : ''}
                <th>${t('th_sale_base')}</th>
                ${state.isAdmin() ? `<th>${t('th_est_margin')}</th>` : ''}
                <th>${t('th_packages')}</th>
                ${state.isAdmin() ? `<th>${t('th_actions')}</th>` : ''}
              </tr>
            </thead>
            <tbody id="products-table-tbody">
              <tr>
                <td colspan="${state.isAdmin() ? 9 : 6}" style="text-align: center; padding: 2rem;">
                  <div class="skeleton" style="height: 30px;"></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadData(container);
    this.initEvents(container);
  },

  async loadData(container, search = '') {
    try {
      const [prods, units] = await Promise.all([
        db.getProducts({ search, limit: 100 }),
        db.getProductUnits()
      ]);
      this.products = prods;
      this.units = units;
      this.renderTable(container);
    } catch (e) {
      console.error('Error loading products:', e);
      notify.error(e.message || 'Error loading catalog');
    }
  },

  renderTable(container) {
    const tbody = container.querySelector('#products-table-tbody');
    if (!tbody) return;

    if (this.products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem;">
            ${t('empty_list')}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.products.map(p => {
      const stock = Number(p.current_stock_base) || 0;
      const minStock = Number(p.min_stock_base) || 0;
      const unitSym = p.product_units?.symbol || 'un';
      const packages = p.product_packages || [];

      return `
        <tr>
          <td>
            <div style="font-size: 0.7rem; color: var(--color-primary); font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">
              📁 ${escapeHtml(p.category || 'Geral')}
            </div>
            <strong>${escapeHtml(p.name)}</strong>
            ${p.generic_name ? `<div style="font-size: 0.75rem; color: var(--text-muted);">DCB / Gen.: ${escapeHtml(p.generic_name)}</div>` : ''}
          </td>
          <td>${escapeHtml(p.dosage || '')} ${escapeHtml(p.presentation || '')}</td>
          <td>
            <code>${escapeHtml(p.barcode || p.code || '—')}</code>
          </td>
          <td>
            <span class="badge ${stock <= minStock ? 'badge-danger' : 'badge-success'}">
              ${stock} ${unitSym}
            </span>
          </td>
          ${state.isAdmin() ? `<td>${formatCurrency(p.cost_price_base)}</td>` : ''}
          <td><strong style="color: var(--color-primary);">${formatCurrency(p.sale_price_base)}</strong></td>
          ${state.isAdmin() ? `
            <td>
              <span class="badge ${(p.sale_price_base - (p.cost_price_base || 0)) >= 0 ? 'badge-success' : 'badge-danger'}" title="Lucro Bruto Unitário: ${formatCurrency(p.sale_price_base - (p.cost_price_base || 0))}">
                ${p.sale_price_base > 0 ? (((p.sale_price_base - (p.cost_price_base || 0)) / p.sale_price_base) * 100).toFixed(1) : '0'}%
              </span>
            </td>
          ` : ''}
          <td>
            ${packages.length === 0 ? `<span style="color:var(--text-muted); font-size:0.8rem;">${t('base_unit_lbl')}</span>` : `
              <div style="font-size: 0.75rem;">
                ${packages.map(pkg => `<div class="badge badge-info" style="margin-bottom:2px;">${escapeHtml(pkg.package_name)} (${formatCurrency(pkg.sale_price)})</div>`).join('')}
              </div>
            `}
          </td>
          ${state.isAdmin() ? `
            <td>
              <div style="display: flex; gap: 0.35rem;">
                <button class="btn btn-secondary btn-sm btn-edit-prod" data-id="${p.id}">${t('btn_edit')}</button>
                <button class="btn btn-secondary btn-sm btn-packages-prod" data-id="${p.id}" title="${t('manage_packages_title')}">${t('btn_packages')}</button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-edit-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = this.products.find(p => p.id === id);
        if (prod) this.openEditProductModal(prod, container);
      });
    });

    tbody.querySelectorAll('.btn-packages-prod').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = this.products.find(p => p.id === id);
        if (prod) this.openPackagesModal(prod, container);
      });
    });
  },

  initEvents(container) {
    const searchInput = container.querySelector('#products-catalog-search');
    const newBtn = container.querySelector('#btn-create-new-product');

    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => {
        this.loadData(container, e.target.value);
      }, 300));
    }

    if (newBtn) {
      newBtn.addEventListener('click', () => this.openCreateModal(container));
    }
  },

  async openCreateModal(container) {
    const categories = await db.getCategories();

    const modalContent = `
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label">${t('prod_name')}</label>
          <input type="text" id="m-new-name" class="form-control" placeholder="Ex: Amoxicilina + Clavulanato" required />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">${t('category')} *</label>
            <button type="button" id="btn-toggle-new-cat-p" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 2px 8px; color: var(--color-primary); border-color: rgba(16, 185, 129, 0.3);">
              ${t('btn_new_category')}
            </button>
          </div>
          <select id="m-new-category" class="form-select">
            <option value="">${t('select_category')}</option>
            ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>

          <!-- Inline Category Creator -->
          <div id="inline-cat-creator-p" style="display: none; background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--color-primary);">${t('new_category_title')}</div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="inline-cat-name-input-p" class="form-control" placeholder="${t('new_category_placeholder')}" style="flex: 1; font-size: 0.85rem;" />
              <button type="button" id="btn-inline-cat-save-p" class="btn btn-sm btn-primary">${t('save')}</button>
              <button type="button" id="btn-inline-cat-cancel-p" class="btn btn-sm btn-secondary">${t('cancel')}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('active_substance')}</label>
          <input type="text" id="m-new-generic" class="form-control" placeholder="Ex: Amoxicilina" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('dosage_concentration')}</label>
          <input type="text" id="m-new-dosage" class="form-control" placeholder="Ex: 500mg + 125mg" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('presentation_form')}</label>
          <input type="text" id="m-new-pres" class="form-control" placeholder="Ex: Comprimidos Revestidos" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('base_unit_select')}</label>
          <select id="m-new-unit" class="form-select">
            ${this.units.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.symbol)})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('cost_price_base')}</label>
          <input type="number" id="m-new-cost-price" class="form-control" step="0.01" min="0" value="0.00" placeholder="0.00" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('sale_price_base')}</label>
          <input type="number" id="m-new-sale-price" class="form-control" step="0.01" min="0" value="0.00" placeholder="0.00" />
        </div>
      </div>

      <!-- Live Profit Margin Indicator -->
      <div id="m-new-margin-box" style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; border: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text-muted);">${t('gross_margin_projection')}</span>
        <strong id="m-new-margin-text" style="color: var(--color-success); font-size: 0.9rem;">0,00 MT (0.0%)</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('barcode')}</label>
          <input type="text" id="m-new-barcode" class="form-control" placeholder="789..." />
        </div>
        <div class="form-group">
          <label class="form-label">${t('min_stock')}</label>
          <input type="number" id="m-new-min-stock" class="form-control" min="0" value="10" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label">${t('manufacturer_lab')}</label>
          <input type="text" id="m-new-manuf" class="form-control" placeholder="Ex: Eurofarma, EMS, Medley" />
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-p">${t('cancel')}</button>
      <button class="btn btn-primary" id="m-btn-save-p">${t('save')}</button>
    `;

    const overlay = modal.open({
      title: t('create_new_prod_modal_title'),
      contentHtml: modalContent,
      footerHtml,
      size: 'lg'
    });

    const costInput = overlay.querySelector('#m-new-cost-price');
    const saleInput = overlay.querySelector('#m-new-sale-price');
    const marginText = overlay.querySelector('#m-new-margin-text');
    const catSelect = overlay.querySelector('#m-new-category');
    const toggleCatBtn = overlay.querySelector('#btn-toggle-new-cat-p');
    const inlineCreator = overlay.querySelector('#inline-cat-creator-p');
    const catInput = overlay.querySelector('#inline-cat-name-input-p');
    const saveCatBtn = overlay.querySelector('#btn-inline-cat-save-p');
    const cancelCatBtn = overlay.querySelector('#btn-inline-cat-cancel-p');

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

    overlay.querySelector('#m-btn-cancel-p')?.addEventListener('click', () => modal.close());

    const saveBtnP = overlay.querySelector('#m-btn-save-p');
    saveBtnP?.addEventListener('click', async () => {
      const name = overlay.querySelector('#m-new-name').value.trim();
      const category = catSelect ? catSelect.value.trim() : '';
      const generic = overlay.querySelector('#m-new-generic').value.trim();
      const dosage = overlay.querySelector('#m-new-dosage').value.trim();
      const pres = overlay.querySelector('#m-new-pres').value.trim();
      const baseUnitId = overlay.querySelector('#m-new-unit').value;
      const barcode = overlay.querySelector('#m-new-barcode').value.trim();
      const costPrice = Number(costInput.value) || 0;
      const salePrice = Number(saleInput.value) || 0;
      const minStock = Number(overlay.querySelector('#m-new-min-stock').value) || 0;
      const manuf = overlay.querySelector('#m-new-manuf').value.trim();

      if (!name) {
        notify.error(t('fill_product_name_alert'));
        return;
      }

      saveBtnP.disabled = true;
      saveBtnP.textContent = t('saving_prod_msg') || 'Salvando...';

      try {
        await db.createProduct({
          name,
          category: category || 'Geral',
          generic_name: generic || null,
          dosage: dosage || null,
          presentation: pres || null,
          base_unit_id: baseUnitId || null,
          barcode: barcode || null,
          cost_price_base: costPrice,
          sale_price_base: salePrice,
          min_stock_base: minStock,
          manufacturer: manuf || null,
          current_stock_base: 0
        });

        modal.close();
        notify.success(`${t('product_saved_success')} (${name})`);
        await this.loadData(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao cadastrar produto');
        saveBtnP.disabled = false;
        saveBtnP.textContent = t('save') || 'Salvar';
      }
    });
  },

  async openEditProductModal(product, container) {
    const categories = await db.getCategories();

    const modalContent = `
      <div class="form-group">
        <label class="form-label">${t('prod_name')}</label>
        <input type="text" id="m-edit-name" class="form-control" value="${escapeHtml(product.name)}" required />
      </div>

      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">${t('category')} *</label>
            <button type="button" id="btn-toggle-edit-cat-p" class="btn btn-sm btn-secondary" style="font-size: 0.75rem; padding: 2px 8px; color: var(--color-primary); border-color: rgba(16, 185, 129, 0.3);">
              ${t('btn_new_category')}
            </button>
          </div>
          <select id="m-edit-category" class="form-select">
            <option value="">${t('select_category')}</option>
            ${categories.map(c => `<option value="${escapeHtml(c)}" ${c.toLowerCase() === (product.category || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>

          <!-- Inline Category Creator -->
          <div id="inline-cat-creator-edit-p" style="display: none; background: var(--bg-surface-elevated); padding: 0.65rem; border-radius: var(--radius-sm); margin-top: 0.5rem; border: 1px solid var(--border-color);">
            <div style="font-size: 0.75rem; font-weight: 700; margin-bottom: 0.35rem; color: var(--color-primary);">${t('new_category_title')}</div>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="inline-cat-name-input-edit-p" class="form-control" placeholder="${t('new_category_placeholder')}" style="flex: 1; font-size: 0.85rem;" />
              <button type="button" id="btn-inline-cat-save-edit-p" class="btn btn-sm btn-primary">${t('save')}</button>
              <button type="button" id="btn-inline-cat-cancel-edit-p" class="btn btn-sm btn-secondary">${t('cancel')}</button>
            </div>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('active_substance')}</label>
          <input type="text" id="m-edit-generic" class="form-control" value="${escapeHtml(product.generic_name || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('dosage_concentration')}</label>
          <input type="text" id="m-edit-dosage" class="form-control" value="${escapeHtml(product.dosage || '')}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('presentation_form')}</label>
          <input type="text" id="m-edit-pres" class="form-control" value="${escapeHtml(product.presentation || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('barcode')}</label>
          <input type="text" id="m-edit-barcode" class="form-control" value="${escapeHtml(product.barcode || '')}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('cost_price_base')}</label>
          <input type="number" id="m-edit-cost-price" class="form-control" step="0.01" min="0" value="${product.cost_price_base || 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">${t('sale_price_base')}</label>
          <input type="number" id="m-edit-sale-price" class="form-control" step="0.01" min="0" value="${product.sale_price_base}" />
        </div>
      </div>

      <!-- Live Profit Margin Indicator -->
      <div id="m-edit-margin-box" style="background: var(--bg-surface-elevated); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); margin-bottom: 1rem; border: 1px dashed var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text-muted);">${t('gross_margin_projection')}</span>
        <strong id="m-edit-margin-text" style="color: var(--color-success); font-size: 0.9rem;">0,00 MT (0.0%)</strong>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${t('min_stock')}</label>
          <input type="number" id="m-edit-min-stock" class="form-control" min="0" value="${product.min_stock_base}" />
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="btn btn-secondary" id="m-btn-cancel-edit">${t('cancel')}</button>
      <button class="btn btn-primary" id="m-btn-save-edit">${t('save')}</button>
    `;

    const overlay = modal.open({
      title: `${t('edit_product_title')}: ${product.name}`,
      contentHtml: modalContent,
      footerHtml,
      size: 'md'
    });

    const costInput = overlay.querySelector('#m-edit-cost-price');
    const saleInput = overlay.querySelector('#m-edit-sale-price');
    const marginText = overlay.querySelector('#m-edit-margin-text');
    const catSelect = overlay.querySelector('#m-edit-category');
    const toggleCatBtn = overlay.querySelector('#btn-toggle-edit-cat-p');
    const inlineCreator = overlay.querySelector('#inline-cat-creator-edit-p');
    const catInput = overlay.querySelector('#inline-cat-name-input-edit-p');
    const saveCatBtn = overlay.querySelector('#btn-inline-cat-save-edit-p');
    const cancelCatBtn = overlay.querySelector('#btn-inline-cat-cancel-edit-p');

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
    updateMargin();

    overlay.querySelector('#m-btn-cancel-edit')?.addEventListener('click', () => modal.close());

    const saveBtnEdit = overlay.querySelector('#m-btn-save-edit');
    saveBtnEdit?.addEventListener('click', async () => {
      const name = overlay.querySelector('#m-edit-name').value.trim();
      const category = catSelect ? catSelect.value.trim() : '';
      const generic = overlay.querySelector('#m-edit-generic').value.trim();
      const dosage = overlay.querySelector('#m-edit-dosage').value.trim();
      const pres = overlay.querySelector('#m-edit-pres').value.trim();
      const costPrice = Number(costInput.value) || 0;
      const salePrice = Number(saleInput.value) || 0;
      const barcode = overlay.querySelector('#m-edit-barcode').value.trim();
      const minStock = Number(overlay.querySelector('#m-edit-min-stock').value) || 0;

      if (!name) {
        notify.error(t('fill_product_name_alert'));
        return;
      }

      saveBtnEdit.disabled = true;
      saveBtnEdit.textContent = t('saving_prod_msg') || 'Salvando...';

      try {
        await db.updateProduct(product.id, {
          name,
          category: category || 'Geral',
          generic_name: generic || null,
          dosage: dosage || null,
          presentation: pres || null,
          cost_price_base: costPrice,
          sale_price_base: salePrice,
          barcode: barcode || null,
          min_stock_base: minStock
        });

        modal.close();
        notify.success(t('product_updated_success'));
        await this.loadData(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao atualizar produto');
        saveBtnEdit.disabled = false;
        saveBtnEdit.textContent = t('save') || 'Salvar';
      }
    });
  },

  openPackagesModal(product, container) {
    const pkgs = product.product_packages || [];
    const baseUnitSym = product.product_units?.symbol || 'un';

    const modalContent = `
      <p style="color: var(--text-muted); margin-bottom: 1rem;">
        ${t('manage_packages_title')} <strong>${escapeHtml(product.name)}</strong>:
      </p>

      <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 1rem;">
        <strong style="font-size: 0.85rem; display: block; margin-bottom: 0.5rem;">${t('add_package_rule')}</strong>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('package_name_field')}</label>
            <input type="text" id="m-pkg-name" class="form-control" placeholder="Ex: Caixa com 30 cp" />
          </div>
          <div class="form-group">
            <label class="form-label">${t('multiplier_to_base_field')} (${baseUnitSym})</label>
            <input type="number" id="m-pkg-multiplier" class="form-control" min="1" value="10" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${t('package_sale_price_field')}</label>
            <input type="number" id="m-pkg-price" class="form-control" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="form-group" style="display: flex; align-items: flex-end;">
            <button class="btn btn-primary" id="m-btn-add-pkg" style="width: 100%;">${t('btn_save_package')}</button>
          </div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>${t('th_packages')}</th>
              <th>${t('multiplier_to_base_field')}</th>
              <th>${t('th_sale_base')}</th>
              <th>${t('th_actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${pkgs.length === 0 ? `
              <tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${t('no_packages_registered')}</td></tr>
            ` : pkgs.map(p => `
              <tr>
                <td><strong>${escapeHtml(p.package_name)}</strong></td>
                <td>${p.multiplier_to_base} ${baseUnitSym}</td>
                <td><strong>${formatCurrency(p.sale_price)}</strong></td>
                <td>
                  <button class="btn btn-danger btn-sm btn-del-pkg" data-pkg-id="${p.id}">${t('delete')}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const overlay = modal.open({
      title: t('manage_packages_title'),
      contentHtml: modalContent,
      size: 'md'
    });

    overlay.querySelector('#m-btn-add-pkg')?.addEventListener('click', async () => {
      const pkgName = overlay.querySelector('#m-pkg-name').value.trim();
      const mult = Number(overlay.querySelector('#m-pkg-multiplier').value) || 1;
      const price = Number(overlay.querySelector('#m-pkg-price').value) || 0;

      if (!pkgName) {
        notify.error('Informe o nome da apresentação.');
        return;
      }

      try {
        await db.createProductPackage({
          product_id: product.id,
          package_name: pkgName,
          multiplier_to_base: mult,
          sale_price: price
        });
        modal.close();
        notify.success(t('package_saved_success'));
        await this.loadData(container);
      } catch (err) {
        notify.error(err.message || 'Erro ao adicionar embalagem.');
      }
    });

    overlay.querySelectorAll('.btn-del-pkg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pkgId = btn.getAttribute('data-pkg-id');
        try {
          await db.deleteProductPackage(pkgId);
          modal.close();
          notify.success('Embalagem removida!');
          await this.loadData(container);
        } catch (err) {
          notify.error('Erro ao remover embalagem.');
        }
      });
    });
  }
};

