import './style.css';
import { NightlineGame, type GameSnapshot, type Action } from './game/engine';
import { GameplayRecorder, type RecordingStatus } from './game/recorder';
import { LeaderboardUI, leaderboardMarkup, resultLeaderboardMarkup } from './game/leaderboard-ui';
import { LeaderboardClient } from './game/leaderboard-client';

const publicBase = import.meta.env.BASE_URL;

if (window.parent !== window) document.body.classList.add('embedded');

const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  sound: '<path d="m11 5-6 4H2v6h3l6 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-6 4H2v6h3l6 4zM16 9l6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.3.8-1.7 1.2-1.7 2.7M12 17h.01"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  trophy:
    '<path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8"/>',
  coin: '<path d="m12 2 9 10-9 10L3 12zM3 12h18M12 2v20"/>',
  location:
    '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  restart: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  rain: '<path d="M6 14a4 4 0 1 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9M8 17l-1 3m6-3-1 3m6-3-1 3"/>',
  flag: '<path d="M5 21V3m0 1c5-3 8 3 14 0v10c-6 3-9-3-14 0"/>',
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>',
};
const icon = (name: keyof typeof icons): string =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="world"></div><div class="vignette"></div><div class="menu-shade"></div><div class="grain"></div><div class="flow-vignette"></div>
  <header class="topbar">
    <button id="brand" class="brand" aria-label="Night Relay home"><img class="higgsfield-glyph" src="${publicBase}branding/higgsfield-mark.svg" alt=""><span class="relay-wordmark"><small>HIGGSFIELD</small>NIGHT RELAY</span></button>
    <span class="brand-note">THE REGISTAN EDITION</span>
    <nav class="nav-actions" aria-label="Game options">
      <button id="leaderboard" class="missions-button leaderboard-nav" aria-label="Leaderboard">${icon('trophy')}<span>Leaderboard</span></button><button id="missions" class="missions-button" aria-label="Tonight’s missions">${icon('flag')}<span>Tonight’s missions</span></button><button id="help" class="help-button" aria-label="How to play">How to play <span>?</span></button>
      <span class="nav-divider"></span>
      <button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="true">${icon('sound')}</button>
      <button id="settings" class="icon-button" aria-label="Settings">${icon('settings')}</button>
      <button id="fullscreen" class="icon-button" aria-label="Enter fullscreen">${icon('expand')}</button>
      <a id="github-profile" class="icon-button github-profile" href="https://github.com/Mukhsin0508" target="_blank" rel="noopener noreferrer" aria-label="Mukhsin Mukhtorov on GitHub" title="Mukhsin Mukhtorov on GitHub"><img src="${publicBase}branding/github.svg" width="20" height="20" alt=""></a>
    </nav>
  </header>
  <main id="menu" class="menu">
    <div class="hero">
      <div class="eyebrow"><span class="live-dot"></span> SAMARKAND · REGISTAN</div>
      <h1>CARRY<br>THE <span>LIGHT.</span></h1>
      <p>A thousand colors. One midnight relay.<br>Light up Samarkand, one pulse at a time.</p>
      <div class="start-line"><button id="start" class="primary-button">START THE RELAY <span>${icon('arrow')}</span></button><div class="best-preview">${icon('trophy')}<div><span>YOUR PERSONAL BEST</span><strong id="menu-best">—</strong></div></div></div>
      <div class="start-caption"><span class="desktop-start"><span class="tiny-key">↵</span> Press enter to carry the light</span><span class="mobile-start">Your next great run starts here.</span></div><button id="player-profile" class="player-profile"><span>PLAYING AS <b id="player-name">A NEW COURIER</b></span><strong id="player-rank">CLAIM YOUR PLACE</strong><span>↗</span></button>
    </div>
    <div class="scene-label"><span class="scene-label-line"></span><span>THE REGISTAN LIGHT FESTIVAL</span><span class="scene-label-sub">${icon('rain')} <span id="weather-label">MIDNIGHT RAIN</span></span><button id="weather-cycle" class="weather-cycle">Change the weather ↗</button></div>
    <div class="menu-bottom"><div class="location">${icon('location')}<div><strong>SAMARKAND, UZBEKISTAN</strong><span>39°39′17″ N &nbsp; 66°58′32″ E</span></div></div>
    <div class="controls-legend"><span class="swipe-hint">SWIPE LEFT OR RIGHT TO SWITCH LANES</span><div><span class="key-pair"><kbd>←</kbd><kbd>→</kbd></span><span>SWITCH LANES</span></div></div>
    <span class="edition"><span></span> EDITION 01 · SAMARKAND <a href="${publicBase}credits.html" target="_blank" rel="noopener">Credits ↗</a></span></div>
  </main>
  <section id="hud" class="hud" hidden aria-label="Run statistics">
    <div class="score-block"><span class="label">SCORE</span><strong id="score">000000</strong><span class="best-small">BEST <b id="hud-best">0</b></span><div id="flow" class="flow-meter"><div><strong id="multiplier">1×</strong><span id="flow-label">FIND YOUR FLOW</span></div><span class="flow-track"><i id="flow-fill"></i></span><small id="streak-label">10 fragments to 2×</small></div></div>
    <div class="run-middle"><div class="coin-counter">${icon('coin')}<span id="coins">0</span></div><button id="pulse" class="pulse-button" aria-label="Activate light pulse" disabled><span class="pulse-icon">${icon('spark')}</span><span><strong id="pulse-label">CHARGE LIGHT</strong><small id="pulse-charge">0 / 6 FRAGMENTS</small></span><kbd>E</kbd><i id="pulse-fill"></i></button><div id="shield" class="shield-counter" hidden>${icon('shield')}<span id="shield-seconds">2.6s</span></div></div>
    <div class="run-right"><div class="distance-counter"><strong id="distance">0</strong><span>METERS</span></div><button id="pause" class="icon-button pause-button" aria-label="Pause game">${icon('pause')}</button></div>
    <div class="district-tag"><span>NOW RUNNING</span><strong id="district">REGISTAN SQUARE</strong><i><b id="district-progress"></b></i></div><div class="run-bottom"><div class="speed-label"><span class="live-dot"></span><b id="speed">50</b> KM/H <span class="speed-line"></span><span>REGISTAN AFTER HOURS</span></div><button id="mission-progress" class="mission-progress" aria-label="View mission progress"><span id="mission-dots">○ ○ ○</span> <b id="mission-count">0/3</b> MISSIONS</button><div class="run-shortcuts"><button id="record" class="subtle-button" aria-label="Record gameplay clip" title="Record up to 15 seconds of silent gameplay (R)"><i class="record-dot"></i><span id="record-label">CLIP</span></button><button id="cinematic" class="subtle-button" title="Hide interface (C)">${icon('camera')} CINEMA</button><span><kbd>esc</kbd> PAUSE</span></div></div>
  </section>
  <div id="intro-overlay" class="intro-overlay" hidden><div class="letterbox top"></div><div class="letterbox bottom"></div><div class="intro-location"><span>REGISTAN · 00:17</span><strong>ONE LAST TOUCH.</strong></div><p id="intro-subtitle" class="intro-subtitle"></p><button id="skip-intro" class="skip-intro">SKIP INTRO <kbd>↵</kbd></button></div><div id="countdown" class="countdown" hidden><span>TAKE A BREATH.</span><strong id="count-number">3</strong></div>
  <div id="cue" class="cue" role="status"></div>
  <div id="touch-controls" class="touch-controls" hidden><button data-action="left" aria-label="Move left">←</button><button data-action="right" aria-label="Move right">→</button></div>
  <div id="pause-panel" class="overlay-panel" hidden><div class="result-card"><span class="eyebrow">THE CITY CAN WAIT.</span><h2>CATCH YOUR<br><em>BREATH.</em></h2><p>Your run is right where you left it.</p><button id="resume" class="primary-button">KEEP RUNNING <span>${icon('play')}</span></button><button id="pause-home" class="text-button">Back to the city</button></div></div>
  <div id="result-panel" class="overlay-panel" hidden><div class="result-card"><span id="result-eyebrow" class="eyebrow">ONE MORE NIGHT?</span><h2>WHAT<br>A <em>RUN.</em></h2><p id="crash-tip" class="crash-tip"></p><div class="result-score"><span>FINAL SCORE</span><strong id="final-score">0</strong></div><div class="result-stats"><div><strong id="final-distance">0 m</strong><span>DISTANCE</span></div><div><strong id="final-coins">0</strong><span>LIGHT FRAGMENTS</span></div><div><strong id="final-best">0</strong><span>PERSONAL BEST</span></div></div><div class="result-extra"><span><b id="final-flow">1×</b> BEST FLOW</span><span><b id="final-close">0</b> CLOSE CALLS</span><span><b id="final-clean">0</b> CLEAN MOVES</span></div><button id="score-sync" class="score-sync">Saving your place on the board…</button>${resultLeaderboardMarkup}<button id="retry" class="primary-button">RUN IT BACK <span>${icon('restart')}</span></button><div class="result-links"><button id="share" class="text-button">Copy your score ↗</button><button id="result-home" class="text-button">Back to the city</button></div></div></div>
  <dialog id="help-dialog"><button class="dialog-close icon-button" aria-label="Close how to play">${icon('close')}</button><span class="eyebrow">FIND YOUR RHYTHM.</span><h2>CARRY THE LIGHT.</h2><p>You are the festival’s courier. Move between two lanes and carry the light through Samarkand’s midnight projections.</p><div class="instruction-row"><span><kbd>←</kbd> <kbd>→</kbd></span><div><strong>Switch lanes</strong><p>Use pronation to move left and supination to move right.</p></div></div><div class="instruction-row"><span><kbd>E</kbd></span><div><strong>Release your light</strong><p>Collect six fragments, then press E or tap PULSE. Pass through projections for 2.6 seconds.</p></div></div><div class="pickup-guide"><span>${icon('coin')} Light fragments: 50 points × your flow multiplier</span><span>${icon('shield')} Six fragments charge a 2.6-second Light Pulse</span></div><p class="help-note">The safe lane alternates, so each successful glove movement reverses the previous movement.</p><p class="help-note">Esc to pause · C for cinema mode · R to record a silent 15-second clip.</p><button class="primary-button dialog-done">GOT IT <span>${icon('arrow')}</span></button></dialog>
  <dialog id="settings-dialog"><button class="dialog-close icon-button" aria-label="Close settings">${icon('close')}</button><span class="eyebrow">MAKE IT YOUR NIGHT.</span><h2>THE DETAILS.</h2><div class="setting-row"><div><strong>Sound</strong><p>Original music, footsteps, and festival chimes.</p></div><button id="setting-sound" class="toggle" role="switch" aria-checked="true" aria-label="Game sound"><span></span></button></div><div class="setting-row"><div><strong>Graphics</strong><p>Choose detail or performance.</p></div><select id="quality" aria-label="Graphics quality"><option value="high">Cinematic</option><option value="balanced">Performance</option></select></div><div class="setting-row"><div><strong>Weather</strong><p>A different mood for the same city.</p></div><select id="weather" aria-label="Weather"><option value="rain">Midnight rain</option><option value="clear">Clear night</option></select></div><div class="setting-row"><div><strong>Touch controls</strong><p>Show buttons alongside swipes.</p></div><button id="setting-touch" class="toggle" role="switch" aria-checked="false" aria-label="Show touch buttons"><span></span></button></div><button class="primary-button dialog-done">ALL SET <span>${icon('arrow')}</span></button></dialog>
  <dialog id="missions-dialog"><button class="dialog-close icon-button" aria-label="Close missions">${icon('close')}</button><span class="eyebrow">MAKE THIS RUN COUNT.</span><h2>TONIGHT’S<br>MISSIONS.</h2><p>Three challenges. One run. How many can you finish?</p><div class="mission-objectives">${[
    { id: 'distance', title: 'Own the night', text: 'Run 500 meters', target: 500 },
    { id: 'coins', title: 'Carry the light', text: 'Collect 40 light fragments', target: 40 },
    {
      id: 'clean-passes',
      title: 'Find your flow',
      text: 'Make 6 clean moves or close calls',
      target: 6,
    },
  ]
    .map(
      (item) =>
        `<div class="objective" id="objective-${item.id}"><span class="objective-check">${icon('flag')}</span><div><strong>${item.title}</strong><p>${item.text}</p><i><b id="objective-fill-${item.id}"></b></i></div><span id="objective-count-${item.id}">0 / ${item.target}</span></div>`,
    )
    .join(
      '',
    )}</div><button class="primary-button dialog-done">LET’S GET THEM <span>${icon('arrow')}</span></button></dialog>
  ${leaderboardMarkup}
  <button id="exit-cinema" class="exit-cinema" hidden>${icon('camera')} Show interface <kbd>C</kbd></button>
  <aside id="clip-panel" class="clip-panel" hidden aria-label="Gameplay clip"><span id="clip-indicator" class="clip-indicator"></span><div><strong id="clip-title">RECORDING YOUR RUN</strong><span id="clip-detail">A clean, silent gameplay clip.</span></div><button id="clip-stop" class="clip-action">STOP</button><a id="clip-download" class="clip-action" hidden>DOWNLOAD ↗</a><button id="clip-dismiss" class="clip-dismiss" aria-label="Dismiss clip" hidden>${icon('close')}</button></aside>
  <div id="loading" class="loading"><img class="higgsfield-glyph" src="${publicBase}branding/higgsfield-mark.svg" alt="Higgsfield"><strong>NIGHT RELAY</strong><div class="loading-bar"><span></span></div><p>Lighting up Samarkand…</p></div>
  <div id="error" class="error-screen" hidden><h2>A little more horsepower.</h2><p>This game needs WebGL. Enable hardware acceleration in your browser, then reload.</p><button id="reload" class="primary-button">RELOAD ${icon('restart')}</button></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const number = new Intl.NumberFormat('en-US');
