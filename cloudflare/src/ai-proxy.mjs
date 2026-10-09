import {AI_PROVIDERS,STORED_KEY} from './private-settings.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const defaults={gemini:'gemini-2.0-flash',anthropic:'claude-haiku-4-5',groq:'llama-3.3-70b-versatile',openrouter:'google/gemini-2.0-flash-001',deepseek:'deepseek-chat'};
export async function aiText(value,request,{admin=false,fetchImpl=globalThis.fetch}={}){
  const {provider,messages}=request||{},cfg=value?.sections?.__ia_config||{};
  if(!AI_PROVIDERS.includes(provider)||!Array.isArray(messages)||!messages.length||messages.length>80||messages.some(message=>!['system','user','assistant'].includes(message?.role)||typeof message.content!=='string')||JSON.stringify(messages).length>300000)fail(400,'Peticion de IA invalida');
  if(cfg.disabled?.includes(provider))fail(400,'Proveedor desactivado por administracion');
  const override=typeof request.key==='string'&&request.key&&request.key!==STORED_KEY?request.key:null;
  if(override&&!admin)fail(403,'Solo administracion puede probar otra clave');
  const key=override||cfg.keys?.[provider]||(cfg.provider===provider?cfg.key:'');if(!key)fail(400,'Proveedor sin clave configurada');
  const savedModel=cfg.models?.[provider]||(cfg.provider===provider?cfg.model:'')||defaults[provider];
  const model=admin&&request.model?request.model:savedModel;
  if(typeof model!=='string'||model.length>160||!/^[\w.:/-]+$/.test(model))fail(400,'Modelo no admitido');
  const headers={'Content-Type':'application/json'},system=messages.filter(message=>message.role==='system').map(message=>message.content).join('\n\n');let url,payload;
  if(provider==='gemini'){
    url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent';headers['x-goog-api-key']=key;
    payload={contents:messages.filter(message=>message.role!=='system').map(message=>({role:message.role==='assistant'?'model':'user',parts:[{text:message.content}]})),generationConfig:{temperature:0.6,maxOutputTokens:4096,responseMimeType:'application/json'}};
    if(system)payload.systemInstruction={parts:[{text:system}]};
  }else if(provider==='anthropic'){
    url='https://api.anthropic.com/v1/messages';headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    payload={model,max_tokens:8000,messages:messages.filter(message=>message.role!=='system')};if(system)payload.system=system;
  }else{
    url={groq:'https://api.groq.com/openai/v1/chat/completions',openrouter:'https://openrouter.ai/api/v1/chat/completions',deepseek:'https://api.deepseek.com/chat/completions'}[provider];
    headers.Authorization='Bearer '+key;payload={model,messages,temperature:0.6,max_tokens:provider==='groq'?2500:4096};if(provider==='groq')payload.response_format={type:'json_object'};
  }
  let response;try{response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(120000)});}catch(_error){fail(503,'El proveedor no ha respondido; no se ha guardado ningun menu');}
  if(!response.ok)fail(response.status>=400&&response.status<600?response.status:502,provider+' '+response.status+': peticion rechazada por el proveedor');
  let result;try{result=await response.json();}catch(_error){fail(502,'Respuesta de IA no valida');}
  const text=provider==='gemini'?result.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join(''):provider==='anthropic'?result.content?.filter(part=>part.type==='text').map(part=>part.text).join(''):result.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text||text.length>1000000)fail(502,'La IA no ha devuelto un texto valido');
  return text;
}
