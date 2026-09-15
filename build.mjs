import {mkdir,rm,cp,readFile} from 'node:fs/promises';
// Explicit allowlist: backend source, workflows, tests and credentials are never public.
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const f of ['index.html','app.js','affandi.css','afandi-client.js','customer-behavior.js','afandi-client.css','privacy.html','reliability.js','reliability.css','checkout-rails.js','checkout-rails.css','favicon.ico','apple-touch-icon.png','afandi-icon-v1.png','assets','admin'])await cp(f,'dist/'+f,{recursive:true});
const html=await readFile('dist/index.html','utf8');if(!html.includes('afandi-client.js'))throw Error('Client integration missing');
