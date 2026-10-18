const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseBotAnnouncement, Store } = require('../notifications.js');
const examples = [
  ['FixtureUser followed!', 'follow'],
  ["FixtureUser gifted a Tier 1 sub to FixtureRecipient CrreamAwk They've gifted 47 subs in total!", 'gift'],
  ['FixtureUser resubscribed with Prime (7 months) CrreamAwk Thanks!', 'resubscribe'],
  ['FixtureUser subscribed with Tier 2.', 'subscribe'],
  ['FixtureUser is raiding with a party of 25!', 'raid']
];
test('all five provided eggbot formats map to notifications', () => {
  for (const [text, kind] of examples) {
    const event = parseBotAnnouncement('EggBotReal', text, 'fixture', kind, '2026-10-18T12:00:00Z');
    assert.equal(event.kind, kind); assert.equal(event.username, 'FixtureUser'); assert.equal(event.status, 'pending');
    assert.equal(event.channel, 'fixture'); assert.equal(event.eventOrigin, 'eggbotreal');
  }
});
test('Twitch /me ACTION wrappers are accepted for all five bot announcements', () => {
  for (const [text, kind] of examples) {
    const event = parseBotAnnouncement('eggbotreal', '\x01ACTION ' + text + '\x01', 'fixture', kind);
    assert.ok(event, `Missing action notification for ${kind}`);
    assert.equal(event.kind, kind); assert.equal(event.username, 'FixtureUser');
  }
  assert.equal(parseBotAnnouncement('eggbotreal', '\x01ACTION FixtureFollower followed!\x01', 'fixture', 'action-follow').username, 'FixtureFollower');
  assert.equal(parseBotAnnouncement('viewer', '\x01ACTION FixtureUser followed!\x01', 'fixture', 'spoof'), null);
});
test('gift lifetime total is not the current gift count, and resub messages omit the emote', () => {
  const gift = parseBotAnnouncement('eggbotreal', examples[1][0], 'fixture', 'gift');
  assert.equal(gift.subscriptions, 1); assert.equal(gift.lifetimeGifts, 47); assert.equal(gift.recipient, 'FixtureRecipient'); assert.equal(gift.tierLabel, 'Tier 1');
  const resub = parseBotAnnouncement('eggbotreal', examples[2][0], 'fixture', 'resub');
  assert.equal(resub.months, 7); assert.equal(resub.tierLabel, 'Prime'); assert.equal(resub.supporterMessage, 'Thanks!');
  assert.equal(parseBotAnnouncement('eggbotreal', examples[4][0], 'fixture', 'raid').viewers, 25);
});
test('only the real bot login is accepted; other wording becomes a bot message', () => {
  for (const user of ['viewer', 'eggbotreal_fake', 'eggbotreaI']) assert.equal(parseBotAnnouncement(user, examples[0][0], 'fixture', 'id'), null);
  for (const text of ['Hi everyone!', 'Someone said: FixtureUser followed!', 'FixtureUser followed! more words', '%user% followed!', 'FixtureUser is raiding with a party of nope!']) {
    const e = parseBotAnnouncement('eggbotreal', text, 'fixture', 'id'); assert.equal(e.kind, 'bot'); assert.equal(e.botText, text);
  }
  assert.equal(parseBotAnnouncement('eggbotreal', 'FixtureUser subscribed with Prime', 'fixture', 'id').tierLabel, 'Prime');
  assert.equal(parseBotAnnouncement('eggbotreal', 'FixtureUser resubscribed with Tier 1 (12 months) CrreamAwk', 'fixture', 'id').supporterMessage, '');
});
test('Dad Joke posts and commands are excluded in plain and ACTION messages', () => {
  for (const text of ['Dad Joke: Something funny', '😂 Dad Joke: A test joke', ' dad joke : Another joke ', '!socials', '!Disabled', '!donate', '  !game ', '']) {
    for (const message of [text, '\x01ACTION ' + text + '\x01']) assert.equal(parseBotAnnouncement('eggbotreal', message, 'fixture', 'id'), null);
  }
  const e = parseBotAnnouncement('eggbotreal', 'FixtureViewer redeemed a reward!', 'fixture', 'id');
  assert.equal(e.kind, 'bot');assert.equal(e.username,'eggbotreal');assert.equal(e.botText,'FixtureViewer redeemed a reward!');
});

