const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// MIDI is handled in the renderer via Web MIDI API (navigator.requestMIDIAccess)
// — no native module needed.

const AUDIO_EXTS = new Set(['.wav', '.aif', '.aiff', '.mp3', '.flac', '.ogg', '.wave'])
const DEFAULT_DIR = 'B:\\Elektron'

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 580,
    backgroundColor: '#12121f',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow local file audio playback and Web MIDI
      webSecurity: false
    }
  })

  // Auto-grant MIDI (including SysEx) permission for the app's own pages
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true)
    } else {
      callback(false)
    }
  })

  win.loadFile(path.join(__dirname, 'src', 'index.html'))

  // Build application menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Kit',      accelerator: 'CmdOrCtrl+N',        click: () => win.webContents.send('menu-new') },
        { label: 'Open Kit…',   accelerator: 'CmdOrCtrl+O',        click: () => win.webContents.send('menu-open') },
        { type: 'separator' },
        { label: 'Save Kit',     accelerator: 'CmdOrCtrl+S',        click: () => win.webContents.send('menu-save') },
        { label: 'Save Kit As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('menu-save-as') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Device',
      submenu: [
        { label: 'Connect to Digitakt II…', click: () => win.webContents.send('menu-connect') },
        { label: 'Push Kit to Device',      click: () => win.webContents.send('menu-push') },
        { type: 'separator' },
        { label: 'Refresh MIDI Ports',      click: () => win.webContents.send('menu-refresh-midi') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

// ─── IPC: File System ─────────────────────────────────────────────────────────

ipcMain.handle('fs-read-dir', async (_, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const result = []
    for (const e of entries) {
      const ext = path.extname(e.name).toLowerCase()
      if (e.isDirectory()) {
        result.push({ name: e.name, type: 'folder', path: path.join(dirPath, e.name) })
      } else if (AUDIO_EXTS.has(ext)) {
        const fullPath = path.join(dirPath, e.name)
        let size = 0
        try { size = fs.statSync(fullPath).size } catch (_) {}
        result.push({ name: e.name, type: 'file', ext: ext.replace('.', '').toUpperCase(), path: fullPath, size })
      }
    }
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    })
    return { ok: true, entries: result }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('fs-home', async () => {
  if (fs.existsSync(DEFAULT_DIR)) return DEFAULT_DIR
  return os.homedir()
})

ipcMain.handle('fs-parent', async (_, dirPath) => {
  return path.dirname(dirPath)
})

ipcMain.handle('dialog-open-kit', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Kit',
    defaultPath: DEFAULT_DIR,
    filters: [
      { name: 'Digitakt Kit', extensions: ['dtkit'] },
      { name: 'JSON',         extensions: ['json'] },
      { name: 'All Files',    extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return null
  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf8')
    return { path: result.filePaths[0], data: JSON.parse(data) }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('dialog-save-kit', async (_, { kitData, suggestedName }) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Kit',
    defaultPath: path.join(DEFAULT_DIR, (suggestedName || 'MyKit') + '.dtkit'),
    filters: [
      { name: 'Digitakt Kit', extensions: ['dtkit'] },
      { name: 'JSON',         extensions: ['json'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  try {
    fs.writeFileSync(result.filePath, JSON.stringify(kitData, null, 2), 'utf8')
    return { path: result.filePath }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('fs-save-to-path', async (_, { filePath, kitData }) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(kitData, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('dialog-browse-folder', async (_, currentPath) => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Sample Folder',
    defaultPath: currentPath || DEFAULT_DIR,
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})
