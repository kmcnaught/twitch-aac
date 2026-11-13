(function (root) {
  'use strict';
  const KEY = 'streamaac_ignored_commands_v1';
  const defaults = () => [];
  const normalize = text => String(text).normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/\s+:/g, ':').trim().toLowerCase().replace(/^(?:\p{Extended_Pictographic}\uFE0F?\s*)+/u, '');
  function validate(entries) {
    if (!Array.isArray(entries) || entries.length > 200) throw new Error('Choose a command list with up to 200 entries.');
    return entries.map(entry => {
      if (!entry || typeof entry.command !== 'string' || !entry.command.trim() || entry.command.length > 80 || !Array.isArray(entry.replies) || entry.replies.length > 30 || entry.replies.some(r => typeof r !== 'string' || !r.trim() || r.length > 2000)) throw new Error('Each entry needs a command name and a list of reply beginnings.');
      return { command: entry.command.trim(), replies: [...new Set(entry.replies.map(r => r.trim()))] };
    });
  }
  function load(storage) {
    try { const raw = (storage || root.localStorage)?.getItem(KEY); return raw === null || raw === undefined ? defaults() : validate(JSON.parse(raw)); }
    catch { return defaults(); }
  }
  function save(entries, storage = root.localStorage) { const clean = validate(entries); storage.setItem(KEY, JSON.stringify(clean)); return clean; }
  function merge(current, incoming) {
    const result = validate(current);
    for (const entry of validate(incoming)) {
      const found = result.find(e => normalize(e.command) === normalize(entry.command));
      if (found) found.replies = [...new Set([...found.replies, ...entry.replies])];
      else result.push(entry);
    }
    return validate(result);
  }
  function commandMatches(text, command) {
    const value = normalize(text), name = normalize(command);
    return Boolean(name) && (value === name || value.startsWith(name + ' '));
  }
  function matches(text, entries = load()) {
    const value = normalize(text.replace(/^\x01ACTION ([\s\S]*)\x01$/, '$1'));
    return entries.some(e => commandMatches(value, e.command) || e.replies.some(reply => { const prefix = normalize(reply); return Boolean(prefix) && value.startsWith(prefix); }));
  }
  const api = { KEY, defaults, validate, load, save, merge, matches, commandMatches };
  root.CommandIgnores = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('ignored-command-list'); if (!list) return;
    const profilesPanel = document.getElementById('profiles-panel');
    const commandsPanel = document.getElementById('ignored-commands-panel');
    function showPanel() {
      if (!profilesPanel || !commandsPanel) return;
      const commandsOpen = root.location.hash === '#ignored-commands';
      profilesPanel.hidden = commandsOpen;
      commandsPanel.hidden = !commandsOpen;
      for (const [id, selected] of [['profiles-nav-link', !commandsOpen], ['ignored-commands-nav-link', commandsOpen]]) {
        const link = document.getElementById(id);
        link.classList.toggle('selected', selected);
        if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      }
    }
    root.addEventListener('hashchange', showPanel);
    showPanel();
    const status = document.getElementById('ignored-command-status');
    const command = document.getElementById('ignored-command-name');
    const replies = document.getElementById('ignored-command-replies');
    const file = document.getElementById('ignored-command-file');
    const report = message => { status.textContent = message; };
    function render() {
      list.replaceChildren();
      const entries = load();
      if (!entries.length) { const p = document.createElement('p'); p.textContent = 'No commands ignored.'; list.append(p); }
      entries.forEach(entry => {
        const item = document.createElement('div'); item.className = 'ignored-command-item';
        const info = document.createElement('div'); const title = document.createElement('strong'); title.textContent = entry.command; info.append(title);
        entry.replies.forEach(reply => { const p = document.createElement('p'); p.textContent = reply; info.append(p); });
        const remove = document.createElement('button'); remove.className = 'hbtn'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + entry.command);
        remove.onclick = () => { try { save(load().filter(e => normalize(e.command) !== normalize(entry.command))); render(); report('Removed ' + entry.command + '.'); document.getElementById('ignored-command-add').focus(); } catch { report('Could not save changes. Please check browser storage.'); } };
        item.append(info, remove); list.append(item);
      });
    }
    document.getElementById('ignored-command-form').onsubmit = event => {
      event.preventDefault();
      try { const entry = {command: command.value, replies: replies.value.split(/\r?\n/).map(r => r.trim()).filter(Boolean)}; save(merge(load(), [entry])); render(); command.value = ''; replies.value = ''; report('Command saved.'); command.focus(); }
      catch (error) { report(error.message || 'Could not save command.'); }
    };
    document.getElementById('ignored-command-export').onclick = () => {
      const blob = new Blob([JSON.stringify({ version: 1, commands: load() }, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'streamaac-ignored-commands.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); report('Command list exported.');
    };
    document.getElementById('ignored-command-import').onclick = () => file.click();
    file.onchange = async () => {
      try {
        const selected = file.files[0]; if (!selected) return;
        if (selected.size > 1000000) throw new Error('Choose a file smaller than 1 MB.');
        const data = JSON.parse(await selected.text());
        if (!data || data.version !== 1) throw new Error('Choose a StreamAAC ignored commands export.');
        save(merge(load(), validate(data.commands))); render(); report('Commands imported. Existing entries kept.');
      } catch (error) { report(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message || 'Could not import commands.'); }
      finally { file.value = ''; }
    };
    root.addEventListener('storage', event => { if (event.key === KEY || event.key === null) render(); });
    render();
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
