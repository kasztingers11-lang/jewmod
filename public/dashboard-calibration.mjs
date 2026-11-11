const n = value => String(Number(value.toFixed(4)));
const field = (name, value) => "['" + name + "'] = " + n(value) + ";";
const clock = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export function calibrationLua({profile, follow}) {
  return [
    ...(follow === 'Camera' ? [field('Smoothness', profile.smoothness)] : []),
    "['Aim Calibration'] = {",
    "    ['Enabled'] = true;",
    ...[field('Strength', profile.strength), field('Min Speed', profile.minSpeed),
      field('Full Speed', profile.fullSpeed), field('Max Speed', profile.maxSpeed)].map(line => '    ' + line),
    "    ['Curve'] = {",
    "        ['Enabled'] = " + profile.curve.enabled + ";",
    ...['Early', 'Middle', 'Late'].map(key => '        ' + field(key, profile.curve[key.toLowerCase()])),
    "    };",
    "};",
  ].join('\n');
}

export function trackingGraph(graph) {
  const max = Math.max(8, ...graph);
  let path = '', next = 'M';
  graph.forEach((value, i) => {
    if (value < 0) { next = 'M'; return; }
    path += next + (10 + i * 580 / 59).toFixed(1) + ' ' + (134 - value / max * 120).toFixed(1) + ' ';
    next = 'L';
  });
  return {path, max};
}

export function mountCalibration({start, cancel, apply}) {
  const $ = id => document.getElementById(id);
  const choices = [...document.querySelectorAll('[data-duration]')];
  let current = null, duration = 180, pending = false, timer, received = 0, previousCode = '', error = '';
  const session = () => current?.session && (!current.request || current.session.id === current.request.id) ? current.session : null;

  function render() {
    const report = session(), request = current?.request;
    const running = report?.status === 'running' && !request?.cancelled;
    const waiting = !!request && !request.cancelled && (!report || report.status === 'running');
    const elapsed = running ? Math.min(report.duration, report.elapsed + Math.max(0, (performance.now() - received) / 1000)) : report?.elapsed ?? 0;
    const limit = report?.duration ?? request?.duration ?? duration;
    choices.forEach(button => {
      button.disabled = pending || waiting;
      button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === (waiting ? limit : duration)));
    });
    $('calibration-mode').textContent = current?.follow ?? 'Offline';
    $('calibration-start-session').disabled = pending || waiting || !current?.enabled || !current.timed;
    $('calibration-start-session').textContent = report?.status === 'complete' ? 'Start another session' : 'Start session';
    $('calibration-cancel-session').hidden = !waiting;
    $('calibration-cancel-session').disabled = pending;
    $('calibration-progress').max = limit;
    $('calibration-progress').value = elapsed;
    $('calibration-time').textContent = clock(elapsed) + ' / ' + clock(limit);
    $('calibration-samples').textContent = String(report?.samples ?? 0);
    $('calibration-active').textContent = (report?.activeSeconds ?? 0) + ' s';
    let message = 'Choose a duration and start when you are ready.';
    if (!current) message = 'Connect a client with Aim Calibration enabled.';
    else if (!current.enabled) message = 'Enable Aim Calibration in your running Lua table.';
    else if (!current.timed) message = 'Load RC17 or newer to start a timed session.';
    else if (request?.cancelled || report?.status === 'cancelled') message = 'Session cancelled. You can start again.';
    else if (report?.status === 'disabled') message = 'Session stopped because Aim Calibration was turned off.';
    else if (report?.status === 'mode-changed') message = 'Follow changed during the session. Start again with your chosen mode.';
    else if (running) message = elapsed >= limit ? 'Waiting for the client’s final results.' : 'Recording in game. Use Aim Assist normally.';
    else if (waiting) message = 'Waiting for the client to start. Keep your script running.';
    else if (report?.status === 'complete') message = report.profile
      ? 'Session complete. Review your graph and settings below.'
      : 'Session complete with too little aiming data. Try again and use Aim Assist more often.';
    $('calibration-status').textContent = error || message;
    const ready = report?.status === 'complete' && !!report.profile;
    $('calibration-results').hidden = !ready;
    if (!ready) return;
    const graph = trackingGraph(report.graph);
    $('tracking-path').setAttribute('d', graph.path);
    $('tracking-scale').textContent = '0–' + graph.max + ' px at 1080p';
    $('calibration-result-note').textContent = report.follow === 'Camera'
      ? 'Smoothness is suggested for Camera follow. Mouse speed settings are included for switching to Mouse later. Your Curve settings were kept.'
      : report.curveSamples >= 6
        ? 'The curve uses ' + report.curveSamples + ' measured mouse gestures. Gaps show periods without usable movement.'
        : 'Your Curve settings were kept because fewer than six usable mouse gestures were measured. Gaps show periods without usable movement.';
    const code = calibrationLua(report);
    if (code !== previousCode) {
      $('calibration-code').value = code;
      $('calibration-feedback').textContent = '';
      previousCode = code;
    }
    $('calibration-apply').disabled = pending;
  }

  for (const button of choices) button.addEventListener('click', () => {
    duration = Number(button.dataset.duration);
    error = ''; render();
  });
  async function action(run) {
    pending = true; error = ''; render();
    try { await run(); }
    catch (problem) { error = problem.message; }
    finally { pending = false; render(); }
  }
  $('calibration-start-session').addEventListener('click', () => action(async () => {
    const {request} = await start(duration);
    if (current) current = {...current, request};
  }));
  $('calibration-cancel-session').addEventListener('click', () => action(async () => {
    const id = current?.request?.id ?? session()?.id;
    if (!id) return;
    await cancel(id);
    current = {...current, request: {...current.request, cancelled: true}};
  }));
  $('calibration-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('calibration-code').value);
      $('calibration-feedback').textContent = 'Settings copied.';
    } catch {
      $('calibration-code').focus(); $('calibration-code').select();
      $('calibration-feedback').textContent = 'Press Ctrl+C or use your browser’s Copy command.';
    }
  });
  $('calibration-apply').addEventListener('click', () => action(async () => {
    const report = session();
    if (report?.status !== 'complete' || !report.profile) return;
    const deliveryEnabled = await apply(report);
    $('calibration-feedback').textContent = deliveryEnabled
      ? 'Saved to your web config. The connection panel shows when your client applies it.'
      : 'Saved to your web config. Set Web configs to true in your Lua table to apply it in game.';
  }));
  return {
    tracking(value) { current = value; received = performance.now(); render(); },
    show(open) { clearInterval(timer); if (open) timer = setInterval(render, 1000); },
  };
}
