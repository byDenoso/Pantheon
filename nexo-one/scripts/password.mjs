import {randomBytes,scryptSync} from 'node:crypto';

const pinMode=process.argv.slice(2).includes('--pin');
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.trimEnd();
if(pinMode){
  if(!/^\d{4,12}$/.test(password))throw new Error('Use um PIN numérico de 4 a 12 dígitos.');
}else if(password.length<16)throw new Error('Use pelo menos 16 caracteres.');
const salt=randomBytes(16).toString('hex');
console.log(`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`);
