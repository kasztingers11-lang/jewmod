export const clone = value => structuredClone(value);
export const calibrationDefaults = {
  Enabled: false, Strength: 0.026, MinMouseSpeed: 12, FullStrengthSpeed: 600, MaxCorrectionSpeed: 300,
  Curve: {Enabled: false, Early: 0, Middle: 0, Late: 0},
};
export function withWebDefaults(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const next={'Intro':true,'Web connect':false,'Web configs':false,...structuredClone(value)};
  if (next['Aim Assist'] && typeof next['Aim Assist'] === 'object' && !Array.isArray(next['Aim Assist'])
    && !Object.hasOwn(next['Aim Assist'], 'Aim Calibration')) {
    next['Aim Assist']['Aim Calibration'] = clone(calibrationDefaults);
  }
  for(const name of ['Silent Aim','Aim Assist','Triggerbot']){
    const fov=next[name]?.Fov;
    if(!fov||typeof fov!=='object'||Array.isArray(fov))continue;
    if(name==='Triggerbot'){
      if(fov.Enabled===false)fov.Method='Character';
      else if(fov.Method==='2d-Circle')fov.Method='2d-Box';
      delete fov['2d-Circle'];
    }else{
      if(fov.Method==='Character')fov.Method='2d-Box';
      fov['2d-Circle']??={Color:[255,255,255],Size:name==='Silent Aim'?50:100,Visible:false};
    }
    delete fov.Enabled;
  }
  const checks=next.Checks;
  if(checks){
    if(!checks['Dead Check']&&Array.isArray(checks.Dead))checks['Dead Check']=checks.Dead.map((v,i)=>v||checks.Knocked?.[i]===true);
    if(!checks['Ground Shot Check']&&checks.GroundShotCheck)checks['Ground Shot Check']=checks.GroundShotCheck;
    delete checks.Dead;delete checks.Knocked;delete checks.GroundShotCheck;
  }
  if(next['Y-Axis'])delete next['Y-Axis'].Method;
  const guns=next['Gun Specifications'];
  if(guns){
    if(guns.Ranges)guns.Ranges.Enabled??=true;
    for(const [name,gun] of Object.entries(guns))if(!['Enabled','Ranges'].includes(name)&&gun&&typeof gun==='object'){
      for(const profile of Object.values(gun))if(Array.isArray(profile?.BoxSize))profile.BoxSize={Width:profile.BoxSize[0],Height:profile.BoxSize[1]};
    }
  }
  return next;
}
export const choices = (path) => {
  const p = path.join('/');
  if (p === 'Y-Axis/Method') return ['Auto', 'Custom'];
  if (p.endsWith('AntiCurve/Method')) return ['3d-angles', 'Endmath'];
  if (p === 'Triggerbot/Fov/Method') return ['2d-Box', 'Character'];
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
    if (++nodes > 8000) throw Error('Config is too large.');
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
      if (isCurveOffset(path)) {
        if (!Number.isFinite(v) || Math.abs(v) > 0.12) throw Error(`${label}: range is −0.12 to 0.12.`);
        return;
      }
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
export function isCurveOffset(path) {
  return path[0] === 'Aim Assist' && path[1] === 'Aim Calibration' && path[2] === 'Curve'
    && ['Early', 'Middle', 'Late'].includes(path[3]);
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
function pairingTokenLine(token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_.-]{81,399}$/.test(token))throw Error('Invalid private connection export.');
  return 'getgenv().__neoperroPanelToken = '+quoted(token)+';\n';
}
export function exportLua(config,token){
  const ordered=withWebDefaults(config);
  const table=luaTable(ordered).replace('["Web connect"] = '+String(ordered['Web connect'])+';','["Web connect"] = '+String(ordered['Web connect'])+'; -- Connect this client to your panel.').replace('["Web configs"] = '+String(ordered['Web configs'])+';','["Web configs"] = '+String(ordered['Web configs'])+'; -- Let the panel change your settings.');
  if(token!==undefined&&!ordered['Web connect'])throw Error('Invalid private connection export.');
  return 'script_key = "YOUR-SCRIPT-KEY";\n\ngetgenv()["neoperro"] = '+table+'\n\n'+(token===undefined?'':pairingTokenLine(token))+loaderLine+'\n';
}
