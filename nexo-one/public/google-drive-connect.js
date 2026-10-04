const byId=id=>document.getElementById(id);
let csrfToken='',canVerify=false,busy=false,startPending=false,expiryTimer;
const messages={
  AUTH_REQUIRED:'Entre novamente na sessão privada do NEXO.',
  GOOGLE_CONSENT_CONFIGURATION_MISMATCH:'Esta conexão só está disponível no servidor de produção e no vínculo de proprietário configurado.',
  GOOGLE_RUNTIME_IDENTITY_REQUIRED:'O servidor ainda não recebeu sua identidade Vercel. A conexão não foi iniciada.',
  GOOGLE_CONSENT_START_UNCERTAIN:'A resposta da Vercel Connect ficou incerta. A solicitação pode ter sido iniciada; aguarde a preparação expirar antes de tentar novamente.',
  CONSENT_ALREADY_PENDING:'Uma confirmação já está pendente. Termine o fluxo aberto ou aguarde até 10 minutos e atualize esta página.',
  CSRF_INVALID_OR_EXPIRED:'A preparação expirou. Atualize esta página para tentar novamente.',
  CONSENT_RETURN_REQUIRED:'Conclua a confirmação do Google e aguarde a volta a esta página.',
  GOOGLE_USER_AUTHORIZATION_REQUIRED:'O Google ainda não autorizou a leitura para este vínculo. Conclua a confirmação e confira novamente.',
  GOOGLE_AUTHORIZATION_DENIED:'A Vercel Connect recusou esta autorização. O acesso precisa ser revisado pelo proprietário.',
  GOOGLE_RATE_LIMITED:'O provedor pediu uma pausa. Tente novamente mais tarde.',
  DRIVE_CANONICAL_READBACK_FAILED:'A leitura ainda não confirmou a Tower canônica. A conexão não foi considerada verificada.',
  GOOGLE_CONNECTION_UNAVAILABLE:'A conexão não respondeu como esperado. Nenhum resultado do piloto foi confirmado.'
};
function error(message=''){byId('error').textContent=message;byId('error').hidden=!message;}
function setBusy(value){busy=value;byId('start').disabled=value||startPending;byId('verify').disabled=value||!canVerify;byId('login-form').querySelector('button').disabled=value;}
async function request(url,options={}){
  const response=await fetch(url,{...options,credentials:'same-origin',cache:'no-store',redirect:'error'});
  const data=await response.json();
  if(!response.ok){
    if(data?.error==='GOOGLE_CONSENT_START_UNCERTAIN'||data?.error==='CONSENT_ALREADY_PENDING')startPending=true;
    throw new Error(messages[data?.error]||'Não foi possível concluir esta etapa.');
  }
  return data;
}
async function prepare(){
  const data=await request('/api/google-drive-consent');
  csrfToken=data.csrfToken;canVerify=data.canVerify===true;startPending=data.pending===true;
  byId('login-section').hidden=true;byId('consent-section').hidden=false;
  byId('status').textContent=canVerify?'Confirmação retornou. Confira a leitura da Tower para validar o acesso.':'Sessão privada ativa. A conexão aguarda sua confirmação.';
  byId('verify').disabled=!canVerify;
  byId('start').disabled=startPending;
  if(data.startUncertain)error(messages.GOOGLE_CONSENT_START_UNCERTAIN);
  else if(startPending)byId('status').textContent='Uma confirmação já está pendente. Termine o fluxo aberto ou aguarde a preparação expirar.';
}
async function initialize(){
  try{
    const state=await request('/api/session');
    if(state.authenticated){await prepare();return;}
    byId('status').textContent='Entre na sessão privada para preparar a conexão.';
    byId('login-section').hidden=false;
  }catch(e){byId('status').textContent='Preparação indisponível.';error(e.message);}
}
byId('login-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);error();
  const password=byId('password').value;byId('password').value='';
  try{await request('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});await prepare();}
  catch(e){error(e.message);}
  finally{setBusy(false);}
});
byId('consent-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;setBusy(true);error();
  byId('authorization').hidden=true;canVerify=false;
  try{
    const data=await request('/api/google-drive-consent',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'start',csrfToken,approveReadOnly:byId('approve').checked})});
    const url=new URL(data.authorizationUrl);
    if(url.origin!=='https://connect.vercel.com')throw new Error('A conexão devolveu um destino inesperado.');
    byId('authorization').href=data.authorizationUrl;byId('authorization').hidden=false;startPending=true;
    byId('status').textContent='Abra a confirmação do Google. Confira a conta e as permissões antes de aceitar.';
    byId('expiry').textContent='O link expira em até 10 minutos.';byId('expiry').hidden=false;
    clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{byId('authorization').hidden=true;byId('expiry').textContent='O link expirou. Atualize esta página para preparar uma nova confirmação.';},Math.max(0,data.expiresAt-Date.now()));
  }catch(e){error(e.message);}
  finally{setBusy(false);}
});
byId('verify').addEventListener('click',async()=>{
  if(busy||!canVerify)return;setBusy(true);error();
  try{
    const data=await request('/api/google-drive-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',csrfToken})});
    if(data.status!=='DRIVE_VERIFIED'||data.readback!=='PASS')throw new Error('A leitura ainda não foi confirmada.');
    byId('status').textContent='Leitura da Tower verificada. Revisão: '+data.towerRevision+'. O piloto de soma ainda requer execução e recibo.';
    canVerify=false;
  }catch(e){error(e.message);}
  finally{setBusy(false);}
});
void initialize();
