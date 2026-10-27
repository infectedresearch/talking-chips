/*
 * TMC0281/TMS5100 speech-frame renderer.
 *
 * Tables and frame layout follow MAME's BSD-3-Clause tms5110r.hxx and
 * tms5220.cpp. This module intentionally stays separate from the stable
 * Vintage Voice Lab so conformance work cannot regress the shared demo.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Tmc0281Chip = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SAMPLE_RATE = 8000;
  const ENERGY = [0, 0, 1, 1, 2, 3, 5, 7, 10, 15, 21, 30, 43, 61, 86, 0];
  const PITCH = [0, 41, 43, 45, 47, 49, 51, 53, 55, 58, 60, 63, 66, 70, 73, 76, 79, 83, 87, 90, 94, 99, 103, 107, 112, 118, 123, 129, 134, 140, 147, 153];
  const K = [
    [-501,-497,-493,-488,-480,-471,-460,-446,-427,-405,-378,-344,-305,-259,-206,-148,-86,-21,45,110,171,227,277,320,357,388,413,434,451,464,474,498],
    [-349,-328,-305,-280,-252,-223,-192,-158,-124,-88,-51,-14,23,60,97,133,167,199,230,259,286,310,333,354,372,389,404,417,429,439,449,506],
    [-397,-365,-327,-282,-229,-170,-104,-36,35,104,169,228,281,326,364,396],
    [-369,-334,-293,-245,-191,-131,-67,-1,64,128,188,243,291,332,367,397],
    [-319,-286,-250,-211,-168,-122,-74,-25,24,73,121,167,210,249,285,318],
    [-290,-252,-209,-163,-114,-62,-9,44,97,147,194,238,278,313,344,371],
    [-291,-256,-216,-174,-128,-80,-31,19,69,117,163,206,246,283,316,345],
    [-218,-133,-38,59,152,235,305,361],
    [-226,-157,-82,-3,76,151,220,280],
    [-179,-122,-61,1,62,123,179,231],
  ];
  const KBITS = [5,5,4,4,4,4,4,3,3,3];
  const CHIRP = [0x00,0x2a,0xd4,0x32,0xb2,0x12,0x25,0x14,0x02,0xe1,0xc5,0x02,0x5f,0x5a,0x05,0x0f,0x26,0xfc,0xa5,0xa5,0xd6,0xdd,0xdc,0xfc,0x25,0x2b,0x22,0x21,0x0f,0xff,0xf8,0xee,0xed,0xef,0xf7,0xf6,0xfa,0x00,0x03,0x02,0x01,0,0,0,0,0,0,0,0,0,0,0].map(v => v > 127 ? v - 256 : v);
  const INTERP_SHIFT = [0,3,3,3,2,2,1,1];

  // Public-domain-style demonstration vector printed in BrerDawg/ti_lpc's
  // documentation. It is a TMS5100 bitstream for the word "isle".
  const ISLE = Uint8Array.from([0x45,0xAB,0x36,0xAE,0xD5,0x56,0xA7,0x3E,0xCA,0xD4,0x2A,0xEE,0x96,0x73,0xD5,0x55,0x57,0x5F,0x73,0x9C,0x6B,0x91,0x1E,0x27,0xFB,0x04,0x9F,0x34,0xA3,0xC6,0xCE,0x89,0x29,0x9A,0xA5,0x5F,0xEC,0x13,0x73,0x72,0x0D,0xCF,0x27,0x37,0xDE,0x7E,0x46,0x32,0x19,0x29,0xFA,0xFA,0x8C,0x20,0xB2,0x9A,0x7D,0xF3,0x9A,0x89,0x7B,0x8F,0x70,0xEF,0x36,0x13,0xF3,0x39,0xA5,0xDE,0x69,0x46,0x1A,0x3B,0x82,0xBB,0xF3,0xAC,0x73,0xCC,0x40,0xA2,0x43,0x44,0x4A,0x9F,0x76,0x3E,0x00,0x00,0x95]);

  class BitReader {
    constructor(bytes) { this.bytes = bytes; this.bit = 0; }
    read(count) {
      if (this.bit + count > this.bytes.length * 8) throw new Error('LPC stream ended before a STOP frame');
      let value = 0;
      while (count--) { value = (value << 1) | ((this.bytes[this.bit >> 3] >> (this.bit & 7)) & 1); this.bit++; }
      return value;
    }
  }

  function parseFrames(bytes, maxFrames = 512) {
    const bits = new BitReader(bytes);
    const frames = [];
    let prior = { energy: 0, pitch: 0, k: Array(10).fill(0) };
    for (let number = 0; number < maxFrames; number++) {
      const energyIndex = bits.read(4);
      if (energyIndex === 15) { frames.push({ stop: true }); return frames; }
      if (energyIndex === 0) { prior = { energy: 0, pitch: 0, k: prior.k.slice() }; frames.push(prior); continue; }
      const repeat = bits.read(1) === 1;
      const pitchIndex = bits.read(5);
      const frame = { energy: ENERGY[energyIndex], pitch: PITCH[pitchIndex], k: prior.k.slice(), repeat };
      if (!repeat) {
        for (let i = 0; i < 4; i++) frame.k[i] = K[i][bits.read(KBITS[i])];
        if (pitchIndex !== 0) for (let i = 4; i < 10; i++) frame.k[i] = K[i][bits.read(KBITS[i])];
        else for (let i = 4; i < 10; i++) frame.k[i] = 0;
      }
      prior = frame;
      frames.push(frame);
    }
    throw new Error(`LPC stream exceeded ${maxFrames} frames`);
  }

  function wrap14(value) {
    value = Math.trunc(value);
    while (value > 16383) value -= 32768;
    while (value < -16384) value += 32768;
    return value;
  }

  function multiply(a, b) {
    while (a > 511) a -= 1024;
    while (a < -512) a += 1024;
    b = wrap14(b);
    return (a * b) >> 9;
  }

  function clipAnalog(value) {
    value = Math.max(-2048, Math.min(2047, wrap14(value))) & ~0x0f;
    return (value << 4) | ((value & 0x7f0) >> 3) | ((value & 0x400) >> 10);
  }

  function render(bytes) {
    const frames = parseFrames(bytes);
    const pcm = [];
    const x = new Int32Array(10);
    const u = new Int32Array(11);
    const current = { energy: 0, pitch: 0, k: Array(10).fill(0) };
    let previousEnergy = 0;
    let pitchCount = 0;
    let pitchZero = false;
    let rng = 0x1fff;
    let oldSilence = true;
    let oldUnvoiced = true;
    let latchedPitch = 0;
    let latchedK = Array(10).fill(0);

    function generateSample() {
      const excitation = oldUnvoiced
        ? ((rng & 1) ? -64 : 64)
        : (pitchCount < 51 ? CHIRP[pitchCount] : CHIRP[51]);
      for (let n = 0; n < 20; n++) rng = ((rng << 1) | (((rng >> 12) ^ (rng >> 3) ^ (rng >> 2) ^ rng) & 1)) & 0x1fff;
      u[10] = multiply(previousEnergy, excitation << 6);
      for (let i = 9; i >= 0; i--) u[i] = u[i + 1] - multiply(current.k[i], x[i]);
      for (let i = 9; i > 0; i--) x[i] = x[i - 1] + multiply(current.k[i - 1], u[i - 1]);
      x[0] = u[0];
      previousEnergy = current.energy;
      pcm.push(clipAnalog(u[0]));
      pitchCount++;
      if (pitchCount >= current.pitch || pitchZero) pitchCount = 0;
      pitchCount &= 0x1ff;
    }

    for (const parsed of frames) {
      // Silence and STOP frames only replace energy in the hardware parser;
      // pitch and coefficient index latches retain their previous values.
      if (!parsed.stop && parsed.energy !== 0) {
        latchedPitch = parsed.pitch;
        latchedK = parsed.k.slice();
      }
      const target = {
        energy: parsed.stop ? 0 : parsed.energy,
        pitch: latchedPitch,
        k: latchedK,
      };
      const newSilence = target.energy === 0;
      const newUnvoiced = target.pitch === 0;
      const inhibit = oldUnvoiced !== newUnvoiced || (oldSilence && !newSilence);
      const zpar = newSilence;
      const uvZpar = newUnvoiced;

      // Normal SPEAK cadence is 25 samples per interpolation period: PC 0..11
      // each have A/B samples and PC 12 has A only. The STOP frame terminates
      // at RESETL4 after IP 7, so unlike a normal frame it has no IP 0 period.
      const periods = parsed.stop ? [1,2,3,4,5,6,7] : [1,2,3,4,5,6,7,0];
      for (const ip of periods) {
        const shift = INTERP_SHIFT[ip];
        for (let pc = 0; pc <= 12; pc++) {
          generateSample();
          if (pc === 12) {
            if (ip === 7) {
              pitchZero = inhibit;
              oldSilence = newSilence;
              oldUnvoiced = newUnvoiced;
            }
            continue;
          }
          const blocked = inhibit && ip !== 0;
          if (pc === 0) {
            if (ip === 0) pitchZero = false;
            current.energy = zpar ? 0 : current.energy + (((target.energy - current.energy) * !blocked) >> shift);
          } else if (pc === 1) {
            current.pitch = zpar ? 0 : current.pitch + (((target.pitch - current.pitch) * !blocked) >> shift);
          } else {
            const k = pc - 2;
            const zero = k < 4 ? zpar : uvZpar;
            current.k[k] = zero ? 0 : current.k[k] + (((target.k[k] - current.k[k]) * !blocked) >> shift);
          }
          generateSample();
        }
      }
      if (parsed.stop) break;
    }
    return { sampleRate: SAMPLE_RATE, samples: Int16Array.from(pcm), frames };
  }

  function wav(result) {
    const bytes = new Uint8Array(44 + result.samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => [...value].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, result.sampleRate, true); view.setUint32(28, result.sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, result.samples.length * 2, true);
    result.samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
    return bytes;
  }

  return { SAMPLE_RATE, ISLE, parseFrames, render, wav };
}));
