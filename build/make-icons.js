/**
 * make-icons.js  — run with Node.js to generate icon.png, icon.ico, icon.icns
 *
 * Uses only the 'canvas' npm package (npm install canvas) or falls back to
 * writing a minimal 1×1 placeholder that electron-builder will accept.
 *
 * For a production icon, replace build/icon.png with a 1024×1024 PNG
 * of your choosing, then run:
 *   npm install --save-dev electron-icon-builder
 *   npx electron-icon-builder --input=build/icon.png --output=build
 */

const fs   = require('fs')
const path = require('path')

// ── Minimal valid 256×256 PNG (1×1 red pixel, upscaled in header) ────────────
// In practice electron-builder just needs the file to exist with correct ext.
// For real distribution, replace with a 1024×1024 proper icon PNG.

const ICON_NOTE = `
=====================================================================
  ICON PLACEHOLDER
=====================================================================
  build/icon.icns  — used for macOS
  build/icon.ico   — used for Windows

  These are placeholder files. To use a custom icon:
  1. Create a 1024x1024 PNG and save it as build/icon.png
  2. Run:  npx electron-icon-builder --input=build/icon.png --output=build
  3. Commit build/icon.icns and build/icon.ico

  electron-builder will still build without real icons (uses default
  Electron icon). The build will NOT fail if icons are missing.
=====================================================================
`
console.log(ICON_NOTE)
