import {clone, exportLua, luaTable, validateConfig} from './config.mjs';

export const ranges = ['Close', 'Medium', 'Far'];
const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const quote = value => "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
const pathLua = path => 'neoperro' + path.map(key => /^\d+$/.test(key) ? '[' + (Number(key) + 1) + ']' : '[' + quote(key) + ']').join('');

export function luaValue(value) {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return '{' + value.map(luaValue).join(', ') + '}';
  return '{' + Object.entries(value).map(([key, item]) => '[' + quote(key) + '] = ' + luaValue(item)).join('; ') + '}';
}

export function makeFunction(assignments) {
  return ['function()', ...assignments.map(({path, value}) => '    ' + pathLua(path) + ' = ' + luaValue(value) + ';'), 'end'].join('\n');
}

export function settingPaths(config) {
  const paths = [];
  function visit(value, path) {
    if (path.join('/') === 'Whitelist/Players') {
      paths.push({path, value});
    } else if (Array.isArray(value) && value.length === 3 && path.includes('Color') && value.every(item => typeof item === 'number')) {
      paths.push({path, value});
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    } else paths.push({path, value});
  }
  for (const [name, value] of Object.entries(config)) {
    if (!['Gun Specifications', 'Web connect', 'Web configs'].includes(name)) visit(value, [name]);
  }
  return paths;
}

function checkedAssignment(assignment, config, defaults) {
  if (!assignment || Object.keys(assignment).some(key => !['path', 'value'].includes(key))
    || !Array.isArray(assignment.path) || assignment.path.length < 1 || assignment.path.length > 9
    || assignment.path.some(key => typeof key !== 'string' || blocked.has(key))
    || ['Gun Specifications', 'Web connect', 'Web configs'].includes(assignment.path[0])) {
    throw Error('Choose an existing feature setting.');
  }
  const candidate = clone(config);
  let parent = candidate;
  for (const key of assignment.path.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw Error('This setting does not exist.');
    parent = parent[key];
  }
  const key = assignment.path.at(-1);
  if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw Error('This setting does not exist.');
  parent[key] = clone(assignment.value);
  validateConfig(candidate, defaults);
  return {path:[...assignment.path], value:clone(assignment.value)};
}

export function validateGunFunctions(input, config, defaults) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid gun functions.');
  let total = 0;
  const result = {};
  for (const [gun, functions] of Object.entries(input)) {
    if (blocked.has(gun) || ['Enabled', 'Ranges'].includes(gun) || !Object.hasOwn(config['Gun Specifications'], gun)
      || !functions || typeof functions !== 'object' || Array.isArray(functions)) throw Error('Choose a configured gun.');
    result[gun] = {};
    for (const [range, assignments] of Object.entries(functions)) {
      if (!ranges.includes(range) || !Array.isArray(assignments) || assignments.length > 20) throw Error('Use at most 20 settings per function.');
      total += assignments.length;
      if (total > 120) throw Error('Use at most 120 settings across your gun functions.');
      result[gun][range] = assignments.map(assignment => checkedAssignment(assignment, config, defaults));
    }
  }
  return result;
}

export function initialGunFunctions(config) {
  const result = {};
  for (const [gun, blocks] of Object.entries(config['Gun Specifications'])) {
    if (['Enabled', 'Ranges'].includes(gun)) continue;
    result[gun] = {};
    for (const range of ranges) {
      const size = blocks[range]?.BoxSize;
      result[gun][range] = size ? [{path:['2d-Box', 'Silent Aim', 'Size'], value:clone(size)}] : [];
    }
  }
  return result;
}

function tokens(source) {
  const pattern = /\s+|--[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|[()[\]{}=;,]/gy;
  const list = [];
  let cursor = 0;
  while (cursor < source.length) {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match) throw Error('Use setting assignments from the function maker.');
    cursor = pattern.lastIndex;
    if (!/^\s|^--/.test(match[0])) list.push(match[0]);
  }
  return list;
}

export function parseFunction(source, config, defaults) {
  if (typeof source !== 'string' || source.length > 8192) throw Error('Keep each function below 8 KB.');
  if (!source.trim()) return [];
  const list = tokens(source);
  let cursor = 0;
  const take = expected => {
    const value = list[cursor++];
    if (expected && value !== expected) throw Error('Expected ' + expected + ' in the function.');
    return value;
  };
  const string = token => {
    if (!/^['"]/.test(token ?? '')) throw Error('Use a quoted setting name.');
    return token.slice(1, -1).replace(/\\(.)/g, (_, escaped) => {
      const values = {n:'\n', r:'\r', t:'\t', '\\':'\\', "'":"'", '"':'"'};
      if (!Object.hasOwn(values, escaped)) throw Error('Unsupported string escape.');
      return values[escaped];
    });
  };
  function value(depth = 0) {
    if (depth > 8) throw Error('This value has too many nested tables.');
    const token = take();
    if (/^['"]/.test(token ?? '')) return string(token);
    if (token === 'true' || token === 'false') return token === 'true';
    if (/^-?\d/.test(token ?? '')) return Number(token);
    if (token !== '{') throw Error('Choose a number, text, switch or table value.');
    const array = [], object = Object.create(null);
    let keyed = false, positional = false;
    while (list[cursor] !== '}') {
      if (list[cursor] === '[') {
        if (positional) throw Error('Use either a list or named settings.');
        take('['); const key = string(take()); take(']'); take('=');
        if (blocked.has(key)) throw Error('Unsupported setting name.');
        object[key] = value(depth + 1); keyed = true;
      } else {
        if (keyed) throw Error('Use either a list or named settings.');
        array.push(value(depth + 1)); positional = true;
      }
      if ([',', ';'].includes(list[cursor])) take();
      else if (list[cursor] !== '}') throw Error('Separate table values with a comma or semicolon.');
    }
    take('}');
    return keyed ? object : array;
  }
  take('function'); take('('); take(')');
  const assignments = [];
  while (list[cursor] !== 'end') {
    if (assignments.length >= 20) throw Error('Use at most 20 settings per function.');
    take('neoperro');
    const path = [];
    while (list[cursor] === '[') {
      take('['); const key = take();
      if (/^\d+$/.test(key)) path.push(String(Number(key) - 1));
      else path.push(string(key));
      take(']');
    }
    take('=');
    assignments.push(checkedAssignment({path, value:value()}, config, defaults));
    if (list[cursor] === ';') take();
  }
  take('end'); if (list[cursor] === ';') take();
  if (cursor !== list.length) throw Error('Paste one complete function.');
  return assignments;
}

export function exportGunScript(config, token, functions) {
  const validated = validateGunFunctions(functions, config, config);
  const spec = config['Gun Specifications'];
  const body = [
    '{',
    "        ['Enabled'] = " + spec.Enabled + ';',
    "        ['Ranges'] = " + luaTable(spec.Ranges, 2) + ';',
  ];
  for (const [gun, blocks] of Object.entries(spec)) {
    if (['Enabled', 'Ranges'].includes(gun)) continue;
    body.push('        [' + quote(gun) + '] = {');
    for (const range of ranges) {
      const assignments = validated[gun]?.[range];
      const block = assignments ? makeFunction(assignments) : luaTable(blocks[range], 3);
      body.push('            [' + quote(range) + '] = ' + block.replaceAll('\n', '\n            ') + ';');
    }
    body.push('        };');
  }
  body.push('    }');
  const original = '["Gun Specifications"] = ' + luaTable(spec, 1);
  return exportLua(config, token).replace(original, () => '["Gun Specifications"] = ' + body.join('\n'));
}
