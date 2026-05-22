'use strict';

export const NETWORKS = {
  mainnet: {
    name: 'Orgon Mainnet',
    fullNode:     'https://tr80.orgon.space',
    solidityNode: 'https://tr81.orgon.space',
    // REST API для истории транзакций (TronGrid-совместимый)
    apiGate:  'https://gate.orgon.space',
    explorer: 'https://orgonscan.org',
    isTestnet: false,
  },
  testnet: {
    name: 'Quasar Testnet',
    fullNode:     'https://api.quasar.orgonscan.org',
    solidityNode: 'https://api.quasar.orgonscan.org',
    apiGate:  'https://quasargate.orgon.space',
    explorer: 'https://quasar.orgonscan.org',
    isTestnet: true,
  },
};

export const API_KEY_HEADER = 'ORGON-PRO-API-KEY';
export const UNITS = { SUN: 1, ORGON: 1_000_000 };
export const LIMITS = { DEFAULT_FEE_LIMIT: 150_000_000 };
export const ERROR_CODES = {
  USER_REJECTED: 4001, UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200, DISCONNECTED: 4900,
  INTERNAL: -32603, INVALID_PARAMS: -32602,
};
