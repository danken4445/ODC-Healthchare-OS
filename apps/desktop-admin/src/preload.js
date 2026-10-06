const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('odysseyDesktop', {
  isDesktop: true,
  portal: 'admin',
  version: '1.0.0',
  printReceipt: (options) => ipcRenderer.invoke('print-receipt', options),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
});
