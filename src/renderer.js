/* ═══════════════════════════════════════════════════════════
   Digitakt II Kit Builder — Renderer Process
   MIDI handled via Web MIDI API (navigator.requestMIDIAccess)
   ═══════════════════════════════════════════════════════════ */

'use strict'

const NUM_TRACKS = 8

// ─── STATE ────────────────────────────────────────────────────────────────────

const state = {
  currentDir:       null,
  selectedFile:     null,   // { name, path, type }
  selectedPad:      null,   // 0-7
  kitName:          'Untitled Kit',
  kitPath:          null,
  tracks: Array.from({ length: NUM_TRACKS }, (_, i) => ({
    index:  i,
    sample: null
  })),
  // MIDI (Web MIDI API)
  midiAccess:       null,
  midiOutput:       null,   // MIDIOutput port
  midiOutputName:   '',
  midiConnected:    false,
  selectedMidiPort: null,   // MIDIOutput object chosen in modal
  // Audio
  isPlaying:        false,
  playingPad:       null
}

// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id)

const kitNameInput   = $('kitNameInput')
const btnNew         = $('btnNew')
const btnOpen        = $('btnOpen')
const btnSave        = $('btnSave')
const btnSaveAs      = $('btnSaveAs')
const btnConnect     = $('btnConnect')
const btnPush        = $('btnPush')
const btnUp          = $('btnUp')
const btnBrowse      = $('btnBrowse')
const browserPath    = $('browserPath')
const browserList    = $('browserList')
const btnAssign      = $('btnAssign')
const padGrid        = $('padGrid')
const statusMsg      = $('statusMsg')
const deviceStatus   = $('deviceStatus')
const previewAudio   = $('previewAudio')

const midiModal      = $('midiModal')
const midiPortList   = $('midiPortList')
const midiNoPortsMsg = $('midiNoPortsMsg')
const btnMidiConnect = $('btnMidiConnect')
const btnMidiCancel  = $('btnMidiCancel')
const midiModalClose = $('midiModalClose')

const pushModal      = $('pushModal')
const pushPreview    = $('pushPreview')
const btnPushConfirm = $('btnPushConfirm')
const btnPushCancel  = $('btnPushCancel')
const pushModalClose = $('pushModalClose')

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function setStatus(msg) { statusMsg.textContent = msg }

function basename(p) {
  if (!p) return ''
  return p.replace(/\\/g, '/').split('/').pop()
}

function formatSize(bytes) {
  if (bytes < 1024)       return `${bytes}B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(0)}K`
  return `${(bytes / 1048576).toFixed(1)}M`
}

// ─── PAD RENDERING ────────────────────────────────────────────────────────────

function buildPads() {
  padGrid.innerHTML = ''
  for (let i = 0; i < NUM_TRACKS; i++) {
    const pad = document.createElement('div')
    pad.className = 'pad'
    pad.dataset.index = i
    pad.innerHTML = `
      <div class="pad-track">T${i + 1}</div>
      <div class="pad-sample">— empty —</div>
      <div class="pad-sample-full"></div>
      <div class="pad-controls">
        <button class="pad-btn pad-btn--play"  data-action="play"  disabled>▶ PLAY</button>
        <button class="pad-btn pad-btn--clear" data-action="clear" disabled>✕ CLEAR</button>
      </div>
    `

    pad.addEventListener('click', e => {
      if (e.target.dataset.action) return
      selectPad(i)
    })
    pad.querySelector('[data-action="play"]').addEventListener('click',  () => playPad(i))
    pad.querySelector('[data-action="clear"]').addEventListener('click', () => clearPad(i))

    // Internal & external drop target
    pad.addEventListener('dragover',  e => { e.preventDefault(); pad.classList.add('drag-over') })
    pad.addEventListener('dragleave', ()  => pad.classList.remove('drag-over'))
    pad.addEventListener('drop', e => {
      e.preventDefault()
      pad.classList.remove('drag-over')
      selectPad(i)

      // Internal drag from the file browser list
      const internal = e.dataTransfer.getData('text/plain')
      if (internal) { assignSample(i, internal); return }

      // External drag from Windows Explorer
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const f = e.dataTransfer.files[0]
        const p = f.path || f.name
        if (p) assignSample(i, p)
      }
    })

    padGrid.appendChild(pad)
  }
}

