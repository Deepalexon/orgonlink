// OrgonLink i18n — перевод по исходной (русской) строке.
// Русский — язык-источник и фолбэк. applyTranslations обходит DOM и заменяет
// известные русские строки на текущий язык; MutationObserver ловит динамику.
// Смена языка делается перезагрузкой попапа (контент заново строится на RU).
(function () {
  'use strict';
  var LANGS = [
    { code: 'ru', name: 'Русский' },
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'ko', name: '한국어' },
    { code: 'ja', name: '日本語' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
    { code: 'pt', name: 'Português' },
    { code: 'it', name: 'Italiano' }
  ];
  var DICT = { en: {"% надёжность": "% reliability", "(не распознаны)": "(not recognized)", "12 секретных слов": "12 secret words", "14 дней": "14 days", "64 hex символа...": "64 hex characters...", "Active — порог": "Active — threshold", "Lock 3 дня": "Lock 3 days", "Owner — порог": "Owner — threshold", "Push при входящих ORGON": "Push on incoming ORGON", "Seed скопирован": "Seed copied", "Seed-фраза": "Seed phrase", "Seed-фраза (12 или 24 слова)": "Seed phrase (12 or 24 words)", "Seed-фраза скопирована": "Seed phrase copied", "Seed-фраза — это полный бэкап кошелька. Храните её офлайн. Никогда не вводите на сайтах.": "The seed phrase is a full wallet backup. Keep it offline. Never enter it on websites.", "TX ID недоступен": "TX ID unavailable", "Tron Power (голоса)": "Tron Power (votes)", "o... адрес": "o... address", "oRC-20 токены не найдены": "No oRC-20 tokens found", "oXxx... адрес получателя": "oXxx... recipient address", "oXxx... адрес смарт-контракта": "oXxx... smart contract address", "~3 сек": "~3 sec", "· нужно набрать вес ≥ порога для подтверждения.": "· must reach weight ≥ threshold to confirm.", "Адрес": "Address", "Адрес Orgon": "Orgon address", "Адрес контракта oRC-20": "oRC-20 contract address", "Адрес кошелька": "Wallet address", "Адрес получателя": "Recipient address", "Адрес получателя...": "Recipient address...", "Адрес скопирован": "Address copied", "Адреса подписантов повторяются": "Duplicate signer addresses", "Адресная книга": "Address book", "Аккаунт": "Account", "Аккаунт 1": "Account 1", "Аккаунт удалён": "Account deleted", "Аккаунты": "Accounts", "Актив": "Asset", "Активы": "Assets", "Баланс": "Balance", "Баланс:": "Balance:", "Баланс: — ORGON": "Balance: — ORGON", "Без фиксации": "No lockup", "Безопасный кошелёк для блокчейна Orgon. Ваши ключи — ваши средства.": "A secure wallet for the Orgon blockchain. Your keys — your funds.", "Будет предоставлен доступ": "Access will be granted", "ВКЛ": "ON", "ВЫКЛ": "OFF", "Валидаторы": "Validators", "Валидаторы не найдены": "No validators found", "Валидаторы, награды, Tron Power": "Validators, rewards, Tron Power", "Ваш Orgon адрес": "Your Orgon address", "Ваш адрес должен быть среди подписантов": "Your address must be among the signers", "Ваш баланс": "Your balance", "Ваш приватный ключ": "Your private key", "Ваша seed-фраза": "Your seed phrase", "Ваша подпись добавлена.": "Your signature has been added.", "Введите seed-фразу": "Enter seed phrase", "Введите адрес контракта": "Enter contract address", "Введите адрес получателя": "Enter recipient address", "Введите имя": "Enter a name", "Введите пароль": "Enter password", "Введите пароль для доступа": "Enter password to access", "Введите пароль кошелька": "Enter wallet password", "Введите приватный ключ": "Enter private key", "Введите слова через пробел...": "Enter words separated by spaces...", "Введите сумму": "Enter amount", "Весь баланс": "Entire balance", "Восстановить кошелёк": "Restore wallet", "Время": "Time", "Время подтверждения": "Confirmation time", "Вы": "You", "Вы не авторизованы подписывать эту транзакцию": "You are not authorized to sign this transaction", "Вы не в списке подписантов": "You are not in the signer list", "Вы получите": "You will receive", "Вы уже подписали эту транзакцию": "You have already signed this transaction", "Выберите контакт для получателя": "Choose a contact for the recipient", "Выберите хотя бы один тип транзакций": "Select at least one transaction type", "Выбор сети": "Select network", "Выбрать ›": "Select ›", "Вывод наград": "Claim rewards", "Выключены": "Disabled", "Голос": "Vote", "Голосование": "Voting", "Голосование...": "Voting...", "Готово к выводу": "Ready to withdraw", "Дата": "Date", "Делегирование ресурсов": "Resource delegation", "Делегировать": "Delegate", "Делегирую…": "Delegating…", "Детали транзакции": "Transaction details", "Добавить токен": "Add token", "Добавьте контракт вручную": "Add a contract manually", "Добавьте подписантов и задайте порог, чтобы перевести аккаунт в мультиподпись.": "Add signers and set a threshold to convert the account to multisig.", "Доступно": "Available", "Доступно к делегированию": "Available for delegation", "Доступно к разморозке": "Available to unfreeze", "Заблокировать": "Lock", "Загрузка валидаторов...": "Loading validators...", "Загрузка истории...": "Loading history...", "Загрузка ожидающих…": "Loading pending…", "Загрузка ресурсов...": "Loading resources...", "Загрузка...": "Loading...", "Загрузка…": "Loading…", "Заметка (опционально)": "Note (optional)", "Заморожено": "Frozen", "Заморозка / Ресурсы": "Staking / Resources", "Заморозка / разморозка": "Freeze / unfreeze", "Заморозка ORGON": "Freeze ORGON", "Заморозка...": "Freezing...", "Запишите 12 слов в правильном порядке. Без них невозможно восстановить кошелёк. Никому не передавайте seed-фразу.": "Write down the 12 words in the correct order. Without them the wallet cannot be restored. Never share your seed phrase.", "Запишите в безопасном месте": "Write it down somewhere safe", "Запрашивает подключение к кошельку": "Requests connection to the wallet", "Запрашивает подпись транзакции": "Requests a transaction signature", "Запрос подключения": "Connection request", "Запрос подписи транзакций": "Transaction signature request", "Изменить": "Edit", "Импорт 1": "Import 1", "Импорт seed-фразы (отдельный кошелёк)": "Import seed phrase (separate wallet)", "Импорт кошелька": "Import wallet", "Импорт по приватному ключу": "Import by private key", "Импортировать": "Import", "Импортировать кошелёк": "Import wallet", "Импортируйте через seed-фразу или приватный ключ": "Import via seed phrase or private key", "Импорт…": "Importing…", "Имя": "Name", "Имя (опционально)": "Name (optional)", "Имя кошелька (опционально)": "Wallet name (optional)", "Использовано": "Used", "История": "History", "История обновлена": "History updated", "История транзакций пуста": "Transaction history is empty", "КЛЮЧ": "KEY", "Ключ скопирован": "Key copied", "Комиссия": "Fee", "Комиссия (Bandwidth)": "Fee (Bandwidth)", "Комиссия (Energy)": "Fee (Energy)", "Контакт удалён": "Contact deleted", "Контактов пока нет": "No contacts yet", "Кошелёк 2": "Wallet 2", "Кошелёк заблокирован": "Wallet locked", "Кошелёк импортирован": "Wallet imported", "Кошелёк создан!": "Wallet created!", "Максимум": "Max", "Минимум": "Min", "Минимум 1 ORGON": "Minimum 1 ORGON", "Минимум 8 символов": "Minimum 8 characters", "Мои голоса": "My votes", "Мои делегирования": "My delegations", "Мультиподписной аккаунт": "Multisig account", "Мультиподпись": "Multisig", "Награды за голосование": "Voting rewards", "Нажмите ⟳ чтобы обновить": "Press ⟳ to refresh", "Назад": "Back", "Название": "Name", "Напр. Биржа / Алекс": "E.g. Exchange / Alex", "Настройки": "Settings", "Нативный токен": "Native token", "Не имеет доступа к ключам": "Has no access to keys", "Не удалось загрузить:": "Failed to load:", "Неверный адрес (должен начинаться с \"o\")": "Invalid address (must start with \"o\")", "Неверный адрес Orgon": "Invalid Orgon address", "Неверный адрес Orgon (должен начинаться с «o»)": "Invalid Orgon address (must start with «o»)", "Неверный пароль": "Incorrect password", "Недостаточно средств": "Insufficient funds", "Недостаточно токенов": "Insufficient tokens", "Нельзя отправить самому себе": "Cannot send to yourself", "Необязательно...": "Optional...", "Несколько подписантов для аккаунта": "Multiple signers for the account", "Нет аккаунтов": "No accounts", "Нет активных делегирований": "No active delegations", "Нет доступных TP. Заморозьте ORGON.": "No TP available. Freeze ORGON.", "Нет ожидающих транзакций.": "No pending transactions.", "Нет подключённых dApp": "No connected dApps", "Нет распределённых голосов": "No allocated votes", "Никому не передавайте!": "Never share with anyone!", "Новое имя аккаунта:": "New account name:", "Новый кошелёк": "New wallet", "Новый пароль кошелька": "New wallet password", "О расширении": "About", "Обмен — скоро": "Swap — coming soon", "Обменять": "Swap", "Обновить": "Refresh", "Ожидание": "Pending", "Ожидающие подписи": "Pending signatures", "Ожидающие подписи (": "Pending signatures (", "Отзываю…": "Revoking…", "Отклонить": "Reject", "Открыть в OrgonScan": "Open in OrgonScan", "Отмена": "Cancel", "Отозвать": "Revoke", "Отправитель": "Sender", "Отправить": "Send", "Отправить ORGON": "Send ORGON", "Отправить токен": "Send token", "Отправка с этого аккаунта создаёт транзакцию, которую подписывают несколько сторон (порог": "Sending from this account creates a transaction signed by several parties (threshold", "Отправка...": "Sending...", "Отправка…": "Sending…", "Отправлено": "Sent", "Отправляйте на этот адрес только токены ORGON, oRC-10 и oRC-20. Другие сети не поддерживаются.": "Send only ORGON, oRC-10 and oRC-20 tokens to this address. Other networks are not supported.", "Ошибка": "Error", "Ошибка вывода": "Withdrawal error", "Ошибка вывода наград": "Reward claim error", "Ошибка голосования": "Voting error", "Ошибка делегирования": "Delegation error", "Ошибка загрузки истории": "Error loading history", "Ошибка загрузки:": "Loading error:", "Ошибка заморозки": "Freeze error", "Ошибка импорта": "Import error", "Ошибка отзыва": "Revoke error", "Ошибка отправки": "Send error", "Ошибка переключения": "Switch error", "Ошибка подписи:": "Signature error:", "Ошибка подтверждения:": "Confirmation error:", "Ошибка разморозки": "Unfreeze error", "Ошибка создания": "Creation error", "Ошибка удаления": "Deletion error", "Ошибка:": "Error:", "Ошибка: requestId недоступен": "Error: requestId unavailable", "Ошибка: данные транзакции недоступны": "Error: transaction data unavailable", "Пароли не совпадают": "Passwords do not match", "Пароль": "Password", "Пароль для шифрования": "Encryption password", "Перевод ORGON": "ORGON transfer", "Переименовать": "Rename", "Период разморозки": "Unfreeze period", "Повторите пароль": "Repeat password", "Подключите кошелёк": "Connect wallet", "Подключить": "Connect", "Подключённые сайты": "Connected sites", "Подписанты (адрес + вес)": "Signers (address + weight)", "Подписать": "Sign", "Подтвердите пароль": "Confirm password", "Подтвердить": "Confirm", "Подтверждение транзакции": "Transaction confirmation", "Подтверждение...": "Confirming...", "Подтверждено": "Confirmed", "Поиск по имени или адресу...": "Search by name or address...", "Показать seed-фразу": "Show seed phrase", "Показать ключ": "Show key", "Получатель": "Recipient", "Получатель сможет тратить ресурс сразу": "The recipient can use the resource immediately", "Получение...": "Receiving...", "Получено": "Received", "Получить": "Receive", "Получить информацию": "Get info", "Порог подписей (threshold)": "Signature threshold", "Приватный ключ": "Private key", "Приватный ключ (64 hex)": "Private key (64 hex)", "Приватный ключ (hex)": "Private key (hex)", "Приватный ключ даёт полный доступ к кошельку. Любой кто его получит — сможет украсть все средства.": "The private key gives full access to the wallet. Anyone who obtains it can steal all funds.", "Проверьте адреса подписантов": "Check the signer addresses", "Проголосовать": "Vote", "Просмотр адреса кошелька": "View wallet address", "Разблокировать": "Unlock", "Разморозка...": "Unfreezing...", "Разрешённые операции:": "Allowed operations:", "Разрешённые типы транзакций": "Allowed transaction types", "Распределено голосов:": "Votes allocated:", "Ресурс": "Resource", "Ресурсы": "Resources", "Сайты получают доступ к вашему адресу и могут запрашивать подпись транзакций.": "Sites get access to your address and can request transaction signatures.", "Отзовите доступ в любой момент.": "Revoke access at any time.", "Сбросить всё": "Reset all", "Сбросить кошелёк": "Reset wallet", "Сбросить кошелёк? Убедитесь что seed-фраза сохранена!": "Reset the wallet? Make sure the seed phrase is saved!", "Сеть": "Network", "Символ": "Symbol", "Скопировать": "Copy", "Скопировать адрес": "Copy address", "Скрыть": "Hide", "Смарт-контракт": "Smart contract", "Сначала получите информацию о токене": "Get token info first", "Создать кошелёк": "Create wallet", "Создать мультиподпись": "Create multisig", "Создать новый кошелёк": "Create a new wallet", "Создаю…": "Creating…", "Сохраните seed-фразу": "Save your seed phrase", "Сохранить": "Save", "Сохранённые контакты": "Saved contacts", "Средства придут через": "Funds will arrive in", "Сумма": "Amount", "Сумма ORGON": "ORGON amount", "Сумма должна быть больше 0": "Amount must be greater than 0", "Текущий режим: одиночная подпись": "Current mode: single signature", "Тема оформления": "Theme", "Тип": "Type", "Токен": "Token", "Токен уже добавлен": "Token already added", "Токены / смарт-контракты": "Tokens / smart contracts", "Только в безопасном месте": "Only somewhere safe", "Только для сети Orgon": "Orgon network only", "Транзакции": "Transactions", "Транзакция": "Transaction", "Уведомления": "Notifications", "Удалить": "Delete", "Фиксация": "Lockup", "Экспорт приватного ключа": "Export private key", "Этот адрес уже в книге": "This address is already in the book", "аккаунт": "account", "валидаторов": "validators", "вес": "weight", "вы": "you", "или": "or", "контракт": "contract", "отправлен": "sent", "по весу).": "by weight).", "получен": "received", "порог больше суммы весов!": "threshold exceeds total weight!", "слово1 слово2 ...": "word1 word2 ...", "см. список ниже": "see list below", "убрать": "remove", "— TP + ресурс": "— TP + resource", "↩️ Отозвать": "↩️ Revoke", "● активен": "● active", "☀️ Светлая": "☀️ Light", "⚠️ Необратимое действие": "⚠️ Irreversible action", "✓ ORGON успешно выведен на баланс!": "✓ ORGON successfully withdrawn to balance!", "✓ Вы подписали": "✓ You signed", "✓ Контакт сохранён": "✓ Contact saved", "✓ Мультиподпись настроена": "✓ Multisig configured", "✓ Награды получены!": "✓ Rewards claimed!", "✓ Отправлено": "✓ Sent", "✓ Отправлено! TX:": "✓ Sent! TX:", "✓ Подпись добавлена": "✓ Signature added", "✓ Порог достигнут — транзакция отправлена в сеть": "✓ Threshold reached — transaction broadcast to the network", "✓ Ресурс отозван": "✓ Resource revoked", "✕ убрать": "✕ remove", "❄️ Заморозить": "❄️ Freeze", "＋ Добавить контакт": "＋ Add contact", "＋ Добавить подписанта": "＋ Add signer", "＋ Создать HD-аккаунт": "＋ Create HD account", "🌙 Тёмная": "🌙 Dark", "📓 Контакты": "📓 Contacts", "🔐 Ждут вашей подписи:": "🔐 Awaiting your signature:", "🔐 Мультисиг": "🔐 Multisig", "🔔 Уведомления включены": "🔔 Notifications enabled", "🔕 Уведомления выключены": "🔕 Notifications disabled", "🔥 Разморозить": "🔥 Unfreeze", "🖥 Авто": "🖥 Auto", "🤝 Делегат": "🤝 Delegate", "🤝 Делегировать": "🤝 Delegate"} };

  var DICT_STUBS = { zh:{}, vi:{}, ko:{}, ja:{}, hi:{}, fr:{}, es:{}, pt:{}, it:{} };
  for (var k in DICT_STUBS) DICT[k] = DICT_STUBS[k];

  function getLang() {
    try { return localStorage.getItem('orgonlink_lang') || 'ru'; } catch (e) { return 'ru'; }
  }
  var LANG = getLang();

  function lookup(key) {
    if (LANG === 'ru') return null;
    var d = DICT[LANG];
    if (d && Object.prototype.hasOwnProperty.call(d, key)) return d[key];
    if (DICT.en && Object.prototype.hasOwnProperty.call(DICT.en, key)) return DICT.en[key];
    return null;
  }

  function t(s, vars) {
    if (s == null) return s;
    var str = String(s);
    var key = str.trim();
    var tr = lookup(key);
    var out = (tr == null) ? key : tr;
    if (vars) out = out.replace(/\{(\w+)\}/g, function (_, k) { return (vars[k] != null) ? vars[k] : '{' + k + '}'; });
    var lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    return lead + out + trail;
  }

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw) return;
    var key = raw.trim();
    if (!key || !/[А-Яа-яЁё]/.test(key)) return;
    var tr = lookup(key);
    if (tr != null && tr !== key) node.nodeValue = raw.replace(key, tr);
  }

  function translateAttrs(el) {
    if (!el || !el.getAttribute) return;
    ['placeholder', 'title'].forEach(function (attr) {
      var raw = el.getAttribute(attr);
      if (!raw) return;
      var key = raw.trim();
      if (!key || !/[А-Яа-яЁё]/.test(key)) return;
      var tr = lookup(key);
      if (tr != null && tr !== key) el.setAttribute(attr, tr);
    });
  }

  function applyTranslations(root) {
    if (LANG === 'ru') return;
    root = root || document.body;
    if (!root) return;
    if (root.querySelectorAll) {
      translateAttrs(root);
      var withAttrs = root.querySelectorAll('[placeholder],[title]');
      for (var i = 0; i < withAttrs.length; i++) translateAttrs(withAttrs[i]);
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (var j = 0; j < nodes.length; j++) translateTextNode(nodes[j]);
  }

  var observer = null;
  function startObserver() {
    if (LANG === 'ru' || observer || !window.MutationObserver || !document.body) return;
    observer = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType === 3) translateTextNode(node);
          else if (node.nodeType === 1) applyTranslations(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setLang(code) {
    try { localStorage.setItem('orgonlink_lang', code); } catch (e) {}
    location.reload();
  }

  function boot() {
    document.documentElement.setAttribute('lang', LANG);
    applyTranslations(document.body);
    startObserver();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.I18N = {
    t: t, applyTranslations: applyTranslations, setLang: setLang,
    getLang: getLang, LANGS: LANGS, DICT: DICT,
    get lang() { return LANG; }
  };
  window.t = t;
})();
