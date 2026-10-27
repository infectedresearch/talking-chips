(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text=$('text'), phrase=$('phrase'), audio=$('audio'), phase=$('phase'), detail=$('detail');
  let image, entries, url;
  function filterText() { text.value=text.value.toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,12); }
  text.addEventListener('input',filterText);
  $('volume').addEventListener('input',()=>{audio.volume=Number($('volume').value)/100;$('volume-value').value=`${$('volume').value}%`;});
  function play(bytes,label) {
    audio.pause();
    phase.textContent='Rendering chip frames…';
    const result=window.Tmc0281Chip.render(bytes);
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(new Blob([window.Tmc0281Chip.wav(result)],{type:'audio/wav'}));
    audio.src=url;audio.hidden=false;audio.volume=Number($('volume').value)/100;
    $('download').href=url;$('download').hidden=false;
    detail.textContent=`${label} · ${(result.samples.length/8000).toFixed(2)} seconds · 8 kHz WAV`;
    audio.play().then(()=>{phase.textContent='Playing';}).catch(()=>{phase.textContent='Ready — press the audio play control';});
  }
  function failed(error) {phase.textContent='Playback unavailable';detail.textContent=error.message;console.error(error);}
  audio.addEventListener('ended',()=>{phase.textContent='Ready';});
  $('play-phrase').addEventListener('click',()=>{try{play(window.Tmc0281Rom.streamAt(image,Number(phrase.value)),phrase.selectedOptions[0].textContent);}catch(e){failed(e);}});
  $('spell').addEventListener('click',()=>{try{
    filterText();
    const spelling=window.Tmc0281Rom.spell(text.value.trim(),entries),frames=[];
    for(const entry of spelling){if(entry){frames.push(...window.Tmc0281Chip.parseFrames(window.Tmc0281Rom.streamAt(image,entry.address)).filter(f=>!f.stop));}frames.push({energy:0,pitch:0,k:Array(10).fill(0)});}
    if(!spelling.some(Boolean)){phase.textContent='Enter letters or digits first';return;}
    play(window.Tmc0281Units.encodeChipFrames(frames),'Letter-by-letter spelling');
  }catch(e){failed(e);}});
  (async()=>{try{
    const roms=await Promise.all(['tmc0351n2l.vsm','tmc0352n2l.vsm'].map(async file=>{const response=await fetch(file);if(!response.ok)throw new Error(`Voice download failed (${response.status})`);return new Uint8Array(await response.arrayBuffer());}));
    image=window.Tmc0281Rom.combine(...roms);entries=window.Tmc0281Rom.standardIndex(roms[0]);
    phrase.replaceChildren(...entries.map(entry=>{const option=document.createElement('option');option.value=entry.address;option.textContent=entry.label;return option;}));
    const preferred=entries.find(entry=>entry.label==='that is correct');if(preferred)phrase.value=preferred.address;
    phrase.disabled=false;$('play-phrase').disabled=false;$('spell').disabled=false;
    phase.textContent='Ready';detail.textContent=`${entries.length} original ROM phrases · emulated TMC0281 playback`;
  }catch(e){failed(e);}})();
})();
