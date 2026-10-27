// Avisa o Bing (e os outros buscadores do IndexNow) que páginas do site mudaram.
// O Bing alimenta a busca do ChatGPT e do Copilot, por isso vale rodar depois de publicar conteúdo.
//
// Uso (na raiz do projeto, depois do deploy no Render):
//   node tools/indexnow.mjs                      -> envia todas as URLs do sitemap
//   node tools/indexnow.mjs /blog/um-post /sobre -> envia só essas
//
// A chave é pública por definição: fica em public/<chave>.txt e o IndexNow confere esse arquivo.
import fs from 'node:fs';

const HOST = 'suprema.blog';
const ORIGIN = `https://${HOST}`;
const keyFile = fs.readdirSync(new URL('../public/', import.meta.url)).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('Arquivo da chave IndexNow não encontrado em public/');
const key = keyFile.replace('.txt', '');

let urls = process.argv.slice(2).map((u) => (u.startsWith('http') ? u : ORIGIN + u));
if (!urls.length) {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => !/\.(jpg|webp|png|svg)$/.test(u));
}
const check = await fetch(`${ORIGIN}/${key}.txt`);
if (!check.ok || (await check.text()).trim() !== key) throw new Error(`A chave ainda não está no ar em ${ORIGIN}/${key}.txt (faça o deploy antes).`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: `${ORIGIN}/${key}.txt`, urlList: urls }),
});
console.log(`IndexNow: HTTP ${res.status} para ${urls.length} URLs (200 ou 202 = recebido).`);
for (const u of urls) console.log('  ' + u);
