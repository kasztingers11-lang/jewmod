import {buildCalibrationProfile, calibrationRounds, measureCalibrationDrag} from './calibration-profile.mjs';

const rounds = [
  [.18, .50, .76, .50], [.77, .68, .24, .30], [.22, .26, .70, .74],
  [.58, .80, .55, .22], [.24, .45, .59, .24], [.68, .46, .33, .47],
];

const luaNumber = value => String(Number(value.toFixed(4)));
const luaField = (name, value) => "['"+name+"'] = "+luaNumber(value)+";";

function bindCopy(button, input, feedback) {
  button.addEventListener('click', async ()=>{
    if(!input.value)return;
    try{
      await navigator.clipboard.writeText(input.value);
      feedback.textContent='Lua settings copied.';
    }catch{
      input.focus();
      input.select();
      feedback.textContent='Press Ctrl+C or use your browser’s Copy command.';
    }
  });
}

export function mountCalibration() {
  const $ = id => document.getElementById(id);
  const disabled = $('calibration-disabled'), card = $('calibration-panel'), board = $('calibration-board');
  const guide = $('calibration-guide'), path = $('calibration-path');
  const start = $('calibration-start'), end = $('calibration-end'), status = $('calibration-status');
  const results = $('calibration-results'), drillCode = $('calibration-code'), drillFeedback = $('calibration-copy-status');
  const progress = $('calibration-progress'), restart = $('calibration-reset');
  const liveMode = $('calibration-live-mode'), liveStatus = $('calibration-live-status');
  const liveResult = $('calibration-live-result'), liveCode = $('calibration-live-code');
  const liveFeedback = $('calibration-live-copy-status'), pasteLabel = $('calibration-live-paste');
  const trackingDetails = $('tracking-details'), graphLine = $('tracking-path');
  let drags = [], drag = null, geometry = null, profile = null, available = false;

  bindCopy($('calibration-live-copy'),liveCode,liveFeedback);
  bindCopy($('calibration-copy'),drillCode,drillFeedback);

  function tracking(current) {
    const mode = current ? current.follow + (current.enabled ? ' · On' : ' · Off') : 'Offline';
    if(liveMode.textContent !== mode)liveMode.textContent = mode;
    let message = 'Connect your client to collect in-game results.';
    if(current){
      if(!current.enabled)message = 'Aim Calibration is off in the running table.';
      else if(current.samples===undefined)message = 'Update your client to RC13 to get in-game results with Web configs off.';
      else if(!current.profile)message = 'Move your mouse while tracking a target with Aim Assist on ('+current.samples+'/24 samples).';
      else message = 'Ready to copy.';
    }
    if(liveStatus.textContent !== message)liveStatus.textContent = message;
    liveResult.hidden = !current?.profile;
    trackingDetails.hidden = !current?.graph;
    if(current?.graph){
      const max = Math.max(8, Math.ceil(Math.max(...current.graph)/8)*8);
      const points = current.graph.map((error,index)=>[8+index*344/(current.graph.length-1),88-error/max*78].join(',')).join(' ');
      if(graphLine.getAttribute('points')!==points)graphLine.setAttribute('points',points);
      $('tracking-scale').textContent = '0 to '+max+' px at 1080p · oldest to newest';
      $('tracking-flicks').textContent = current.flickShare+'% fast movement';
    }
    const suggestion=current?.profile, camera=current?.follow==='Camera';
    let snippet='';
    if(suggestion){
      const hint=camera ? 'Replace Smoothness under Aim Assist.' : 'Replace these four lines inside Aim Calibration. Keep your Curve settings.';
      if(pasteLabel.textContent!==hint)pasteLabel.textContent=hint;
      snippet=(camera ? [luaField('Smoothness',suggestion.smoothness)] : [
        luaField('Strength',suggestion.strength), luaField('Min Speed',suggestion.minSpeed),
        luaField('Full Speed',suggestion.fullSpeed), luaField('Max Speed',suggestion.maxSpeed),
      ]).join('\n');
    }
    if(liveCode.value!==snippet){
      liveCode.value=snippet;
      liveCode.rows=camera ? 1 : 4;
      liveFeedback.textContent='';
    }
  }

  function drawRound() {
    const rect = board.getBoundingClientRect();
    const round = rounds[drags.length];
    if (!round || rect.width < 100 || rect.height < 100) return;
    const [a, b, c, d] = round;
    const from = {x: a * rect.width, y: b * rect.height};
    const to = {x: c * rect.width, y: d * rect.height};
    const radius = Math.min(23, rect.width * 0.055, rect.height * 0.1);
    geometry = {from, to, radius, width: rect.width, height: rect.height};
    board.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    for (const [circle, point] of [[start, from], [end, to]]) {
      circle.setAttribute('cx', point.x);
      circle.setAttribute('cy', point.y);
      circle.setAttribute('r', radius);
    }
    for (const [name, value] of Object.entries({x1: from.x, y1: from.y, x2: to.x, y2: to.y})) {
      guide.setAttribute(name, value);
    }
    path.removeAttribute('points');
  }

  function renderProfile() {
    results.hidden = !profile;
    if (!profile) return;
    const proposed = profile.settings;
    $('calibration-stats').textContent = profile.usableDrags + ' usable rounds / ' + Math.round(profile.overshootFrequency * 100) + '% overshoot';
    const speedCeiling = Math.max(1, profile.travelSpeed, profile.approachSpeed);
    for (const [name, speed] of [['travel', profile.travelSpeed], ['approach', profile.approachSpeed]]) {
      const meter = $('calibration-' + name);
      meter.setAttribute('aria-valuemax',Math.round(speedCeiling));
      meter.setAttribute('aria-valuenow',Math.round(speed));
      meter.querySelector('.meter-fill').setAttribute('width',100*speed/speedCeiling);
      $('calibration-' + name + '-value').textContent = Math.round(speed) + ' px/s';
    }
    const curve = [0, proposed.Curve.Early, proposed.Curve.Middle, proposed.Curve.Late, 0];
    const smooth = curve.slice(1).map((offset, index) => {
      const x = 12 + index * 74, y0 = 48 - curve[index] * 260, y1 = 48 - offset * 260;
      return `C${x+25} ${y0} ${x+49} ${y1} ${x+74} ${y1}`;
    });
    $('calibration-profile-path').setAttribute('d', 'M12 48 ' + smooth.join(' '));
    drillCode.value = [
      "['Aim Calibration'] = {",
      "    ['Enabled'] = true;",
      ...[luaField('Strength',proposed.Strength),luaField('Min Speed',proposed.MinMouseSpeed),
        luaField('Full Speed',proposed.FullStrengthSpeed),luaField('Max Speed',proposed.MaxCorrectionSpeed)].map(line=>'    '+line),
      "    ['Curve'] = {",
      "        ['Enabled'] = true;",
      ...['Early','Middle','Late'].map(key=>'        '+luaField(key,proposed.Curve[key])),
      "    };",
      "};",
    ].join('\n');
  }

  function reset() {
    drags = [];
    drag = null;
    profile = null;
    drillCode.value = '';
    drillFeedback.textContent = '';
    progress.textContent = `0 / ${calibrationRounds}`;
    $('calibration-details').open = false;
    board.removeAttribute('hidden');
    status.textContent = 'Start on the outlined circle.';
    renderProfile();
    drawRound();
  }

  function sample(event, rect) {
    return {x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp};
  }

  board.addEventListener('pointerdown', event => {
    if (!available || !geometry || drag || drags.length === rounds.length || event.button !== 0) return;
    const rect = board.getBoundingClientRect();
    const first = sample(event, rect);
    const {from, radius} = geometry;
    if (Math.hypot(first.x - from.x, first.y - from.y) > radius) return;
    drag = {pointer: event.pointerId, rect, samples: [first], target: geometry.to, radius};
    path.setAttribute('points', `${first.x},${first.y}`);
    board.setPointerCapture(event.pointerId);
    status.textContent = 'Release inside the red circle.';
  });

  board.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId || drag.samples.length >= 4095) return;
    drag.samples.push(sample(event, drag.rect));
    path.setAttribute('points', drag.samples.map(point => `${point.x},${point.y}`).join(' '));
  });

  board.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    const completed = drag;
    drag = null;
    const last = sample(event, completed.rect);
    if (Math.hypot(last.x - completed.target.x, last.y - completed.target.y) > completed.radius) {
      status.textContent = 'Release inside the red circle. Try the same round again.';
      drawRound();
      return;
    }
    completed.samples.push(last);
    const measured = measureCalibrationDrag(completed, window.innerHeight);
    if (!measured) {
      status.textContent = 'Drag continuously through the circle at your usual speed. Try this round again.';
      drawRound();
      return;
    }
    drags.push(measured);
    progress.textContent = `${drags.length} / ${calibrationRounds}`;
    if (drags.length === calibrationRounds) {
      profile = buildCalibrationProfile(drags);
      board.setAttribute('hidden', '');
      status.textContent = 'Ready to copy.';
      renderProfile();
    } else {
      status.textContent = 'Good. Start on the next outlined circle.';
      drawRound();
    }
  });

  function cancelDrag() {
    if (!drag) return;
    drag = null;
    status.textContent = 'Drag interrupted. Try the same round again.';
    drawRound();
  }
  board.addEventListener('pointercancel', cancelDrag);
  board.addEventListener('lostpointercapture', cancelDrag);
  new ResizeObserver(() => {
    if (card.hidden || board.hasAttribute('hidden')) return;
    const rect = board.getBoundingClientRect();
    if (rect.width !== geometry?.width || rect.height !== geometry?.height) {
      if (drag) cancelDrag();
      else drawRound();
    }
  }).observe(board);
  restart.addEventListener('click', reset);
  return {
    tracking,
    show(open) {
      if (!open) cancelDrag();
      else if (available) requestAnimationFrame(drawRound);
    },
    access(enabled) {
      if (!enabled && available) reset();
      available = enabled;
      disabled.hidden = enabled;
      card.hidden = !enabled;
    },
  };
}
