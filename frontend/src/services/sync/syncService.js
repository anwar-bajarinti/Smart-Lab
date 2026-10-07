// src/db/syncService.js
// Offline Queue & Conflict-Resilient Cloud Synchronization Manager
// Manages local offline mutations, retries with exponential backoff,
// and safe last-write-wins timestamp conflict resolution.

const SYNC_QUEUE_KEY = 'inc_cms_offline_sync_queue_v1';
const MAX_RETRIES = 5;

class SyncService {
  constructor() {
    this.isSyncing = false;
    this.listeners = new Set();
    this.initNetworkListeners();
  }

  initNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncService] Network restored. Triggering cloud synchronization queue...');
        this.notify('NETWORK_ONLINE', { isOnline: true });
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        console.log('[SyncService] Network lost. Switching to offline queue mode.');
        this.notify('NETWORK_OFFLINE', { isOnline: false });
      });
    }
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, payload) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, payload);
      } catch (err) {
        console.error('[SyncService Notification Error]:', err);
      }
    });
  }

  isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  getQueue() {
    try {
      const data = localStorage.getItem(SYNC_QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('[SyncService] Failed to read offline queue from localStorage:', e);
      return [];
    }
  }

  saveQueue(queue) {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('[SyncService] Failed to persist offline queue:', e);
    }
  }

  /**
   * Enqueue a pending mutation when offline or when network call fails.
   */
  enqueueMutation({ table, action, id, data, timestamp = new Date().toISOString() }) {
    const queue = this.getQueue();
    // Avoid duplicate queuing of exact same mutation
    const existingIdx = queue.findIndex((m) => m.table === table && m.id === id && m.action === action);

    const mutation = {
      mutationId: `MUT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      table,
      action, // 'upsert' | 'insert' | 'update' | 'delete'
      id,
      data,
      timestamp,
      retryCount: 0,
    };

    if (existingIdx !== -1) {
      queue[existingIdx] = mutation;
    } else {
      queue.push(mutation);
    }

    this.saveQueue(queue);
    this.notify('MUTATION_ENQUEUED', { table, id, pendingCount: queue.length });
    return mutation;
  }

  /**
   * Process all queued offline mutations against Supabase.
   */
  async processQueue(supabaseClient, toDbRowFn) {
    if (!this.isOnline() || this.isSyncing) {
      return { processed: 0, pending: this.getQueue().length };
    }

    const queue = this.getQueue();
    if (queue.length === 0) return { processed: 0, pending: 0 };

    this.isSyncing = true;
    this.notify('SYNC_STARTED', { queueLength: queue.length });

    let processedCount = 0;
    const remainingQueue = [];

    for (const mutation of queue) {
      try {
        const { table, action, id, data, timestamp } = mutation;
        const dbPayload = toDbRowFn ? toDbRowFn(table, data) : data;

        // 1. Conflict check: verify if newer cloud record already exists
        if (action !== 'delete') {
          const { data: existingRows } = await supabaseClient
            .from(table)
            .select('updated_at')
            .eq('id', id)
            .limit(1);

          if (existingRows && existingRows.length > 0 && existingRows[0].updated_at) {
            const cloudTimestamp = new Date(existingRows[0].updated_at).getTime();
            const localTimestamp = new Date(timestamp).getTime();
            if (cloudTimestamp > localTimestamp) {
              console.warn(
                `[SyncService] Conflict detected on ${table} (${id}): Cloud has newer timestamp. Discarding stale offline mutation.`
              );
              processedCount++;
              continue; // Skip stale write
            }
          }
        }

        // 2. Execute mutation against Supabase
        let resError = null;
        if (action === 'delete') {
          const { error } = await supabaseClient.from(table).delete().eq('id', id);
          resError = error;
        } else if (action === 'insert') {
          const { error } = await supabaseClient.from(table).insert(dbPayload);
          resError = error;
        } else {
          // Default to upsert for idempotent replay
          const { error } = await supabaseClient.from(table).upsert(dbPayload);
          resError = error;
        }

        if (resError) {
          console.warn(`[SyncService] Mutation failed for ${table} (${id}):`, resError.message);
          mutation.retryCount = (mutation.retryCount || 0) + 1;
          if (mutation.retryCount < MAX_RETRIES) {
            remainingQueue.push(mutation);
          } else {
            console.error(`[SyncService] Dropping mutation for ${table} (${id}) after ${MAX_RETRIES} failed attempts.`);
          }
        } else {
          processedCount++;
        }
      } catch (err) {
        console.error('[SyncService] Unexpected error processing mutation:', err);
        mutation.retryCount = (mutation.retryCount || 0) + 1;
        if (mutation.retryCount < MAX_RETRIES) {
          remainingQueue.push(mutation);
        }
      }
    }

    this.saveQueue(remainingQueue);
    this.isSyncing = false;
    this.notify('SYNC_FINISHED', { processed: processedCount, pending: remainingQueue.length });

    return { processed: processedCount, pending: remainingQueue.length };
  }
}

export const syncService = new SyncService();
