const statuses = ['running', 'complete', 'cancelled', 'disabled', 'mode-changed'];
const finite = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => allowed.includes(key));

export function validateCalibrationSession(value, fail) {
  if (value === undefined) return undefined;
  if (!keys(value, ['id', 'duration', 'follow', 'status', 'elapsed', 'samples', 'activeSeconds', 'curveSamples', 'graph', 'profile'])
    || !/^[a-f0-9]{32}$/.test(value.id) || ![180, 360, 600].includes(value.duration)
    || !['Camera', 'Mouse'].includes(value.follow) || !statuses.includes(value.status)
    || !Number.isSafeInteger(value.elapsed) || !finite(value.elapsed, 0, value.duration)
    || !Number.isSafeInteger(value.samples) || !finite(value.samples, 0, 20000)
    || !finite(value.activeSeconds, 0, value.elapsed + 1)
    || !Number.isSafeInteger(value.curveSamples) || !finite(value.curveSamples, 0, value.samples)
    || !Array.isArray(value.graph) || value.graph.length !== 60
    || value.graph.some(point => !Number.isSafeInteger(point) || !finite(point, -1, 480))) {
    fail(400, 'Invalid timed calibration report.');
  }
  if (value.profile !== undefined) {
    const profile = value.profile;
    if (value.samples < 24 || !keys(profile, ['smoothness', 'strength', 'minSpeed', 'fullSpeed', 'maxSpeed', 'curve'])
      || !finite(profile.smoothness, 0, 1) || !finite(profile.strength, 0.012, 0.055)
      || !Number.isSafeInteger(profile.minSpeed) || !finite(profile.minSpeed, 2, 150)
      || !Number.isSafeInteger(profile.fullSpeed) || !finite(profile.fullSpeed, profile.minSpeed + 1, 6000)
      || !Number.isSafeInteger(profile.maxSpeed) || !finite(profile.maxSpeed, 180, 1800)
      || !keys(profile.curve, ['enabled', 'early', 'middle', 'late'])
      || typeof profile.curve.enabled !== 'boolean'
      || ['early', 'middle', 'late'].some(key => !finite(profile.curve[key], -0.12, 0.12))) {
      fail(400, 'Invalid timed calibration profile.');
    }
  }
  return structuredClone(value);
}
