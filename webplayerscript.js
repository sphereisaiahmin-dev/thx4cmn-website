<!-- Load Tone.js and Doto font -->
<script src="https://cdn.jsdelivr.net/npm/tone@14.8.39/build/Tone.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Doto:wght@500&display=swap" rel="stylesheet">

<!-- Main Audio Player -->
<div id="custom-audio-player" style="
  position: fixed; top: 25px; right: 25px;
  width: 320px; background: rgba(0,0,0,0.35);
  border-radius: 20px; padding: 15px; color: white;
  font-family: 'Doto', sans-serif; z-index: 9999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  text-align: center;
">
  <div style="overflow: hidden; white-space: nowrap; margin-bottom: 10px;">
    <div id="track-title" style="
      display: inline-block; font-size: 16px; font-weight: 500;
      animation: scroll-title 12s linear infinite; padding-left: 100%;
    ">loading…</div>
  </div>

  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
    <div id="prev" class="prev" style="cursor: pointer; font-size: 14px;">prev</div>
    <div id="play-pause" class="play-pause" style="cursor: pointer; font-size: 16px;">play</div>
    <div id="next" class="next" style="cursor: pointer; font-size: 14px;">next</div>
  </div>

  <div style="display: flex; flex-direction: column; align-items: center;">
    <div id="dot-progress" style="display: flex; justify-content: center; gap: 4px; min-height: 10px;"></div>
    <div id="time-display" style="margin-top: 6px; font-size: 12px; opacity: 0.8;">
      <span id="current-time">0:00</span> / <span id="total-duration">0:00</span>
    </div>
  </div>

  <div style="margin-top: 12px;">
    <button id="dsp-toggle" class="dsp-toggle" style="
      font-size: 16px; background: none; border: 0px solid #fff;
      color: #fff; padding: 6px 10px; border-radius: 8px; cursor: pointer;
    ">ctrl</button>
  </div>
</div>

<!-- DSP Widget (hidden initially) -->
<div id="audio-widget" style="
  position: fixed; display: none; right: 25px;
  width: 320px; background: rgba(0,0,0,0.35);
  border-radius: 20px; padding: 16px; color: white;
  font-family: 'Doto', sans-serif; z-index: 9998;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
">
  <div style="margin-bottom: 8px;"><strong></strong></div>
<div style="margin-bottom: 30px;">
<div style="position: relative; height: 12px; margin-bottom: 6px;">
  <div style="position: absolute; left: 0; font-size: 12px; color: red;">0.5x</div>
  <div style="position: absolute; left: 50%; transform: translateX(-50%); font-size: 12px; color: green;">1.0x</div>
  <div style="position: absolute; right: 0; font-size: 12px; color: blue;">2.0x</div>
</div>
<input type="range" id="speed" min="0" max="100" step="1" value="50" style="width:100%;">
</div>
<div style="
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: absolute;
  bottom: 16px;
  left: 16px;
  right: 16px;
">
  <div id="reverse" class="ab-btn">reverse</div>
  <div id="ab-controls" style="display: flex; gap: 16px;">
    <button id="markA" class="ab-btn">a</button>
    <button id="markB" class="ab-btn">b</button>
  </div>
</div>

