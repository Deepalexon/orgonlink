/**
 * TxQueue — очередь транзакций и запросов, ожидающих одобрения пользователя.
 * 
 * Когда dApp вызывает sendTransaction(), запрос ставится в очередь,
 * открывается popup подтверждения. Когда пользователь нажимает
 * "Подтвердить" или "Отклонить" — Promise в service_worker разрешается.
 */

'use strict';

export class TxQueue {
  constructor() {
    // Map<id, { data, resolve, reject }>
    this._queue = new Map();
    // Map<approvalId, resolve> для connect/tx approvals
    this._approvals = new Map();
  }

  // ─── Транзакции ─────────────────────────────────────────────────────────

  add(transaction) {
    const id = `tx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this._queue.set(id, { transaction, status: 'pending' });
    return id;
  }

  get(id) {
    return this._queue.get(id) ?? null;
  }

  resolve(id, result) {
    const entry = this._queue.get(id);
    if (entry) {
      entry.status = 'confirmed';
      entry.result = result;
    }
  }

  reject(id) {
    const entry = this._queue.get(id);
    if (entry) {
      entry.status = 'rejected';
      this._queue.delete(id);
    }
  }

  // ─── Popup approvals ────────────────────────────────────────────────────

  addApproval(requestId, resolveFn) {
    this._approvals.set(requestId, resolveFn);
  }

  setApproval(requestId, approved) {
    const resolve = this._approvals.get(requestId);
    if (resolve) {
      resolve(approved);
      this._approvals.delete(requestId);
    }
  }

  getPending() {
    return Array.from(this._queue.entries())
      .filter(([, v]) => v.status === 'pending')
      .map(([id, v]) => ({ id, ...v }));
  }
}
