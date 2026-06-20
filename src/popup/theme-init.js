// Раннее применение темы — выполняется в <head> до отрисовки, чтобы не было
// мигания при открытии попапа. Внешний файл (инлайн-скрипты запрещены CSP MV3).
(function () {
  try {
    var pref = localStorage.getItem('orgonlink_theme') || 'light';
    var dark = pref === 'dark' ||
      (pref === 'system' && window.matchMedia &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
