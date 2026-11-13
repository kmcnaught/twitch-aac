const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../settings.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('let elVoices'))[1];
const ctx = vm.createContext({ window: { addEventListener() {} } });
vm.runInContext(script, ctx);
const backup = settings => ({type:'streamaac-voice-settings', version:1, settings});
test('voice backup restores every preference and optionally the API key', () => {
  const saved = {voice_source:'elevenlabs', el_voice_id:'saved-voice', el_model:'eleven_multilingual_v2', el_speed_mode:'playback', el_speed:'0.70', el_stability:'0', el_similarity_boost:'1', el_style:'0.07', el_key:'test-only-key'};
  const result = ctx.validateVoiceBackup(backup(saved));
  for(const [key,value] of Object.entries(saved)) assert.equal(result[key],value);
  assert.equal(Object.hasOwn(ctx.validateVoiceBackup(backup({})), 'el_key'),false);
});
test('invalid backups and unrelated fields cannot overwrite browser data', () => {
  for(const settings of [{el_speed:'NaN'}, {el_speed:'2'}, {el_style:'-1'}, {voice_source:'unknown'}, {el_key:3}, {voice_lang:[]}, {el_stability:''}])
    assert.throws(() => ctx.validateVoiceBackup(backup(settings)));
  assert.throws(() => ctx.validateVoiceBackup({version:1,settings:{}}));
  const result = ctx.validateVoiceBackup(backup({twitch_token:'never-import', service_proxy_url:'never-import'}));
  assert.equal(Object.hasOwn(result,'twitch_token'),false);
  assert.equal(Object.hasOwn(result,'service_proxy_url'),false);
});
test('import restores controls immediately, clears an explicitly empty key, and tolerates stale cache', async () => {
  const store = new Map([['el_key','old-test-key'],['el_voices','{}']]);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'', style:{}, classList:{toggle(){}}, appendChild(){}, parentElement:{querySelector(){return null;}}});
    return elements.get(id);
  };
  const env = vm.createContext({
    window:{addEventListener(){},speechSynthesis:{getVoices:()=>[]}},
    document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>({})},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
    getElSpeed:()=>Number(store.get('el_speed')||1), EL_VOICE_DEFAULTS:{stability:0.5,similarity_boost:0.75,style:0},
    getElVoiceSetting:k=>Number(store.get('el_'+k)||0),getElModel:()=>store.get('el_model'),getElSpeedMode:()=>store.get('el_speed_mode')
  });
  vm.runInContext(script,env);
  const input = {files:[{size:200,text:async()=>JSON.stringify(backup({voice_source:'elevenlabs',el_voice_id:'test-voice',el_key:'',el_style:'0.07'}))}],value:'file'};
  await env.importVoiceSettings(input);
  assert.equal(store.get('el_key'),'');
  assert.equal(element('el-key-input').value,'');
  assert.equal(element('el-style-label').textContent,'7%');
  assert.equal(element('voice-select-row').style.display,'flex');
  assert.match(element('voice-backup-status').textContent,/imported/);
  const previous = store.get('el_style');
  await env.importVoiceSettings({files:[{size:30,text:async()=>JSON.stringify(backup({el_style:'9'}))}],value:'file'});
  assert.equal(store.get('el_style'),previous);
});