function getPadEl(index) {
  return padGrid.querySelector(`.pad[data-index="${index}"]`)
}

function refreshPad(index) {
  const el = getPadEl(index)
  if (!el) return
  const track = state.tracks[index]
  const hasFile = !!track.sample
  const name    = hasFile ? basename(track.sample) : null

  el.classList.toggle('has-sample', hasFile)
  el.classList.toggle('selected',   state.selectedPad === index)

  el.querySelector('.pad-sample').textContent      = hasFile ? name : '— empty —'
  el.querySelector('.pad-sample-full').textContent = hasFile ? track.sample : ''
  el.querySelector('.pad-sample-full').title        = track.sample || ''

  const playBtn  = el.querySelector('[data-action="play"]')
  const clearBtn = el.querySelector('[data-action="clear"]')
  playBtn.disabled  = !hasFile
  clearBtn.disabled = !hasFile
  playBtn.classList.toggle('playing', state.playingPad === index && state.isPlaying)
}

function refreshAllPads() {
  for (let i = 0; i < NUM_TRACKS; i++) refreshPad(i)
}

function selectPad(index) {
  state.selectedPad = index
  refreshAllPads()
  const name = state.tracks[index].sample ? basename(state.tracks[index].sample) : 'empty'
  setStatus(`T${index + 1} selected (${name}) — assign a sample or drag a file`)
}

// ─── PAD ACTIONS ──────────────────────────────────────────────────────────────

function assignSample(padIndex, filePath) {
  state.tracks[padIndex].sample = filePath
  refreshPad(padIndex)
  setStatus(`Assigned "${basename(filePath)}" → T${padIndex + 1}`)
}

function clearPad(index) {
  state.tracks[index].sample = null
  if (state.playingPad === index) stopAudio()
  refreshPad(index)
  setStatus(`T${index + 1} cleared`)
}

function playPad(index) {
  const filePath = state.tracks[index].sample
  if (!filePath) return

  if (state.playingPad === index && state.isPlaying) { stopAudio(); return }

  stopAudio()
  const url = 'file:///' + filePath.replace(/\\/g, '/')
  previewAudio.src = url
  previewAudio.load()
  previewAudio.play()
    .then(() => {
      state.isPlaying  = true
      state.playingPad = index
      refreshPad(index)
      setStatus(`Playing: ${basename(filePath)}`)
    })
    .catch(err => setStatus(`Playback error: ${err.message}`))
}

function stopAudio() {
  previewAudio.pause()
  previewAudio.currentTime = 0
  const prev   = state.playingPad
  state.isPlaying  = false
  state.playingPad = null
  if (prev !== null) refreshPad(prev)
}

previewAudio.addEventListener('ended', stopAudio)

// ─── FILE BROWSER ─────────────────────────────────────────────────────────────

