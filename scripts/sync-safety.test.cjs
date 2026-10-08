const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(path.join(__dirname,'..','github-sync.js'),'utf8');
let browser,server,origin;
test.before(async()=>{
  server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/github-sync.js'?'text/javascript':'text/html');res.end(req.url==='/github-sync.js'?source:'<!doctype html><html><body><button id="ghSyncBadge"></button></body></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,channel:'msedge'});
});
test.after(async()=>{await browser?.close();await new Promise(resolve=>server.close(resolve));});
async function fixture(){
  const context=await browser.newContext({serviceWorkers:'block'});
  const state={remote:{training_online:{tob_online_v2:{clientes:[{id:'A',nota:'original'}],plantillas:[]}},options:{ot_cfg:{keep:true}}},sha:1,puts:0,fail:false,conflict:false};
  await context.route('https://api.github.com/**',async route=>{
    const req=route.request();
    if(req.method()==='PUT'){
      state.puts++;
      if(state.delay)await state.delay;
      if(state.fail)return route.fulfill({status:500,body:'synthetic failure'});
      if(state.conflict){state.conflict=false;state.remote.options.ot_cfg.concurrent=true;state.sha++;return route.fulfill({status:409,body:'synthetic race'});}
      const value=req.postDataJSON();if(value.sha!=='sha-'+state.sha)return route.fulfill({status:409,body:'SHA mismatch'});
      state.remote=JSON.parse(Buffer.from(value.content,'base64').toString('utf8'));state.sha++;
      return route.fulfill({json:{content:{sha:'sha-'+state.sha}}});
    }
    return route.fulfill({json:{sha:'sha-'+state.sha,content:Buffer.from(JSON.stringify(state.remote)).toString('base64')}});
  });
  async function load(page){await page.goto(origin);await page.addScriptTag({url:origin+'/github-sync.js'});await page.evaluate(()=>GitHubSync.setupCredentials({repo:'fixture/data',token:'SYNTHETIC'}));}
  const page=await context.newPage();await load(page);await page.evaluate(()=>GitHubSync.pullAndApplyAll());await load(page);
  await page.evaluate(()=>{GitHubSync.setStatusElement(document.getElementById('ghSyncBadge'));GitHubSync.attach({section:'training_online',keys:['tob_online_v2']});GitHubSync.enableAutoPush();});
  return {context,page,state,load};
}
test('normal save preserves other modules and current IDs',async()=>{
  const f=await fixture();try{
    await f.page.evaluate(async()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='edited';localStorage.setItem('tob_online_v2',JSON.stringify(db));await GitHubSync.flush();});
    assert.equal(f.state.remote.training_online.tob_online_v2.clientes[0].nota,'edited');assert.equal(f.state.remote.options.ot_cfg.keep,true);
  }finally{await f.context.close();}
});
test('stale section cannot overwrite remote edits',async()=>{
  const f=await fixture();try{
    f.state.remote.training_online.tob_online_v2.clientes[0].nota='remote edit';f.state.sha++;
    const error=await f.page.evaluate(async()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='local edit';localStorage.setItem('tob_online_v2',JSON.stringify(db));try{await GitHubSync.flush();return null;}catch(e){return e.syncConflict;}});
    assert.equal(error,true);assert.equal(f.state.puts,0);assert.equal(f.state.remote.training_online.tob_online_v2.clientes[0].nota,'remote edit');
  }finally{await f.context.close();}
});
test('failed upload blocks manual download and keeps local work',async()=>{
  const f=await fixture();try{
    f.state.fail=true;
    await f.page.evaluate(async()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='unsent';localStorage.setItem('tob_online_v2',JSON.stringify(db));await GitHubSync.manualResync();});
    assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('tob_online_v2')).clientes[0].nota),'unsent');
  }finally{await f.context.close();}
});
test('409 for another module preserves its latest values',async()=>{
  const f=await fixture();try{
    f.state.conflict=true;
    await f.page.evaluate(async()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='edited';localStorage.setItem('tob_online_v2',JSON.stringify(db));await GitHubSync.flush();});
    assert.equal(f.state.remote.options.ot_cfg.concurrent,true);assert.equal(f.state.remote.training_online.tob_online_v2.clientes[0].nota,'edited');
  }finally{await f.context.close();}
});
test('configuration conflict retry never restores unrelated sections',async()=>{
  const f=await fixture();try{f.state.conflict=true;await f.page.evaluate(()=>GitHubSync.updateSecuritySection(value=>({...value,test:true})));assert.equal(f.state.remote.options.ot_cfg.concurrent,true);}finally{await f.context.close();}
});
test('two tabs cannot replace each other through localStorage',async()=>{
  const f=await fixture();try{
    const second=await f.context.newPage();await f.load(second);await second.evaluate(()=>{GitHubSync.attach({section:'training_online',keys:['tob_online_v2']});GitHubSync.enableAutoPush();});
    await f.page.evaluate(()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='first tab';localStorage.setItem('tob_online_v2',JSON.stringify(db));});
    const blocked=await second.evaluate(()=>{try{localStorage.setItem('tob_online_v2',JSON.stringify({clientes:[]}));return false;}catch(e){return !!e.syncConflict;}});
    assert.equal(blocked,true);assert.equal(await second.evaluate(()=>JSON.parse(localStorage.getItem('tob_online_v2')).clientes[0].nota),'first tab');
  }finally{await f.context.close();}
});
test('flush waits for an existing upload',async()=>{
  const f=await fixture();try{
    let release;f.state.delay=new Promise(resolve=>release=resolve);
    await f.page.evaluate(()=>{const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='in flight';localStorage.setItem('tob_online_v2',JSON.stringify(db));window.finished=false;window.first=GitHubSync.flush();window.second=GitHubSync.flush().then(()=>window.finished=true);});
    assert.equal(await f.page.evaluate(()=>window.finished),false);release();await f.page.evaluate(()=>Promise.all([window.first,window.second]));assert.equal(await f.page.evaluate(()=>window.finished),true);
  }finally{await f.context.close();}
});
test('legacy cleanup does not delete large old keys',async()=>{
  const f=await fixture();try{await f.page.evaluate(()=>localStorage.setItem('recetas','x'.repeat(110000)));await f.load(f.page);assert.equal(await f.page.evaluate(()=>localStorage.getItem('recetas').length),110000);}finally{await f.context.close();}
});
test('catalog conflicts cannot be decided by one global timestamp',async()=>{
  const f=await fixture();try{
    const result=await f.page.evaluate(async()=>{try{await GitHubSync.reconcileCatalog({recetas:[{id:'r',nombre:'local'}],_syncTs:999},{recetas:[{id:'r',nombre:'remote'}],_syncTs:1});return false;}catch(e){return !!e.syncConflict;}});assert.equal(result,true);
  }finally{await f.context.close();}
});
test('snapshot quota error prevents remote write',async()=>{
  const f=await fixture();try{
    await f.page.evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('synthetic quota','QuotaExceededError');};const db=JSON.parse(localStorage.getItem('tob_online_v2'));db.clientes[0].nota='pending';localStorage.setItem('tob_online_v2',JSON.stringify(db));});
    const failed=await f.page.evaluate(async()=>{try{await GitHubSync.flush();return false;}catch(e){return true;}});assert.equal(failed,true);assert.equal(f.state.puts,0);
  }finally{await f.context.close();}
});

