import {randomBytes,scryptSync} from 'node:crypto';
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.trimEnd();if(password.length<16)throw new Error('Use pelo menos 16 caracteres.');
const salt=randomBytes(16).toString('hex');console.log(`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`);
