/**
 * service_worker.js — Background Service Worker (MV3)
 *
 * Центральный обработчик всей логики кошелька.
 */

'use strict';

import { KeyringController } from './keyring.js';
import { OrgonRPC } from './rpc.js';
import { PermissionController } from './permissions.js';
import { TxQueue } from './tx_queue.js';
import { NETWORKS } from '../shared/constants.js';

// ─── Глобальное состояние ─────────────────────────────────────────────────

const state = {
  isUnlocked: false,
  selectedAddress: null,  // { base58, hex }
  network: { ...NETWORKS.mainnet },
};

const keyring = new KeyringController();
const rpc = new OrgonRPC(
  state.network.fullNode,
  state.network.solidityNode,
  null,                        // apiKey (опционально)
  state.network.apiGate        // gate URL для истории транзакций
);
const permissions = new PermissionController();
const txQueue = new TxQueue();

// ─── Маршрутизатор запросов ───────────────────────────────────────────────

const handlers = {

  async getState() {
    return {
      isUnlocked: state.isUnlocked,
      selectedAddress: state.selectedAddress,
      network: state.network,
    };
  },

  async requestAccess({ origin }) {
    if (!state.isUnlocked) {
      await openPopup('unlock');
      throw providerError(4001, 'User must unlock wallet first');
    }
    const existing = await permissions.getPermission(origin);
    if (existing?.connected) return state.selectedAddress;

    const granted = await openApprovalPopup('connect', { origin });
    if (!granted) throw providerError(4001, 'User rejected connection');

    await permissions.grantPermission(origin, state.selectedAddress.base58);
    return state.selectedAddress;
  },

  async getCurrentAddress({ origin } = {}) {
    if (!state.isUnlocked) return null;
    if (origin) {
      const perm = await permissions.getPermission(origin);
      if (!perm?.connected) return null;
    }
    return state.selectedAddress;
  },

  // ─── Подпись транзакции (с popup подтверждения) ────────────────────────

  async signTransaction({ transaction }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');

    const txId = await txQueue.add(transaction);
    const approved = await openApprovalPopup('transaction', {
      txId, transaction, from: state.selectedAddress.base58,
    });
    if (!approved) {
      txQueue.reject(txId);
      throw providerError(4001, 'User rejected transaction');
    }

    const signed = await keyring.signTransaction(state.selectedAddress.hex, transaction);
    txQueue.resolve(txId, signed);
    return signed;
  },

  // ─── Подпись ключом напрямую (если dApp передал privateKey) ───────────

  async signTransactionWithKey({ transaction, privateKey }) {
    return keyring.signTransactionWithKey(transaction, privateKey);
  },

  // ─── Broadcast ─────────────────────────────────────────────────────────

  async broadcastTransaction({ transaction }) {
    return rpc.broadcastTransaction(transaction);
  },

  // ─── signMessageV2 / verifyMessageV2 (TIP-191) ─────────────────────────

  async signMessageV2({ message }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    return keyring.signMessageV2(state.selectedAddress.hex, message);
  },

  async verifyMessageV2({ message, signature }) {
    return keyring.verifyMessageV2(message, signature);
  },

  async verifyMessage({ message, signature, address }) {
    return keyring.verifyMessage(message, signature, address);
  },

  // ─── RPC прокси ────────────────────────────────────────────────────────

  async rpcCall({ method, params, node }) {
    return rpc.call(method, params, node);
  },

  // ─── trx подмодуль ─────────────────────────────────────────────────────

  async ['trx.getBalance']({ address }) {
    return rpc.getBalance(address);
  },

  async ['trx.getTransactions']({ address, limit = 20 }) {
    return rpc.getTransactions(address, limit);
  },

  async ['trx.getAccount']({ address }) {
    return rpc.getAccount(address);
  },

  async ['trx.getAccount']({ address }) {
    return rpc.getAccount(address);
  },

  async ['trx.getTransaction']({ txid }) {
    return rpc.getTransactionById(txid);
  },

  async ['trx.getTransactionInfo']({ txid }) {
    return rpc.getTransactionInfo(txid);
  },

  async ['trx.getCurrentBlock']() {
    return rpc.getCurrentBlock();
  },

  async ['trx.getBlockByNumber']({ num }) {
    return rpc.getBlockByNumber(num);
  },

  // ─── transactionBuilder подмодуль ──────────────────────────────────────

  // ─── Прямая отправка из popup (без второго окна подтверждения) ──────────

  async ['wallet.sendOrgon']({ to, amount, from }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');

    const ownerAddr = from ?? state.selectedAddress?.base58;
    if (!ownerAddr) throw new Error('Нет адреса отправителя');
    if (!to) throw new Error('Нет адреса получателя');
    if (ownerAddr === to) throw new Error('Нельзя отправить самому себе');

    // 1. Создаём неподписанную транзакцию
    const raw = await rpc.call('wallet/createtransaction', {
      owner_address: ownerAddr,
      to_address: to,
      amount,
      visible: true,
    });

    if (!raw || !raw.txID) {
      const errMsg = raw?.Error ?? raw?.error ?? JSON.stringify(raw);
      throw new Error('Ошибка создания транзакции: ' + errMsg);
    }

    // 2. Подписываем напрямую (keyring уже разблокирован)
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);

    // 3. Broadcast
    const result = await rpc.broadcastTransaction(signed);
    return result;
  },

  async ['transactionBuilder.sendTrx']({ to, amount, from }) {
    // visible:true — принимать base58 адреса (Orgon адреса начинаются с 'o')
    const ownerAddr = from ?? state.selectedAddress?.base58 ?? state.selectedAddress?.hex;
    const raw = await rpc.call('wallet/createtransaction', {
      owner_address: ownerAddr,
      to_address: to,
      amount,
      visible: true,   // ОБЯЗАТЕЛЬНО для base58 адресов
    });
    return raw;
  },

  async ['transactionBuilder.sendToken']({ to, amount, tokenId, from }) {
    const ownerAddr = from ?? state.selectedAddress?.base58 ?? state.selectedAddress?.hex;
    return rpc.call('wallet/transferasset', {
      owner_address: ownerAddr,
      to_address: to,
      asset_name: tokenId,
      amount,
      visible: true,
    });
  },

  async ['transactionBuilder.triggerSmartContract']({ contractAddress, functionSelector, options, parameters, ownerAddress }) {
    return rpc.triggerSmartContract(
      ownerAddress ?? state.selectedAddress.hex,
      contractAddress,
      functionSelector,
      parameters,
      options
    );
  },

  async ['transactionBuilder.triggerConstantContract']({ contractAddress, functionSelector, options, parameters, ownerAddress }) {
    return rpc.triggerConstantContract(
      ownerAddress ?? state.selectedAddress?.hex ?? '01',
      contractAddress,
      functionSelector,
      parameters,
      options
    );
  },

  async ['transactionBuilder.estimateEnergy']({ contractAddress, functionSelector, options, parameters, ownerAddress }) {
    return rpc.estimateEnergy(
      ownerAddress ?? state.selectedAddress?.hex ?? '01',
      contractAddress,
      functionSelector,
      parameters,
      options
    );
  },

  async ['transactionBuilder.createSmartContract']({ options }) {
    return rpc.call('wallet/deploycontract', options);
  },

  // ─── contract подмодуль ────────────────────────────────────────────────

  async ['contract.call']({ address, functionSelector, parameters, options }) {
    return rpc.triggerConstantContract(
      state.selectedAddress?.hex ?? '01',
      address,
      functionSelector,
      parameters,
      options
    );
  },

  async ['contract.send']({ address, functionSelector, parameters, options }) {
    // Создаём транзакцию
    const result = await rpc.triggerSmartContract(
      state.selectedAddress.hex,
      address,
      functionSelector,
      parameters,
      options
    );
    // Отправляем на подпись + broadcast
    const signed = await handlers.signTransaction({ transaction: result.transaction });
    return rpc.broadcastTransaction(signed);
  },

  // ─── Внутренние методы (popup) ─────────────────────────────────────────

  async ['__internal.unlock']({ password }) {
    const address = await keyring.unlock(password);
    state.isUnlocked = true;
    state.selectedAddress = address;
    broadcastEvent('unlocked', { state: await handlers.getState() });
    return true;
  },

  async ['__internal.lock']() {
    await keyring.lock();
    state.isUnlocked = false;
    state.selectedAddress = null;
    broadcastEvent('locked');
    return true;
  },

  async ['__internal.createWallet']({ mnemonic, password }) {
    const address = await keyring.createFromMnemonic(mnemonic, password);
    state.isUnlocked = true;
    state.selectedAddress = address;
    broadcastEvent('unlocked', { state: await handlers.getState() });
    return { address };
  },

  async ['__internal.importWallet']({ privateKey, password }) {
    const address = await keyring.importPrivateKey(privateKey, password);
    state.isUnlocked = true;
    state.selectedAddress = address;
    broadcastEvent('unlocked', { state: await handlers.getState() });
    return { address };
  },

  async ['__internal.approveRequest']({ requestId, approved }) {
    txQueue.setApproval(requestId, approved);
    return true;
  },

  async ['__internal.getPendingRequest']({ requestId }) {
    return txQueue.get(requestId);
  },

  async ['__internal.generateMnemonic']() {
    return KeyringController.generateMnemonic();
  },

  async ['__internal.getState']() {
    return handlers.getState();
  },

  async ['__internal.switchNetwork']({ network }) {
    if (!NETWORKS[network]) throw providerError(4200, `Unknown network: ${network}`);
    Object.assign(state.network, NETWORKS[network]);
    rpc.fullNodeUrl = state.network.fullNode;
    rpc.solidityNodeUrl = state.network.solidityNode;
    rpc.apiGateUrl = state.network.apiGate;
    broadcastEvent('networkChanged', { network: state.network });
    return state.network;
  },
};

