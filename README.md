# Digitakt II — Kit Builder

An offline sample kit builder for the **Elektron Digitakt II**, built with Electron.

Build kits on your computer, then push them to a blank project on your Digitakt II over USB-MIDI.

![Dark DAW-style UI with file browser and 8-pad grid](screenshot.png)

---

## Features

- **File Browser** — navigate your local drives, shows audio files only (`.wav`, `.aif`, `.aiff`, `.mp3`, `.flac`, `.ogg`)
- **8-Pad Grid** — visual layout matching the Digitakt II's physical buttons (T1–T8)
- **Drag & Drop** — drag from the browser pane *or* from Windows Explorer directly onto a pad
- **Sample Preview** — ▶ PLAY button on each pad to audition assigned samples
- **Save / Load Kits** — persist kits as `.dtkit` JSON files
- **Push to Device** — send kit data to the Digitakt II over USB-MIDI via SysEx

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- Electron (installed automatically via npm)

### Install & Run

```bash
cd digitakt-kit-builder
npm install
npm start
```

---

## How to Use

| Action | How |
|---|---|
| Select a pad | Click it (or press `1`–`8`) |
| Assign a sample | Double-click a file **or** drag it onto a pad |
| Preview a sample | Click ▶ PLAY on the pad |
| Clear a pad | Click ✕ CLEAR |
| Save kit | `Ctrl+S` or File → Save Kit |
| Load kit | `Ctrl+O` or File → Open Kit |
| Connect device | Click **CONNECT** in the toolbar |
| Push to device | Click **PUSH TO DEVICE** (requires connection) |

---

## MIDI / SysEx Notes

The app uses the **Web MIDI API** built into Electron's Chromium — no native modules or Python required.

Elektron SysEx prefix used:
```
F0 00 20 3C 14 ...
   ─────────── ──
   Elektron ID  Digitakt II device byte (0x14)
```

> **Note:** The full Elektron kit parameter SysEx payload format is not publicly documented. The push feature currently transmits a correctly-prefixed message with kit name and sample filenames. Contributions to map the full byte layout are welcome.

---

## Project Structure

```
digitakt-kit-builder/
├── main.js        # Electron main process (file system, dialogs, MIDI permission)
├── preload.js     # contextBridge — secure IPC between main and renderer
├── src/
│   ├── index.html # App layout
│   ├── styles.css # Dark DAW theme
│   └── renderer.js# All UI logic (file browser, pads, drag-drop, Web MIDI)
└── package.json
```

---

## Kit File Format (`.dtkit`)

```json
{
  "name": "My Kit",
  "version": 1,
  "tracks": [
    { "index": 0, "sample": "B:\\Samples\\kick.wav" },
    { "index": 1, "sample": "B:\\Samples\\snare.wav" },
    { "index": 2, "sample": null },
    ...
  ]
}
```

---

## License

MIT
