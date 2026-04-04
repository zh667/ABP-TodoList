import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost';

export const environment = {
  production: true,
  application: {
    baseUrl,
    name: 'TodoList',
    logoUrl: '',
  },
  oAuthConfig: {
    issuer: 'http://localhost/',
    redirectUri: baseUrl,
    clientId: 'TodoList_App',
    responseType: 'code',
    scope: 'offline_access TodoList',
    requireHttps: false,
  },
  apis: {
    default: {
      url: '',
      rootNamespace: 'TodoList',
    },
  },
} as Environment;
