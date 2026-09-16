import { createClient } from '../vendor/supabase/supabase.mjs?v=2565f3e47308';
import { libraryConfig } from '../library-config.js?v=2565f3e47308';

export { libraryConfig };
export const PUBLIC_FIELDS = 'id,title,category,description,keywords,search_text,pages,file_bytes,sha256,file_path,cover_path,status,created_at,updated_at,published_at';

// Admin sessions last for this browser tab. Public browsing never loads an admin session.
export function createLibraryClient({ admin = false } = {}) {
  const memory = new Map();
  const storage = {
    getItem(key) { try { return sessionStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    setItem(key, value) { memory.set(key, value); try { sessionStorage.setItem(key, value); } catch { /* Keep access in memory if browser storage is unavailable. */ } },
    removeItem(key) { memory.delete(key); try { sessionStorage.removeItem(key); } catch { /* The memory session has still been removed. */ } }
  };
  return createClient(libraryConfig.url, libraryConfig.key, {
    auth: { persistSession: admin, autoRefreshToken: admin, detectSessionInUrl: false,
      storageKey: 'northstar-marketing-admin-v1', ...(admin ? { storage } : {}) },
    global: { headers: { 'X-Client-Info': 'northstar-marketing-library' } }
  });
}