async function loadDir(dirPath) {
  const result = await window.api.readDir(dirPath)
  if (!result.ok) { setStatus(`Error: ${result.error}`); return }

  state.currentDir   = dirPath
  state.selectedFile = null
  btnAssign.disabled = true

  browserPath.textContent = dirPath
  browserPath.title = dirPath
  browserList.innerHTML = ''

  for (const entry of result.entries) {
    const li = document.createElement('li')
    li.className = entry.type === 'folder' ? 'is-folder' : 'is-file'
    li.dataset.path = entry.path
    li.dataset.type = entry.type

    const icon = entry.type === 'folder' ? '📁' : '🔊'
    const extBadge = entry.type === 'file'
      ? `<span class="item-ext">${entry.ext} ${formatSize(entry.size)}</span>`
      : ''

    li.innerHTML = `
      <span class="item-icon">${icon}</span>
      <span class="item-name" title="${entry.path}">${entry.name}</span>
      ${extBadge}
    `

    li.addEventListener('click', () => {
      if (entry.type === 'file') {
        document.querySelectorAll('.browser-list li').forEach(el => el.classList.remove('selected'))
        li.classList.add('selected')
        state.selectedFile = entry
        btnAssign.disabled = false
        setStatus(`Selected: ${entry.name}`)
      }
    })

    li.addEventListener('dblclick', () => {
      if (entry.type === 'folder') {
        loadDir(entry.path)
      } else {
        doAssign()
      }
    })

    if (entry.type === 'file') {
      li.draggable = true
      li.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', entry.path)
        e.dataTransfer.effectAllowed = 'copy'
        document.querySelectorAll('.browser-list li').forEach(el => el.classList.remove('selected'))
        li.classList.add('selected')
        state.selectedFile = entry
        btnAssign.disabled = false
      })
    }

    browserList.appendChild(li)
  }
}

async function goUp() {
  if (!state.currentDir) return
  const parent = await window.api.getParent(state.currentDir)
  if (parent && parent !== state.currentDir) loadDir(parent)
}

function doAssign() {
  if (!state.selectedFile) return
  if (state.selectedPad === null) {
    // Auto-select first empty pad
    const firstEmpty = state.tracks.findIndex(t => !t.sample)
    if (firstEmpty >= 0) {
      selectPad(firstEmpty)
      setStatus(`Auto-selected T${firstEmpty + 1} — click ASSIGN again to assign "${state.selectedFile.name}"`)
    } else {
      setStatus('Select a pad first, then click ASSIGN')
    }
    return
  }
  assignSample(state.selectedPad, state.selectedFile.path)
}

// ─── KIT PERSISTENCE ──────────────────────────────────────────────────────────

function kitToData() {
  return {
    name:    state.kitName,
    version: 1,
    tracks:  state.tracks.map(t => ({ index: t.index, sample: t.sample }))
  }
}

function applyKitData(data) {
  state.kitName = data.name || 'Untitled Kit'
  kitNameInput.value = state.kitName
  state.tracks.forEach(t => { t.sample = null })
  if (Array.isArray(data.tracks)) {
    data.tracks.forEach(t => {
      if (t.index >= 0 && t.index < NUM_TRACKS) {
        state.tracks[t.index].sample = t.sample || null
      }
    })
  }
  refreshAllPads()
}

function newKit() {
  stopAudio()
  state.kitName = 'Untitled Kit'
  state.kitPath = null
  state.selectedPad = null
  state.tracks.forEach(t => { t.sample = null })
  kitNameInput.value = state.kitName
  refreshAllPads()
  document.title = 'Digitakt II — Kit Builder'
  setStatus('New kit created')
}

async function openKit() {
  const result = await window.api.openKit()
  if (!result) return
  if (result.error) { setStatus(`Error: ${result.error}`); return }
  stopAudio()
  state.kitPath = result.path
  applyKitData(result.data)
  document.title = `Digitakt II — ${basename(result.path)}`
  setStatus(`Loaded: ${result.path}`)
}

async function saveKit() {
  if (state.kitPath) {
    const res = await window.api.saveToPath({ filePath: state.kitPath, kitData: kitToData() })
    if (res.ok) setStatus(`Saved: ${state.kitPath}`)
    else        setStatus(`Save error: ${res.error}`)
  } else {
    await saveKitAs()
  }
}

async function saveKitAs() {
  const result = await window.api.saveKit({ kitData: kitToData(), suggestedName: state.kitName })
  if (!result) return
  if (result.error) { setStatus(`Save error: ${result.error}`); return }
  state.kitPath = result.path
  document.title = `Digitakt II — ${basename(result.path)}`
  setStatus(`Saved: ${result.path}`)
}