test('configured disability command response is excluded without storing personal reply text', () => {
  const prefix = ['I have', 'quadriplegic', 'cerebral palsy'].join(' ');
  assert.equal(parseBotAnnouncement('eggbotreal', prefix + ', test explanation.', 'fixture', 'id'), null);
  assert.equal(parseBotAnnouncement('eggbotreal', '\x01ACTION ' + prefix + ', test explanation.\x01', 'fixture', 'id'), null);
});
test('bot message IDs persist for duplicate suppression without merging distinct gifts', () => {
  const saved = new Map(); const disk = { getItem:k=>saved.get(k), setItem:(k,v)=>saved.set(k,v) };
  const store = new Store(disk, 'fixture');
  const event = id => parseBotAnnouncement('eggbotreal', examples[1][0], 'fixture', id);
  assert.equal(store.add(event('a')), true); assert.equal(new Store(disk, 'fixture').add(event('a')), false);
  assert.equal(store.add(event('b')), true); assert.equal(store.data.events.length, 2);
});
test('chat ingestion handles batched IRC lines before normal bot exclusion', () => {
  const html = fs.readFileSync(require('node:path').join(__dirname, '../chat.html'), 'utf8');
  const core = fs.readFileSync(require('node:path').join(__dirname, '../chat-core.js'), 'utf8');
  const connectCode = html.slice(html.indexOf('function connect(rawCh)'), html.indexOf("document.addEventListener('visibilitychange'"));
  let socket; const received = [], added = [], sent = [];
  const context = vm.createContext({ localStorage:{getItem:()=>null}, clearTimeout(){},setTimeout(){},console:{log(){},warn(){}},
    WebSocket:class {constructor(){socket=this;this.readyState=1;} send(s){sent.push(s);} close(){}},
    window:{StreamNotifications:{connect(){},chatStatus(){},receiveChat:(...args)=>received.push(args)}},
    setStatus(){},updateSuggestEnabled(){},clearEmptyMsg(){},addChatDivider(){},addMsg:(...args)=>added.push(args),
    alert(){},ws:null,reconnectTimer:null,currentChannel:'',isConnected:false,everConnected:false });
  vm.runInContext(core.slice(core.indexOf('function parseIrcMsg('), core.indexOf('// ── SPEECH ──')), context);
  vm.runInContext(connectCode + "\nconnect('fixture');", context); socket.onopen();
  assert.ok(sent.includes('CAP REQ :twitch.tv/tags twitch.tv/commands'));
  const lines = examples.map(([text], i)=> i === 0
    ? `@id=fixture-${i};tmi-sent-ts=1792324800000 :eggbotreal!eggbotreal@eggbotreal.tmi.twitch.tv PRIVMSG #fixture :\x01ACTION ${text}\x01`
    : `@id=fixture-${i};login=eggbotreal;msg-id=announcement;tmi-sent-ts=1792324800000 :tmi.twitch.tv USERNOTICE #fixture :${text}`);
  socket.onmessage({data: 'PING :tmi.twitch.tv\r\n' + lines.join('\r\n') + '\r\n'});
  assert.equal(received.length, 5); assert.equal(added.length, 5); assert.ok(sent.includes('PONG :tmi.twitch.tv'));
  assert.equal(received[0][3], 'fixture-0');
  assert.equal(received[0][4], '2026-10-18T12:00:00.000Z');
  assert.equal(received.map(args=>parseBotAnnouncement(...args)).filter(Boolean).length,5);
  socket.onmessage({data:'@id=reply;reply-parent-msg-body=!Disabled\\splease :eggbotreal!eggbotreal@eggbotreal.tmi.twitch.tv PRIVMSG #fixture :Command reply text'});
  assert.equal(received.at(-1)[5],true);
});
test('generic bot messages provide their original text to AI without treating the bot as a supporter', async () => {
  const saved = new Map([['streamaac_notifications_v1:fixture',JSON.stringify({events:[],mode:'ai',mappings:{}})]]);
  let request;const elements=new Map();
  const context=vm.createContext({
    document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',setAttribute(){},replaceChildren(){}});return elements.get(id);}},
    addEventListener(){},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},
    loadPhrases:()=>[],clearTimeout(){},setTimeout(){},AbortController,PROXY_URL:'https://fixture.invalid',
    fetch:async(_,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({content:[{text:'{"responses":["That is exciting!"]}'}]})};}
  });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../notifications.js'),'utf8'),context);
  await context.StreamNotifications.connect('fixture');
  context.StreamNotifications.receiveChat('eggbotreal','A stream goal was reached!','fixture','generic-ai');
  await new Promise(setImmediate);
  assert.match(request.messages[0].content,/A stream goal was reached!/);assert.match(request.messages[0].content,/Do not address or thank eggbotreal/);
  assert.equal(JSON.parse(saved.get('streamaac_notifications_v1:fixture')).events[0].response,'That is exciting!');
});
test('bot notifications work without a Twitch token or AI request and respect the channel setting', async () => {
  const path = require('node:path'); const saved = new Map(); const elements = new Map(); let requests = 0;
  const context = vm.createContext({
    document:{addEventListener(){},getElementById(id){if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',setAttribute(){},replaceChildren(){}});return elements.get(id);}},
    addEventListener(){},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},
    loadPhrases:()=>[],clearTimeout(){},setTimeout(){},fetch(){requests++;throw Error('Must not request services');}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../notifications.js'),'utf8'),context);
  await context.StreamNotifications.connect('fixture');
  context.StreamNotifications.receiveChat('eggbotreal',examples[0][0],'fixture','one');
  context.StreamNotifications.receiveChat('eggbotreal',examples[0][0],'otherchannel','two');
  context.StreamNotifications.receiveChat('eggbotreal','A stream goal was reached!','fixture','generic');
  context.StreamNotifications.receiveChat('eggbotreal','Dad Joke: Skip this','fixture','joke');
  context.StreamNotifications.receiveChat('eggbotreal','!socials','fixture','command');
  context.StreamNotifications.receiveChat('eggbotreal','Here are the social links.','fixture','command-reply',undefined,true);
  const record = JSON.parse(saved.get('streamaac_notifications_v1:fixture'));
  assert.equal(record.events.length,2);assert.equal(requests,0);assert.match(record.events[0].response,/FixtureUser/);
  assert.equal(record.events[1].botText,'A stream goal was reached!');assert.equal(record.events[1].response,'Thanks for letting me know!');
  record.botAnnouncements=false;saved.set('streamaac_notifications_v1:fixture',JSON.stringify(record));
  await context.StreamNotifications.connect('otherchannel');await context.StreamNotifications.connect('fixture');
  context.StreamNotifications.receiveChat('eggbotreal',examples[0][0],'fixture','three');
  assert.equal(JSON.parse(saved.get('streamaac_notifications_v1:fixture')).events.length,2);
});
test('announcement parsing verifies USERNOTICE type and sender login rather than display name', () => {
  const core = fs.readFileSync(require('node:path').join(__dirname,'../chat-core.js'),'utf8');
  const context = vm.createContext({});
  vm.runInContext(core.slice(core.indexOf('function parseIrcMsg('),core.indexOf('// ── SPEECH ──')),context);
  const line = tags => `@${tags} :tmi.twitch.tv USERNOTICE #fixture :FixtureUser subscribed with Prime.`;
  assert.equal(context.parseIrcMsg(line('msg-id=sub;login=eggbotreal')),null);
  assert.equal(context.parseIrcMsg(line('msg-id=announcement;display-name=eggbotreal')),null);
  const spoof = context.parseIrcMsg(line('msg-id=announcement;login=viewer;display-name=eggbotreal'));
  assert.equal(spoof.user,'viewer');assert.equal(parseBotAnnouncement(spoof.user,spoof.text,'fixture','id'),null);
  const real = context.parseIrcMsg(line('msg-id=announcement;login=eggbotreal;emotes='));
  assert.equal(parseBotAnnouncement(real.user,real.text,'fixture','id').kind,'subscribe');
});
