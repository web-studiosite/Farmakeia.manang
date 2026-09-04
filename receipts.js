/**
 * FARMAKEIA — Receipt & Ticket Printing & Sharing Module
 * Formats thermal 80mm/58mm tickets, A4 invoices, WhatsApp sharing,
 * and Web Share API integrations.
 */

import { formatCurrency, formatDateTime, escapeHtml } from './utils.js';
import { state } from './state.js';
import { notify } from './notifications.js';

export function formatPaymentMethod(method) {
  const m = String(method || '').toUpperCase();
  switch (m) {
    case 'CASH': return 'Dinheiro';
    case 'MPESA':
    case 'M-PESA': return 'M-Pesa';
    case 'EMOLA':
    case 'E-MOLA': return 'e-Mola';
    case 'CARD_POS': return 'Cartão / POS';
    case 'CARD_DEBIT': return 'Cartão de Débito';
    case 'CARD_CREDIT': return 'Cartão de Crédito';
    case 'TRANSFER': return 'Transferência Bancária';
    case 'OTHER': return 'Outro';
    default: return method || 'Dinheiro';
  }
}

export const receipts = {
  /**
   * Generates formatted thermal receipt HTML for printing or preview
   */
  generateReceiptHtml(sale, store) {
    const storeName = store?.name || state.activeStore?.name || 'FARMAKEIA';
    const storeHeader = store?.receipt_header || state.activeStore?.receipt_header || 'Drogaria & Farmácia';
    const storeFooter = store?.receipt_footer || state.activeStore?.receipt_footer || 'Obrigado pela preferência!';
    const storePhone = store?.phone || state.activeStore?.phone || '';
    const storeAddress = store?.address || state.activeStore?.address || '';
    const storeTaxId = store?.cnpj_nif || state.activeStore?.cnpj_nif || '';

    const items = sale.sale_items || [];

    const itemsRows = items.map(item => {
      const prodName = item.products?.name || item.product_name || 'Item';
      const unitSym = item.product_units?.symbol || item.unit_symbol || 'un';
      const qty = Number(item.quantity_sold) || 1;
      const unitPrice = Number(item.unit_price) || 0;
      const total = Number(item.total_price) || (qty * unitPrice);

      return `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <div style="flex:1;">
            <div style="font-weight:bold;">${escapeHtml(prodName)}</div>
            <div style="font-size:11px; color:#555;">${qty} ${unitSym} x ${formatCurrency(unitPrice)}</div>
          </div>
          <div style="text-align:right; font-weight:bold;">${formatCurrency(total)}</div>
        </div>
      `;
    }).join('');

    return `
      <div id="printable-receipt" style="font-family:'Courier New', monospace; font-size:12px; line-height:1.4; color:#000; background:#fff; max-width:320px; margin:0 auto; padding:12px; border:1px dashed #ccc;">
        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:8px; margin-bottom:8px;">
          <h2 style="font-size:16px; margin:0; font-weight:bold;">${escapeHtml(storeName)}</h2>
          <div style="font-size:11px;">${escapeHtml(storeHeader)}</div>
          ${storeTaxId ? `<div style="font-size:10px;">CNPJ/NIF: ${escapeHtml(storeTaxId)}</div>` : ''}
          ${storeAddress ? `<div style="font-size:10px;">${escapeHtml(storeAddress)}</div>` : ''}
          ${storePhone ? `<div style="font-size:10px;">Tel: ${escapeHtml(storePhone)}</div>` : ''}
        </div>

        <div style="border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:8px; font-size:11px;">
          <div><strong>RECIBO:</strong> ${escapeHtml(sale.receipt_number || 'S/N')}</div>
          <div><strong>DATA:</strong> ${formatDateTime(sale.created_at)}</div>
          <div><strong>OPERADOR:</strong> ${escapeHtml(sale.profiles?.full_name || state.user?.email?.split('@')[0] || 'Caixa')}</div>
          <div><strong>CLIENTE:</strong> ${escapeHtml(sale.customer_name || 'Consumidor Final')}</div>
          ${sale.customer_tax_id ? `<div><strong>CPF/NIF:</strong> ${escapeHtml(sale.customer_tax_id)}</div>` : ''}
        </div>

        <div style="border-bottom:1px dashed #000; padding-bottom:8px; margin-bottom:8px;">
          <div style="font-weight:bold; margin-bottom:6px; border-bottom:1px solid #eee;">ITENS DA VENDA</div>
          ${itemsRows}
        </div>

        <div style="border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between;">
            <span>Subtotal:</span>
            <span>${formatCurrency(sale.total_gross || sale.total_net)}</span>
          </div>
          ${sale.discount_amount > 0 ? `
            <div style="display:flex; justify-content:space-between; color:#c00;">
              <span>Desconto:</span>
              <span>- ${formatCurrency(sale.discount_amount)}</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:bold; margin-top:4px;">
            <span>TOTAL PAGO:</span>
            <span>${formatCurrency(sale.total_net)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px;">
            <span>Forma de Pagamento:</span>
            <span><strong>${formatPaymentMethod(sale.payment_method)}</strong></span>
          </div>
        </div>

        <div style="text-align:center; font-size:11px; margin-top:8px;">
          <p>${escapeHtml(storeFooter)}</p>
          <div style="font-size:9px; color:#888; margin-top:6px;">FARMAKEIA — Pharmacy System</div>
        </div>
      </div>
    `;
  },

  /**
   * Triggers native browser print
   */
  printReceipt(sale, store) {
    const receiptHtml = this.generateReceiptHtml(sale, store);
    
    // Create print iframe
    let printFrame = document.getElementById('receipt-print-frame');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'receipt-print-frame';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);
    }

    const doc = printFrame.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo ${sale.receipt_number}</title>
          <style>
            body { margin: 0; padding: 10px; font-family: 'Courier New', monospace; font-size: 12px; }
            @page { margin: 0; }
          </style>
        </head>
        <body>
          ${receiptHtml}
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  },

  /**
   * Generates formatted plain text receipt for copying and pasting anywhere
   */
  generatePlainTextReceipt(sale, store) {
    const storeName = store?.name || state.activeStore?.name || 'FARMAKEIA';
    const storeHeader = store?.receipt_header || state.activeStore?.receipt_header || 'Drogaria & Farmácia';
    const storeFooter = store?.receipt_footer || state.activeStore?.receipt_footer || 'Obrigado pela preferência!';
    const storePhone = store?.phone || state.activeStore?.phone || '';
    const storeAddress = store?.address || state.activeStore?.address || '';
    const storeTaxId = store?.cnpj_nif || state.activeStore?.cnpj_nif || '';
    const items = sale.sale_items || [];

    let text = `================================\n`;
    text += `   ${storeName.toUpperCase()}\n`;
    if (storeHeader) text += `   ${storeHeader}\n`;
    if (storeTaxId) text += `CNPJ/NIF: ${storeTaxId}\n`;
    if (storeAddress) text += `End: ${storeAddress}\n`;
    if (storePhone) text += `Tel: ${storePhone}\n`;
    text += `================================\n`;
    text += `RECIBO Nº: ${sale.receipt_number || 'S/N'}\n`;
    text += `DATA: ${formatDateTime(sale.created_at)}\n`;
    text += `CLIENTE: ${sale.customer_name || 'Consumidor Final'}\n`;
    if (sale.customer_tax_id) text += `DOC/NIF: ${sale.customer_tax_id}\n`;
    text += `OPERADOR: ${sale.profiles?.full_name || state.user?.email?.split('@')[0] || 'Caixa'}\n`;
    text += `--------------------------------\n`;
    text += `ITENS DA VENDA:\n`;

    items.forEach(item => {
      const name = item.products?.name || item.product_name || 'Item';
      const qty = Number(item.quantity_sold) || 1;
      const unit = item.product_units?.symbol || item.unit_symbol || 'un';
      const unitPrice = Number(item.unit_price) || 0;
      const total = Number(item.total_price) || (qty * unitPrice);
      text += `• ${name}\n  ${qty} ${unit} x ${formatCurrency(unitPrice)} = ${formatCurrency(total)}\n`;
    });

    text += `--------------------------------\n`;
    if (sale.discount_amount > 0) {
      text += `Subtotal: ${formatCurrency(sale.total_gross || sale.total_net)}\n`;
      text += `Desconto: - ${formatCurrency(sale.discount_amount)}\n`;
    }
    text += `TOTAL PAGO: ${formatCurrency(sale.total_net)}\n`;
    text += `FORMA DE PAGAMENTO: ${formatPaymentMethod(sale.payment_method)}\n`;
    text += `================================\n`;
    text += `${storeFooter}\n`;

    return text;
  },

  /**
   * Copies formatted receipt to clipboard so user can paste it anywhere
   */
  async copyReceipt(sale, store) {
    const text = this.generatePlainTextReceipt(sale, store);
    let success = false;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (err) {
        console.warn('Clipboard API writeText failed, trying fallback:', err);
      }
    }

    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '-9999px';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('Fallback execCommand copy error:', err);
      }
    }

    if (success) {
      notify.success('Recibo copiado para a área de transferência! Pode colar onde quiser.');
    } else {
      notify.info('Não foi possível copiar automaticamente. Você pode selecionar o texto na tela para copiar.');
    }
    return success;
  },

  /**
   * Shares receipt via SMS protocol with unit prices, item breakdown and total
   */
  shareSMS(sale, store, phone = '') {
    const storeName = store?.name || state.activeStore?.name || 'FARMAKEIA';
    const items = sale.sale_items || [];
    
    let smsBody = `${storeName.toUpperCase()}\n`;
    smsBody += `Recibo: #${sale.receipt_number || 'S/N'}\n`;
    smsBody += `Data: ${formatDateTime(sale.created_at)}\n`;
    if (sale.customer_name && sale.customer_name !== 'Consumidor Final') {
      smsBody += `Cliente: ${sale.customer_name}\n`;
    }
    smsBody += `--------------------\n`;
    smsBody += `ITENS:\n`;

    items.forEach(i => {
      const name = i.products?.name || i.product_name || 'Item';
      const qty = Number(i.quantity_sold) || 1;
      const unit = i.product_units?.symbol || i.unit_symbol || 'un';
      const unitPrice = Number(i.unit_price) || 0;
      const totalItem = Number(i.total_price) || (qty * unitPrice);
      smsBody += `• ${name}\n  Qtd: ${qty} ${unit} | Preço Un: ${formatCurrency(unitPrice)} | Subtotal: ${formatCurrency(totalItem)}\n`;
    });

    smsBody += `--------------------\n`;
    if (Number(sale.discount_amount) > 0) {
      smsBody += `Desconto: -${formatCurrency(sale.discount_amount)}\n`;
    }
    smsBody += `TOTAL: ${formatCurrency(sale.total_net)} (${formatPaymentMethod(sale.payment_method)})\n`;
    smsBody += `Obrigado pela preferência!`;

    const cleanPhone = (phone || sale.customer_phone || '').replace(/\D/g, '');
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const separator = isIOS ? '&' : '?';
    const smsUrl = cleanPhone 
      ? `sms:${cleanPhone}${separator}body=${encodeURIComponent(smsBody)}`
      : `sms:${separator}body=${encodeURIComponent(smsBody)}`;

    const link = document.createElement('a');
    link.href = smsUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify.info('Abrindo aplicativo de SMS para partilha do recibo...');
  },

  /**
   * Generates WhatsApp message string and link
   */
  generateWhatsAppText(sale, store) {
    const storeName = store?.name || state.activeStore?.name || 'FARMAKEIA';
    const items = sale.sale_items || [];

    let text = `*${storeName.toUpperCase()}*\n`;
    text += `*COMPROVANTE DE VENDA*\n\n`;
    text += `📄 *Recibo:* ${sale.receipt_number}\n`;
    text += `📅 *Data:* ${formatDateTime(sale.created_at)}\n`;
    text += `👤 *Cliente:* ${sale.customer_name || 'Consumidor Final'}\n\n`;
    text += `*ITENS:*\n`;

    items.forEach(item => {
      const name = item.products?.name || item.product_name || 'Item';
      const qty = Number(item.quantity_sold) || 1;
      const unit = item.product_units?.symbol || item.unit_symbol || 'un';
      const price = Number(item.total_price) || 0;
      text += `• ${name} (${qty} ${unit}) - ${formatCurrency(price)}\n`;
    });

    text += `\n*TOTAL: ${formatCurrency(sale.total_net)}*\n`;
    text += `Forma de Pagto: ${formatPaymentMethod(sale.payment_method)}\n\n`;
    text += `_Obrigado pela preferência!_`;

    return text;
  },

  shareWhatsApp(sale, store, phone = '') {
    const text = this.generateWhatsAppText(sale, store);
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  },

  async shareWebAPI(sale, store) {
    const text = this.generateWhatsAppText(sale, store);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Recibo ${sale.receipt_number}`,
          text: text
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          notify.error('Não foi possível compartilhar via Web Share.');
        }
      }
    } else {
      await navigator.clipboard.writeText(text);
      notify.success('Texto do comprovante copiado para a área de transferência!');
    }
  }
};
