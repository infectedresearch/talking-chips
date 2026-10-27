/*
 * Original, TMC0281-compatible allophone sequencer.
 *
 * These are hand-authored control targets, not copied TI ROM data. Text is
 * converted to a small phoneme inventory, then into smoothly joined LPC
 * frames. This is the intended arbitrary-text path; it avoids analysing and
 * re-quantising another synthesizer one window at a time.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Tmc0281Units = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ENERGY = [0,0,1,1,2,3,5,7,10,15,21,30,43,61,86];
  const PITCH = [0,41,43,45,47,49,51,53,55,58,60,63,66,70,73,76,79,83,87,90,94,99,103,107,112,118,123,129,134,140,147,153];
  const K = [
    [-501,-497,-493,-488,-480,-471,-460,-446,-427,-405,-378,-344,-305,-259,-206,-148,-86,-21,45,110,171,227,277,320,357,388,413,434,451,464,474,498],
    [-349,-328,-305,-280,-252,-223,-192,-158,-124,-88,-51,-14,23,60,97,133,167,199,230,259,286,310,333,354,372,389,404,417,429,439,449,506],
    [-397,-365,-327,-282,-229,-170,-104,-36,35,104,169,228,281,326,364,396],[-369,-334,-293,-245,-191,-131,-67,-1,64,128,188,243,291,332,367,397],
    [-319,-286,-250,-211,-168,-122,-74,-25,24,73,121,167,210,249,285,318],[-290,-252,-209,-163,-114,-62,-9,44,97,147,194,238,278,313,344,371],
    [-291,-256,-216,-174,-128,-80,-31,19,69,117,163,206,246,283,316,345],[-218,-133,-38,59,152,235,305,361],[-226,-157,-82,-3,76,151,220,280],[-179,-122,-61,1,62,123,179,231],
  ];
  const BITS = [5,5,4,4,4,4,4,3,3,3];
  const VOWELS = {
    AA: [14, 20, [-110, 80, 185, 120, 70, 35, 15, 0, 0, 0]], AE: [14, 21, [-160, 95, 215, 130, 75, 40, 20, 0, 0, 0]],
    AH: [13, 19, [-125, 60, 160, 95, 45, 25, 10, 0, 0, 0]], EE: [14, 23, [-195, 125, 265, 145, 85, 45, 20, 0, 0, 0]],
    EH: [13, 21, [-180, 100, 235, 125, 70, 35, 15, 0, 0, 0]], IH: [13, 22, [-185, 110, 250, 135, 75, 40, 15, 0, 0, 0]],
    OH: [13, 17, [-100, 50, 135, 80, 55, 35, 15, 0, 0, 0]], OO: [12, 15, [-85, 35, 105, 65, 40, 25, 10, 0, 0, 0]],
    ER: [13, 19, [-145, 70, 185, 100, 120, 65, 25, 5, 0, 0]], AY: [14, 21, [-170, 105, 240, 130, 75, 35, 15, 0, 0, 0]],
    OW: [13, 17, [-110, 55, 145, 85, 55, 30, 10, 0, 0, 0]],
  };
  const VOICED = {
    B: [-210, 70, 130, 65], D: [-190, 90, 155, 75], G: [-175, 75, 145, 70], L: [-160, 65, 175, 85],
    M: [-120, 45, 125, 70], N: [-135, 55, 140, 75], R: [-150, 60, 170, 95], V: [-170, 55, 115, 55],
    W: [-125, 45, 135, 75], Y: [-155, 70, 175, 90], Z: [-175, 65, 125, 60],
  };
  const UNVOICED = new Set(['F', 'H', 'K', 'P', 'S', 'T', 'C', 'X']);
  const DIGRAPHS = { TH: 'T', SH: 'S', CH: 'C', PH: 'F', NG: 'N', QU: 'KW', CK: 'K' };
  const WORDS = { HELLO: ['H','EH','L','OW'], WORLD: ['W','ER','L','D'], THE: ['T','AH'], THIS: ['T','IH','S'], ISLE: ['AY','L'],
    TMC: ['T','EH','M','S','EE'], CHAT: ['C','AE','T'], YOU: ['Y','OO'], ARE: ['AA','R'], AND: ['AE','N','D'],
    ZERO: ['Z','IH','R','OW'], ONE: ['W','AH','N'], TWO: ['T','OO'], THREE: ['T','H','R','EE'], FOUR: ['F','OH','R'], FIVE: ['F','AY','V'], SIX: ['S','IH','K','S'], SEVEN: ['S','EH','V','EH','N'], EIGHT: ['AY','T'], NINE: ['N','AY','N'] };
  const DIGITS = ['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE'];

  class Bits {
    constructor() { this.bytes = []; this.position = 0; }
    write(value, count) { for (let bit = count - 1; bit >= 0; bit--) { const at = this.position >> 3; this.bytes[at] = this.bytes[at] || 0; this.bytes[at] |= ((value >> bit) & 1) << (this.position & 7); this.position++; } }
    finish() { return Uint8Array.from(this.bytes); }
  }
  const nearest = (table, value) => table.reduce((best, item, index) => Math.abs(item - value) < Math.abs(table[best] - value) ? index : best, 0);
  const clone = frame => ({ energy: frame.energy, pitch: frame.pitch, k: frame.k.slice() });
  const silence = () => ({ energy: 0, pitch: 0, k: Array(10).fill(0) });

  function phonemes(text) {
    const output = [];
    const words = String(text).toUpperCase().replace(/\d/g, digit => ` ${DIGITS[Number(digit)]} `).match(/[A-Z]+|[.!?,;:]/g) || [];
    for (const word of words) {
      if (/^[.!?,;:]$/.test(word)) {
        if (word === '.' || word === '!' || word === '?') { if (output.at(-1) === 'GAP') output.pop(); output.push('PAUSE'); }
        continue;
      }
      if (WORDS[word]) { output.push(...WORDS[word], 'GAP'); continue; }
      for (let i = 0; i < word.length;) {
        const digraph = DIGRAPHS[word.slice(i, i + 2)];
        if (digraph) { output.push(...digraph.split('')); i += 2; continue; }
        const letter = word[i++];
        output.push(({ A: 'AE', E: 'EH', I: 'IH', O: 'OH', U: 'AH' })[letter] || letter);
      }
      output.push('GAP');
    }
    return output;
  }

  function target(token, pitchScale) {
    if (token === 'GAP' || token === 'PAUSE') return silence();
    if (VOWELS[token]) { const [energy, pitch, k] = VOWELS[token]; return { energy, pitch: nearest(PITCH, Math.round(PITCH[pitch] / pitchScale)), k: k.concat(Array(10 - k.length).fill(0)) }; }
    if (VOICED[token]) return { energy: 7, pitch: nearest(PITCH, Math.round(106 / pitchScale)), k: VOICED[token].concat(Array(6).fill(0)) };
    if (UNVOICED.has(token)) return { energy: token === 'H' ? 4 : 6, pitch: 0, k: [-90, 30, 75, 35].concat(Array(6).fill(0)) };
    return { energy: 5, pitch: 0, k: Array(10).fill(0) };
  }

  function framesFor(tokens, options = {}) {
    const pitchScale = Math.max(0.7, Math.min(1.4, Number(options.pitch) || 1));
    const frames = [];
    let prior = silence();
    for (const token of tokens) {
      const next = target(token, pitchScale);
      const count = token === 'PAUSE' ? 3 : token === 'GAP' ? 1 : VOWELS[token] ? 4 : 2;
      for (let n = 1; n <= count; n++) {
        const ratio = n / count;
        const frame = { energy: Math.round(prior.energy + (next.energy - prior.energy) * ratio), pitch: Math.round(prior.pitch + (next.pitch - prior.pitch) * ratio), k: Array(10) };
        for (let k = 0; k < 10; k++) frame.k[k] = Math.round(prior.k[k] + (next.k[k] - prior.k[k]) * ratio);
        frames.push(frame);
      }
      prior = clone(next);
    }
    frames.push(silence());
    return frames;
  }

  function writeFrame(bits, frame, indexed) {
    const energy = indexed ? frame.energy : nearest(ENERGY, frame.energy);
    bits.write(Math.max(0, Math.min(14, energy)), 4);
    if (!energy) return;
    const pitch = indexed ? frame.pitch : nearest(PITCH, frame.pitch);
    bits.write(0, 1); bits.write(Math.max(0, Math.min(31, pitch)), 5);
    for (let i = 0; i < 4; i++) bits.write(nearest(K[i], frame.k[i]), BITS[i]);
    if (pitch) for (let i = 4; i < 10; i++) bits.write(nearest(K[i], frame.k[i]), BITS[i]);
  }

  function encodeFrames(frames) {
    const bits = new Bits();
    for (const frame of frames) writeFrame(bits, frame, true);
    bits.write(15, 4);
    return bits.finish();
  }

  // Repackages parsed, local ROM phrase frames into one continuous chip stream.
  // This enables arbitrary *spelling* with a user-owned original VSM image;
  // its audible units remain genuine ROM speech rather than guessed controls.
  function encodeChipFrames(frames) {
    const bits = new Bits();
    for (const frame of frames) if (!frame.stop) writeFrame(bits, frame, false);
    bits.write(15, 4);
    return bits.finish();
  }

  function encodeText(text, options) { const tokens = phonemes(text); const frames = framesFor(tokens, options); return { tokens, frames, bytes: encodeFrames(frames) }; }
  return { encodeChipFrames, encodeFrames, encodeText, framesFor, phonemes };
}));
