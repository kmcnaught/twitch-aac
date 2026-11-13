const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('proxy settings save token globally, preserve valid settings on invalid edits, and clear both',()=>{
 const values=new Map(),elements=new Map(),offered=[];let save;
 function PasswordCredential(value){Object.assign(this,value);}
 const document={documentElement:{setAttribute(){},getAttribute(){return 'dark'}},getElementById(id){if(id==='game-phrase-manager')return null;if(!elements.has(id))elements.set(id,{value:'',textContent:'',setCustomValidity(){},addEventListener(name,fn){if(id==='proxy-settings-form')save=()=>fn({preventDefault(){}});}});return elements.get(id);}};
 const ctx=vm.createContext({URL,document,PasswordCredential,navigator:{credentials:{store(credential){offered.push(credential);return Promise.reject(new Error('Browser declined'));}}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},window:{isSecureContext:true,PasswordCredential,addEventListener(name,fn){if(name==='DOMContentLoaded')this.callbacks.push(fn)},callbacks:[]}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../chat-core.js'),'utf8'),ctx);
 const html=fs.readFileSync(path.join(__dirname,'../settings.html'),'utf8');
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if (!m[1].includes('let elVoices')) vm.runInContext(m[1],ctx);
 for(const fn of ctx.window.callbacks)fn();
 const url=elements.get('service-proxy-input'),token=elements.get('service-proxy-token');
 url.value='https://fixture.invalid';token.value='fixture-only-not-a-real-token';save();
 assert.equal(values.get('service_proxy_token'),token.value);
 assert.equal(offered.length,1);assert.equal(offered[0].id,url.value);assert.equal(offered[0].password,token.value);
 assert.equal(ctx.getProxyHeaders().Authorization,'Bearer '+token.value);
 assert.equal(ctx.getProxyHeaders(false)['Content-Type'],undefined);
 url.value='http://invalid.example';save();assert.equal(values.get('service_proxy_url'),'https://fixture.invalid');
 url.value='';save();assert.equal(values.has('service_proxy_url'),false);assert.equal(values.has('service_proxy_token'),false);assert.equal(ctx.getProxyHeaders().Authorization,undefined);assert.equal(offered.length,1);
});

