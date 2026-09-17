import {randomBytes,scryptSync} from 'node:crypto';
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.trimEnd();
const pinMode=process.argv.includes('--pin');
if(pinMode){
  if(!/^\d{4,12}$/.test(password))throw new Error('PIN deve ter entre 4 e 12 dígitos.');
}else if(password.length<16)throw new Error('Use pelo menos 16 caracteres ou execute com --pin para acesso numérico protegido por rate limit.');
const salt=randomBytes(16).toString('hex');
console.log(`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`);