// ─── Обработчик сообщений ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'PROVIDER_REQUEST' && message.type !== 'INTERNAL_REQUEST') {
    return false;
  }

  const { id, method, params, origin } = message;
  const resolvedOrigin = origin ?? (sender.url ? new URL(sender.url).origin : 'unknown');

  const handler = handlers[method];
  if (!handler) {
    sendResponse({ id, error: { code: 4200, message: `Unknown method: ${method}` } });
    return true;
  }

  handler({ ...(params ?? {}), origin: resolvedOrigin })
    .then(result => sendResponse({ id, result }))
    .catch(err => sendResponse({
      id,
      error: { code: err.code ?? 4000, message: err.message ?? 'Unknown error' },
    }));

  return true;
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function providerError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function broadcastEvent(type, payload = {}) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      target: 'content_script',
      type: 'EXTENSION_EVENT',
      payload: { type, ...payload },
    }).catch(() => {});
  }
}

function openApprovalPopup(type, data) {
  return new Promise((resolve) => {
    const requestId = `approval_${Date.now()}`;
    txQueue.addApproval(requestId, resolve);

    const params = new URLSearchParams({
      type,
      requestId,
      data: JSON.stringify(data),
    });

    chrome.windows.create({
      url: `src/popup/popup.html?${params}`,
      type: 'popup',
      width: 380,
      height: 620,
      focused: true,
    });
  });
}

function openPopup(view) {
  return chrome.windows.create({
    url: `src/popup/popup.html?view=${view}`,
    type: 'popup',
    width: 380,
    height: 620,
  });
}

// ─── Keep-alive (MV3 SW засыпает через ~30с) ──────────────────────────────

chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    chrome.storage.local.get('__ping').catch(() => {});
  }
});

console.debug('[OrgonLink] Service Worker started, network:', state.network.name);