// ─── WEB MIDI API ─────────────────────────────────────────────────────────────

async function getMidiAccess() {
  if (state.midiAccess) return state.midiAccess
  try {
    state.midiAccess = await navigator.requestMIDIAccess({ sysex: true })
    return state.midiAccess
  } catch (e) {
    setStatus(`Web MIDI error: ${e.message}`)
    return null
  }
}

async function openMidiModal() {
  midiPortList.innerHTML = ''
  midiNoPortsMsg.classList.add('hidden')
  btnMidiConnect.disabled = true
  state.selectedMidiPort = null
  midiModal.classList.remove('hidden')

  const access = await getMidiAccess()
  if (!access) {
    midiNoPortsMsg.textContent = 'Web MIDI API unavailable in this context.'
    midiNoPortsMsg.classList.remove('hidden')
    return
  }

  const ports = Array.from(access.outputs.values())
  if (!ports.length) {
    midiNoPortsMsg.classList.remove('hidden')
    return
  }

  ports.forEach(port => {
    const li = document.createElement('li')
    li.textContent = port.name
    li.addEventListener('click', () => {
      document.querySelectorAll('#midiPortList li').forEach(el => el.classList.remove('selected'))
      li.classList.add('selected')
      state.selectedMidiPort = port
      btnMidiConnect.disabled = false
    })
    // Auto-select Digitakt port
    if (port.name.toLowerCase().includes('digitakt')) li.click()
    midiPortList.appendChild(li)
  })
}

async function connectMidi() {
  if (!state.selectedMidiPort) return
  try {
    await state.selectedMidiPort.open()
    state.midiOutput      = state.selectedMidiPort
    state.midiOutputName  = state.selectedMidiPort.name
    state.midiConnected   = true

    deviceStatus.textContent = `● ${state.midiOutputName.slice(0, 40)}`
    deviceStatus.className   = 'device-status device-status--on'
    btnPush.disabled         = false
    setStatus(`Connected: ${state.midiOutputName}`)

    // Send universal identity request (SysEx) to confirm the connection
    state.midiOutput.send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7])
  } catch (e) {
    setStatus(`MIDI connect error: ${e.message}`)
  }
  closeMidiModal()
}

function closeMidiModal() { midiModal.classList.add('hidden') }

// ─── PUSH TO DEVICE ───────────────────────────────────────────────────────────

function openPushModal() {
  if (!state.midiConnected) { setStatus('Connect to Digitakt II first'); return }

  pushPreview.innerHTML = state.tracks.map(t => {
    const name = t.sample ? basename(t.sample) : null
    return `
      <div class="push-preview-row">
        <span class="push-preview-track">T${t.index + 1}</span>
        ${name
          ? `<span class="push-preview-sample" title="${t.sample}">${name}</span>`
          : `<span class="push-preview-empty">— empty —</span>`}
      </div>`
  }).join('')

  pushModal.classList.remove('hidden')
}

function buildKitSysEx(kitData) {
  // Elektron Manufacturer ID : 00 20 3C
  // Digitakt II Device ID    : 0x14 (20)
  // ─────────────────────────────────────────────────────────────────
  // NOTE: The full Elektron kit SysEx payload format (parameter blocks,
  // sample slot references, etc.) is not publicly documented.
  // This stub transmits a correctly-prefixed SysEx message with kit
  // name and sample filenames. Expand once the protocol is known.
  // ─────────────────────────────────────────────────────────────────
  const SYSEX_START  = 0xF0
  const ELEKTRON_MFR = [0x00, 0x20, 0x3C]
  const DEVICE_ID    = 0x14
  const MSG_TYPE     = 0x01  // placeholder message type
  const SYSEX_END    = 0xF7

  const nameBytes = Array.from(
    new TextEncoder().encode(kitData.name.padEnd(16, '\0').slice(0, 16))
  )

  const trackBytes = kitData.tracks.flatMap(t => {
    const raw = t.sample ? t.sample.split(/[\\/]/).pop() : ''
    return Array.from(new TextEncoder().encode(raw.padEnd(24, '\0').slice(0, 24)))
  })

  return new Uint8Array([
    SYSEX_START,
    ...ELEKTRON_MFR,
    DEVICE_ID,
    MSG_TYPE,
    ...nameBytes,
    ...trackBytes,
    SYSEX_END
  ])
}