test('legacy archive verifies both values, remains exportable, and can be restored',async()=>{
  const f=await fixture();try{
    const result=await f.page.evaluate(async()=>{
      localStorage.setItem('ot_images','synthetic image data');
      localStorage.setItem('__gh_sync_lastgood','synthetic prior backup');
      const count=await GitHubSync.archiveLegacyStorage();
      const records=await GitHubSync.readLegacyArchive();
      const removed=localStorage.getItem('ot_images')===null&&localStorage.getItem('__gh_sync_lastgood')===null;
      const images=records.find(r=>r.key==='ot_images');
      await GitHubSync.restoreLegacyStorage(images.key,images.sha256);
      return {count,removed,archived:records.map(r=>r.raw).sort(),restored:localStorage.getItem('ot_images')};
    });
    assert.equal(result.count,2);assert.equal(result.removed,true);
    assert.deepEqual(result.archived,['synthetic image data','synthetic prior backup']);
    assert.equal(result.restored,'synthetic image data');
  }finally{await f.context.close();}
});

test('archive failure preserves both original localStorage values',async()=>{
  const f=await fixture();try{
    const result=await f.page.evaluate(async()=>{
      localStorage.setItem('ot_images','image draft');localStorage.setItem('__gh_sync_lastgood','old backup');
      const native=IDBObjectStore.prototype.put;let writes=0;
      IDBObjectStore.prototype.put=function(...args){if(++writes===2)throw new DOMException('synthetic quota','QuotaExceededError');return native.apply(this,args);};
      let failed=false;try{await GitHubSync.archiveLegacyStorage();}catch(e){failed=true;}
      return {failed,images:localStorage.getItem('ot_images'),backup:localStorage.getItem('__gh_sync_lastgood')};
    });
    assert.equal(result.failed,true);assert.equal(result.images,'image draft');assert.equal(result.backup,'old backup');
  }finally{await f.context.close();}
});

test('legacy restoration refuses to overwrite an existing different value',async()=>{
  const f=await fixture();try{
    const result=await f.page.evaluate(async()=>{
      localStorage.setItem('ot_images','older images');await GitHubSync.archiveLegacyStorage();
      const record=(await GitHubSync.readLegacyArchive())[0];localStorage.setItem('ot_images','newer images');
      let blocked=false;try{await GitHubSync.restoreLegacyStorage(record.key,record.sha256);}catch(e){blocked=!!e.syncConflict;}
      return {blocked,current:localStorage.getItem('ot_images'),preserved:(await GitHubSync.readLegacyArchive())[0].raw};
    });
    assert.equal(result.blocked,true);assert.equal(result.current,'newer images');assert.equal(result.preserved,'older images');
  }finally{await f.context.close();}
});

test('archived copies have a visible recovery and export dialog',async()=>{
  const f=await fixture();try{
    await f.page.evaluate(async()=>{localStorage.setItem('ot_images','synthetic');await GitHubSync.archiveLegacyStorage();await GitHubSync.openRecoveryArchive();});
    assert.equal(await f.page.getByRole('dialog').count(),1);
    assert.equal(await f.page.getByRole('button',{name:'Exportar datos y archivo'}).count(),1);
    assert.equal(await f.page.getByRole('button',{name:'Recuperar copia local'}).count(),1);
    await f.page.getByRole('button',{name:'Cerrar',exact:true}).click();
    assert.equal(await f.page.getByRole('dialog').count(),0);
  }finally{await f.context.close();}
});
