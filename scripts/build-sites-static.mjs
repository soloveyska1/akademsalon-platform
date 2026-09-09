import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const client = join(dist, "client");
const server = join(dist, "server");

rmSync(dist, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
mkdirSync(server, { recursive: true });

const publicDirectories = ["assets", "bimi"];
for (const directory of publicDirectories) {
  const source = join(root, directory);
  if (existsSync(source)) {
    cpSync(source, join(client, directory), { recursive: true });
  }
}

const publicRootExtensions = new Set([
  ".gif",
  ".html",
  ".ico",
  ".json",
  ".txt",
  ".webmanifest",
  ".xml",
]);

for (const entry of readdirSync(root)) {
  const source = join(root, entry);
  if (!statSync(source).isFile() || !publicRootExtensions.has(extname(entry))) {
    continue;
  }
  cpSync(source, join(client, entry));
  if (extname(entry) === ".html") {
    const html = readFileSync(source, "utf8").replace(/<head>/i,
      '<head><meta name="robots" content="noindex,nofollow"><script src="/__site-preview.js"></script>');
    writeFileSync(join(client, entry), html);
  }
}

// Sites is the owner's review surface. Production HTML remains untouched.
writeFileSync(join(client, "__site-preview.js"), String.raw`(function(){
  'use strict';
  const realFetch = window.fetch.bind(window);
  function isApi(input){try{const u=new URL(typeof input==='string'?input:input.url,location.href);return u.pathname.startsWith('/api/')||u.hostname==='akademsalon.ru'&&u.pathname==='/api'}catch(e){return false}}
  window.fetch = function(input,init){if(isApi(input))return Promise.resolve(new Response(JSON.stringify({ok:false,error:'private_preview',authenticated:false,guest_session:false,orders:[]}),{status:403,headers:{'Content-Type':'application/json'}}));return realFetch(input,init)};
  if(navigator.sendBeacon){const send=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(url,data)=>isApi(url)?false:send(url,data)}
  if(navigator.serviceWorker){navigator.serviceWorker.register=()=>Promise.reject(new Error('Private preview'));navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()))}
  document.addEventListener('DOMContentLoaded',()=>{const bar=document.createElement('div');bar.textContent='Личный просмотр · заявки здесь не отправляются';bar.style.cssText='padding:9px 16px;background:#26213d;color:#fff;text-align:center;font:12px/1.5 sans-serif';document.body.prepend(bar)});
  document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();const n=document.getElementById('form-message')||document.getElementById('supportStatus');if(n){n.hidden=false;n.textContent='Это версия для просмотра. Заявка не отправлена. На основном сайте форма будет передавать задание в кабинет.';n.focus()}},true);
})();`);

writeFileSync(
  join(server, "index.js"),
  `export default {
  async fetch(request, env) {
    if (!env?.ASSETS) {
      return new Response("Static asset binding is unavailable", { status: 500 });
    }

    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    if (request.method === "GET" || request.method === "HEAD") {
      const path = url.pathname;
      if (!path.endsWith("/") && !path.split("/").at(-1)?.includes(".")) {
        const htmlUrl = new URL(path + ".html" + url.search, url.origin);
        response = await env.ASSETS.fetch(new Request(htmlUrl, request));
        if (response.status !== 404) return response;
      }
    }

    const notFoundUrl = new URL("/404.html", url.origin);
    const notFound = await env.ASSETS.fetch(new Request(notFoundUrl, request));
    return new Response(notFound.body, {
      status: 404,
      headers: notFound.headers,
    });
  },
};
`,
);

console.log(`Built static preview in ${dist}`);
