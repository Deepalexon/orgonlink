/**
 * OrgonLink Provider
 *
 * Инжектируется в MAIN world. Экспортирует:
 *   window.tron          — основной объект провайдера (как в TronLink)
 *   window.tron.tronWeb  — экземпляр OrgonWeb (совместимо с dApp экосистемой)
 *   window.orgonWeb      — псевдоним для удобства (указывает на tron.tronWeb)
 *
 * Архитектура коммуникации:
 *   dApp → window.tron.tronWeb.method()
 *       → dispatchEvent(OrgonLinkRequest)
 *       → bridge.js (ISOLATED world) слушает
 *       → chrome.runtime.sendMessage → service_worker
 *       → ответ через CustomEvent(OrgonLinkResponse)
 *       → Promise resolve/reject
 */

(function () {
  'use strict';

  if (window.tron) return; // уже инжектирован

  // ─── Утилита: запрос к background через bridge ───────────────────────────

  let _reqCounter = 0;

  function _request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `orgon_${++_reqCounter}_${Date.now()}`;

      function handler(event) {
        if (event.detail?.id !== id) return;
        window.removeEventListener('OrgonLinkResponse', handler);
        if (event.detail.error) {
          reject(new OrgonProviderError(event.detail.error.code, event.detail.error.message));
        } else {
          resolve(event.detail.result);
        }
      }

      window.addEventListener('OrgonLinkResponse', handler);

      window.dispatchEvent(new CustomEvent('OrgonLinkRequest', {
        detail: { id, method, params }
      }));

      // 30 секунд — достаточно для popup подтверждения
      setTimeout(() => {
        window.removeEventListener('OrgonLinkResponse', handler);
        reject(new OrgonProviderError(4001, `Request timeout: ${method}`));
      }, 60_000);
    });
  }

  // ─── Типы ошибок ─────────────────────────────────────────────────────────

  class OrgonProviderError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = 'OrgonProviderError';
    }
  }

  // ─── EventEmitter ─────────────────────────────────────────────────────────

  class EventEmitter {
    constructor() { this._listeners = {}; }

    on(event, fn) {
      (this._listeners[event] ??= []).push(fn);
      return this;
    }

    off(event, fn) {
      this._listeners[event] = (this._listeners[event] ?? []).filter(f => f !== fn);
      return this;
    }

    once(event, fn) {
      const wrapper = (...args) => { fn(...args); this.off(event, wrapper); };
      return this.on(event, wrapper);
    }

    emit(event, ...args) {
      (this._listeners[event] ?? []).forEach(fn => fn(...args));
    }
  }

  // ─── OrgonWeb (tronWeb-совместимый экземпляр) ────────────────────────────

  class OrgonWeb extends EventEmitter {
    constructor() {
      super();
      this.version = '0.1.0';
      this.isOrgonLink = true;

      // Текущее состояние
      this.ready = false;
      this.defaultAddress = false;  // false когда не подключён (как в TronLink)
      this.defaultAccount = false;

      // Подмодули (совместимы с TronWeb API)
      this.trx = new OrgonTrx(this);
      this.transactionBuilder = new OrgonTransactionBuilder(this);
      this.contract = OrgonContractFactory(this);
      this.utils = orgonUtils;

      // Слушаем push-события от extension
      window.addEventListener('OrgonLinkEvent', (e) => this._handleExtensionEvent(e.detail));

      this._init();
    }

    async _init() {
      try {
        const state = await _request('getState');
        this._applyState(state);
      } catch {
        // Кошелёк заблокирован или не создан — нормальное состояние
      }
    }

    _applyState(state) {
      const wasReady = this.ready;
      this.ready = state.isUnlocked && !!state.selectedAddress;
      this.defaultAddress = state.selectedAddress ?? false;
      this.defaultAccount = this.defaultAddress;

      if (this.ready && !wasReady) {
        this.emit('connect', { address: this.defaultAddress });
      } else if (!this.ready && wasReady) {
        this.emit('disconnect');
      }
    }

    _handleExtensionEvent(detail) {
      switch (detail.type) {
        case 'accountChanged':
          this.defaultAddress = detail.address ?? false;
          this.defaultAccount = this.defaultAddress;
          this.ready = !!detail.address;
          this.emit('accountsChanged', detail.address);
          break;
        case 'locked':
          this.ready = false;
          this.defaultAddress = false;
          this.defaultAccount = false;
          this.emit('disconnect');
          break;
        case 'unlocked':
          this._applyState(detail.state);
          break;
        case 'networkChanged':
          this.emit('networkChanged', detail.network);
          break;
      }
    }

    // ─── Публичное API ──────────────────────────────────────────────────────

    /**
     * Запрос подключения dApp к кошельку.
     * Аналог tronLink.request({ method: 'tron_requestAccounts' })
     * @returns {Promise<{ code: number, message: string }>}
     */
    async request(args) {
      const { method, params } = args ?? {};
      switch (method) {
        case 'tron_requestAccounts':
          return this.requestAccess();
        default:
          throw new OrgonProviderError(4200, `Unsupported method: ${method}`);
      }
    }

    async requestAccess() {
      return _request('requestAccess', { origin: window.location.origin });
    }

    async sign(transaction) {
      // Алиас для tronWeb.trx.sign — основной способ подписи в dApp
      if (!this.ready) throw new OrgonProviderError(4100, 'Wallet is locked or not connected');
      return _request('signTransaction', { transaction });
    }

    async signTransaction(transaction) {
      return this.sign(transaction);
    }

    async sendRawTransaction(signedTransaction) {
      return _request('broadcastTransaction', { transaction: signedTransaction });
    }

    /**
     * signMessageV2 — рекомендуемый метод подписи сообщений (TIP-191).
     * Префикс: "\x19TRON Signed Message:\n" + длина (совместимо с Orgon).
     * @param {string|Uint8Array} message
     * @returns {Promise<string>} hex-подпись
     */
    async signMessageV2(message) {
      if (!this.ready) throw new OrgonProviderError(4100, 'Wallet is locked or not connected');
      return _request('signMessageV2', { message });
    }

    /**
     * @deprecated Используй signMessageV2
     */
    async signMessage(message) {
      return this.signMessageV2(message);
    }

    /**
     * verifyMessageV2 — верификация подписи от signMessageV2.
     * @returns {Promise<string>} base58-адрес подписанта
     */
    async verifyMessageV2(message, signature) {
      return _request('verifyMessageV2', { message, signature });
    }

    async verifyMessage(message, signature, address) {
      return _request('verifyMessage', { message, signature, address });
    }

    /**
     * Прямой RPC вызов к Full Node.
     */
    async fullNode(method, params = {}) {
      return _request('rpcCall', { method, params });
    }
  }

  // ─── Подмодуль: trx ───────────────────────────────────────────────────────

  class OrgonTrx {
    constructor(provider) { this._p = provider; }

    async getBalance(address) {
      return _request('trx.getBalance', {
        address: address ?? this._p.defaultAddress?.base58
      });
    }

    /**
     * sign — основной метод подписи транзакции (открывает popup подтверждения).
     * Используется dApp как: const signedTx = await tronWeb.trx.sign(tx)
     */
    async sign(transaction, privateKey) {
      if (privateKey) {
        // Если передан приватный ключ напрямую — подписываем без popup
        return _request('signTransactionWithKey', { transaction, privateKey });
      }
      if (!this._p.ready) throw new OrgonProviderError(4100, 'Wallet is locked or not connected');
      return _request('signTransaction', { transaction });
    }

    /**
     * sendRawTransaction — отправить подписанную транзакцию в сеть.
     */
    async sendRawTransaction(signedTransaction) {
      return _request('broadcastTransaction', { transaction: signedTransaction });
    }

    /**
     * signMessageV2 — подпись сообщения (TIP-191 совместимо).
     */
    async signMessageV2(message) {
      return this._p.signMessageV2(message);
    }

    async verifyMessageV2(message, signature) {
      return this._p.verifyMessageV2(message, signature);
    }

    async getAccount(address) {
      return _request('trx.getAccount', { address });
    }

    async getTransaction(txid) {
      return _request('trx.getTransaction', { txid });
    }

    async getTransactionInfo(txid) {
      return _request('trx.getTransactionInfo', { txid });
    }

    async getCurrentBlock() {
      return _request('trx.getCurrentBlock');
    }

    async getBlockByNumber(num) {
      return _request('trx.getBlockByNumber', { num });
    }

    async getBalance(address) {
      return _request('trx.getBalance', { address });
    }

    async getTransactions(address, limit = 20) {
      return _request('trx.getTransactions', { address, limit });
    }

    /**
     * sign — подписать транзакцию (алиас trx.sign = tronWeb.sign)
     */
    async sign(transaction) {
      return this._p.sign(transaction);
    }
  }

  // ─── Подмодуль: transactionBuilder ───────────────────────────────────────

  class OrgonTransactionBuilder {
    constructor(provider) { this._p = provider; }

    /**
     * sendTrx — создать транзакцию перевода ORGON.
     * @param {string} to       base58 адрес
     * @param {number} amount   в SUN (1 ORGON = 1_000_000 SUN)
     * @param {string} from     base58 адрес отправителя (опционально)
     */
    async sendTrx(to, amount, from) {
      return _request('transactionBuilder.sendTrx', {
        to,
        amount,
        from: from ?? this._p.defaultAddress?.base58,
      });
    }

    /**
     * sendToken — перевод oRC10 токена.
     */
    async sendToken(to, amount, tokenId, from) {
      return _request('transactionBuilder.sendToken', {
        to, amount, tokenId,
        from: from ?? this._p.defaultAddress?.base58,
      });
    }

    /**
     * triggerSmartContract — вызов write-метода контракта.
     * Возвращает { transaction } — нужно подписать и broadcast.
     */
    async triggerSmartContract(contractAddress, functionSelector, options = {}, parameters = []) {
      return _request('transactionBuilder.triggerSmartContract', {
        contractAddress, functionSelector, options, parameters,
        ownerAddress: options.ownerAddress ?? this._p.defaultAddress?.base58,
      });
    }

    /**
     * triggerConstantContract — read-only вызов (view/pure).
     */
    async triggerConstantContract(contractAddress, functionSelector, options = {}, parameters = []) {
      return _request('transactionBuilder.triggerConstantContract', {
        contractAddress, functionSelector, options, parameters,
        ownerAddress: options.ownerAddress ?? this._p.defaultAddress?.base58,
      });
    }

    /**
     * estimateEnergy — оценить стоимость вызова контракта.
     */
    async estimateEnergy(contractAddress, functionSelector, options = {}, parameters = []) {
      return _request('transactionBuilder.estimateEnergy', {
        contractAddress, functionSelector, options, parameters,
        ownerAddress: options.ownerAddress ?? this._p.defaultAddress?.base58,
      });
    }

    /**
     * createSmartContract — деплой нового контракта.
     */
    async createSmartContract(options) {
      return _request('transactionBuilder.createSmartContract', { options });
    }
  }

  // ─── contract() — фабрика экземпляров контрактов ─────────────────────────
  //
  // Используется как: const instance = await tronWeb.contract(abi, address)
  // Затем: await instance.balanceOf(addr).call()
  //        await instance.transfer(to, amount).send({ feeLimit: 100_000_000 })

  function OrgonContractFactory(provider) {
    /**
     * @param {Array}  abi
     * @param {string} address  base58
     */
    return function contract(abi, address) {
      return new ContractInstance(address, abi, provider);
    };
  }

  class ContractInstance {
    constructor(address, abi, provider) {
      this.address = address;
      this.abi = abi;
      this._provider = provider;

      // Динамически создаём методы из ABI
      if (Array.isArray(abi)) {
        abi
          .filter(item => item.type === 'Function' || item.type === 'function')
          .forEach(fn => {
            this[fn.name] = (...args) => new ContractMethod(
              address, fn, args, provider
            );
          });
      }
    }
  }

  class ContractMethod {
    constructor(address, abiItem, args, provider) {
      this._address = address;
      this._abi = abiItem;
      this._args = args;
      this._provider = provider;
    }

    /** Read-only вызов (view/pure) */
    call(options = {}) {
      return _request('contract.call', {
        address: this._address,
        functionSelector: `${this._abi.name}(${(this._abi.inputs ?? []).map(i => i.type).join(',')})`,
        parameters: this._args.map((val, i) => ({
          type: this._abi.inputs?.[i]?.type ?? 'bytes32',
          value: val,
        })),
        options,
      });
    }

    /** Write вызов (показывает popup подтверждения) */
    send(options = {}) {
      return _request('contract.send', {
        address: this._address,
        functionSelector: `${this._abi.name}(${(this._abi.inputs ?? []).map(i => i.type).join(',')})`,
        parameters: this._args.map((val, i) => ({
          type: this._abi.inputs?.[i]?.type ?? 'bytes32',
          value: val,
        })),
        options: {
          feeLimit: 150_000_000,
          callValue: 0,
          ...options,
        },
      });
    }
  }

  // ─── Утилиты ─────────────────────────────────────────────────────────────

  const orgonUtils = {
    /** SUN → ORGON */
    fromSun(sun) {
      return Number(sun) / 1_000_000;
    },
    /** ORGON → SUN */
    toSun(orgon) {
      return Math.round(Number(orgon) * 1_000_000);
    },
    /** Проверка адреса — Orgon адреса начинаются с 'O' (форк Tron, где 'T') */
    isAddress(addr) {
      // TODO: уточнить финальный формат адресов Orgon
      return typeof addr === 'string' && addr.length >= 34;
    },
    hexToBytes(hex) {
      const clean = hex.replace(/^0x/, '');
      return new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    },
    bytesToHex(bytes) {
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    // Совместимость с ethers.js (используется в signMessageV2)
    ethersUtils: {
      arrayify(hex) {
        return orgonUtils.hexToBytes(hex);
      },
      hexlify(bytes) {
        return '0x' + orgonUtils.bytesToHex(bytes);
      },
    },
  };

  // ─── Сборка объекта window.tron ───────────────────────────────────────────

  const tronWebInstance = new OrgonWeb();

  /**
   * window.tron — главный объект провайдера OrgonLink.
   * dApp обращаются через window.tron или window.tron.tronWeb
   */
  const tronProvider = {
    tronWeb: tronWebInstance,
    isOrgonLink: true,

    /**
     * request() — EIP-1193-подобный метод (адаптация для Tron/Orgon).
     * Пример: await window.tron.request({ method: 'tron_requestAccounts' })
     */
    request(args) {
      return tronWebInstance.request(args);
    },

    on(event, fn) { return tronWebInstance.on(event, fn); },
    off(event, fn) { return tronWebInstance.off(event, fn); },
    once(event, fn) { return tronWebInstance.once(event, fn); },
  };

  // Инжектируем в window
  Object.defineProperty(window, 'tron', {
    value: tronProvider,
    writable: false,
    configurable: false,
  });

  // window.orgonWeb — удобный псевдоним для кода специфичного для Orgon
  Object.defineProperty(window, 'orgonWeb', {
    get() { return window.tron.tronWeb; },
    configurable: false,
  });

  // Сигнал готовности провайдера
  window.dispatchEvent(new Event('tron#initialized'));
  window.dispatchEvent(new Event('orgonWeb#initialized'));

  console.debug('[OrgonLink] Provider injected', tronWebInstance.version);

})();
