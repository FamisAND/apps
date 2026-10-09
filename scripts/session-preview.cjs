const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const port=Number(process.env.PORT||8788);
const admin={id:'root-admin',name:'Administrador de prueba',email:'admin@example.test',role:'admin',active:true,permissions:[]};
const users=[admin,{id:'trainer-demo',name:'Entrenador de prueba',email:'trainer@example.test',role:'user',active:true,permissions:['training_online']}];
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/session')return json(res,{user:admin,modules:{},heartbeatSeconds:25,writesEnabled:false});
  if(url.pathname==='/api/admin/users'&&req.method==='GET')return json(res,{users});
  if(url.pathname==='/api/admin/sessions')return json(res,{sessions:[{id:'demo-session',name:'Entrenador de prueba',email:'trainer@example.test',created_at:Math.floor(Date.now()/1000)-600,last_seen:Math.floor(Date.now()/1000),expires_at:Math.floor(Date.now()/1000)+3600,revoked:0,valid_version:1}]});
  if(url.pathname.startsWith('/api/'))return json(res,{error:'Vista aislada: cambios administrativos no conectados'},423);
  const name=url.pathname.slice(1)||'session-admin.html';
  if(!['session-admin.html','session-admin.js','app-session.js'].includes(name)){res.writeHead(404);return res.end();}
  let content=fs.readFileSync(path.join(root,name),'utf8');
  if(name.endsWith('.html'))content=content.replace('<head>','<head><script src="app-session.js"></script>');
  res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html':'text/javascript','Cache-Control':'no-store'});res.end(content);
});
module.exports=server;
if(require.main===module)server.listen(port,'127.0.0.1',()=>console.log(`Preview UI only; synthetic data; no production access: http://127.0.0.1:${port}/session-admin.html`));
