import {choices} from './config.mjs';
import {initialGunFunctions, luaValue, makeFunction, parseFunction, ranges, settingPaths} from './gun-functions.mjs';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const label = (text, input) => {
  const node = element('label', 'gun-field');
  node.append(element('span', '', text), input);
  return node;
};
const button = (text, run, className = 'button secondary') => {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', run);
  return node;
};

export function mountGunFunctions(root, {config, defaults, functions, state, changed}) {
  const plans = functions;
  const spec = config['Gun Specifications'];
  const card = element('section', 'gun-builder');
  const enabledRow = element('div', 'setting-row');
  const enabled = element('input', 'switch');
  enabled.type = 'checkbox'; enabled.checked = spec.Enabled; enabled.setAttribute('role', 'switch');
  enabled.setAttribute('aria-label', 'Gun Specifications / Enabled');
  enabled.addEventListener('change', () => { spec.Enabled = enabled.checked; changed(); });
  enabledRow.append(label('Enabled', enabled));
  root.append(enabledRow, card);
  card.append(element('h3', '', 'Function maker'),
    element('p', 'gun-help', 'Choose a setting, set its value, and add it to your function. Copy the result into a gun’s range box below.'));
  const picker = element('div', 'gun-picker');
  const feature = element('select'), setting = element('select');
  feature.setAttribute('aria-label', 'Feature to change');
  setting.setAttribute('aria-label', 'Setting to change');
  const paths = settingPaths(config);
  for (const name of new Set(paths.map(item => item.path[0]))) {
    const option = element('option', '', name); option.value = name; feature.append(option);
  }
  feature.value = state.feature && [...feature.options].some(option => option.value === state.feature) ? state.feature : '2d-Box';
  const valueArea = element('div', 'gun-value');
  let selected, valueInput;
  function fillValue() {
    selected = paths[Number(setting.value)];
    valueArea.replaceChildren();
    if (!selected) return;
    state.path = setting.value;
    const options = choices(selected.path);
    if (options) {
      valueInput = element('select');
      for (const value of options) { const option = element('option', '', value); option.value = value; valueInput.append(option); }
      valueInput.value = selected.value;
    } else {
      valueInput = element('input');
      valueInput.type = Array.isArray(selected.value) && selected.path.includes('Color') ? 'color' : typeof selected.value === 'boolean' ? 'checkbox' : typeof selected.value === 'number' ? 'number' : 'text';
      if (valueInput.type === 'checkbox') {
        valueInput.className = 'switch'; valueInput.checked = selected.value; valueInput.setAttribute('role', 'switch');
      } else {
        valueInput.value = valueInput.type === 'color' ? '#' + selected.value.map(value => value.toString(16).padStart(2, '0')).join('') : Array.isArray(selected.value) ? selected.value.join(', ') : selected.value;
        if (valueInput.type === 'number') valueInput.step = 'any';
        else {
          valueInput.maxLength = Array.isArray(selected.value) ? 2000 : 64;
          if (Array.isArray(selected.value)) valueInput.placeholder = 'Username, 123456';
        }
      }
    }
    valueInput.setAttribute('aria-label', 'New setting value');
    valueArea.append(label('Value', valueInput));
  }
  function fillSettings() {
    setting.replaceChildren();
    state.feature = feature.value;
    for (const [index, item] of paths.entries()) {
      if (item.path[0] !== feature.value) continue;
      const names = item.path.slice(1).map((key, index, parts) => {
        if (!/^\d+$/.test(key)) return key;
        if (item.path[0] === 'Checks') return ['Silent Aim','Aim Assist','Triggerbot'][Number(key)];
        if (parts.includes('Keybind')) return ['Keyboard key','Mouse button','Input source'][Number(key)];
        if (parts[index - 1] === 'Name') return ['Show name','Name field'][Number(key)];
        if (parts.includes('Color') && parts[index - 1] === 'Box') return ['Main','Outline'][Number(key)];
        return String(Number(key) + 1);
      });
      const option = element('option', '', names.join(' / ') || item.path[0]);
      option.value = String(index); setting.append(option);
    }
    const preferred = {
      '2d-Box':'2d-Box/Silent Aim/Size/Width',
      'Silent Aim':'Silent Aim/Prediction/Value',
      'Aim Assist':'Aim Assist/Smoothness',
      'Triggerbot':'Triggerbot/Delay',
    }[feature.value];
    const index = paths.findIndex(item => item.path.join('/') === preferred);
    if ([...setting.options].some(option => option.value === state.path)) setting.value = state.path;
    else if (index >= 0) setting.value = String(index);
    fillValue();
  }
  feature.addEventListener('change', fillSettings); setting.addEventListener('change', fillValue);
  picker.append(label('Feature', feature), label('Setting', setting), valueArea);
  card.append(picker);
  const feedback = element('p', 'gun-feedback'); feedback.setAttribute('role', 'status');
  const assignments = state.assignments ??= [];
  const list = element('div', 'gun-assignments');
  const output = element('textarea', 'gun-code'); output.readOnly = true; output.rows = 5; output.spellcheck = false;
  output.setAttribute('aria-label', 'Generated function');
  const copy = button('Copy function', async () => {
    try { await navigator.clipboard.writeText(output.value); feedback.textContent = 'Function copied. Paste it into a gun range below.'; }
    catch { output.focus(); output.select(); feedback.textContent = 'Press Ctrl+C to copy the selected function.'; }
  });
  function renderAssignments() {
    list.replaceChildren();
    assignments.forEach((assignment, index) => {
      const row = element('div', 'gun-assignment');
      row.append(element('span', '', assignment.path.join(' / ') + ' = ' + luaValue(assignment.value)));
      const remove = button('Remove', () => { assignments.splice(index, 1); renderAssignments(); }, 'inline-button');
      remove.setAttribute('aria-label', 'Remove ' + assignment.path.join(' / '));
      row.append(remove); list.append(row);
    });
    output.value = makeFunction(assignments);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) output.animate([{opacity:.4}, {opacity:1}], {duration:180});
    copy.disabled = !assignments.length;
  }
  const add = button('Add setting', () => {
    try {
      let value = valueInput.type === 'checkbox' ? valueInput.checked : typeof selected.value === 'number' ? Number(valueInput.value) : valueInput.value;
      if (Array.isArray(selected.value) && valueInput.type !== 'color') value = valueInput.value.split(/[\s,]+/).filter(Boolean).map(item => /^\d+$/.test(item) ? Number(item) : item);
      if (valueInput.type === 'color') value = valueInput.value.slice(1).match(/../g).map(part => parseInt(part, 16));
      if (valueInput.type === 'number' && valueInput.value.trim() === '') throw Error('Enter a value first.');
      const proposal = {path:selected.path, value};
      parseFunction(makeFunction([proposal]), config, defaults);
      const index = assignments.findIndex(item => item.path.join('/') === proposal.path.join('/'));
      if (index >= 0) assignments[index] = proposal;
      else { if (assignments.length >= 20) throw Error('Use up to 20 settings in one function.'); assignments.push(proposal); }
      feedback.textContent = ''; renderAssignments();
    } catch (error) { feedback.textContent = error.message; }
  }, 'button primary');
  const actions = element('div', 'gun-actions');
  actions.append(add, button('Clear function', () => { assignments.length = 0; feedback.textContent = ''; renderAssignments(); }));
  card.append(actions, list, output, copy, feedback);
  fillSettings(); renderAssignments();
  root.append(element('p', 'gun-help gun-save-note', 'Functions are saved with your profile. Export Lua and rerun your script after changing a function.'));
  const gunList = element('div', 'gun-list');
  const initial = initialGunFunctions(config);
  for (const gun of Object.keys(initial)) {
    plans[gun] ??= initial[gun];
    const details = element('details', 'gun-card');
    details.open = state.open?.[gun] ?? gun === Object.keys(initial)[0];
    const summary = element('summary', '', gun);
    details.append(summary);
    state.open ??= {};
    details.addEventListener('toggle', () => { state.open[gun] = details.open; });
    const content = element('div', 'gun-card-content');
    const tabs = element('div', 'gun-range-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', gun + ' range');
    const editor = element('textarea', 'gun-code'); editor.rows = 8; editor.spellcheck = false;
    const hint = element('p', 'gun-help'), message = element('p', 'gun-feedback');
    message.setAttribute('role', 'status');
    state.ranges ??= {}; let selectedRange = state.ranges[gun] ?? 'Close';
    const editorKey = () => gun + '/' + selectedRange;
    function showRange() {
      state.ranges[gun] = selectedRange;
      for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.textContent === selectedRange));
      editor.setAttribute('aria-label', gun + ' ' + selectedRange + ' function');
      editor.value = state.buffers[editorKey()] ?? makeFunction(plans[gun][selectedRange] ?? []);
      hint.textContent = !spec.Ranges.Enabled ? 'Ranges are off. This gun uses Close.'
        : selectedRange + ' ends at ' + spec.Ranges[selectedRange] + ' studs.';
      message.textContent = state.errors[editorKey()] ?? '';
      editor.setAttribute('aria-invalid', String(!!state.errors[editorKey()]));
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) editor.animate([{opacity:.4,transform:'translateY(5px)'}, {opacity:1,transform:'translateY(0)'}], {duration:180,easing:'ease-out'});
    }
    for (const range of ranges) tabs.append(button(range, () => { selectedRange = range; showRange(); }, 'gun-range-button'));
    editor.addEventListener('input', () => {
      state.buffers[editorKey()] = editor.value;
      try {
        const parsed = parseFunction(editor.value, config, defaults);
        plans[gun][selectedRange] = parsed;
        delete state.errors[editorKey()]; message.textContent = 'Function ready to save.';
        editor.setAttribute('aria-invalid', 'false');
      } catch (error) {
        state.errors[editorKey()] = error.message; message.textContent = error.message;
        editor.setAttribute('aria-invalid', 'true');
      }
      changed();
    });
    content.append(tabs, hint, editor, message); details.append(content); gunList.append(details); showRange();
  }
  root.append(gunList);
}
