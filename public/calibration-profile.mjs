const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function measure({samples, target, radius}, pixelsPerReferencePixel) {
  if (!Array.isArray(samples) || samples.length < 4 || samples.length > 4096) return null;
  if (!target || ![target.x, target.y, radius].every(Number.isFinite) || radius <= 0) return null;
  if (!samples.every(sample => sample && [sample.x, sample.y, sample.t].every(Number.isFinite))) return null;
  const first = samples[0], last = samples.at(-1);
  if (Math.hypot(last.x - target.x, last.y - target.y) > radius || last.t <= first.t) return null;
  const dx = target.x - first.x, dy = target.y - first.y;
  const reference = Math.hypot(dx, dy);
  if (!Number.isFinite(reference) || reference <= radius) return null;
  const lengthSquared = reference * reference;
  const checkpoints = [0.25, 0.5, 0.75];
  const crossings = [];
  let travel = 0, approachTravel = 0, overshot = false;
  let previous = {progress: 0, sideways: 0, t: first.t};
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i], prior = samples[i - 1];
    if (sample.t < prior.t) return null;
    const x = sample.x - first.x, y = sample.y - first.y;
    const progress = (x * dx + y * dy) / lengthSquared;
    const sideways = (-x * dy + y * dx) / lengthSquared;
    const distance = Math.hypot(sample.x - prior.x, sample.y - prior.y);
    travel += distance;
    overshot ||= (progress - 1) * reference > 1;
    if (crossings.length === 3) approachTravel += distance;
    while (crossings.length < 3 && progress >= checkpoints[crossings.length] && progress > previous.progress) {
      const fraction = (checkpoints[crossings.length] - previous.progress) / (progress - previous.progress);
      crossings.push({
        sideways: previous.sideways + fraction * (sideways - previous.sideways),
        t: previous.t + fraction * (sample.t - previous.t),
      });
      if (crossings.length === 3) approachTravel += (1 - fraction) * distance;
    }
    previous = {progress, sideways, t: sample.t};
  }
  if (crossings.length < 3 || crossings[2].t >= last.t) return null;
  const travelSpeed = travel * 1000 / ((last.t - first.t) * pixelsPerReferencePixel);
  const approachSpeed = approachTravel * 1000 / ((last.t - crossings[2].t) * pixelsPerReferencePixel);
  if (!Number.isFinite(travelSpeed) || !Number.isFinite(approachSpeed) || travelSpeed <= 0 || approachSpeed <= 0) return null;
  return {travelSpeed, approachSpeed, overshot, curve: crossings.map(point => point.sideways)};
}

export function buildCalibrationProfile(drags, viewportHeight) {
  if (!Array.isArray(drags) || drags.length > 12 || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return null;
  const scale = clamp(viewportHeight / 1080, 0.5, 4);
  const results = drags.filter(drag => drag && typeof drag === 'object').map(drag => measure(drag, scale)).filter(Boolean);
  if (results.length < 6) return null;
  const travel = median(results.map(result => result.travelSpeed));
  const approach = median(results.map(result => result.approachSpeed));
  const overshoot = results.filter(result => result.overshot).length / results.length;
  const curve = [0, 1, 2].map(i => clamp(median(results.map(result => result.curve[i])), -0.12, 0.12));
  const minimum = Math.round(clamp(approach * 0.15, 0, 2000));
  return {
    usableDrags: results.length,
    travelSpeed: travel,
    approachSpeed: approach,
    overshootFrequency: overshoot,
    settings: {
      Enabled: true,
      Strength: clamp(0.0068 * approach / travel * (1 - overshoot * 0.25), 0.002, 0.02),
      'Min Speed': minimum,
      'Full Speed': Math.round(clamp(travel, minimum + 1, 20000)),
      'Max Speed': Math.round(clamp(approach * 0.5, 1, 20000)),
      Curve: {Enabled: true, Early: curve[0], Middle: curve[1], Late: curve[2]},
    },
  };
}
