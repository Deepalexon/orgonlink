/**
 * KeyringController — управление ключами OrgonLink.
 *
 * Реализация БЕЗ orgonweb (orgonweb тянет Google Closure Protobuf,
 * который несовместим с Chrome Extension Service Worker).
 *
 * Используем чистые библиотеки:
 *   @noble/curves    — secp256k1 подпись
 *   @noble/hashes    — keccak256, sha256
 *   @scure/bip32     — HD деривация
 *   @scure/bip39     — мнемоника BIP39
 *   bs58check        — base58check кодирование
 *
 * Подтверждённые параметры Orgon:
 *   ADDRESS_PREFIX  = 0x73  (адреса начинаются с 'o')
 *   DERIVATION_PATH = m/44'/195'/0'/0/0
 *   signMessageV2   = "\x19TRON Signed Message:\n" + len + msg (TIP-191)
 *   signTransaction = secp256k1.sign(txID, privKey, {lowS:true})
 *                     recovery byte = v + 27 (как у Tron)
 */

'use strict';

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { mnemonicToSeed, generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import bs58checkPkg from 'bs58check';

const bs58check = bs58checkPkg.default || bs58checkPkg;

const DERIVATION_PATH = "m/44'/195'/0'/0/0";
const ADDRESS_PREFIX  = 0x73;
const SIGN_MSG_PREFIX = '\x19TRON Signed Message:\n';

export class KeyringController {
  constructor() {
    this._privateKeyBytes = null; // Uint8Array — только в памяти
  }

  // ─── Создание / Импорт ────────────────────────────────────────────────

  async createFromMnemonic(mnemonic, password) {
    const clean = mnemonic.trim();
    if (!validateMnemonic(clean, wordlist)) {
      throw new Error('Неверная seed-фраза (BIP39 validation failed)');
    }
    const seed = await mnemonicToSeed(clean);
    const root = HDKey.fromMasterSeed(seed);
    const child = root.derive(DERIVATION_PATH);
    this._privateKeyBytes = child.privateKey;

    const address = privKeyToAddress(this._privateKeyBytes);
    await this._saveEncrypted({ mnemonic: clean, privateKey: bytesToHex(this._privateKeyBytes) }, password);
    return address;
  }

  async importPrivateKey(privateKeyHex, password) {
    const clean = privateKeyHex.trim().replace(/^0x/, '');
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
      throw new Error('Неверный формат приватного ключа (ожидается 64 hex символа)');
    }
    this._privateKeyBytes = hexToBytes(clean);
    const address = privKeyToAddress(this._privateKeyBytes);
    await this._saveEncrypted({ mnemonic: null, privateKey: clean }, password);
    return address;
  }

  // ─── Lock / Unlock ────────────────────────────────────────────────────

  async unlock(password) {
    const vault = await this._loadVault();
    if (!vault) throw new Error('Кошелёк не найден. Создайте новый.');
    const decrypted = await this._decrypt(vault, password);
    this._privateKeyBytes = hexToBytes(decrypted.privateKey);
    return privKeyToAddress(this._privateKeyBytes);
  }

  async lock() {
    if (this._privateKeyBytes) {
      this._privateKeyBytes.fill(0);
    }
    this._privateKeyBytes = null;
  }

  async hasVault() {
    return !!(await this._loadVault());
  }

  // ─── Подпись транзакции ───────────────────────────────────────────────

  /**
   * Подписывает Tron/Orgon транзакцию.
   * txID — hex-строка, 32 байта.
   * Возвращает транзакцию с добавленным полем signature[].
   */
  async signTransaction(_address, transaction) {
    if (!this._privateKeyBytes) throw new Error('Кошелёк заблокирован');

    const txIdHex = transaction.txID;
    if (!txIdHex || !/^[0-9a-fA-F]{64}$/.test(txIdHex)) {
      throw new Error('Неверный txID: ' + txIdHex);
    }

    const txHash = hexToBytes(txIdHex);
    const sig = secp256k1.sign(txHash, this._privateKeyBytes, { lowS: true });

    // Tron/Orgon signature format: r(32) + s(32) + v(1), v = recovery + 27 (Ethereum style but +27 not EIP-155)
    const sigBytes = sig.toCompactRawBytes(); // 64 bytes r+s
    const v = sig.recovery + 27;             // 27 or 28
    const sigHex = bytesToHex(sigBytes) + v.toString(16).padStart(2, '0');

    return {
      ...transaction,
      signature: [sigHex],
    };
  }

  // ─── signMessageV2 (TIP-191) ──────────────────────────────────────────

  /**
   * Подписывает сообщение по стандарту TIP-191.
   * Prefix: "\x19TRON Signed Message:\n" + message.length
   */
  async signMessageV2(_address, message) {
    if (!this._privateKeyBytes) throw new Error('Кошелёк заблокирован');

    const msgStr = typeof message === 'string' ? message : bytesToHex(message);
    const toSign = SIGN_MSG_PREFIX + msgStr.length + msgStr;
    const msgHash = keccak_256(new TextEncoder().encode(toSign));

    const sig = secp256k1.sign(msgHash, this._privateKeyBytes, { lowS: true });
    const v = sig.recovery + 27;
    return '0x' + bytesToHex(sig.toCompactRawBytes()) + v.toString(16).padStart(2, '0');
  }

  /**
   * Восстанавливает base58-адрес из подписи сообщения.
   */
  async verifyMessageV2(message, signatureHex) {
    const msgStr = typeof message === 'string' ? message : bytesToHex(message);
    const toSign = SIGN_MSG_PREFIX + msgStr.length + msgStr;
    const msgHash = keccak_256(new TextEncoder().encode(toSign));

    const sigHex = signatureHex.replace(/^0x/, '');
    const sigBytes = hexToBytes(sigHex.slice(0, 128)); // 64 bytes compact
    const v = parseInt(sigHex.slice(128, 130), 16);
    const recovery = v >= 27 ? v - 27 : v;

    const sig = secp256k1.Signature.fromCompact(sigBytes).addRecoveryBit(recovery);
    const pubKey = sig.recoverPublicKey(msgHash).toRawBytes(false); // uncompressed

    return pubKeyToAddress(pubKey);
  }

  // ─── Генерация мнемоники ──────────────────────────────────────────────

  static generateMnemonic() {
    return generateMnemonic(wordlist, 128); // 12 слов
  }

  // ─── Шифрование vault (AES-256-GCM + PBKDF2) ─────────────────────────

  async _saveEncrypted(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iv   = crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt']
    );

    const payload   = new TextEncoder().encode(JSON.stringify({ ...data, version: 1 }));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, payload);

    await chrome.storage.local.set({
      orgonlink_vault: {
        encrypted: bytesToHex(new Uint8Array(encrypted)),
        salt:      bytesToHex(salt),
        iv:        bytesToHex(iv),
        version:   1,
      }
    });
  }

  async _loadVault() {
    const data = await chrome.storage.local.get('orgonlink_vault');
    return data.orgonlink_vault ?? null;
  }

  async _decrypt(vault, password) {
    const salt      = hexToBytes(vault.salt);
    const iv        = hexToBytes(vault.iv);
    const encrypted = hexToBytes(vault.encrypted);

    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['decrypt']
    );

    let decrypted;
    try {
      decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encrypted);
    } catch {
      throw new Error('Неверный пароль');
    }

    return JSON.parse(new TextDecoder().decode(decrypted));
  }
}

