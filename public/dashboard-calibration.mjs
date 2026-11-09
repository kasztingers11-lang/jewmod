import {buildCalibrationProfile} from './calibration-profile.mjs';

const rounds = [
  [.18, .50, .76, .50], [.77, .68, .24, .30], [.22, .26, .70, .74],
  [.58, .80, .55, .22], [.80, .26, .43, .60], [.27, .70, .69, .45],
  [.68, .46, .33, .47], [.35, .23, .39, .78], [.24, .45, .59, .24],
  [.72, .75, .25, .62], [.32, .75, .77, .29], [.78, .50, .19, .50],
];

export function mountCalibration({getSettings, apply}) {
  const $ = id => document.getElementById(id);
  const disabled = $('calibration-disabled'), card = $('calibration-panel'), board = $('calibration-board');
  const guide = $('calibration-guide'), path = $('calibration-path');
  const start = $('calibration-start'), end = $('calibration-end'), status = $('calibration-status');
  const results = $('calibration-results'), applyButton = $('calibration-apply');
  const progress = $('calibration-progress'), restart = $('calibration-reset');
  let drags = [], drag = null, geometry = null, profile = null, available = false, saving = false;

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
    applyButton.disabled = !available || saving || !profile;
    if (!profile) return;
    const current = getSettings(), proposed = profile.settings;
    $('calibration-stats').textContent = profile.usableDrags + ' usable rounds / ' + Math.round(profile.overshootFrequency * 100) + '% overshoot';
    const speedCeiling = Math.max(1, profile.travelSpeed, profile.approachSpeed);
    for (const [name, speed] of [['travel', profile.travelSpeed], ['approach', profile.approachSpeed]]) {
      const meter = $('calibration-' + name);
      meter.max = speedCeiling;
      meter.value = speed;
      $('calibration-' + name + '-value').textContent = Math.round(speed) + ' px/s';
    }
    const curve = [0, proposed.Curve.Early, proposed.Curve.Middle, proposed.Curve.Late, 0];
    const smooth = curve.slice(1).map((offset, index) => {
      const x = 12 + index * 74, y0 = 48 - curve[index] * 260, y1 = 48 - offset * 260;
      return `C${x+25} ${y0} ${x+49} ${y1} ${x+74} ${y1}`;
    });
    $('calibration-profile-path').setAttribute('d', 'M12 48 ' + smooth.join(' '));
    const fields = [
      ['Strength', current.Strength, proposed.Strength],
      ['Minimum mouse speed', current.MinMouseSpeed, proposed.MinMouseSpeed],
      ['Full strength speed', current.FullStrengthSpeed, proposed.FullStrengthSpeed],
      ['Maximum correction speed', current.MaxCorrectionSpeed, proposed.MaxCorrectionSpeed],
      ['Curve at 25%', current.Curve.Early, proposed.Curve.Early],
      ['Curve at 50%', current.Curve.Middle, proposed.Curve.Middle],
      ['Curve at 75%', current.Curve.Late, proposed.Curve.Late],
    ];
    $('calibration-settings').replaceChildren(...fields.map(field => {
      const row = document.createElement('tr');
      for (const value of field) {
        const cell = document.createElement('td');
        cell.textContent = typeof value === 'number' ? Number(value.toFixed(4)).toString() : value;
        row.append(cell);
      }
      return row;
    }));
  }

  function reset() {
    drags = [];
    drag = null;
    profile = null;
    progress.textContent = '0 / 12';
    board.removeAttribute('hidden');
    status.textContent = 'Start on the outlined circle.';
    renderProfile();
    drawRound();
  }

  function sample(event, rect) {
    return {x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp};
  }

  board.addEventListener('pointerdown', event => {
    if (!available || saving || !geometry || drag || drags.length === rounds.length || event.button !== 0) return;
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
    drags.push({samples: completed.samples, target: completed.target, radius: completed.radius});
    progress.textContent = `${drags.length} / ${rounds.length}`;
    if (drags.length === rounds.length) {
      profile = buildCalibrationProfile(drags, window.innerHeight);
      board.setAttribute('hidden', '');
      status.textContent = profile ? 'Drill complete. Review your profile below.' : 'Fewer than six usable paths. Restart and drag at your usual speed.';
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
  applyButton.addEventListener('click', async () => {
    if (!available || saving || !profile) return;
    if (await apply(profile.settings)) {
      status.textContent = 'Calibration saved to your profile.';
      renderProfile();
    } else {
      status.textContent = 'The profile could not be saved. Check the workspace notice and try again.';
    }
  });

  return {
    show(open) {
      if (!open) cancelDrag();
      else if (available) requestAnimationFrame(drawRound);
    },
    access(enabled, busy) {
      if (!enabled && available) reset();
      available = enabled;
      saving = busy;
      disabled.hidden = enabled;
      card.hidden = !enabled;
      applyButton.disabled = !available || saving || !profile;
    },
  };
}
