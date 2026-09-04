/**
 * FARMAKEIA — Client Audit Logger Helper
 */

import { getSupabase } from './supabase.js';
import { state } from './state.js';

export const audit = {
  async log(action, entity, entityId = null, details = '') {
    try {
      const supabase = await getSupabase();
      if (!supabase) return;

      const storeId = state.activeStore?.id || null;
      const user = state.user;
      const profile = state.profile;

      await supabase.from('audit_logs').insert({
        store_id: storeId,
        user_id: user?.id || null,
        user_role: profile?.role || 'UNKNOWN',
        user_email: user?.email || '',
        action: action,
        entity: entity,
        entity_id: entityId,
        details: details,
        user_agent: navigator.userAgent
      });
    } catch (e) {
      console.warn('Audit log write error:', e);
    }
  }
};
