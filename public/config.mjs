export const clone = value => structuredClone(value);
export const choices = (path) => {
  const p = path.join('/');
  if (p === 'Y-Axis/Method') return ['Auto', 'Custom'];
  if (p.endsWith('AntiCurve/Method')) return ['3d-angles', 'Endmath'];
  if (p.endsWith('Fov/Method')) return ['2d-Box', '2d-Circle'];
  if (p.endsWith('/Selection')) return ['Part', 'Point'];
  if (p.endsWith('/Axis')) return ['Center', 'All'];
  if (p.endsWith('/Follow')) return ['Camera', 'Mouse'];
  if (p.endsWith('/Unlock Method')) return ['Normal', 'Repeat'];
  if (p.endsWith('/DelayMethod')) return ['Normal', 'Random'];
  if (p === 'Whitelist/Method') return ['Friend', 'Target'];
  if (/^(Silent Aim|Aim Assist)\/Method$/.test(p)) return ['Auto', 'Target'];
  if (p.endsWith('/BasePart')) return ['Head','UpperTorso','HumanoidRootPart','LowerTorso','Torso','LeftUpperArm','LeftLowerArm','LeftHand','RightUpperArm','RightLowerArm','RightHand','LeftUpperLeg','LeftLowerLeg','LeftFoot','RightUpperLeg','RightLowerLeg','RightFoot','Left Arm','Right Arm','Left Leg','Right Leg'];
  if (p.endsWith('/Keybind/2')) return ['Keyboard', 'Mouse'];
  if (p.endsWith('/Name/1')) return ['DisplayName', 'Name', 'UserId'];
  return null;
};
export function validateConfig(value, defaults) {
  let nodes = 0;
  function walk(v, d, path) {
    if (++nodes > 8000) throw Error('Configuration is too large.');
    const label = path.join(' / ');
    if (path.join('/') === 'Whitelist/Players') {
      if (!Array.isArray(v) || v.some(x => !(Number.isSafeInteger(x) && x > 0) && !(typeof x === 'string' && /^[a-zA-Z0-9_]{1,64}$/.test(x)))) throw Error('Whitelist accepts user IDs or usernames.');
      return;
    }
    if (Array.isArray(d)) {
      if (!Array.isArray(v) || v.length !== d.length) throw Error(`${label}: invalid list.`);
      d.forEach((x, i) => walk(v[i], x, [...path, String(i)])); return;
    }
    if (d && typeof d === 'object') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(`${label}: expected settings.`);
      if (Object.keys(v).length !== Object.keys(d).length || Object.keys(v).some(k => !Object.hasOwn(d, k))) throw Error(`${label}: unknown or missing setting.`);
      for (const k of Object.keys(d)) walk(v[k], d[k], [...path, k]); return;
    }
    if (typeof v !== typeof d) throw Error(`${label}: invalid type.`);
    if (typeof d === 'number') {
      if (!Number.isFinite(v) || v < 0 || v > 1e12) throw Error(`${label}: use a finite non-negative number.`);
      if (/\/Color\//.test('/'+path.join('/')+'/') && (v > 255 || !Number.isInteger(v))) throw Error(`${label}: color values must be integers from 0 to 255.`);
      if (path.at(-1) === 'Sharpness' || path.at(-1) === 'Smoothness' || (path.at(-1) === 'Value' && path.includes('Prediction'))) {
        if (v > 1) throw Error(`${label}: maximum is 1.`);
      }
    }
    if (typeof d === 'string') {
      if (v.length > 64 || /[\x00-\x1f]/.test(v)) throw Error(`${label}: invalid text.`);
      const options = choices(path); if (options && !options.includes(v)) throw Error(`${label}: unsupported option.`);
    }
  }
  walk(value, defaults, []); return value;
}
function quoted(value) {
  return '"' + value.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('\n','\\n').replaceAll('\r','\\r') + '"';
}
export function luaTable(value, depth = 0) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return quoted(value);
  const indent = '    '.repeat(depth), child = indent+'    ';
  const entries = Array.isArray(value) ? value.map(v => child+luaTable(v,depth+1)+';') : Object.entries(value).map(([k,v]) => child+'['+quoted(k)+'] = '+luaTable(v,depth+1)+';');
  return entries.length ? '{\n'+entries.join('\n')+'\n'+indent+'}' : '{}';
}
export const loaderLine = 'loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()';
export const exportLua = config => 'script_key = "YOUR-FLOWAUTH-KEY";\n\ngetgenv()["neoperro"] = '+luaTable(config)+'\n\n'+loaderLine+'\n';