// ─── Адресный алгоритм Orgon/Tron ─────────────────────────────────────

/**
 * privKey (Uint8Array 32) → { base58, hex }
 * Алгоритм: secp256k1 uncompressed pubkey → keccak256 → last 20 bytes → prefix 0x73 → base58check
 */
function privKeyToAddress(privKeyBytes) {
  const pubKey = secp256k1.getPublicKey(privKeyBytes, false); // 65 bytes, uncompressed
  return pubKeyToAddress(pubKey);
}

function pubKeyToAddress(pubKeyUncompressed) {
  // pubkey без первого байта (0x04)
  const body = pubKeyUncompressed.length === 65 ? pubKeyUncompressed.slice(1) : pubKeyUncompressed;
  const keccakHash = keccak_256(body);              // 32 bytes
  const addressBody = keccakHash.slice(-20);         // last 20 bytes
  const prefixed = new Uint8Array([ADDRESS_PREFIX, ...addressBody]); // 21 bytes
  const base58 = bs58check.encode(prefixed);
  const hex = ADDRESS_PREFIX.toString(16).padStart(2, '0') + bytesToHex(addressBody);
  return { base58, hex };
}

// ─── Утилиты ──────────────────────────────────────────────────────────

function hexToBytes(hex) {
  const clean = (hex || '').replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex: ' + clean.slice(0, 20));
  return new Uint8Array(clean.match(/.{1,2}/g).map(b => parseInt(b, 16)));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
