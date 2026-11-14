function renderPhraseEditor() {
  const list = document.getElementById('phrases-list');
  list.innerHTML = '';
  const phrases = loadPhrases();
  const tags = getPhraseTags(phrases);
  if (!phrases.length) {
    list.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:12px 0">no phrases yet — add one above</div>';
    return;
  }
  tags.forEach(tag => {
    const group = phrases.filter(p => (p.tag || 'misc') === tag);
    const lbl = document.createElement('div');
    lbl.className = 'phrase-group-label';
    lbl.textContent = `${tag} (${group.length} phrase${group.length !== 1 ? 's' : ''})`;
    list.appendChild(lbl);
    group.forEach(p => {
      const row = document.createElement('div');
      row.className = 'phrase-row';
      row.innerHTML = `
        <input aria-label="Tag" class="pr-tag" value="${x(p.tag || 'misc')}" list="phrase-tag-datalist"
          onchange="updatePhraseField('${p.id}','tag',this.value)" autocomplete="off">
        <input aria-label="Label" class="pr-label" value="${x(p.label || '')}" placeholder="label"
          onchange="updatePhraseField('${p.id}','label',this.value)" autocomplete="off">
        <input aria-label="Phrase text" class="pr-phrase" value="${x(p.phrase)}" placeholder="phrase"
          onchange="updatePhraseField('${p.id}','phrase',this.value)" autocomplete="off">
        <button class="pr-star${p.starred ? ' starred' : ''}" onclick="togglePhraseStar('${p.id}')" aria-label="Favourite phrase" aria-pressed="${p.starred ? 'true' : 'false'}">★</button>
        <button class="pr-del" onclick="deletePhrase('${p.id}')" aria-label="Delete phrase">✕</button>`;
      list.appendChild(row);
    });
  });
}

function addPhrase() {
  const tagIn = document.getElementById('phrase-tag-input').value.trim() || 'misc';
  const labelIn = document.getElementById('phrase-label-input').value.trim();
  const phraseIn = document.getElementById('phrase-phrase-input').value.trim();
  if (!phraseIn) return;
  const phrases = loadPhrases();
  phrases.push({ id: generateId(), tag: tagIn, label: labelIn || phraseIn, phrase: phraseIn, starred: false });
  savePhrases(phrases);
  document.getElementById('phrase-tag-input').value = '';
  document.getElementById('phrase-label-input').value = '';
  document.getElementById('phrase-phrase-input').value = '';
  renderPhraseEditor();
  refreshTagDatalist();
}

function updatePhraseField(id, field, value) {
  const phrases = loadPhrases();
  const p = phrases.find(ph => ph.id === id);
  if (!p) return;
  if (field === 'tag') p.tag = value.trim() || 'misc';
  else if (field === 'label') p.label = value.trim();
  else if (field === 'phrase') p.phrase = value.trim();
  savePhrases(phrases);
  if (field === 'tag') { renderPhraseEditor(); refreshTagDatalist(); }
}

function togglePhraseStar(id) {
  const phrases = loadPhrases();
  const p = phrases.find(ph => ph.id === id);
  if (!p) return;
  p.starred = !p.starred;
  savePhrases(phrases);
  renderPhraseEditor();
}

function deletePhrase(id) {
  const phrases = loadPhrases().filter(p => p.id !== id);
  savePhrases(phrases);
  renderPhraseEditor();
}

function refreshTagDatalist() {
  const dl = document.getElementById('phrase-tag-datalist');
  if (!dl) return;
  dl.innerHTML = '';
  getPhraseTags(loadPhrases()).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    dl.appendChild(opt);
  });
}

// ── PHRASES EXPORT / IMPORT ──
function formatPhrasesTxt(phrases) {
  const today = new Date().toISOString().slice(0, 10);
  let out = `# StreamAAC phrases — exported ${today}\n# Format: [tag], then  * label | phrase  (* = favourite)\n\n`;
  const tags = getPhraseTags(phrases);
  tags.forEach(tag => {
    out += `[${tag}]\n`;
    phrases.filter(p => (p.tag || 'misc') === tag).forEach(p => {
      out += `${p.starred ? '* ' : ''}${p.label || p.phrase} | ${p.phrase}\n`;
    });
    out += '\n';
  });
  return out.trimEnd();
}

function exportPhrases() {
  const phrases = loadPhrases();
  if (!phrases.length) { alert('No phrases to export.'); return; }
  const txt = formatPhrasesTxt(phrases);
  const blob = new Blob([txt], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  a.download = `streamaac-phrases-${today}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function parsePhrasesTxt(text) {
  const parsed = [];
  let currentTag = 'misc';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const tagMatch = line.match(/^\[(.+)\]$/);
    if (tagMatch) { currentTag = tagMatch[1].trim() || 'misc'; continue; }
    const starred = line.startsWith('* ');
    const content = starred ? line.slice(2).trim() : line;
    const sep = content.includes(' | ') ? ' | ' : '|';
    const idx = content.indexOf(sep);
    let label, phrase;
    if (idx !== -1) {
      label = content.slice(0, idx).trim();
      phrase = content.slice(idx + sep.length).trim();
    } else {
      label = content;
      phrase = content;
    }
    if (phrase) parsed.push({ tag: currentTag, label: label || phrase, phrase, starred });
  }
  return parsed;
}

function addImportedPhrases(incoming) {
  const existing = loadPhrases();
  const existingPhrases = new Set(existing.map(p => p.phrase));
  let added = 0;
  incoming.forEach(p => {
    if (!existingPhrases.has(p.phrase)) {
      existing.push({ id: generateId(), ...p });
      existingPhrases.add(p.phrase);
      added++;
    }
  });
  savePhrases(existing);
  renderPhraseEditor();
  refreshTagDatalist();
  alert(`Imported ${added} phrase${added !== 1 ? 's' : ''} (${incoming.length - added} duplicate${incoming.length - added !== 1 ? 's' : ''} skipped).`);
}

async function loadStarterPhrases() {
  const button = document.getElementById('load-starter-phrases');
  button.disabled = true;
  try {
    const response = await fetch('starter-phrases.txt');
    if (!response.ok) throw new Error('Could not load starter phrases');
    const incoming = parsePhrasesTxt(await response.text());
    if (!incoming.length) throw new Error('No starter phrases found');
    addImportedPhrases(incoming);
  } catch (_) {
    alert('Could not load starter phrases. Please try again, or use import .txt to choose your starter phrases file.');
  } finally {
    button.disabled = false;
  }
}

function importPhrases(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const incoming = parsePhrasesTxt(e.target.result);
    addImportedPhrases(incoming);
  };
  reader.readAsText(file);
  event.target.value = '';
}

window.addEventListener('DOMContentLoaded', () => { renderPhraseEditor(); refreshTagDatalist(); });
