(function (root) {
  'use strict';
  const KEY = 'streamaac_bot_patterns_v1';
  const kinds = ['follow', 'subscribe', 'resubscribe', 'gift', 'raid', 'donate'];
  const fields = { username: '[a-zA-Z0-9_]{1,25}', recipient: '[a-zA-Z0-9_]{1,25}', tier: '.+?', subscriptions: '[1-9][0-9]*', months: '[1-9][0-9]*', viewers: '[1-9][0-9]*', lifetimeGifts: '[0-9]+', supporterMessage: '.+?', amount: '.+?', currency: '.+?', ignore: '.*?' };
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compile(template, kind) {
    if (typeof template !== 'string' || !template.trim() || template.length > 500) throw new Error('Enter a pattern of up to 500 characters.');
    if (/[\r\n]/.test(template)) throw new Error('Use one line per pattern.');
    if (/\}\{/.test(template)) throw new Error('Separate placeholders with message text or spaces.');
    let source = '', offset = 0;
    const seen = new Set();
    for (const match of template.matchAll(/\{([^{}]+)\}/g)) {
      source += escape(template.slice(offset, match.index));
      const field = match[1];
      if (!Object.hasOwn(fields, field) || seen.has(field)) throw new Error('Use supported placeholders once each per pattern.');
      seen.add(field);
      const end = match.index + match[0].length;
      const next = template.indexOf('{', end);
      const literal = template.slice(end, next < 0 ? template.length : next);
      const boundary = escape(literal) + (next < 0 ? '$' : '');
      // Capture once up to the next literal, then consume without backtracking.
      source += '(?=(?<' + field + '>' + (field === 'username' && kind === 'donate' ? '.+?' : fields[field]) + ')(?=' + boundary + '))\\k<' + field + '>';
      offset = match.index + match[0].length;
    }
    source += escape(template.slice(offset));
    if (!seen.has('username')) throw new Error('Include {username} in each pattern.');
    return new RegExp('^' + source + '$', 'i');
  }
  function validate(entries) {
    if (!Array.isArray(entries) || entries.length > 100) throw new Error('Use up to 100 patterns.');
    return entries.map(entry => {
      if (!entry || !kinds.includes(entry.kind)) throw new Error('Choose an event type.');
      const template = typeof entry.template === 'string' ? entry.template.trim() : entry.template;
      compile(template, entry.kind);
      return { kind: entry.kind, template };
    });
  }
  function load(storage = root.localStorage) {
    try { return validate(JSON.parse(storage?.getItem(KEY) || '[]')); } catch { return []; }
  }
  function save(entries, storage = root.localStorage) { const clean = validate(entries); storage.setItem(KEY, JSON.stringify(clean)); return clean; }
  function parseText(text) {
    if (typeof text !== 'string' || text.length > 100000) throw new Error('Choose a text file smaller than 100 KB.');
    const entries = [];
    for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('|');
      try {
        if (separator < 0) throw new Error('Use event | message pattern.');
        entries.push(...validate([{ kind: line.slice(0, separator).trim().toLowerCase(), template: line.slice(separator + 1).trim() }]));
      } catch (error) { throw new Error('Line ' + (index + 1) + ': ' + error.message); }
    }
    if (!entries.length) throw new Error('The file contains no patterns.');
    return validate(entries);
  }
  function importText(text, storage = root.localStorage) {
    const entries = load(storage);
    for (const entry of parseText(text)) {
      if (!entries.some(saved => saved.kind === entry.kind && saved.template === entry.template)) entries.push(entry);
    }
    return save(entries, storage);
  }
  function exportText(entries = load()) { return validate(entries).map(entry => entry.kind + ' | ' + entry.template).join('\n') + '\n'; }
  function match(text, entries = load()) {
    if (typeof text !== 'string' || text.length > 2000) return null;
    for (const entry of entries) {
      const result = compile(entry.template, entry.kind).exec(text);
      if (!result) continue;
      const data = { ...result.groups };
      delete data.ignore;
      if (data.tier !== undefined) { data.tierLabel = data.tier; delete data.tier; }
      for (const key of ['subscriptions', 'months', 'viewers', 'lifetimeGifts']) {
        if (data[key] !== undefined) {
          data[key] = Number(data[key]);
          if (!Number.isSafeInteger(data[key])) return null;
        }
      }
      if (entry.kind === 'gift' && data.recipient && data.subscriptions === undefined) data.subscriptions = 1;
      return { kind: entry.kind, ...data };
    }
    return null;
  }
  const api = { KEY, kinds, compile, validate, load, save, match, parseText, importText, exportText };
  root.BotPatterns = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('bot-pattern-form'); if (!form) return;
    const list = document.getElementById('bot-pattern-list');
    const status = document.getElementById('bot-pattern-status');
    const kind = document.getElementById('bot-pattern-kind');
    const template = document.getElementById('bot-pattern-template');
    let editing = null;
    function render() {
      list.replaceChildren();
      const entries = load();
      if (!entries.length) list.textContent = 'No patterns saved. Bot messages appear as generic notifications.';
      entries.forEach((entry, index) => {
        const row = document.createElement('div'); row.className = 'ignored-command-item';
        const text = document.createElement('p'); text.textContent = entry.kind + ': ' + entry.template;
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'hbtn'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', 'Edit pattern ' + (index + 1));
        edit.onclick = () => { editing = index; kind.value = entry.kind; template.value = entry.template; template.focus(); };
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'hbtn'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove pattern ' + (index + 1));
        remove.onclick = () => {
          try { save(load().filter((_, i) => i !== index)); editing = null; render(); status.textContent = 'Pattern removed.'; template.focus(); }
          catch (error) { status.textContent = error.message; }
        };
        row.append(text, edit, remove); list.append(row);
      });
    }
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const entries = load(), entry = { kind: kind.value, template: template.value };
        if (editing === null) entries.push(entry); else entries[editing] = entry;
        save(entries); editing = null; template.value = ''; render(); status.textContent = 'Pattern saved.'; template.focus();
      } catch (error) { status.textContent = error.message; }
    };
    document.getElementById('bot-pattern-cancel').onclick = () => { editing = null; template.value = ''; status.textContent = 'Ready to add a new pattern.'; template.focus(); };
    const file = document.getElementById('bot-pattern-file');
    document.getElementById('bot-pattern-import').onclick = () => file.click();
    file.onchange = async () => {
      try {
        const selected = file.files[0]; if (!selected) return;
        if (selected.size > 100000) throw new Error('Choose a text file smaller than 100 KB.');
        importText(await selected.text()); editing = null; template.value = ''; render();
        status.textContent = 'Patterns imported. Existing patterns kept; duplicates skipped.';
      } catch (error) { status.textContent = error.message + ' Existing patterns kept.'; }
      finally { file.value = ''; }
    };
    document.getElementById('bot-pattern-export').onclick = () => {
      const url = URL.createObjectURL(new Blob([exportText()], {type:'text/plain;charset=utf-8'}));
      const link = document.createElement('a'); link.href = url; link.download = 'streamaac-bot-patterns.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = 'Patterns exported.';
    };
    document.getElementById('bot-pattern-test').onclick = () => {
      try {
        const entry = validate([{ kind: kind.value, template: template.value }]);
        const result = match(document.getElementById('bot-pattern-example').value.trim(), entry);
        status.textContent = result ? 'Matched: ' + JSON.stringify(result) : 'No match. Check wording, spaces, and punctuation.';
      } catch (error) { status.textContent = error.message; }
    };
    root.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { editing = null; render(); status.textContent = 'Patterns updated in another tab. Select Edit again before saving changes.'; } });
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
