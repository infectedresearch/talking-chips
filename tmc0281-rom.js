/* Speak & Spell VSM helpers. ROM bytes are supplied by the user, never uploaded. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Tmc0281Rom = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function pointer(bytes, offset) {
    if (offset < 0 || offset + 1 >= bytes.length) throw new Error('ROM pointer is outside the supplied image');
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function standardIndex(rom0) {
    if (!(rom0 instanceof Uint8Array) || rom0.length < 0x60) throw new Error('Expected a Speak & Spell VSM image');
    const entries = [];
    let offset = 0x0c;
    for (let i = 0; i < 26; i++, offset += 2) entries.push({ label: String.fromCharCode(65 + i), address: pointer(rom0, offset) });
    entries.push({ label: 'beep', address: pointer(rom0, offset) }); offset += 2;
    for (let i = 0; i < 10; i++, offset += 2) entries.push({ label: String(i), address: pointer(rom0, offset) });
    entries.push({ label: '10', address: pointer(rom0, offset) }); offset += 2;
    for (const label of ['that is correct', 'you are correct', 'that is right', 'you are right']) {
      entries.push({ label, address: pointer(rom0, offset) }); offset += 2;
    }
    return entries.filter(entry => entry.address > 0 && entry.address < 0x8000);
  }

  function combine(rom0, rom1) {
    if (!(rom0 instanceof Uint8Array)) throw new Error('ROM 0 is required');
    if (!rom1) return rom0.slice();
    const size = Math.max(0x4000, rom0.length);
    const combined = new Uint8Array(size + rom1.length);
    combined.set(rom0);
    combined.set(rom1, size);
    return combined;
  }

  function streamAt(rom, address) {
    if (!(rom instanceof Uint8Array) || !Number.isInteger(address) || address < 0 || address >= rom.length) throw new Error('Phrase address is outside the supplied ROM');
    return rom.subarray(address);
  }

  function spellingIndex(entries) {
    const byLabel = new Map(entries.map(entry => [entry.label.toUpperCase(), entry]));
    return { letters: byLabel, beep: byLabel.get('BEEP') || null };
  }

  function spell(text, entries) {
    const { letters } = spellingIndex(entries);
    const units = [];
    for (const raw of String(text).toUpperCase()) {
      if (/[A-Z]/.test(raw)) units.push(letters.get(raw));
      else if (/\d/.test(raw)) units.push(letters.get(raw)); // digits can be spelled with letter names
      else if (/\s|[.,;:!?-]/.test(raw)) units.push(null);
    }
    return units.filter(unit => unit !== undefined);
  }

  return { combine, pointer, standardIndex, spell, spellingIndex, streamAt };
}));