let game: NightlineGame;
let recorder: GameplayRecorder | undefined;
let leaderboard: LeaderboardUI | undefined;
const leaderboardClient = new LeaderboardClient();
let current: GameSnapshot | undefined;
let weather: 'rain' | 'clear' = 'rain';
let sound = true,
  cinema = false,
  touch = window.matchMedia('(pointer: coarse)').matches;
let lastMode = '';
let cueTimer: ReturnType<typeof setTimeout>;
let pausedForDialog = false;
try {
  sound = localStorage.getItem('nightline.sound') !== 'off';
} catch {
  /* Use defaults if storage is unavailable. */
}
const announce = (message: string): void => {
  $('cue').textContent = message;
  $('cue').classList.add('visible');
  clearTimeout(cueTimer);
  cueTimer = setTimeout(() => $('cue').classList.remove('visible'), 2600);
};
const updateRecording = (status: RecordingStatus): void => {
  const recording = status.state === 'recording';
  $('clip-panel').hidden = status.state === 'idle';
  $('clip-panel').classList.toggle('recording', recording);
  $('clip-title').textContent = recording
    ? `RECORDING · ${status.remaining}s LEFT`
    : 'YOUR CLIP IS READY';
  $('clip-detail').textContent = recording
    ? 'Just the game. No interface. No audio.'
    : 'Save your run and make it yours.';
  $('clip-stop').hidden = !recording;
  $('clip-download').hidden = recording;
  $('clip-dismiss').hidden = recording;
  const download = $<HTMLAnchorElement>('clip-download');
  if (status.url) {
    download.href = status.url;
    download.download = status.filename;
  } else download.removeAttribute('href');
  $('record').classList.toggle('active', recording);
  $('record').setAttribute('aria-label', recording ? 'Stop recording' : 'Record gameplay clip');
  $('record-label').textContent = recording ? 'STOP' : 'CLIP';
};
const toggleRecording = (): void => {
  if (recorder?.isRecording) {
    recorder.stop();
    return;
  }
  if (current?.mode === 'playing' && !recorder?.start())
    announce('Clip recording isn’t supported in this browser.');
};
const setCinema = (value: boolean): void => {
  cinema = value;
  document.body.classList.toggle('cinema', cinema);
  $('exit-cinema').hidden = !cinema;
  game.setCinematic(cinema);
};
const updateSound = (): void => {
  $('sound').innerHTML = icon(sound ? 'sound' : 'mute');
  $('sound').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound');
  $('sound').setAttribute('aria-pressed', String(sound));
  $('setting-sound').setAttribute('aria-checked', String(sound));
  game.setSound(sound);
  try {
    localStorage.setItem('nightline.sound', sound ? 'on' : 'off');
  } catch {
    /* Optional preference. */
  }
};
const update = (snapshot: GameSnapshot): void => {
  current = snapshot;
  if (snapshot.mode === 'playing' || snapshot.mode === 'over')
    leaderboardClient.trackProgress(snapshot.runSeconds);
  if (snapshot.mode !== lastMode && ['paused', 'menu'].includes(snapshot.mode))
    void leaderboardClient.flushProgress();
  $('world').dataset.fps = String(snapshot.fps);
  $('world').dataset.human = String(snapshot.humanReady);
  $('intro-subtitle').textContent = snapshot.introText;
  document.body.classList.toggle('in-flow', snapshot.mode === 'playing' && snapshot.multiplier > 1);
  $('multiplier').textContent = `${snapshot.multiplier}×`;
  $('flow-label').textContent = snapshot.multiplier > 1 ? 'IN THE FLOW' : 'FIND YOUR FLOW';
  $('flow-fill').style.transform = `scaleX(${snapshot.comboRemaining})`;
  $('streak-label').textContent =
    snapshot.streak >= 50
      ? `${snapshot.streak} LIGHT STREAK`
      : snapshot.streak >= 25
        ? `${50 - snapshot.streak} fragments to 4×`
        : snapshot.streak >= 10
          ? `${25 - snapshot.streak} fragments to 3×`
          : `${10 - snapshot.streak} fragments to 2×`;
  $('district').textContent = snapshot.district;
  $('district-progress').style.transform = `scaleX(${(snapshot.distance % 250) / 250})`;
  const completed = snapshot.objectives.filter((objective) => objective.complete).length;
  $('mission-dots').textContent = snapshot.objectives
    .map((objective) => (objective.complete ? '●' : '○'))
    .join(' ');
  $('mission-count').textContent = `${completed}/3`;
  for (const objective of snapshot.objectives) {
    $(`objective-${objective.id}`).classList.toggle('complete', objective.complete);
    $(`objective-count-${objective.id}`).textContent = `${objective.current} / ${objective.target}`;
    $(`objective-fill-${objective.id}`).style.transform =
      `scaleX(${objective.current / objective.target})`;
  }
  $('score').textContent = String(snapshot.score).padStart(6, '0');
  $('coins').textContent = String(snapshot.coins);
  $('distance').textContent = number.format(Math.floor(snapshot.distance));
  $('speed').textContent = String(Math.round(snapshot.speed * 3.6));
  $('menu-best').textContent = snapshot.best ? number.format(snapshot.best) : 'Set the first one';
  $('hud-best').textContent = number.format(snapshot.best);
  $('shield').hidden = snapshot.shield <= 0;
  $('shield-seconds').textContent = `PULSE · ${snapshot.shield.toFixed(1)}s`;
  $<HTMLButtonElement>('pulse').disabled = !snapshot.pulseReady;
  $('pulse').classList.toggle('ready', snapshot.pulseReady);
  $('pulse').classList.toggle('active', snapshot.shield > 0);
  $('pulse-label').textContent =
    snapshot.shield > 0 ? 'LIGHT RELEASED' : snapshot.pulseReady ? 'RELEASE PULSE' : 'CHARGE LIGHT';
  $('pulse-charge').textContent =
    snapshot.shield > 0
      ? `${snapshot.shield.toFixed(1)}s REMAINING`
      : snapshot.pulseReady
        ? 'READY TO USE'
        : `${snapshot.pulseCharge} / 6 FRAGMENTS`;
  $('pulse-fill').style.transform = `scaleX(${snapshot.pulseCharge / 6})`;
  $('pulse').setAttribute(
    'aria-label',
    snapshot.shield > 0
      ? `Light pulse active: ${snapshot.shield.toFixed(1)} seconds`
      : snapshot.pulseReady
        ? 'Activate light pulse'
        : `Light pulse: ${snapshot.pulseCharge} of 6 fragments`,
  );
  $('count-number').textContent = snapshot.countdown > 0 ? String(snapshot.countdown) : 'GO';
  if (snapshot.mode !== lastMode) {
    if (['over', 'paused', 'menu'].includes(snapshot.mode)) recorder?.stop();
    document.body.dataset.mode = snapshot.mode;
    $('menu').hidden = snapshot.mode !== 'menu';
    $('hud').hidden = !['playing', 'countdown', 'paused'].includes(snapshot.mode);
    $('intro-overlay').hidden = snapshot.mode !== 'intro';
    $('countdown').hidden = snapshot.mode !== 'countdown';
    $('pause-panel').hidden = snapshot.mode !== 'paused';
    $('result-panel').hidden = snapshot.mode !== 'over';
    $('touch-controls').hidden = !(touch && snapshot.mode === 'playing');
    if (snapshot.mode === 'over') {
      leaderboard?.finishRun({
        score: snapshot.score,
        distance: snapshot.distance,
        coins: snapshot.coins,
        runSeconds: snapshot.runSeconds,
        peakFlow: snapshot.peakFlow,
        nearMisses: snapshot.nearMisses,
        cleanMoves: snapshot.cleanMoves,
      });
      if (cinema) setCinema(false);
      $('final-score').textContent = number.format(snapshot.score);
      $('final-distance').textContent = number.format(Math.floor(snapshot.distance)) + ' m';
      $('final-coins').textContent = number.format(snapshot.coins);
      $('final-best').textContent = number.format(snapshot.best);
      $('crash-tip').textContent = snapshot.crashReason;
      $('final-flow').textContent = `${snapshot.peakFlow}×`;
      $('final-close').textContent = String(snapshot.nearMisses);
      $('final-clean').textContent = String(snapshot.cleanMoves);
      $('result-eyebrow').textContent =
        snapshot.score >= snapshot.best ? 'A NEW PERSONAL BEST.' : 'ONE MORE NIGHT?';
      setTimeout(() => $('retry').focus({ preventScroll: true }), 200);
    }
    if (snapshot.mode === 'paused') {
      if (cinema) setCinema(false);
      setTimeout(() => $('resume').focus({ preventScroll: true }), 100);
    }
    if (snapshot.mode === 'menu' && cinema) setCinema(false);
    lastMode = snapshot.mode;
  }
};
const start = (): void => {
  (document.activeElement as HTMLElement)?.blur();
  leaderboard?.beginRun();
  game.start();
};
const openDialog = (id: string): void => {
  pausedForDialog =
    current?.mode === 'playing' || current?.mode === 'countdown' || current?.mode === 'intro';
  if (pausedForDialog) game.pause();
  $<HTMLDialogElement>(id).showModal();
};

