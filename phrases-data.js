function loadPhrases() {
  try { return JSON.parse(localStorage.getItem('stored_phrases') || '[]'); }
  catch(_) { return []; }
}

function savePhrases(arr) {
  localStorage.setItem('stored_phrases', JSON.stringify(arr));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getPhraseTags(phrases) {
  const seen = new Set(), tags = [];
  for (const p of phrases) {
    const t = p.tag || 'misc';
    if (!seen.has(t)) { seen.add(t); tags.push(t); }
  }
  return tags;
}

