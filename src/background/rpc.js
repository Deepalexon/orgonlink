/**
 * OrgonRPC — HTTP клиент для Full Node Orgon.
 *
 * Публичные ноды:
 *   Full Node:     https://tr80.orgon.space  (порт 19067 для http)
 *   Solidity Node: https://tr81.orgon.space  (порт 19068 для http)
 *
 * OrgonGate (платный, с API ключом): https://gate.orgon.space
 *
 * API совместимо с Tron HTTP API (форк), но заголовок ключа другой:
 *   Tron:  'TRON-PRO-API-KEY'
 *   Orgon: 'ORGON-PRO-API-KEY'
 */

'use strict';

import { API_KEY_HEADER } from '../shared/constants.js';

export class OrgonRPC {
  /**
   * @param {string} fullNodeUrl      — URL Full Node
   * @param {string} solidityNodeUrl  — URL Solidity Node (опционально)
   * @param {string} apiKey           — API ключ OrgonGate (опционально)
   */
  constructor(
    fullNodeUrl = 'https://tr80.orgon.space',
    solidityNodeUrl = 'https://tr81.orgon.space',
    apiKey = null,
    apiGateUrl = 'https://gate.orgon.space'
  ) {
    this.fullNodeUrl = fullNodeUrl.replace(/\/$/, '');
    this.solidityNodeUrl = solidityNodeUrl.replace(/\/$/, '');
    this.apiGateUrl = apiGateUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this._timeout = 15_000;
  }

  /**
   * POST запрос к Full Node.
   * @param {string} endpoint  — напр. 'wallet/getaccount'
   * @param {object} body
   * @param {'full'|'solidity'} node
   */
  async call(endpoint, body = {}, node = 'full') {
    const base = node === 'solidity' ? this.solidityNodeUrl : this.fullNodeUrl;
    const url = `${base}/${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Orgon API key header — отличается от Tron ('TRON-PRO-API-KEY')
    if (this.apiKey) {
      headers[API_KEY_HEADER] = this.apiKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new RPCError(response.status, `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Tron/Orgon API возвращает { Error: "..." } при ошибках
      if (data?.Error) {
        throw new RPCError(-32000, data.Error);
      }
      if (data?.result === false && data?.message) {
        throw new RPCError(-32000, data.message);
      }

      return data;

    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new RPCError(-32603, 'RPC request timeout');
      }
      throw err;
    }
  }

  /**
   * Отправить подписанную транзакцию.
   */
  async broadcastTransaction(signedTx) {
    const result = await this.call('wallet/broadcasttransaction', signedTx);
    if (!result.result) {
      throw new RPCError(-32000, result.message ?? 'Broadcast failed');
    }
    return { txid: result.txid ?? signedTx.txID, result: true };
  }

  // ─── Удобные обёртки ──────────────────────────────────────────────────────

  getAccount(address) {
    // visible:true — принимать base58 адрес (начинается с 'o' для Orgon)
    return this.call('wallet/getaccount', { address, visible: true });
  }

  async getBalance(address) {
    const acc = await this.getAccount(address);
    return acc?.balance ?? 0;
  }

  getCurrentBlock() {
    return this.call('wallet/getnowblock');
  }

  getBlockByNumber(num) {
    return this.call('wallet/getblockbynum', { num });
  }

  getTransactionById(txid) {
    return this.call('wallet/gettransactionbyid', { value: txid });
  }

  getTransactionInfo(txid) {
    return this.call('wallet/gettransactioninfobyid', { value: txid });
  }

  /**
   * triggerConstantContract — read-only вызов контракта (view/pure).
   */
  triggerConstantContract(ownerAddress, contractAddress, functionSelector, parameters = [], options = {}) {
    return this.call('wallet/triggerconstantcontract', {
      owner_address: ownerAddress,
      contract_address: contractAddress,
      function_selector: functionSelector,
      parameter: parameters,
      ...options,
    });
  }

  /**
   * triggerSmartContract — write вызов (создаёт неподписанную транзакцию).
   */
  triggerSmartContract(ownerAddress, contractAddress, functionSelector, parameters = [], options = {}) {
    return this.call('wallet/triggersmartcontract', {
      owner_address: ownerAddress,
      contract_address: contractAddress,
      function_selector: functionSelector,
      parameter: parameters,
      fee_limit: options.feeLimit ?? 150_000_000,
      call_value: options.callValue ?? 0,
      ...options,
    });
  }

  /**
   * estimateEnergy — оценка стоимости вызова контракта.
   */
  estimateEnergy(ownerAddress, contractAddress, functionSelector, parameters = [], options = {}) {
    return this.call('wallet/estimateenergy', {
      owner_address: ownerAddress,
      contract_address: contractAddress,
      function_selector: functionSelector,
      parameter: parameters,
      ...options,
    });
  }

  /**
   * createTransaction — создать перевод ORGON.
   */
  createTransaction(ownerAddress, toAddress, amount) {
    return this.call('wallet/createtransaction', {
      owner_address: ownerAddress,
      to_address: toAddress,
      amount,
    });
  }

  /**
   * oRC20 баланс (вызов balanceOf через triggerconstantcontract).
   */
  async getORC20Balance(contractAddress, ownerAddress) {
    const param = ownerAddress.replace(/^(41|0x)/, '').padStart(64, '0');
    const result = await this.triggerConstantContract(
      ownerAddress,
      contractAddress,
      'balanceOf(address)',
      param
    );
    const hex = result?.constant_result?.[0] ?? '0';
    return BigInt('0x' + (hex || '0'));
  }

  /**
   * История транзакций аккаунта (через /v1/ API, аналог TronGrid).
   */
  async getTransactions(base58Address, hexAddress, limit = 20) {
    // gate.orgon.space принимает ТОЛЬКО base58 адрес (начинается с 'o')
    // hex адрес возвращает data:null (транзакции не найдены)
    const headers = { 'Accept': 'application/json' };
    if (this.apiKey) headers[API_KEY_HEADER] = this.apiKey;

    const url = `${this.apiGateUrl}/v1/accounts/${base58Address}/transactions?limit=${limit}`;
    console.log('[RPC] getTransactions:', base58Address.slice(0,12) + '...');

    const res = await fetch(url, { headers });
    const text = await res.text();
    console.log('[RPC] gate', res.status, text.slice(0, 120));

    if (!res.ok) {
      throw new Error('gate HTTP ' + res.status + ': ' + text.slice(0, 60));
    }

    const data = JSON.parse(text);

    // data:null + success:true = аккаунт найден но транзакций нет (новый аккаунт)
    // data:[...] = транзакции есть
    const txs = Array.isArray(data.data) ? data.data : [];
    console.log('[RPC] getTransactions count:', txs.length);
    return txs;
  }

}

class RPCError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'RPCError';
  }
}
