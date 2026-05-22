/**
 * PermissionController — управление разрешениями dApp.
 * 
 * Хранит список сайтов, которым пользователь разрешил подключение,
 * и к каким адресам кошелька у них есть доступ.
 */

'use strict';

const STORAGE_KEY = 'orgonlink_permissions';

export class PermissionController {

  /**
   * Получить разрешение для origin.
   * @returns {{ connected: boolean, address: string, grantedAt: number } | null}
   */
  async getPermission(origin) {
    const all = await this._load();
    return all[origin] ?? null;
  }

  /**
   * Выдать разрешение.
   * @param {string} origin
   * @param {string} address  base58
   */
  async grantPermission(origin, address) {
    const all = await this._load();
    all[origin] = {
      connected: true,
      address,
      grantedAt: Date.now(),
    };
    await this._save(all);
  }

  /**
   * Отозвать разрешение.
   */
  async revokePermission(origin) {
    const all = await this._load();
    delete all[origin];
    await this._save(all);
  }

  /**
   * Список всех подключённых сайтов.
   */
  async getAllPermissions() {
    return this._load();
  }

  async _load() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] ?? {};
  }

  async _save(permissions) {
    return chrome.storage.local.set({ [STORAGE_KEY]: permissions });
  }
}
