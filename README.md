# OrgonLink — Chrome Extension Wallet

Браузерное расширение-кошелёк для блокчейна [Orgon](https://orgon.space) (форк Tron).

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4fffb0?style=flat&logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Возможности

- 🔐 Создание и импорт кошелька (BIP39 seed-фраза / приватный ключ)
- 💰 Отображение баланса ORGON в реальном времени
- 💸 Отправка ORGON с подписью транзакции
- 📊 История транзакций через gate.orgon.space API
- 📱 QR-код адреса для получения средств
- 💱 Курс ORGON/USDT с биржи Blazarex
- 🌐 Поддержка Mainnet и Quasar Testnet
- 🔌 Provider API для dApp (`window.tron` / `window.tron.tronWeb`)

---

## Параметры блокчейна Orgon

| Параметр | Значение |
|---|---|
| Address prefix | `0x73` → адреса начинаются с `o` |
| Derivation path | `m/44'/195'/0'/0/0` |
| Sign message | `\x19TRON Signed Message:\n` (TIP-191) |
| Full Node | `https://tr80.orgon.space` |
| Solidity Node | `https://tr81.orgon.space` |
| API Gate | `https://gate.orgon.space` |
| Testnet Gate | `https://quasargate.orgon.space` |
| Explorer | `https://orgonscan.org` |

---

## Установка (разработка)

### Требования
- Node.js 18+
- npm 9+

### Сборка

```bash
# Установка зависимостей
npm install

# Сборка бандлов (dist/)
npm run build

# Сборка с отслеживанием изменений
npm run dev
```

### Установка в Chrome

1. Открой `chrome://extensions`
2. Включи **Режим разработчика**
3. Нажми **Загрузить распакованное**
4. Выбери папку `orgonlink/`

---

## Архитектура

```
orgonlink/
├── manifest.json              # Chrome Extension MV3 манифест
├── icons/                     # Иконки расширения
├── src/
│   ├── background/
│   │   ├── service_worker.js  # SW: обработчики RPC, подпись, хранение
│   │   ├── keyring.js         # Крипта: BIP39, HD деривация, подпись tx
│   │   ├── rpc.js             # HTTP клиент Full Node / Gate API
│   │   ├── permissions.js     # Контроль доступа dApp
│   │   └── tx_queue.js        # Очередь подтверждения транзакций
│   ├── content/
│   │   └── bridge.js          # ISOLATED world: мост popup ↔ provider
│   ├── provider/
│   │   └── orgonWeb.js        # MAIN world: window.tron провайдер
│   ├── popup/
│   │   ├── popup.html         # UI расширения
│   │   └── popup.js           # Логика UI (CSP-совместимо, без inline JS)
│   └── shared/
│       └── constants.js       # Сети, константы
└── dist/                      # Бандлы Rollup (генерируется)
    ├── background/service_worker.js
    ├── content/bridge.js
    └── provider/orgonWeb.js
```

### Поток данных

```
dApp → window.tron.tronWeb → CustomEvent → bridge.js (ISOLATED)
     → chrome.runtime.sendMessage → service_worker.js
     → KeyringController (подпись) + OrgonRPC (broadcast)
     → https://tr80.orgon.space
```

---

## API интеграции

| Сервис | URL | Назначение |
|---|---|---|
| Orgon Full Node | `https://tr80.orgon.space` | Баланс, создание tx, broadcast |
| Orgon Gate | `https://gate.orgon.space` | История транзакций (`/v1/accounts/`) |
| Quasar Testnet | `https://quasargate.orgon.space` | Тестовая сеть |
| Blazarex | `https://public-api.blazarex.com/api/tickers` | Курс ORGON/USDT |

---

## Стек технологий

| Компонент | Технология |
|---|---|
| Крипто | `@noble/curves`, `@noble/hashes`, `@scure/bip32`, `@scure/bip39`, `bs58check` |
| Бандлер | Rollup + plugins (commonjs, node-resolve, polyfill-node, terser) |
| Шифрование vault | AES-256-GCM + PBKDF2 (600k итераций), WebCrypto API |
| QR-код | qrcode-generator (встроен в popup.js) |
| Стандарт | Chrome Extension MV3, CSP `script-src 'self'` |

---

## Рабочий процесс (Git Flow)

```bash
# Новая фича
git checkout develop
git checkout -b feature/имя-фичи
# ... разработка ...
git add .
git commit -m "feat: описание"
git push origin feature/имя-фичи
# Pull Request → develop

# Релиз
git checkout main
git merge develop
git tag v0.2.0
git push origin main --tags
```

---

## Конвенция коммитов

```
feat:     новая функция
fix:      исправление бага
refactor: рефакторинг без изменения поведения
style:    UI/CSS правки
docs:     документация
build:    изменения сборки
```

---

## Дорожная карта

- [ ] Поддержка oRC-20 токенов (баланс + отправка)
- [ ] Стейкинг ORGON
- [ ] Мультиаккаунт
- [ ] Hardware wallet (Ledger)
- [ ] Публикация в Chrome Web Store

---

## Лицензия

MIT — см. [LICENSE](LICENSE)
