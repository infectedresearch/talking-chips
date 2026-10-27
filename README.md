# Speak & Spell — browser TMC0281 emulator

[Use the hosted version on Fracktron](https://fracktron.com/experiments/tmc0281/speak-and-spell.html)

Play original ROM phrases, spell letters/digits aloud, and download 8 kHz WAVs.
Vanilla JavaScript; no build step, model, API keys, account, or speech backend.
This emulates chip output, not the physical toy's speaker/enclosure.

## Run locally

1. Supply compatible `tmc0351n2l.vsm` and `tmc0352n2l.vsm` images in this directory.
   Original TI ROM data is **not included** and is not covered by the code license.
   Obtain and use ROM images only where you have the necessary rights.
2. Serve the directory over HTTP, for example `python3 -m http.server 8080`.
3. Open `http://localhost:8080/`. Opening the HTML via `file://` will not allow
   the browser's ROM fetches.

Free text is spelled letter by letter (up to 12 characters, A–Z, digits, spaces).
It is not arbitrary-text pronunciation, a full educational toy emulator, or a
neural/LPC re-encoding voice. Audio and spelling run locally in the browser.

## Files

- `tmc0281-chip.js`: integer chip-frame parser, excitation/interpolation/lattice
  renderer and WAV writer. Tables/reference behavior follow BSD-licensed MAME.
- `tmc0281-rom.js`: phrase index and spelling helpers.
- `tmc0281-units.js`: includes frame repacking used for letter concatenation.
  Its older guessed allophone/text-synthesis routines are **not used by this UI**.
- `speak-and-spell.js`, `index.html`, `tmc0281.css`: browser product.

The renderer was compared against MAME and genuine ROM-frame repacking; this
is not a claim of physical-hardware verification. No GPL ti_lpc implementation
is included. See [notices](speak-and-spell-NOTICES.txt) for attribution and ROM
licensing scope. Speak & Spell is a Texas Instruments name; no affiliation or
endorsement is implied.

## License

Software source is BSD-3-Clause; see LICENSE and third-party notices. This
license does not grant rights to original ROM data or trademarks.
