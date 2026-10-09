// Profiles contain stream setup only; authentication and voice credentials stay global.
const PROFILE_FIELDS = {
  'channel-input': 'twitch_channel', 'handle-input': 'twitch_handle',
  'persona-input': 'persona', 'ctx-input': 'context', 'bots-input': 'ignored_bots',
  'yt-channel-input': 'youtube_video_url', 'game-select': 'game', 'game-custom-input': 'game_custom'
};
let profiles = [];
let activeProfileId;
let applyingProfile = false;
let savedProfiles = [];
function readProfileFields() {
  return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([id, key]) => [key, document.getElementById(id).value.trim()]));
}
function loadProfiles() {
  try {
    const saved = JSON.parse(localStorage.getItem('streamaac_profiles') || '[]');
    return Array.isArray(saved) ? saved.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.settings && typeof p.settings === 'object') : [];
  } catch { return []; }
}
function persistProfiles() {
  // Merge only this tab's edits into the latest list. Other tabs may have added,
  // edited or deleted profiles since this tab last saved.
  const latest = loadProfiles();
  const localIds = new Set(profiles.map(p => p.id));
  const removedIds = new Set(savedProfiles.filter(p => !localIds.has(p.id)).map(p => p.id));
  const merged = latest.filter(p => !removedIds.has(p.id));
  for (const local of profiles) {
    const previous = savedProfiles.find(p => p.id === local.id);
    const remote = merged.find(p => p.id === local.id);
    if (!previous) { if (!remote) merged.push(local); continue; }
    // Do not resurrect a profile deleted in another tab.
    if (!remote) continue;
    for (const key of ['name', 'description', 'icon']) {
      if (local[key] !== previous[key]) remote[key] = local[key];
    }
    for (const key of Object.values(PROFILE_FIELDS)) {
      if (local.settings[key] !== previous.settings[key]) remote.settings[key] = local.settings[key];
    }
  }
  profiles = merged;
  savedProfiles = JSON.parse(JSON.stringify(profiles));
  localStorage.setItem('streamaac_profiles', JSON.stringify(profiles));
}
function saveActiveProfile() {
  if (applyingProfile) return;
  const profile = profiles.find(p => p.id === activeProfileId);
  if (!profile) return;
  profile.name = document.getElementById('profile-name').value.trim() || 'Untitled profile';
  profile.description = document.getElementById('profile-description').value.trim();
  profile.settings = readProfileFields();
  if (localStorage.getItem('twitch_token')) profile.settings.twitch_handle = localStorage.getItem('twitch_handle') || '';
  Object.entries(profile.settings).forEach(([key, value]) => localStorage.setItem(key, value));
  invalidateBotCache();
  persistProfiles();
  if (!profiles.some(p => p.id === activeProfileId)) {
    if (profiles.length) applyProfile(profiles[0].id);
    else {
      const replacement = { id: crypto.randomUUID(), name: 'My stream', description: '', icon: '🎧', settings: readProfileFields() };
      profiles.push(replacement);
      persistProfiles();
      applyProfile(replacement.id);
    }
  } else {
    // Keep the form aligned with remote edits before advancing to the next save.
    const mergedProfile = profiles.find(p => p.id === activeProfileId);
    applyingProfile = true;
    for (const [field, key] of Object.entries(PROFILE_FIELDS)) {
      if (mergedProfile.settings[key] === profile.settings[key]) continue;
      const input = document.getElementById(field);
      input.value = mergedProfile.settings[key] || '';
      localStorage.setItem(key, input.value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (mergedProfile.name !== profile.name) document.getElementById('profile-name').value = mergedProfile.name;
    if (mergedProfile.description !== profile.description) document.getElementById('profile-description').value = mergedProfile.description || '';
    document.getElementById('game-custom-wrap').style.display = mergedProfile.settings.game === 'other' ? '' : 'none';
    applyingProfile = false;
    invalidateBotCache();
    const container = document.getElementById('profile-cards');
    const ids = [...container.children].map(card => card.dataset.profileId);
    if (JSON.stringify(ids) !== JSON.stringify(profiles.map(p => p.id))) renderProfiles();
    else profiles.forEach(p => {
      const card = [...container.children].find(card => card.dataset.profileId === p.id);
      card.querySelector('strong').textContent = p.name;
      card.querySelector('.profile-description').textContent = p.description || 'Your streaming setup';
      card.querySelector('summary').setAttribute('aria-label', 'Actions for ' + p.name);
    });
  }
}
function applyProfile(id) {
  const profile = profiles.find(p => p.id === id);
  if (!profile) return;
  applyingProfile = true;
  activeProfileId = id;
  document.getElementById('profile-name').value = profile.name;
  document.getElementById('profile-description').value = profile.description || '';
  Object.entries(PROFILE_FIELDS).forEach(([field, key]) => {
    const value = key === 'twitch_handle' && localStorage.getItem('twitch_token')
      ? localStorage.getItem('twitch_handle') || '' : profile.settings[key] || '';
    const input = document.getElementById(field);
    input.value = value;
    localStorage.setItem(key, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  document.getElementById('game-custom-wrap').style.display = profile.settings.game === 'other' ? '' : 'none';
  invalidateBotCache();
  applyingProfile = false;
  localStorage.setItem('streamaac_active_profile', activeProfileId);
  renderProfiles();
}
function createProfile(duplicate = false) {
  saveActiveProfile();
  const current = profiles.find(p => p.id === activeProfileId);
  const profile = { id: crypto.randomUUID(), name: duplicate ? current.name.slice(0, 75) + ' copy' : 'New profile',
    description: duplicate ? current.description : '', icon: duplicate ? current.icon : '🎮',
    settings: duplicate ? { ...current.settings } : {} };
  profiles.push(profile);
  persistProfiles();
  applyProfile(profile.id);
  document.getElementById('profile-name').focus();
  document.getElementById('profile-name').select();
  document.getElementById('profile-status').textContent = duplicate ? 'Profile copied. Changes save automatically.' : 'New profile created. Changes save automatically.';
}
function exportProfiles() {
  saveActiveProfile();
  const exported = profiles.map(profile => ({
    name: profile.name, description: profile.description || '', icon: profile.icon || '🎮',
    settings: Object.fromEntries(Object.values(PROFILE_FIELDS).map(key => [key, profile.settings[key] || '']))
  }));
  const blob = new Blob([JSON.stringify({ format: 'streamaac-profiles', version: 1, profiles: exported }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'streamaac-profiles.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.getElementById('profile-status').textContent = 'Profiles exported. The file includes your stream setup, but no login tokens or API keys.';
}
function parseProfileImport(text) {
  const data = JSON.parse(text);
  if (!data || data.format !== 'streamaac-profiles' || data.version !== 1 || !Array.isArray(data.profiles) || !data.profiles.length || data.profiles.length > 1000) {
    throw new Error('Choose a StreamAAC profiles export file (version 1).');
  }
  return data.profiles.map(profile => {
    if (!profile || typeof profile.name !== 'string' || !profile.name.trim()
      || (profile.description !== undefined && typeof profile.description !== 'string')
      || (profile.icon !== undefined && (typeof profile.icon !== 'string' || profile.icon.length > 32))
      || !profile.settings || typeof profile.settings !== 'object' || Array.isArray(profile.settings)) {
      throw new Error('The file contains an invalid profile. No profiles were imported.');
    }
    const settings = {};
    for (const key of Object.values(PROFILE_FIELDS)) {
      const value = profile.settings[key] ?? '';
      if (typeof value !== 'string') throw new Error('The file contains invalid profile settings. No profiles were imported.');
      settings[key] = value;
    }
    const gameOptions = [...document.getElementById('game-select').options].map(option => option.value);
    if (!gameOptions.includes(settings.game)) {
      settings.game_custom = settings.game;
      settings.game = 'other';
    }
    return { id: crypto.randomUUID(), name: profile.name.trim(), description: profile.description || '', icon: profile.icon || '🎮', settings };
  });
}
async function importProfiles(file) {
  if (!file) return;
  const status = document.getElementById('profile-status');
  try {
    if (file.size > 1024 * 1024) throw new Error('Choose a profiles file smaller than 1 MB.');
    const imported = parseProfileImport(await file.text());
    saveActiveProfile();
    const names = new Set(profiles.map(profile => profile.name));
    for (const profile of imported) {
      const originalName = profile.name;
      let suffix = 2;
      while (names.has(profile.name)) {
        const ending = ' (' + suffix++ + ')';
        profile.name = originalName.slice(0, Math.max(80, originalName.length) - ending.length) + ending;
      }
      names.add(profile.name);
    }
    const previousProfiles = JSON.parse(JSON.stringify(profiles));
    const previousSavedProfiles = JSON.parse(JSON.stringify(savedProfiles));
    profiles.push(...imported);
    try {
      persistProfiles();
    } catch {
      profiles = previousProfiles;
      savedProfiles = previousSavedProfiles;
      throw new Error('Profiles could not be saved. Your browser storage may be full. No profiles were imported.');
    }
    renderProfiles();
    status.textContent = imported.length + (imported.length === 1 ? ' profile imported.' : ' profiles imported.') + ' Your current profile is still active.';
  } catch (error) {
    status.textContent = error instanceof SyntaxError ? 'This file is not valid JSON. No profiles were imported.' : error.message;
  } finally {
    document.getElementById('import-profiles-file').value = '';
  }
}
function renderProfiles() {
  const container = document.getElementById('profile-cards');
  const focused = document.activeElement;
  const focusedCard = focused.closest('[data-profile-id]');
  const focusedId = focusedCard?.dataset.profileId;
  const focusedSelector = focused.matches('.profile-choose') ? '.profile-choose' : focused.matches('summary') ? 'summary' : focused.matches('.profile-menu button') ? '.profile-choose' : null;
  const openMenus = new Set([...container.querySelectorAll('details[open]')].map(menu => menu.parentElement.dataset.profileId));
  container.replaceChildren();
  profiles.forEach(profile => {
    const card = document.createElement('div');
    card.dataset.profileId = profile.id;
    card.className = 'profile-card' + (profile.id === activeProfileId ? ' active' : '');
    const choose = document.createElement('button');
    choose.className = 'profile-choose';
    choose.setAttribute('aria-pressed', String(profile.id === activeProfileId));
    const icon = document.createElement('span'); icon.className = 'profile-icon'; icon.textContent = profile.icon || '🎮';
    const name = document.createElement('strong'); name.textContent = profile.name;
    const description = document.createElement('span'); description.className = 'profile-description'; description.textContent = profile.description || 'Your streaming setup';
    choose.append(icon, name, description);
    choose.onclick = () => { saveActiveProfile(); applyProfile(profile.id); document.getElementById('profile-status').textContent = profile.name + ' is active.'; };
    card.append(choose);
    if (profile.id === activeProfileId) {
      const badge = document.createElement('span'); badge.className = 'active-badge'; badge.textContent = 'Active'; card.append(badge);
    }
    const menu = document.createElement('details'); menu.className = 'profile-menu';
    menu.open = openMenus.has(profile.id);
    const summary = document.createElement('summary'); summary.textContent = '⋮'; summary.setAttribute('aria-label', 'Actions for ' + profile.name);
    const remove = document.createElement('button'); remove.textContent = 'Delete profile'; remove.disabled = profiles.length === 1;
    remove.onclick = () => {
      if (!confirm('Delete “' + profile.name + '”?')) return;
      saveActiveProfile();
      if (profiles.length <= 1) return;
      profiles = profiles.filter(p => p.id !== profile.id);
      persistProfiles();
      applyProfile(profile.id === activeProfileId ? profiles[0].id : activeProfileId);
      document.getElementById('profile-status').textContent = 'Profile deleted.';
    };
    menu.append(summary, remove); card.append(menu); container.append(card);
  });
  if (focusedSelector && focusedId) {
    const card = [...container.children].find(card => card.dataset.profileId === focusedId);
    (card || container.querySelector('.profile-card'))?.querySelector(focusedSelector)?.focus();
  }
}
window.addEventListener('DOMContentLoaded', () => {
  profiles = loadProfiles();
  savedProfiles = JSON.parse(JSON.stringify(profiles));
  if (!profiles.length) {
    profiles = [{ id: crypto.randomUUID(), name: localStorage.getItem('twitch_handle') || 'My stream', description: 'Main streaming profile', icon: '🎧', settings: readProfileFields() }];
  }
  persistProfiles();
  applyProfile(profiles.some(p => p.id === localStorage.getItem('streamaac_active_profile')) ? localStorage.getItem('streamaac_active_profile') : profiles[0].id);
  [...Object.keys(PROFILE_FIELDS), 'profile-name', 'profile-description'].forEach(id => {
    document.getElementById(id).addEventListener('input', saveActiveProfile);
    document.getElementById(id).addEventListener('change', saveActiveProfile);
  });
  document.getElementById('export-profiles-btn').onclick = exportProfiles;
  document.getElementById('import-profiles-btn').onclick = () => document.getElementById('import-profiles-file').click();
  document.getElementById('import-profiles-file').onchange = event => importProfiles(event.target.files[0]);
  document.getElementById('new-profile-btn').onclick = () => createProfile();
  document.getElementById('duplicate-profile-btn').onclick = () => createProfile(true);
});
