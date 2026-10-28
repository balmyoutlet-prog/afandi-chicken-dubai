const UPSTREAM = 'https://affandi-chicken-dubai.suzy-309.chatgpt.site';
const ORIGINS = new Set(['https://alafandichicken.com','https://www.alafandichicken.com']);
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (!['GET','POST'].includes(req.method)) return res.status(405).end();
  if (req.method === 'POST' && !ORIGINS.has(req.headers.origin)) return res.status(403).json({error:'Forbidden'});
  const url = new URL(req.url, 'https://alafandichicken.com');
  const action = url.searchParams.get('action');
  if (!['login','logout','dashboard','status','track'].includes(action)) return res.status(404).end();
  url.searchParams.delete('action');
  const headers = {'Content-Type':'application/json'};
  if(req.headers.cookie) headers.Cookie = req.headers.cookie;
  if(req.method === 'POST') headers.Origin = UPSTREAM;
  try {
    const response = await fetch(UPSTREAM+'/api/analytics/'+action+url.search, {
      method:req.method, headers, redirect:'manual',
      ...(req.method === 'POST' ? {body:typeof req.body === 'string' ? req.body : JSON.stringify(req.body)} : {})
    });
    if(response.status>=300 && response.status<400) return res.status(502).json({error:'Unexpected upstream redirect'});
    res.status(response.status);
    res.setHeader('Content-Type',response.headers.get('content-type')||'application/json');
    const cookies=response.headers.getSetCookie();
    if(cookies.length) res.setHeader('Set-Cookie',cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(502).json({error:'Admin service unavailable'}); }
};
