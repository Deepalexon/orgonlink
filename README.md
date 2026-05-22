# OrgonLink — Browser Extension Wallet

Браузерное расширение (Chrome MV3) для блокчейна Orgon — аналог TronLink.

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                     dApp (любой сайт)                   │
│  const tron = window.tron                               │
│  const tronWeb = tron.tronWeb                           │
│  await tronWeb.trx.sign(tx)                             │
│  await tronWeb.transactionBuilder.sendTrx(to, amount)   │
└────────────────┬────────────────────────────────────────┘
                 │ CustomEvent('OrgonLinkRequest')
                 ▼
┌─────────────────────────────────────────────────────────┐
│  src/provider/orgonWeb.js  [MAIN world]                 │
│  • window.tron             — основной объект провайдера │
│  • window.tron.tronWeb     — OrgonWeb экземпляр         │
│  • window.orgonWeb         — псевдоним                  │
│  • transactionBuilder, trx, contract, utils             │
│  • EventEmitter: connect, disconnect, accountsChanged   │
└────────────────┬────────────────────────────────────────┘
                 │ CustomEvent ↕
                 ▼
┌─────────────────────────────────────────────────────────┐
│  src/content/bridge.js  [ISOLATED world]                │
│  • chrome.runtime.sendMessage ↔ SW                      │
└────────────────┬────────────────────────────────────────┘
                 │ chrome.runtime.sendMessage
                 ▼
┌─────────────────────────────────────────────────────────┐
│  src/background/service_worker.js                       │
│  ├── KeyringController  (ключи, AES-256-GCM vault)      │
│  ├── OrgonRPC           (HTTP клиент Full Node)         │
│  ├── PermissionController (разрешения dApp)             │
│  └── TxQueue            (очередь подтверждений)         │
└────────────────┬────────────────────────────────────────┘
                 │ fetch / HTTPS
                 ▼
    https://tr80.orgon.space  (Full Node)
    https://tr81.orgon.space  (Solidity Node)
```

## Ноды и сеть

| Параметр | Значение |
|---|---|
| Full Node | `https://tr80.orgon.space` |
| Solidity Node | `https://tr81.orgon.space` |
| Full Node (http+port) | `http://tr80.orgon.space:19067` |
| Solidity Node (http+port) | `http://tr80.orgon.space:19068` |
| OrgonGate (платный) | `https://gate.orgon.space` |
| Testnet (Quasar) | `https://api.quasar.orgonscan.org` |
| API Key Header | `ORGON-PRO-API-KEY` ← отличается от Tron! |

## Провайдер — как dApp использует OrgonLink

### Подключение
```javascript
// Получить провайдер (как в TronLink)
const tron = window.tron;
const tronWeb = tron.tronWeb;

// Запрос доступа — показывает popup
await tron.request({ method: 'tron_requestAccounts' });
// или
await tronWeb.requestAccess();

// Состояние
console.log(tronWeb.ready);          // true если подключён и разблокирован
console.log(tronWeb.defaultAddress); // { base58, hex } или false

// События
tronWeb.on('connect', ({ address }) => console.log('Connected:', address));
tronWeb.on('disconnect', () => console.log('Disconnected'));
tronWeb.on('accountsChanged', addr => console.log('New account:', addr));
tronWeb.on('networkChanged', net => console.log('Network:', net));
```

### Создание и отправка транзакции
```javascript
// 1. Создать транзакцию
const tx = await tronWeb.transactionBuilder.sendTrx(toAddress, amountInSun);
// 2. Подписать (открывается popup OrgonLink)
const signedTx = await tronWeb.trx.sign(tx);
// 3. Broadcast
const result = await tronWeb.trx.sendRawTransaction(signedTx);
console.log(result.txid);
```

### oRC20 токены
```javascript
// Через contract()
const contract = await tronWeb.contract(ERC20_ABI, tokenAddress);
const balance = await contract.balanceOf(myAddress).call();
const txId = await contract.transfer(toAddress, amount).send({ feeLimit: 100_000_000 });

// Через transactionBuilder (низкоуровнево)
const tx = await tronWeb.transactionBuilder.triggerSmartContract(
  tokenAddress,
  'transfer(address,uint256)',
  { feeLimit: 100_000_000 },
  [{ type: 'address', value: toAddress }, { type: 'uint256', value: 100 }]
);
const signed = await tronWeb.trx.sign(tx.transaction);
await tronWeb.trx.sendRawTransaction(signed);
```

### Подпись сообщений (TIP-191)
```javascript
// signMessageV2 — рекомендуется (TIP-191, префикс "\x19TRON Signed Message:\n")
const signature = await tronWeb.trx.signMessageV2('Hello Orgon');

// Верификация — возвращает base58 адрес подписанта
const signer = await tronWeb.trx.verifyMessageV2('Hello Orgon', signature);
console.log(signer === tronWeb.defaultAddress.base58); // true
```

## Ключевые отличия от TronLink / TronWeb

| Параметр | TronLink / TronWeb | OrgonLink |
|---|---|---|
| npm пакет | `tronweb` | `orgonweb` |
| window объект | `window.tron` | `window.tron` ✓ (совместимо) |
| API Key Header | `TRON-PRO-API-KEY` | `ORGON-PRO-API-KEY` |
| Full Node | `https://api.trongrid.io` | `https://tr80.orgon.space` |
| Токен стандарты | TRC-10, TRC-20, TRC-721 | oRC-10, oRC-20, oRC-721 |
| Нативный токен | TRX | ORGON |
| Подпись префикс | `\x19TRON Signed Message:\n` | `\x19TRON Signed Message:\n` (совместимо) |

## TODO — заглушки требующие реализации

Файл `src/background/keyring.js` содержит заглушки вместо реальных crypto операций.
После `npm install` заменить их на:

```javascript
// Деривация адреса
import { mnemonicToSeed } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import * as secp256k1 from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import bs58check from 'bs58check';

// Подпись
const sig = await secp256k1.sign(txIdBytes, privateKey, { lowS: true });
```

## Следующие этапы

1. **Popup UI** — создание/импорт кошелька, баланс, история транзакций
2. **Approval UI** — popup подтверждения транзакций и connect-запросов
3. **Crypto** — подключить @noble/* libs, убрать заглушки в keyring.js
4. **Build pipeline** — настроить Rollup/Webpack для бандлинга
5. **Тесты** — unit тесты KeyringController, интеграционные с Quasar testnet
