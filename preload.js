const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // File system
  readDir:      (p) => ipcRenderer.invoke('fs-read-dir', p),
  getHome:      ()  => ipcRenderer.invoke('fs-home'),
  getParent:    (p) => ipcRenderer.invoke('fs-parent', p),
  browseFolder: (p) => ipcRenderer.invoke('dialog-browse-folder', p),

  // Kit persistence
  openKit:    ()  => ipcRenderer.invoke('dialog-open-kit'),
  saveKit:    (d) => ipcRenderer.invoke('dialog-save-kit', d),
  saveToPath: (d) => ipcRenderer.invoke('fs-save-to-path', d),

  // Menu events from main process
  onMenu: (channel, cb) => {
    const valid = [
      'menu-new', 'menu-open', 'menu-save', 'menu-save-as',
      'menu-connect', 'menu-push', 'menu-refresh-midi'
    ]
    if (valid.includes(channel)) ipcRenderer.on(channel, cb)
  }
})
