export const gameProfiles = ['da-strike', 'da-uphill', 'da-uphill-2', 'da-downhill', 'da-hood'];
export const macroDefaults = {Keybind:['X','MouseButton2','Keyboard']};
export const daHoodWeapons=['Glock','Silencer','Shotgun','Rifle','SMG','AR','RPG','GrenadeLauncher','P90','SilencerAR','Revolver','AK47','TacticalShotgun','DrumGun','Flamethrower','AUG','LMG','Double-Barrel SG','Drum-Shotgun','Flintlock','Deagle'];
export const spreadWeaponDefaults={Enabled:false,Value:1};
export const gunModificationDefaults = {'Spread Modifier':Object.fromEntries(['Double-Barrel SG','TacticalShotgun','Shotgun'].map(name=>[name,{...spreadWeaponDefaults}]))};
export const weaponKey=name=>name.toLowerCase().replace(/[\[\]\s_-]/g,'');

export function connectedGameProfile(runtime, now=Date.now()) {
  return runtime?.online===true && Number.isFinite(runtime.seenAt) && now-runtime.seenAt<35000
    && now>=runtime.seenAt && gameProfiles.includes(runtime.gameProfile) ? runtime.gameProfile : null;
}

export function macroSetting(profile) {
  return profile==='da-hood' ? 'Macro' : gameProfiles.includes(profile) ? 'Macro Abuse' : null;
}

export function configForGame(config, profile) {
  const result=structuredClone(config), active=macroSetting(profile);
  if(active && result.Misc)delete result.Misc[active==='Macro'?'Macro Abuse':'Macro'];
  if(active==='Macro Abuse')delete result['Gun Modifications'];
  return result;
}

export function functionsForGame(functions, profile) {
  const result=structuredClone(functions), active=macroSetting(profile);
  if(active)for(const ranges of Object.values(result))for(const [range,assignments] of Object.entries(ranges)){
    ranges[range]=assignments.filter(({path})=>(path[0]!=='Misc'||!['Macro','Macro Abuse'].includes(path[1])||path[1]===active)&&(active==='Macro'||path[0]!=='Gun Modifications'));
  }
  return result;
}
