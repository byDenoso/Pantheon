const byId=id=>document.getElementById(id);
const DRIVE_PROFILE='drive_readonly',SHEETS_PROFILE='sheets_spool_write';
let driveCsrfToken='',sheetsCsrfToken='',canVerify=false,canVerifySheets=false,busy=false,startPending=false,expiryTimer;
const messages={
  AUTH_REQUIRED:'Entre novamente na sessão privada do NEXO.',
  GOOGLE_CONSENT_CONFIGURATION_MISMATCH:'Esta conexão só está disponível no servidor de produção e no vínculo de proprietário configurado.',
  GOOGLE_RUNTIME_IDENTITY_REQUIRED:'O servidor ainda não recebeu sua identidade Vercel. A conexão não foi iniciada.',
  GOOGLE_CONSENT_START_UNCERTAIN:'A resposta da Vercel Connect ficou incerta. A solicitação pode ter sido iniciada; aguarde a preparação expirar antes de tentar novamente.',
  CONSENT_ALREADY_PENDING:'Uma confirmação já está pendente. Termine o fluxo aberto ou aguarde até 10 minutos e atualize esta página.',
  CSRF_INVALID_OR_EXPIRED:'A preparação expirou. Atualize esta página para tentar novamente.',
  CONSENT_RETURN_REQUIRED:'Conclua a confirmação do Google e aguarde a volta a esta página.',
  CONSENT_PROFILE_MISMATCH:'A confirmação retornou para outro perfil. Atualize a página antes de verificar.',
  CONSENT_PROFILE_INVALID:'O perfil selecionado não é válido. Atualize esta página.',
  CONSENT_PROFILE_APPROVAL_MISMATCH:'A confirmação não corresponde ao perfil selecionado. Atualize esta página.',
  SHEETS_WRITE_CONSENT_REQUIRED:'Marque a autorização específica de Drive + Sheets antes de continuar.',
  GOOGLE_USER_AUTHORIZATION_REQUIRED:'O Google ainda não autorizou os escopos para este vínculo. Conclua a confirmação e confira novamente.',
  GOOGLE_AUTHORIZATION_DENIED:'A Vercel Connect recusou esta autorização. O acesso precisa ser revisado pelo proprietário.',
  GOOGLE_RATE_LIMITED:'O provedor pediu uma pausa. Tente novamente mais tarde.',
  DRIVE_CANONICAL_READBACK_FAILED:'A leitura ainda não confirmou a Tower canônica. A conexão não foi considerada verificada.',
  SHEETS_SPOOL_READBACK_FAILED:'A leitura segura do spool não foi confirmada. Nenhuma linha foi acrescentada.',
  GOOGLE_CONNECTION_UNAVAILABLE:'A conexão não respondeu como esperado. Nenhum resultado do piloto foi confirmado.'
};
function error(message=''){byId('error').textContent=message;byId('error').hidden=!message;}
function setBusy(value){
  busy=value;
  for(const id of ['start','sheets-start'])byId(id).disabled=value||startPending;
  byId('verify').disabled=value||!canVerify;
  byId('sheets-verify').disabled=value||!canVerifySheets;
  byId('login-form').querySelector('button').disabled=value;
}
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
  driveCsrfToken=data.csrfTokens?.[DRIVE_PROFILE]||data.csrfToken;
  sheetsCsrfToken=data.csrfTokens?.[SHEETS_PROFILE]||'';
  canVerify=data.canVerify===true;canVerifySheets=data.canVerifySheetsWrite===true;startPending=data.pending===true;
  byId('login-section').hidden=true;byId('consent-section').hidden=false;byId('sheets-section').hidden=false;
  byId('verify').disabled=!canVerify;byId('sheets-verify').disabled=!canVerifySheets;
  for(const id of ['start','sheets-start'])byId(id).disabled=startPending;
  if(data.returnProfile===SHEETS_PROFILE)byId('status').textContent='Confirmação retornou. Confira a leitura da Tower e do spool; nenhuma linha será gravada nesta verificação.';
  else if(canVerify)byId('status').textContent='Confirmação retornou. Confira a leitura da Tower para validar o acesso.';
  else byId('status').textContent='Sessão privada ativa. Escolha um perfil e confirme explicitamente os escopos antes de iniciar.';
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
async function startConsent({formId,profile,checkboxId,approveKey,linkId,expiryId}){
  byId(formId).addEventListener('submit',async event=>{
    event.preventDefault();if(busy||startPending)return;setBusy(true);error();
    byId(linkId).hidden=true;canVerify=false;canVerifySheets=false;
    try{
      const data=await request('/api/google-drive-consent',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'start',profile,csrfToken:profile===SHEETS_PROFILE?sheetsCsrfToken:driveCsrfToken,[approveKey]:byId(checkboxId).checked})});
      const url=new URL(data.authorizationUrl);
      if(url.origin!=='https://connect.vercel.com')throw new Error('A conexão devolveu um destino inesperado.');
      byId(linkId).href=data.authorizationUrl;byId(linkId).hidden=false;startPending=true;
      byId('status').textContent=profile===SHEETS_PROFILE
        ?'Abra a confirmação. Confira a conta e os escopos de leitura do Drive e leitura/escrita de planilhas antes de aceitar.'
        :'Abra a confirmação do Google. Confira a conta e a permissão somente de leitura antes de aceitar.';
      byId(expiryId).textContent='O link expira em até 10 minutos.';byId(expiryId).hidden=false;
      clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{byId(linkId).hidden=true;byId(expiryId).textContent='O link expirou. Atualize esta página para preparar uma nova confirmação.';},Math.max(0,data.expiresAt-Date.now()));
    }catch(e){error(e.message);}
    finally{setBusy(false);}
  });
}
void startConsent({formId:'consent-form',profile:DRIVE_PROFILE,checkboxId:'approve',approveKey:'approveReadOnly',linkId:'authorization',expiryId:'expiry'});
void startConsent({formId:'sheets-consent-form',profile:SHEETS_PROFILE,checkboxId:'sheets-approve',approveKey:'approveSheetsWrite',linkId:'sheets-authorization',expiryId:'sheets-expiry'});
byId('verify').addEventListener('click',async()=>{
  if(busy||!canVerify)return;setBusy(true);error();
  try{
    const data=await request('/api/google-drive-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',profile:DRIVE_PROFILE,csrfToken:driveCsrfToken})});
    if(data.status!=='DRIVE_VERIFIED'||data.readback!=='PASS')throw new Error('A leitura ainda não foi confirmada.');
    byId('status').textContent='Leitura da Tower verificada. Revisão: '+data.towerRevision+'. O piloto de soma ainda requer execução e recibo.';
    canVerify=false;
  }catch(e){error(e.message);}
  finally{setBusy(false);}
});
byId('sheets-verify').addEventListener('click',async()=>{
  if(busy||!canVerifySheets)return;setBusy(true);error();
  try{
    const data=await request('/api/google-drive-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'verify',profile:SHEETS_PROFILE,csrfToken:sheetsCsrfToken})});
    if(data.status!=='SHEETS_SPOOL_READ_VERIFIED'||data.spoolReadback!=='PASS'||data.writePerformed!==false)throw new Error('A leitura segura do spool ainda não foi confirmada.');
    byId('status').textContent='Leituras da Tower e do spool verificadas. Nenhuma gravação foi executada; o acesso de escrita não foi testado.';
    canVerifySheets=false;
  }catch(e){error(e.message);}
  finally{setBusy(false);}
});
void initialize();
