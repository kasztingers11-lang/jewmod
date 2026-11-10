import {luaTable, withWebDefaults} from './config.mjs';

const code = document.querySelector('#default-lua');
const tokens = /("(?:\\.|[^"\\])*"|\b(?:true|false|nil)\b|-?\b\d+(?:\.\d+)?\b)/g;

function renderLine(line) {
  const row = document.createElement('span');
  row.className = 'lua-line';
  let start = 0;
  for (const match of line.matchAll(tokens)) {
    row.append(document.createTextNode(line.slice(start, match.index)));
    const token = document.createElement('span');
    if (match[0].startsWith('"')) {
      token.className = 'lua-string';
    } else {
      token.className = /^[\d-]/.test(match[0]) ? 'lua-number' : 'lua-boolean';
    }
    token.textContent = match[0];
    row.append(token);
    start = match.index + match[0].length;
  }
  row.append(document.createTextNode(line.slice(start)));
  return row;
}

async function mountDefaults() {
  const response = await fetch('/config-schema.json');
  if (!response.ok) throw new Error('Default config unavailable');
  const {defaults} = await response.json();
  const lua = 'getgenv()["neoperro"] = ' + luaTable(withWebDefaults(defaults)) + ';';
  const fragment = document.createDocumentFragment();
  for (const line of lua.split('\n')) {
    fragment.append(renderLine(line));
  }
  code.replaceChildren(fragment);
}

code.addEventListener('copy', event => event.preventDefault());
code.addEventListener('dragstart', event => event.preventDefault());
mountDefaults().catch(() => {
  code.textContent = 'Default settings are temporarily unavailable. Refresh to try again.';
});
