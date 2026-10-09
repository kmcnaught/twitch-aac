// Profiles contain stream setup only; authentication and voice credentials stay global.
const PROFILE_FIELDS = {
  'channel-input': 'twitch_channel', 'handle-input': 'twitch_handle',
  'persona-input': 'persona', 'ctx-input': 'context', 'bots-input': 'ignored_bots',
  'yt-channel-input': 'youtube_video_url', 'game-select': 'game', 'game-custom-input': 'game_custom'
};
let profiles = [];
let activeProfileId;
let applyingProfile = false;
function readProfileFields() {
  return Object.fromEntries(Object.entries(PROFILE_FIELDS).map(([id, key]) => [key, document.getElementById(id).value.trim()]));
}
function persistProfiles() {
  localStorage.setItem('streamaac_profiles', JSON.stringify(profiles));
  localStorage.setItem('streamaac_active_profile', activeProfileId);
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
  const index = profiles.indexOf(profile);
  const card = document.getElementById('profile-cards').children[index];
  if (card) {
    card.querySelector('strong').textContent = profile.name;
    card.querySelector('.profile-description').textContent = profile.description || 'Your streaming setup';
    card.querySelector('summary').setAttribute('aria-label', 'Actions for ' + profile.name);
  }
}
function applyProfile(id) {
  applyingProfile = true;
  activeProfileId = id;
  const profile = profiles.find(p => p.id === id);
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
  persistProfiles();
  renderProfiles();
}
function createProfile(duplicate = false) {
  saveActiveProfile();
  const current = profiles.find(p => p.id === activeProfileId);
  const profile = { id: crypto.randomUUID(), name: duplicate ? current.name + ' copy' : 'New profile',
    description: duplicate ? current.description : '', icon: duplicate ? current.icon : '🎮',
    settings: duplicate ? { ...current.settings } : {} };
  profiles.push(profile);
  applyProfile(profile.id);
  document.getElementById('profile-name').focus();
  document.getElementById('profile-name').select();
  document.getElementById('profile-status').textContent = duplicate ? 'Profile copied. Changes save automatically.' : 'New profile created. Changes save automatically.';
}
function renderProfiles() {
  const container = document.getElementById('profile-cards');
  container.replaceChildren();
  profiles.forEach(profile => {
    const card = document.createElement('div');
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
    const summary = document.createElement('summary'); summary.textContent = '⋮'; summary.setAttribute('aria-label', 'Actions for ' + profile.name);
    const remove = document.createElement('button'); remove.textContent = 'Delete profile'; remove.disabled = profiles.length === 1;
    remove.onclick = () => {
      if (!confirm('Delete “' + profile.name + '”?')) return;
      saveActiveProfile();
      profiles = profiles.filter(p => p.id !== profile.id);
      applyProfile(profile.id === activeProfileId ? profiles[0].id : activeProfileId);
      document.getElementById('profile-status').textContent = 'Profile deleted.';
    };
    menu.append(summary, remove); card.append(menu); container.append(card);
  });
}
window.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = JSON.parse(localStorage.getItem('streamaac_profiles') || '[]');
    if (Array.isArray(saved)) profiles = saved.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.settings && typeof p.settings === 'object');
  } catch { /* Restore existing setup if profile storage is malformed. */ }
  if (!profiles.length) {
    profiles = [{ id: crypto.randomUUID(), name: localStorage.getItem('twitch_handle') || 'My stream', description: 'Main streaming profile', icon: '🎧', settings: readProfileFields() }];
  }
  applyProfile(profiles.some(p => p.id === localStorage.getItem('streamaac_active_profile')) ? localStorage.getItem('streamaac_active_profile') : profiles[0].id);
  [...Object.keys(PROFILE_FIELDS), 'profile-name', 'profile-description'].forEach(id => {
    document.getElementById(id).addEventListener('input', saveActiveProfile);
    document.getElementById(id).addEventListener('change', saveActiveProfile);
  });
  document.getElementById('new-profile-btn').onclick = () => createProfile();
  document.getElementById('duplicate-profile-btn').onclick = () => createProfile(true);
});
