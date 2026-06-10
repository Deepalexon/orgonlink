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


  // ═══════════════════════════════════════════════════
  //  РЕСУРСЫ: Energy, Bandwidth, Staking
  // ═══════════════════════════════════════════════════

  /**
   * Получить ресурсы аккаунта: Energy, Bandwidth, замороженные ORGON, Tron Power
   * Возвращает: { energy, bandwidth, frozenEnergy, frozenBandwidth, tronPower, ... }
   */
  async getAccountResource(address) {
    const [account, resource] = await Promise.all([
      this.call('wallet/getaccount', { address, visible: true }),
      this.call('wallet/getaccountresource', { address, visible: true }),
    ]);

    // Stake 2.0 формат frozenV2 (Orgon):
    // {amount: N}                  → Bandwidth (нет type)
    // {type: "ENERGY", amount: N}  → Energy
    // {type: "TRON_POWER"}         → голоса без amount (игнорируем)
    const frozenV2 = account?.frozen_v2 ?? account?.frozenV2 ?? [];
    let frozenEnergy    = 0;
    let frozenBandwidth = 0;
    for (const f of frozenV2) {
      const fType = (f.type ?? '').toUpperCase();
      const amt   = Number(f.amount ?? 0);
      if (fType === 'ENERGY')                       frozenEnergy    += amt;
      else if (fType === '' || fType === 'BANDWIDTH') frozenBandwidth += amt;
      // TRON_POWER — не суммируем отдельно, уже входит в Energy+Bandwidth
    }

    // Альтернативный формат account_resource (старый Stake 1.0)
    const acRes = account?.account_resource ?? {};
    if (acRes.frozen_balance_for_energy?.frozen_balance) {
      frozenEnergy += Number(acRes.frozen_balance_for_energy.frozen_balance);
    }

    // Tron Power = сумма всех замороженных (для голосования)
    const tronPower = frozenEnergy + frozenBandwidth;

    // Bandwidth
    const bwLimit    = resource?.NetLimit ?? 0;
    const bwUsed     = resource?.NetUsed  ?? 0;
    const bwFree     = resource?.freeNetLimit ?? 1500;
    const bwFreeUsed = resource?.freeNetUsed  ?? 0;
    const bwTotal    = bwLimit + bwFree;
    const bwAvail    = Math.max(0, bwLimit - bwUsed) + Math.max(0, bwFree - bwFreeUsed);

    // Energy
    const energyLimit = resource?.EnergyLimit ?? 0;
    const energyUsed  = resource?.EnergyUsed  ?? 0;
    const energyAvail = Math.max(0, energyLimit - energyUsed);

    // Анфриз в процессе (unfreezing_v2)
    const unfreezingV2 = account?.unfreezing_v2 ?? [];

    return {
      // Energy
      energyLimit,
      energyUsed,
      energyAvail,
      frozenEnergy,           // заморожено для Energy (SUN)
      frozenEnergyOrgon: frozenEnergy / 1e6,

      // Bandwidth
      bwLimit, bwUsed, bwFree, bwFreeUsed, bwTotal, bwAvail,
      frozenBandwidth,        // заморожено для Bandwidth (SUN)
      frozenBandwidthOrgon: frozenBandwidth / 1e6,

      // Голосование
      tronPower,              // суммарный Tron Power (SUN)
      tronPowerOrgon: tronPower / 1e6,

      // Анфриз в ожидании
      unfreezingV2,

      // Сырые данные
      _account:  account,
      _resource: resource,
    };
  }

  /**
   * Заморозить ORGON для получения Energy или Bandwidth
   * resource: 'ENERGY' | 'BANDWIDTH'
   * amount: в SUN (1 ORGON = 1_000_000 SUN)
   */
  freezeBalanceV2(ownerAddress, amount, resource) {
    return this.call('wallet/freezebalancev2', {
      owner_address:  ownerAddress,
      frozen_balance: amount,
      resource,
      visible: true,
    });
  }

  /**
   * Разморозить ORGON (начать процесс — средства придут через 14 дней)
   * resource: 'ENERGY' | 'BANDWIDTH'
   * amount: в SUN
   */
  unfreezeBalanceV2(ownerAddress, amount, resource) {
    return this.call('wallet/unfreezebalancev2', {
      owner_address:    ownerAddress,
      unfreeze_balance: amount,
      resource,
      visible: true,
    });
  }

  /**
   * Забрать разморозившиеся ORGON (после истечения 14 дней)
   */
  withdrawExpireUnfreeze(ownerAddress) {
    return this.call('wallet/withdrawexpireunfreeze', {
      owner_address: ownerAddress,
      visible: true,
    });
  }

  /**
   * Сколько ORGON можно разморозить прямо сейчас
   */
  getCanWithdrawUnfreezeAmount(ownerAddress) {
    return this.call('wallet/getcanwithdrawunfreezeamount', {
      owner_address: ownerAddress,
      timestamp:     Date.now(),
      visible:       true,
    });
  }

  // ═══════════════════════════════════════════════════
  //  ГОЛОСОВАНИЕ за валидаторов
  // ═══════════════════════════════════════════════════

  /**
   * Список всех валидаторов (witnesses/super representatives)
   * Возвращает отсортированный по голосам массив
   */
  async listWitnesses() {
    // getpaginatednowwitnesslist — реальные голоса, сортировка по убыванию
    try {
      const data = await this.call('wallet/getpaginatednowwitnesslist', {
        offset: 0, limit: 100, visible: true,
      });
      const list = data?.witnesses ?? data?.data ?? [];
      if (list.length > 0) {
        console.log('[Voting] witnesses[0]:', JSON.stringify(list[0]).slice(0, 150));
        return list;
      }
    } catch {
      // getpaginatednowwitnesslist не поддерживается нодой — используем listwitnesses
    }
    // Фолбэк: обычный listwitnesses
    const data = await this.call('wallet/listwitnesses', { visible: true });
    const list = data?.witnesses ?? [];
    console.log('[Voting] listwitnesses[0]:', JSON.stringify(list[0]).slice(0, 150));
    return list.sort((a, b) => (b.voteCount ?? 0) - (a.voteCount ?? 0));
  }

  /**
   * Получить текущие голоса аккаунта (за кого проголосовал)
   * Возвращает массив { vote_address, vote_count }
   */
  async getAccountVotes(address) {
    const account = await this.call('wallet/getaccount', { address, visible: true });
    return account?.votes ?? [];
  }

  /**
   * Получить накопленные награды за голосование
   */
  async getReward(address) {
    const data = await this.call('wallet/getReward', { address, visible: true });
    return data?.reward ?? 0;
  }

  /**
   * Проголосовать за валидаторов
   * votes: [{ vote_address: 'oXxx...', vote_count: 10 }, ...]
   * Сумма vote_count не может превышать Tron Power аккаунта
   */
  voteWitness(ownerAddress, votes) {
    return this.call('wallet/votewitnessaccount', {
      owner_address: ownerAddress,
      votes,
      visible: true,
    });
  }

  /**
   * Забрать награды за голосование (voting rewards)
   */
  withdrawVotingRewards(ownerAddress) {
    return this.call('wallet/withdrawbalance', {
      owner_address: ownerAddress,
      visible: true,
    });
  }


}

class RPCError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'RPCError';
  }
}
