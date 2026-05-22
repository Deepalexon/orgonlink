/**
 * injector.js — Content Script, world: "MAIN"
 * 
 * Запускается в контексте страницы (MAIN world).
 * Инжектирует провайдер orgonWeb.js напрямую — это даёт доступ к window.
 * 
 * MV3 поддерживает world: "MAIN" в content_scripts начиная с Chrome 111.
 * Файл уже объявлен в manifest.json как MAIN world script.
 */

// orgonWeb.js объявлен в web_accessible_resources и уже выполняется
// как MAIN world content script — этот файл служит точкой входа
// если нужна дополнительная логика инжекции.

// Отправляем сигнал в ISOLATED world (bridge.js) что провайдер загружен
window.dispatchEvent(new CustomEvent('OrgonLinkInjected'));
