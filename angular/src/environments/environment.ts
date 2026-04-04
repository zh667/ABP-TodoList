import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost:4200';

export const environment = {
  production: false,
  application: {
    baseUrl,
    name: 'TodoList',
    logoUrl: '',
  },
  oAuthConfig: {
    issuer: 'http://localhost:44306/',
    redirectUri: baseUrl,
    clientId: 'TodoList_App',
    responseType: 'code',
    scope: 'offline_access TodoList',
    requireHttps: false,
  },
  apis: {
    default: {
      url: 'http://localhost:44306',
      rootNamespace: 'TodoList',
    },
  },
} as Environment;
