const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('odysseyDesktop', {
  isDesktop: true,
  portal: 'provider',
  version: '1.0.0',
});