function pushToDevice() {
  closePushModal()
  if (!state.midiOutput || !state.midiConnected) {
    setStatus('Not connected — use CONNECT first')
    return
  }
  try {
    const msg = buildKitSysEx(kitToData())
    state.midiOutput.send(msg)
    setStatus(`Kit SysEx sent to ${state.midiOutputName} (${msg.length} bytes)`)
  } catch (e) {
    setStatus(`Push error: ${e.message}`)
  }
}

function closePushModal() { pushModal.classList.add('hidden') }

// ─── TOOLBAR & MENU EVENTS ────────────────────────────────────────────────────

btnNew.addEventListener('click',    () => { if (confirm('Create a new kit? Unsaved changes will be lost.')) newKit() })
btnOpen.addEventListener('click',   openKit)
btnSave.addEventListener('click',   saveKit)
btnSaveAs.addEventListener('click', saveKitAs)
btnConnect.addEventListener('click', openMidiModal)
btnPush.addEventListener('click',   openPushModal)

btnUp.addEventListener('click',     goUp)
btnBrowse.addEventListener('click', async () => {
  const folder = await window.api.browseFolder(state.currentDir)
  if (folder) loadDir(folder)
})
btnAssign.addEventListener('click', doAssign)

kitNameInput.addEventListener('input', () => { state.kitName = kitNameInput.value })

// MIDI modal
btnMidiConnect.addEventListener('click', connectMidi)
btnMidiCancel.addEventListener('click',  closeMidiModal)
midiModalClose.addEventListener('click', closeMidiModal)
midiModal.addEventListener('click', e => { if (e.target === midiModal) closeMidiModal() })

// Push modal
btnPushConfirm.addEventListener('click', pushToDevice)
btnPushCancel.addEventListener('click',  closePushModal)
pushModalClose.addEventListener('click', closePushModal)
pushModal.addEventListener('click', e => { if (e.target === pushModal) closePushModal() })

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const inInput = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'n') { e.preventDefault(); if (confirm('New kit?')) newKit() }
    if (e.key === 'o') { e.preventDefault(); openKit() }
    if (e.key === 's' && !e.shiftKey) { e.preventDefault(); saveKit() }
    if (e.key === 'S' &&  e.shiftKey) { e.preventDefault(); saveKitAs() }
  }
  if (e.key === 'Escape') { closeMidiModal(); closePushModal(); stopAudio() }
  // Keys 1-8 select pads
  if (!inInput && !e.ctrlKey && !e.metaKey) {
    const n = parseInt(e.key)
    if (n >= 1 && n <= 8) selectPad(n - 1)
  }
})

// Main-process menu events
window.api.onMenu('menu-new',          () => { if (confirm('New kit?')) newKit() })
window.api.onMenu('menu-open',         openKit)
window.api.onMenu('menu-save',         saveKit)
window.api.onMenu('menu-save-as',      saveKitAs)
window.api.onMenu('menu-connect',      openMidiModal)
window.api.onMenu('menu-push',         openPushModal)
window.api.onMenu('menu-refresh-midi', openMidiModal)

// Allow drops on pads even when dragging over other elements
document.addEventListener('dragover', e => e.preventDefault())
document.addEventListener('drop',     e => e.preventDefault())

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  buildPads()
  refreshAllPads()
  const homeDir = await window.api.getHome()
  await loadDir(homeDir)
  setStatus('Ready — select a pad, then double-click a sample or drag a file onto a pad')
}

init()
