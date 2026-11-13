const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function setup(value) {
  const context = vm.createContext({URL, localStorage:{getItem:()=>value},window:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync(path.join(root,'chat-core.js'),'utf8'),context);
  return context;
}
test('proxy has no default and rejects insecure or credential-bearing URLs',()=>{
  for (const url of ['', 'invalid', 'http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid?key=secret', 'https://example.invalid#token']) assert.equal(setup(url).getProxyUrl(),'');
  assert.equal(setup(' https://example.invalid/base/// ').getProxyUrl(),'https://example.invalid/base');
});
test('unconfigured AI and YouTube entry points make no requests', async()=>{
  const html=fs.readFileSync(path.join(root,'chat.html'),'utf8');
  const script=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  let requests=0;
  const context=vm.createContext({getProxyUrl:()=>'',localStorage:{getItem:k=>k==='youtube_video_url'?'https://youtube.com/watch?v=fixture':''},window:{addEventListener(){}},document:{addEventListener(){},documentElement:{setAttribute(){}},getElementById:()=>({style:{}})},fetch(){requests++;throw Error('Unexpected request');},URL,console});
  vm.runInContext(script,context);
  vm.runInContext('updateSuggestEnabled=()=>{};renderPhrasesGrid=()=>{};',context);
  await context.gen();await context.genFromKeywords();await context.loadSuggestedPhrases();await context.connectYouTube();await context.pollYouTubeChat();
  assert.equal(requests,0);
});




