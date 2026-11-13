const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('proxy settings save token globally, preserve valid settings on invalid edits, and clear both',()=>{
 const values=new Map(),elements=new Map();let save;
 const document={documentElement:{setAttribute(){},getAttribute(){return 'dark'}},getElementById(id){if(id==='game-phrase-manager')return null;if(!elements.has(id))elements.set(id,{value:'',textContent:'',setCustomValidity(){},addEventListener(name,fn){if(id==='save-proxy-btn')save=fn;}});return elements.get(id);}};
 const ctx=vm.createContext({URL,document,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},window:{addEventListener(name,fn){if(name==='DOMContentLoaded')this.callbacks.push(fn)},callbacks:[]}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../chat-core.js'),'utf8'),ctx);
 const html=fs.readFileSync(path.join(__dirname,'../settings.html'),'utf8');
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],ctx);
 for(const fn of ctx.window.callbacks)fn();
 const url=elements.get('service-proxy-input'),token=elements.get('service-proxy-token');
 url.value='https://fixture.invalid';token.value='fixture-only-not-a-real-token';save();
 assert.equal(values.get('service_proxy_token'),token.value);
 assert.equal(ctx.getProxyHeaders().Authorization,'Bearer '+token.value);
 assert.equal(ctx.getProxyHeaders(false)['Content-Type'],undefined);
 url.value='http://invalid.example';save();assert.equal(values.get('service_proxy_url'),'https://fixture.invalid');
 url.value='';save();assert.equal(values.has('service_proxy_url'),false);assert.equal(values.has('service_proxy_token'),false);assert.equal(ctx.getProxyHeaders().Authorization,undefined);
});