$('start').onclick = start;
$('retry').onclick = start;
$('resume').onclick = () => game.pause();
$('pause').onclick = () => game.pause();
for (const id of ['brand', 'pause-home', 'result-home']) $(id).onclick = () => game.home();
$('leaderboard').onclick = $('player-profile').onclick = () => {
  openDialog('leaderboard-dialog');
  leaderboard?.open();
};
$('skip-intro').onclick = () => game.skipIntro();
$('pulse').onclick = () => game.action('pulse');
$('missions').onclick = $('mission-progress').onclick = () => openDialog('missions-dialog');
$('help').onclick = () => openDialog('help-dialog');
$('settings').onclick = () => openDialog('settings-dialog');
for (const dialog of document.querySelectorAll('dialog')) {
  dialog
    .querySelectorAll('button.dialog-close,button.dialog-done')
    .forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    if (pausedForDialog && current?.mode === 'paused') game.pause();
    pausedForDialog = false;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close();
    }
  });
}
$('sound').onclick = $('setting-sound').onclick = () => {
  sound = !sound;
  updateSound();
};
$<HTMLSelectElement>('quality').onchange = () => {
  const quality = $<HTMLSelectElement>('quality').value;
  if (quality === 'high' || quality === 'balanced') game.setQuality(quality);
};
const setWeather = (next: 'rain' | 'clear'): void => {
  weather = next;
  game.setWeather(weather);
  $<HTMLSelectElement>('weather').value = weather;
  $('weather-label').textContent = weather === 'rain' ? 'MIDNIGHT RAIN' : 'CLEAR NIGHT';
};
$<HTMLSelectElement>('weather').onchange = () => {
  const next = $<HTMLSelectElement>('weather').value;
  if (next === 'rain' || next === 'clear') setWeather(next);
};
$('weather-cycle').onclick = () => setWeather(weather === 'rain' ? 'clear' : 'rain');
$('setting-touch').setAttribute('aria-checked', String(touch));
$('setting-touch').onclick = () => {
  touch = !touch;
  $('setting-touch').setAttribute('aria-checked', String(touch));
  $('touch-controls').hidden = !(touch && current?.mode === 'playing');
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    announce('Fullscreen isn’t available in this browser.');
  }
};
document.addEventListener('fullscreenchange', () =>
  $('fullscreen').setAttribute(
    'aria-label',
    document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen',
  ),
);
$('cinematic').onclick = () => setCinema(!cinema);
$('exit-cinema').onclick = () => setCinema(false);
$('record').onclick = toggleRecording;
$('clip-stop').onclick = () => recorder?.stop();
$('clip-dismiss').onclick = () => {
  $('clip-panel').hidden = true;
};
$('share').onclick = async () => {
  if (!current) return;
  const text = `I scored ${number.format(current.score)} on Higgsfield Night Relay — ${Math.floor(current.distance)}m through Samarkand’s light festival. Your turn. ${location.origin}`;
  try {
    await navigator.clipboard.writeText(text);
    $('share').textContent = 'Score copied ✓';
    setTimeout(() => ($('share').textContent = 'Copy your score ↗'), 2200);
  } catch {
    announce('Copy isn’t available in this browser.');
  }
};
$('reload').onclick = () => location.reload();
window.addEventListener('keydown', (event) => {
  if (!game || document.querySelector('dialog[open]')) return;
  if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
  if (event.target instanceof Element && event.target.closest('a[href]')) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' || key === 'p') {
    event.preventDefault();
    if (!event.repeat) game.pause();
    return;
  }
  if (key === 'c') {
    if (!event.repeat && current?.mode === 'playing') {
      event.preventDefault();
      setCinema(!cinema);
    }
    return;
  }
  if (key === 'r') {
    if (!event.repeat && current?.mode === 'playing') {
      event.preventDefault();
      toggleRecording();
    }
    return;
  }
  if ((key === 'enter' || key === ' ') && current?.mode === 'intro') {
    event.preventDefault();
    game.skipIntro();
    return;
  }
  if (key === 'enter' && (current?.mode === 'menu' || current?.mode === 'over')) {
    event.preventDefault();
    start();
    return;
  }
  const actions: Record<string, Action> = {
    arrowleft: 'left',
    a: 'left',
    arrowright: 'right',
    d: 'right',
    e: 'pulse',
  };
  if (actions[key]) {
    if (key === ' ' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (!event.repeat) game.action(actions[key]);
  }
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  const message = event.data as { type?: unknown; action?: unknown } | null;
  if (!message || message.type !== 'neuro-game-action' || typeof message.action !== 'string') return;
  const actions: Record<string, Action> = {
    move_left: 'left',
    move_right: 'right',
  };
  const action = actions[message.action];
  if (action && current?.mode === 'playing') game?.action(action);
});
let touchStart: { x: number; y: number } | null = null;
$('world').addEventListener('pointerdown', (event) => {
  if (event.isPrimary) touchStart = { x: event.clientX, y: event.clientY };
});
window.addEventListener('pointermove', (event) => {
  if (!touchStart) return;
  const x = event.clientX - touchStart.x,
    y = event.clientY - touchStart.y;
  if (Math.max(Math.abs(x), Math.abs(y)) > 28) {
    touchStart = null;
    if (Math.abs(x) > Math.abs(y)) game?.action(x > 0 ? 'right' : 'left');
  }
});
window.addEventListener('pointercancel', () => {
  touchStart = null;
});
window.addEventListener('pointerup', (event) => {
  if (!touchStart) return;
  const x = event.clientX - touchStart.x,
    y = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(x), Math.abs(y)) > 24)
    if (Math.abs(x) > Math.abs(y)) game?.action(x > 0 ? 'right' : 'left');
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]'))
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const action = button.dataset.action;
    if (action === 'left' || action === 'right') game.action(action);
  });
