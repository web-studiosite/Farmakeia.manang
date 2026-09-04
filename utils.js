/**
 * FARMAKEIA — Utility Helper Functions
 * Currency formatters, date/time helpers, FEFO expiry calculations,
 * string sanitization, and mathematical precision utilities.
 */

/**
 * Formats numeric values to standard currency format in Mozambican Meticais (MT)
 * (e.g. 1.250,50 MT)
 */
export function formatCurrency(amount, currency = 'MT') {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`;
}

/**
 * Formats date into readable Brazilian/Standard format (DD/MM/YYYY)
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? dateString : d.toLocaleDateString('pt-BR');
}

/**
 * Formats date and time into readable format (DD/MM/YYYY HH:MM)
 */
export function formatDateTime(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Calculates FEFO status and returns color badge class and label
 */
export function getFefoStatus(expiryDateStr) {
  if (!expiryDateStr) {
    return { status: 'UNKNOWN', label: 'Sem data', badgeClass: 'badge-gray', daysLeft: 9999 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateStr);
  expiry.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'EXPIRED',
      label: `Vencido (${Math.abs(diffDays)}d)`,
      badgeClass: 'badge-fefo-expired',
      daysLeft: diffDays
    };
  } else if (diffDays <= 30) {
    return {
      status: 'CRITICAL_30',
      label: `Vence em ${diffDays}d`,
      badgeClass: 'badge-fefo-30',
      daysLeft: diffDays
    };
  } else if (diffDays <= 60) {
    return {
      status: 'WARNING_60',
      label: `Vence em ${diffDays}d`,
      badgeClass: 'badge-fefo-60',
      daysLeft: diffDays
    };
  } else if (diffDays <= 90) {
    return {
      status: 'ATTENTION_90',
      label: `Vence em ${diffDays}d`,
      badgeClass: 'badge-fefo-90',
      daysLeft: diffDays
    };
  } else {
    return {
      status: 'OK',
      label: `Vence em ${diffDays}d`,
      badgeClass: 'badge-fefo-ok',
      daysLeft: diffDays
    };
  }
}

/**
 * Debounce function for smooth search inputs
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escapes HTML characters to prevent XSS
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Payment method localized labels
 */
export const PAYMENT_METHODS = {
  CASH: { label: 'Dinheiro', icon: 'banknote' },
  CARD_CREDIT: { label: 'Cartão de Crédito', icon: 'credit-card' },
  CARD_DEBIT: { label: 'Cartão de Débito', icon: 'credit-card' },
  PIX: { label: 'PIX', icon: 'zap' },
  TRANSFER: { label: 'Transferência Bancária', icon: 'arrow-right-left' },
  OTHER: { label: 'Outro', icon: 'help-circle' }
};

/**
 * Generates clean barcode canvas or SVG if needed
 */
export function renderBarcodePlaceholder(code) {
  return `<div class="barcode-box font-mono text-center tracking-widest text-xs py-1 border border-dashed border-gray-600 rounded bg-gray-900/50">||||| | || |||| | ${escapeHtml(code || '000000000000')} ||||</div>`;
}
