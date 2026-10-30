import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const files = ['index.html','betriebsraete.html','hr.html','unternehmen.html','impressum.html','datenschutz.html'];
const redirects = {'/impressum/':'/impressum.html','/datenschutzerklaerung/':'/datenschutz.html','/startseite/':'/','/index.html':'/','/wp-sitemap.xml':'/sitemap.xml','/sitemap_index.xml':'/sitemap.xml','/page-sitemap1.xml':'/sitemap.xml'};
http.createServer(async(req,res)=>{
 const u = new URL(req.url,'http://localhost'); const host = (req.headers.host||'').split(':')[0];
 const prod = host === 'firmenbenefits.at';
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 if(!prod && host!=='www.firmenbenefits.at')res.setHeader('X-Robots-Tag','noindex, nofollow');
 if(host === 'www.firmenbenefits.at'){res.writeHead(301,{Location:'https://firmenbenefits.at'+u.pathname+u.search});return res.end();}
 const oldId=u.searchParams.get('page_id')||u.searchParams.get('p');
 const oldIds={'41':'/','141':'/impressum.html','146':'/datenschutz.html'};
 if(oldId && oldIds[oldId]){res.writeHead(301,{Location:'https://firmenbenefits.at'+oldIds[oldId]});return res.end();}
 if(redirects[u.pathname]){res.writeHead(301,{Location:redirects[u.pathname]+u.search});return res.end();}
 if(u.pathname==='/robots.txt'){res.setHeader('Content-Type','text/plain');return res.end(prod?'User-agent: *\nAllow: /\nSitemap: https://firmenbenefits.at/sitemap.xml\n':'User-agent: *\nDisallow: /\n');}
 if(u.pathname==='/sitemap.xml'){res.setHeader('Content-Type','application/xml');return res.end('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+files.map(f=>'<url><loc>https://firmenbenefits.at/'+(f==='index.html'?'':f)+'</loc></url>').join('')+'</urlset>');}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
 let p;try{p=decodeURIComponent(u.pathname);}catch{res.writeHead(400);return res.end();}
 const file = path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+'/')||(!files.includes(path.relative(root,file))&&!['styles.css','consent.js','consent.css'].includes(path.relative(root,file))&&!/^fonts\/[a-z0-9-]+\.woff2$/.test(path.relative(root,file)))){res.writeHead(404);return res.end('Seite nicht gefunden');}
 try{
 let data = await fs.readFile(file); const ext=path.extname(file);
 if(ext==='.html'){
  const canonical='https://firmenbenefits.at'+(p==='/index.html'?'/':p);
  data=Buffer.from(data.toString().replace('noindex, nofollow',prod?'index, follow':'noindex, nofollow').replace('</head>',`<link rel="canonical" href="${canonical}"><link rel="stylesheet" href="/consent.css"><script>window.ConvernaticsConsentConfig={version:'firmenbenefits-v1',language:'de',services:[{key:'convernatics-consent',name:'Convernatics Consent',group:'necessary',provider:'Convernatics',description:'Speichert Ihre Datenschutzeinstellungen',privacy:'/datenschutz.html',cookies:[{name:'convernatics_consent',lifetime:'180 Tage'}]}]};</script><script defer src="/consent.js"></script>${prod?'<script defer data-domain="firmenbenefits.at" src="https://plausible.convernatics.com/js/script.js"></script>':''}</head>`));
 }
 res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.woff2':'font/woff2'})[ext]||'application/octet-stream','Cache-Control':ext==='.woff2'?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Seite nicht gefunden');}
}).listen(3000,'0.0.0.0');