document.addEventListener('visibilitychange', () => {
  if (
    document.hidden &&
    (current?.mode === 'playing' || current?.mode === 'countdown' || current?.mode === 'intro')
  )
    game.pause();
});
window.addEventListener('blur', () => {
  if (window.parent !== window) return;
  if (current?.mode === 'playing' || current?.mode === 'countdown' || current?.mode === 'intro')
    game.pause();
});
window.addEventListener(
  'pagehide',
  () => {
    recorder?.dispose();
    leaderboard?.dispose();
    leaderboardClient.dispose();
    game?.dispose();
  },
  { once: true },
);

requestAnimationFrame(() => {
  try {
    game = new NightlineGame($('world'), update, announce);
    if (window.parent !== window)
      window.parent.postMessage({ type: 'night-relay-ready' }, window.location.origin);
    game.setSound(sound);
    leaderboard = new LeaderboardUI(leaderboardClient);
    recorder = new GameplayRecorder($('world').querySelector('canvas')!, updateRecording);
    $('sound').innerHTML = icon(sound ? 'sound' : 'mute');
    $('sound').setAttribute('aria-label', sound ? 'Mute sound' : 'Enable sound');
    $('sound').setAttribute('aria-pressed', String(sound));
    $('setting-sound').setAttribute('aria-checked', String(sound));
    if (window.matchMedia('(pointer: coarse)').matches) {
      game.setQuality('balanced');
      $<HTMLSelectElement>('quality').value = 'balanced';
    }
    void Promise.race([game.whenReady(), new Promise((resolve) => setTimeout(resolve, 8000))]).then(
      () => {
        $('loading').classList.add('loaded');
      },
    );
  } catch (error) {
    console.error('Night Relay could not start:', error);
    $('loading').classList.add('loaded');
    $('error').hidden = false;
  }
});
