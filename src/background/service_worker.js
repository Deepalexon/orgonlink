/**
 * service_worker.js — Background Service Worker (MV3)
 *
 * Центральный обработчик всей логики кошелька.
 */

'use strict';

import { KeyringController, hexToBase58, base58ToCleanHex } from './keyring.js';
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

  async ['trx.getAccountFull']({ address }) {
    const addr = address ?? state.selectedAddress?.base58;
    const data = await rpc.getAccount(addr);
    // Логируем для диагностики oRC-20
    console.log('[AccountFull] keys:', Object.keys(data ?? {}).join(', '));
    console.log('[AccountFull] trc20:', JSON.stringify(data?.trc20 ?? []));
    console.log('[AccountFull] assetV2:', JSON.stringify(data?.assetV2 ?? []));
    console.log('[AccountFull] balance:', data?.balance);
    return data;
  },

  async ['trx.getTransactions']({ address, limit = 20 }) {
    // gate.orgon.space принимает base58 адрес (начинается с 'o')
    const base58Addr = state.selectedAddress?.base58 ?? address;
    const hexAddr = state.selectedAddress?.hex ?? null;
    return rpc.getTransactions(base58Addr, hexAddr, limit);
  },

  // ─── Ресурсы: Energy, Bandwidth, Staking ──────────────────────────────

  async ['trx.getAccountResource']({ address }) {
    const addr = address ?? state.selectedAddress?.base58;
    return rpc.getAccountResource(addr);
  },

  async ['wallet.freezeBalanceV2']({ amount, resource }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const raw = await rpc.freezeBalanceV2(ownerAddr, amount, resource);
    if (!raw?.txID) throw new Error(raw?.Error ?? 'Ошибка создания транзакции freeze');
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);
    return rpc.broadcastTransaction(signed);
  },

  async ['wallet.unfreezeBalanceV2']({ amount, resource }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const raw = await rpc.unfreezeBalanceV2(ownerAddr, amount, resource);
    if (!raw?.txID) throw new Error(raw?.Error ?? 'Ошибка создания транзакции unfreeze');
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);
    return rpc.broadcastTransaction(signed);
  },

  async ['wallet.withdrawExpireUnfreeze']() {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const raw = await rpc.withdrawExpireUnfreeze(ownerAddr);
    if (!raw?.txID) throw new Error(raw?.Error ?? 'Нет средств для вывода');
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);
    return rpc.broadcastTransaction(signed);
  },

  // ─── Голосование ────────────────────────────────────────────────────────

  async ['wallet.listWitnesses']() {
    const witnesses = await rpc.listWitnesses();
    // Конвертируем hex адреса в base58 для отображения и голосования
    return (witnesses ?? []).map(w => ({
      ...w,
      address: w.address ? hexToBase58(w.address) : w.address,
    }));
  },

  async ['wallet.getAccountVotes']({ address }) {
    const addr = address ?? state.selectedAddress?.base58;
    const votes = await rpc.getAccountVotes(addr);
    // vote_address может быть hex — конвертируем
    return (votes ?? []).map(v => ({
      ...v,
      vote_address: v.vote_address ? hexToBase58(v.vote_address) : v.vote_address,
    }));
  },

  async ['wallet.getReward']({ address }) {
    const addr = address ?? state.selectedAddress?.base58;
    return rpc.getReward(addr);
  },

  async ['wallet.voteWitness']({ votes }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const raw = await rpc.voteWitness(ownerAddr, votes);
    if (!raw?.txID) throw new Error(raw?.Error ?? 'Ошибка создания транзакции голосования');
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);
    return rpc.broadcastTransaction(signed);
  },

  async ['wallet.withdrawVotingRewards']() {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const raw = await rpc.withdrawVotingRewards(ownerAddr);
    if (!raw?.txID) throw new Error(raw?.Error ?? 'Нет наград для вывода');
    const signed = await keyring.signTransaction(state.selectedAddress.hex, raw);
    return rpc.broadcastTransaction(signed);
  },

  // ─── oRC-20 токены ──────────────────────────────────────────────────────

  async ['trx.getORC20Balance']({ contractAddress, address }) {
    const addr    = address ?? state.selectedAddress?.base58;
    // Передаём hex адрес без префикса — state хранит полный hex (73xxx)
    const hexFull = state.selectedAddress?.hex ?? '';
    // Убираем префикс 73 → 20 bytes = 40 hex chars
    const ownerHex = hexFull.replace(/^(73|41)/, '');
    console.log('[SW] getORC20Balance addr:', addr?.slice(0,12), 'hex:', ownerHex.slice(0,12)+'...');
    const result = await rpc.getORC20Balance(contractAddress, addr, ownerHex);
    // BigInt не сериализуется в JSON — конвертируем в строку
    const resultStr = result?.toString() ?? '0';
    console.log('[SW] getORC20Balance result:', resultStr);
    return resultStr;
  },

  async ['orc20.getTokens']({ address }) {
    const addr = address ?? state.selectedAddress?.base58;
    return rpc.getORC20Tokens(addr);
  },

  async ['orc20.getInfo']({ contractAddress }) {
    const info = await rpc.getORC20Info(contractAddress);
    // Добавляем hex адрес контракта для сопоставления с историей TX
    const contractHex = base58ToCleanHex(contractAddress);
    return { ...info, contractHex: contractHex ? '73' + contractHex : null };
  },

  async ['orc20.transfer']({ contractAddress, to, amount }) {
    if (!state.isUnlocked) throw providerError(4100, 'Wallet locked');
    const ownerAddr = state.selectedAddress?.base58;
    const ownerHex  = state.selectedAddress?.hex;

    // Конвертируем to адрес base58 → clean hex (20 bytes, без префикса)
    const toCleanHex = base58ToCleanHex(to);
    console.log('[ORC20 transfer] to:', to.slice(0,12), '→ hex:', toCleanHex?.slice(0,12)+'...');

    if (!toCleanHex || toCleanHex.length < 30) {
      throw new Error('Неверный адрес получателя');
    }

    console.log('[ORC20 transfer] contract:', contractAddress.slice(0,12),
      'owner:', ownerAddr.slice(0,12), 'amount:', amount);

    const result = await rpc.transferORC20(contractAddress, ownerAddr, toCleanHex, amount);
    console.log('[ORC20 transfer] result:', JSON.stringify(result).slice(0, 150));

    if (!result?.transaction?.txID && !result?.txID) {
      throw new Error(result?.result?.message ?? result?.Error ?? JSON.stringify(result).slice(0,100));
    }
    const tx = result.transaction ?? result;
    const signed = await keyring.signTransaction(ownerHex, tx);
    return rpc.broadcastTransaction(signed);
  },

  async ['wallet.getCanWithdrawUnfreeze']() {
    const addr = state.selectedAddress?.base58;
    return rpc.getCanWithdrawUnfreezeAmount(addr);
  },

  async ['trx.getAccount']({ address }) {
    const data = await rpc.getAccount(address);
    console.log('[Account] keys:', Object.keys(data ?? {}));
    console.log('[Account] trc20:', JSON.stringify(data?.trc20));
    console.log('[Account] assetV2:', JSON.stringify(data?.assetV2));
    console.log('[Account] balance:', data?.balance);
    return data;
  },

  async ['trx.getORC20Tokens']({ address }) {
    // Получаем полный аккаунт и извлекаем trc20 токены
    const addr = address ?? state.selectedAddress?.base58;
    const data = await rpc.getAccount(addr);
    console.log('[ORC20] raw trc20:', JSON.stringify(data?.trc20));
    console.log('[ORC20] all keys:', Object.keys(data ?? {}));
    return {
      trc20:   data?.trc20   ?? [],
      assetV2: data?.assetV2 ?? [],
      allKeys: Object.keys(data ?? {}),
    };
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

  async ['__internal.exportPrivateKey']({ password }) {
    if (!state.isUnlocked) throw new Error('Кошелёк заблокирован');
    return keyring.exportPrivateKey(password);
  },

  async ['__internal.exportMnemonic']({ password }) {
    if (!state.isUnlocked) throw new Error('Кошелёк заблокирован');
    return keyring.exportMnemonic(password);
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

    // Сохраняем в storage.session — переживает засыпание SW
    chrome.storage.session?.set({
      [`pending_approval_${requestId}`]: { type, data, requestId, ts: Date.now() }
    }).catch(() => {});

    // Держим SW живым через порт пока ждём подтверждения
    keepSwAlive();

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

// Держим SW живым пока есть pending approvals
let _keepAliveInterval = null;
function keepSwAlive() {
  if (_keepAliveInterval) return;
  _keepAliveInterval = setInterval(() => {
    if (txQueue._approvals.size === 0) {
      clearInterval(_keepAliveInterval);
      _keepAliveInterval = null;
      return;
    }
    // Пинг чтобы SW не засыпал
    chrome.storage.local.set({ __sw_keepalive: Date.now() }).catch(() => {});
  }, 5000);
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