<!-- CSS -->
<style>
  @keyframes scroll-title {
    0% { transform: translateX(0%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes rgb-cycle {
    0%   { background: red; }
    33%  { background: green; }
    66%  { background: blue; }
    100% { background: red; }
  }
  @keyframes rgb-text-cycle {
    0%   { color: red; }
    33%  { color: green; }
    66%  { color: blue; }
    100% { color: red; }
  }
  .dot {
    width: 8px; height: 8px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%; cursor: pointer;
    transition: background 0.2s ease;
  }
  .dot.active { background: white; }
  .dot.loop { animation: rgb-cycle 1.5s linear infinite; }

  /* A/B buttons styling */
.ab-btn {
  background: transparent;
  border: none;
  color: white;
  font-size: 18px;
  padding: 4px 8px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.ab-btn:hover {
  transform: scale(1.2);
  animation: rgb-text-cycle 1.5s linear infinite;
}

.ab-btn.active {
  animation: rgb-text-cycle 1.5s linear infinite;
}

.dsp-toggle:hover {
	transform: scale(1.7);
  animation: rgb-text-cycle 1.5s linear infinite;
  }

.prev:hover {
	transform: scale(1.5);
  }

.play-pause:hover {
	transform: scale(1.5);
  }
  
.next:hover {
	transform: scale(1.5);
  }
  
  /* hide loopInfo if present */
  #loopInfo { display: none !important; }

  /* allow absolute bottom */
  #audio-widget { position: relative; min-height: 80px; }
  input[type="range"]#speed {
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: #999;
  border-radius: 3px;
  outline: none;
  margin: 12px 0;
}

input[type="range"]#speed::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
  transition: background 0.2s;
}

input[type="range"]#speed::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
}
</style>

<!-- JavaScript -->
<script>
(() => {
  const tracks = [
  { url: "https://dl.dropboxusercontent.com/scl/fi/dy67jy0psprw0rfwbv2k4/4thefam-84bpm_BEAT-thx4cmn-L-T.mp3?rlkey=5k14ifu203gwesdq8ze0fd3v4&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/y9cr45nvm7rih0ybbnha8/4thelove-101bpm_BEAT-thx4cmn-L-C-T.mp3?rlkey=vavg4c176hla4xopaln4l1xj0&st=ikgo5zul&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/w29ydbn6uk9fkanp7m2za/8mile-138bpm_BEAT-thx4cmn-L-T.mp3?rlkey=4tkcfx4xankqiib69f2yw1vhw&st=o5yigs00&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/37n2s2qn5eyf2qx2msm8i/21questions-149bpm_BEAT-thx4cmn-L-T-J.mp3?rlkey=dv6nyejg0sl5q0jnv0dzbpdhp&st=iqxiuj27&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/37n2s2qn5eyf2qx2msm8i/21questions-149bpm_BEAT-thx4cmn-L-T-J.mp3?rlkey=dv6nyejg0sl5q0jnv0dzbpdhp&st=yqu90wpc&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/ia4o8w1s3tm7m5vqq5gsu/50yards_BEAT-THX4CMN-T-L.mp3?rlkey=7ogdsp72s2gitjnp3d826cfj1&st=hd44jqov&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/a3y5pyabymjtmtqbniwj8/36type-BEAT-120bpm-thx4cmn-L-T-U.mp3?rlkey=piv54vynir8wtfl9ek0fzvone&st=n7259k5o&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/e8nkc3vb312anxsjq99wv/alltime_BEAT-143bpm-thx4cmn-L-U.mp3?rlkey=aenlb38a9fbh0fxaawpq6gd7b&st=2ndo5bxy&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/ayfuyhrjeaketj2p2rsyo/anotherday_BEAT-77bpm-thx4cmn-L-T.mp3?rlkey=iy7jjcn62wqdhws4t8yl4m21y&st=cf2pmj0p&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/89e3qi04k09o3cficy8m2/APPS-130BPM-PROD.THX4CMN-toryon-cole-lyfe.mp3?rlkey=dec1von509vyd68aubsuqxsp8&st=66sy7czx&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/4jk3j97u9xi9ws4gkckto/beachday-146bpm_BEAT-L-U-T.mp3?rlkey=xra2y546p2eikc4yq6225gccn&st=riszsdfv&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/zw6iq2nnn6b67vo8qtppl/bigrisks-170bpm-thx4cmn-T-L.mp3?rlkey=etum111j0co0q08u59dip3g3r&st=shekfio7&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/nmne9nys734x8t4llbwz9/dontblink-151bpm_BEAT-thx4cmn-L-T-J.mp3?rlkey=wzktiqlac252bxjfm4knbskqj&st=d3dpa5eq&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/b8eoixniuchrzhm8wx2ty/ESC_BEAT-104bpm-thx4cmn-U-L.mp3?rlkey=clrirxrjp0ww83r19vob5ysfa&st=66pb8371&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/3t7guv6a5c3enm8x1kid9/eternal-fire-137bpm_BEAT-thx4cmn-L-T.mp3?rlkey=m1oasfcra1t2y4hfhvbqxeiin&st=7lvjb58v&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/d1k7i4ybnuoqewkypy6ge/downanaheim-86bpm-thx4cmn-T-L.mp3?rlkey=lwzxuvloxg0oj8093b8lrb214&st=74piovg7&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/0l0ovms4uef8i7a8vkbmn/finechina_BEAT-106bpm-thx4cmn-L-U.mp3?rlkey=hci7eqjb79c8k0uqjcatbmqmh&st=f2z1b9cl&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/ly0dfkid06ma098m15nyh/finishline-159bpm-thx4cmn-U-L.mp3?rlkey=niw289hsbbhebo462gtbox7p7&st=toidk2tp&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/rlfgbasb3o4qfn4xnd0st/foundations_BEAT-162bpm-thx4cmn-L-T-U.mp3?rlkey=uyihhwlr27scl3824p1hx7673&st=yanp6sl7&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/yflzl4gor7nfztfvtlfx4/fullmetal-132bpm_BEAT-thx4cmn-L-T.mp3?rlkey=iv7ao1gq30bxkexa5vvvy27u7&st=ga3f43m3&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/vk8ttfcrlj4wylv0bw8zp/highasl-125bpm-thx4cmn-x-wes-T-L.mp3?rlkey=52qj6w22m0zb6844k2afds4vh&st=ffvmrqrx&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/tom7uce67rj1iny6a0z1b/hyperspace-125bpm_BEAT-thx4cmn-L-T.mp3?rlkey=1as4yp9hygu1quy9h3g5z7xk7&st=7jyejpex&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/gw4915tm68vm1mf8i29fy/iknowwhy_BEAT-100bpm-thx4cmn-L-T.mp3?rlkey=bkyw6hathhj7q9pnsb7ufuapg&st=1qk16n3y&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/gch08vpcegg95dct9c8n9/in-daclub-123bpm_BEAT-thx4cmn-L-T.mp3?rlkey=qzkcsxuss1bqg1s1b8ywxc4bj&st=mpuxikn1&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/y0h883ttze5kpux4qeb75/kitana-147bpm_BEAT-thx4cmn-L-U.mp3?rlkey=ediz4o5h2b3zfubpnuuvm7ixa&st=fp38z7wr&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/hmle549mmn4c3z9lujnfs/lalala_BEAT-144bpm-thx4cmn-U-L-J.mp3?rlkey=9mwqkf5n6n4dnazsodkgd1wu9&st=jynbtio0&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/hmle549mmn4c3z9lujnfs/lalala_BEAT-144bpm-thx4cmn-U-L-J.mp3?rlkey=9mwqkf5n6n4dnazsodkgd1wu9&st=wrp66ya8&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/py4g5smdotbf5q5ycsoj5/marysantos_BEAT-144bpm-thx4cmn-L-T.mp3?rlkey=gu95h1n8v106b2d6x3ywv8246&st=wb6b78zy&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/6mf8gkvxt57fv6n6tq0sz/lavish-132bpm_BEAT-thx4cmn-L-U.mp3?rlkey=y01sml73sf81haspxotlc8gky&st=qjqk1k9d&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/py4g5smdotbf5q5ycsoj5/marysantos_BEAT-144bpm-thx4cmn-L-T.mp3?rlkey=gu95h1n8v106b2d6x3ywv8246&st=od8ofc9p&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/e1nqplw96ltubfs8p1dmy/MONEYBAGS-151bpm-thx4cmn-L-T.mp3?rlkey=1fe6w31l792kntjgohcbolj09&st=krbtjcmg&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/jgtw7yvtor2gl55l6lskx/moneytalk-BEAT-DbMin-thx4cmn-L-T.mp3?rlkey=ztk8uushmep8c7hkfeflltnt1&st=4e6mj9x7&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/q2tvsjt2pgt7c6bbr9awp/natureboy-131bpm-BEAT-thx4cmn-L-T.mp3?rlkey=idwjtw59x3zarytqvpwi2mcs2&st=02rjbyac&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/3ii0khlycac29r143fnze/outthemud-152bpm-thx4cmn-U-L.mp3?rlkey=tfjfgkv66cio4k5wtmn3yb4af&st=8jsypec9&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/o7n1w2nwa65tfr4g9a57u/setablaze-140bpm_BEAT-thx4cmn-L-T.mp3?rlkey=qh1x4349u8fj650co2481ecdp&st=ntmowvak&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/wddoqawafl48e2qx3942g/slappy-117bpm_BEAT-thx4cmn-L-T.mp3?rlkey=cgdauj0qgvcu19qb10hru40hp&st=sh6glv9j&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/uc6silfq0ywr07mmf9wv5/speakers-79bpm_BEAT-thx4cmn-L-T-TV.mp3?rlkey=esqpjv56tsrd65bukqqqm2kn2&st=9c7usx43&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/wukqhbzwi0zr96owahjkf/SPLIFF2-THX4CMN-U-C-L.mp3?rlkey=59ew3g953du2gq32ml44u4xu9&st=l3kz8ut3&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/nvruicajszt9ljfi78anc/starvation-178bpm_BEAT-L-T.mp3?rlkey=6sxd8wm11ugj7gq0zwsupqve2&st=osbxutaa&raw=1" },
  { url: "https://dl.dropboxusercontent.com/scl/fi/pe7tkhmosdwssf8uepcp1/steviewonder-164bpm-BEAT-thx4cmn-L-T.wav?rlkey=kk65uxt5m1l5ve6u1pf7cn4n9&st=7cf1o3jh&raw=1" }
];
  tracks.forEach(t => {
    const fn = decodeURIComponent(t.url.split('/').pop().split('?')[0]);
    t.title = fn.replace(/\.[^/.]+$/, '').replace(/[_-]/g,' ').replace(/^./, c=>c.toUpperCase());
  });

  const NUM_DOTS = 20;
  let currentTrack=0, player, startTime=0, offset=0, isPlaying=false;
  let loopA=0, loopB=0, aEn=false, bEn=false, loopChk;

  // DOM refs
  const titleEl   = document.getElementById('track-title'),
        playBtn   = document.getElementById('play-pause'),
        prevBtn   = document.getElementById('prev'),
        nextBtn   = document.getElementById('next'),
        dotsCont  = document.getElementById('dot-progress'),
        curT      = document.getElementById('current-time'),
        totT      = document.getElementById('total-duration'),
        dspToggle = document.getElementById('dsp-toggle'),
        widget    = document.getElementById('audio-widget'),
        speedCtl  = document.getElementById('speed'),
        revCtl    = document.getElementById('reverse'),
        markA     = document.getElementById('markA'),
        markB     = document.getElementById('markB'),
        speedVal  = document.getElementById('speedVal');

  const fmt = s => {
    const m=Math.floor(s/60), sec=Math.floor(s%60).toString().padStart(2,'0');
    return `${m}:${sec}`;
  };
async function loadTrack(i) {
  if (player) player.dispose();

  const t = tracks[i];
  player = new Tone.Player({ url: t.url, loop: false, reverse: false }).toDestination();

  titleEl.textContent = t.title;
  offset = 0; isPlaying = false; playBtn.textContent = 'play';
  clearLoop();
  createDots();
  curT.textContent = '0:00'; totT.textContent = '0:00';

  // <— Set this here, *after* player exists
  player.onload = () => {
    // 1) show duration
    totT.textContent = fmt(player.buffer.duration);

    // 2) center the log slider at 1.0×
    const initSlider = speedToSlider(1.0);
    speedCtl.value = initSlider;
    speedVal.textContent = sliderToSpeed(initSlider).toFixed(2);
  };
}
  function createDots(){
    dotsCont.innerHTML='';
    for(let i=0;i<NUM_DOTS;i++){
      const d=document.createElement('div');
      d.className='dot';
      d.onclick=()=>{ if(!player.buffer) return;
        offset=(i+0.5)*(player.buffer.duration/NUM_DOTS);
        startTime=Tone.now();
        player.stop(); player.start(Tone.now(),offset);
      };
      dotsCont.appendChild(d);
    }
  }

  function nowPos(){
    const elapsed=(Tone.now()-startTime)*player.playbackRate;
    return Math.max(0, Math.min(offset+(player.reverse?-elapsed:elapsed), player.buffer.duration));
  }

  function updateUI(pos){
    if(!player.buffer) return;
    const dur=player.buffer.duration, slice=dur/NUM_DOTS;
    const filled=Math.floor(pos/slice),
          aIdx=Math.floor(loopA/slice),
          bIdx=Math.floor(loopB/slice);
    dotsCont.childNodes.forEach((d,i)=>{
      d.classList.toggle('active', i<filled);
      d.classList.remove('loop');
if (aEn && !bEn) {
  // only A set: highlight from A to current playhead
  if ((!player.reverse && i >= aIdx && i <= filled) ||
      ( player.reverse && i <= aIdx && i >= filled)) {
    d.classList.add('loop');
  }
}
if (aEn && bEn) {
  // both set: highlight full A↔B regardless of order
  const low  = Math.min(aIdx, bIdx);
  const high = Math.max(aIdx, bIdx);
  if (i >= low && i <= high) {
    d.classList.add('loop');
  }
}

if (aEn && bEn) {
  const min = Math.min(aIdx, bIdx);
  const max = Math.max(aIdx, bIdx);
  if (i >= min && i <= max) d.classList.add('loop');
}
    });
    curT.textContent=fmt(pos);
  }

  function seek(pos){
    player.stop(); offset=pos; startTime=Tone.now();
    player.start(Tone.now(),offset);
  }

function startLoop() {
  clearInterval(loopChk);
  loopChk = setInterval(() => {
    const p = nowPos();
    if (aEn && bEn) {
      // always treat A/B as a range, regardless of how they were set
      const low  = Math.min(loopA, loopB);
      const high = Math.max(loopA, loopB);

      if (!player.reverse) {
        // forward: when playhead passes the later point, jump to the earlier
        if (p >= high) seek(low);
      } else {
        // reverse: when playhead moves before the earlier point, jump to the later
        if (p <= low)  seek(high);
      }
    }
  }, 50);
}


  function clearLoop(){
    clearInterval(loopChk);
    aEn=bEn=false;
    markA.classList.remove('active');
    markB.classList.remove('active');
  }

let toneStarted = false;

playBtn.onclick = async () => {
  // First time: unlock the audio context
  if (!toneStarted) {
    await Tone.start();
    toneStarted = true;
  }

  // Now ensure the player exists & is buffered
  if (!player || !player.buffer || !player.buffer.loaded) {
    console.warn('Track not yet ready');
    return;
  }

  clearLoop();

  if (!isPlaying) {
    startTime = Tone.now();
    player.start(Tone.now(), offset);
    isPlaying = true;
    playBtn.textContent = 'pause';
  } else {
    player.stop();
    isPlaying = false;
    playBtn.textContent = 'play';
  }
};

function resetSlider() {
  const center = speedToSlider(1.0);
  speedCtl.value = center;
};

function resetReverse() {
  isReversing = false;
  reverseBtn.classList.remove('active');
};

prevBtn.onclick = () => {
  clearLoop();
  currentTrack = (currentTrack - 1 + tracks.length) % tracks.length;
  loadTrack(currentTrack);
  resetSlider();
  resetReverse();
};

nextBtn.onclick = () => {
  clearLoop();
  currentTrack = (currentTrack + 1) % tracks.length;
  loadTrack(currentTrack);
  resetSlider();
  resetReverse();
};

  // Speed
  speedCtl.oninput=e=>{
    if(!player.buffer||!player.buffer.loaded) return;
    player.playbackRate=+e.target.value;
    speedVal.textContent=(+e.target.value).toFixed(2);
  };
  
const reverseBtn = document.getElementById('reverse');
let isReversing = false;

reverseBtn.onclick = () => {
  if (!player.buffer || !isPlaying) return;

  isReversing = !isReversing;
  reverseBtn.classList.toggle('active', isReversing);

  const p = nowPos();
  player.stop();
  offset = p;
  player.reverse = isReversing;
  startTime = Tone.now();
  player.start(Tone.now(), offset);
  if (aEn && bEn) startLoop();
};

function sliderToSpeed(val) {
  const min = 0.5, max = 2.0;
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const scale = val / 100;
  const logVal = logMin + (logMax - logMin) * scale;
  return Math.exp(logVal);
}

function speedToSlider(speed) {
  const min = 0.5, max = 2.0;
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const percent = (Math.log(speed) - logMin) / (logMax - logMin);
  return Math.round(percent * 100);
}

speedCtl.oninput = e => {
  const newRate = sliderToSpeed(+e.target.value);
  player.playbackRate = newRate;
};


// A/B buttons
markA.onclick = () => {
  if (!isPlaying) return alert('▶ Play first');

  if (!aEn) {
    // === Setting A ===
    // Clear only B (in case a previous loop existed):
    bEn = false;
    markB.classList.remove('active');

    // Now mark A:
    aEn = true;
    loopA = nowPos();
    markA.classList.add('active');
  } else {
    // === Un-setting A ===
    // Clear both A & B:
    clearLoop();

    // Jump playhead back to A:
    seek(loopA);
  }
};

markB.onclick = () => {
  if (!isPlaying || !aEn) return;

  if (!bEn) {
    // === Setting B ===
    bEn = true;
    loopB = nowPos();
    markB.classList.add('active');
    startLoop();
  } else {
    // === Un-setting B ===
    clearLoop();
    seek(loopA);
  }
};

  // DSP toggle
  dspToggle.onclick=()=>{
    widget.style.display=widget.style.display==='block'?'none':'block';
    const r=document.getElementById('custom-audio-player').getBoundingClientRect();
    widget.style.top=r.bottom+window.scrollY+10+'px';
  };

  // Live update
  setInterval(()=>{
    if(player?.buffer&&isPlaying) updateUI(nowPos());
  },100);
  
  loadTrack(currentTrack);

// Init
window.onload = () => {
  // Shuffle array
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  loadTrack(currentTrack);
};
})();
</script>
