# Gera as capas 1200x630 do blog do Hot Poker na linguagem do muro de lambe-lambe.
# Uso: python gerar_capas.py [slug ...]
import json, re, subprocess, sys, pathlib, html
from PIL import Image

AQUI = pathlib.Path(__file__).parent
MOCK = pathlib.Path(r"C:\Users\Administrator\Desktop\portal-afiliacao\portal\mocks\hot-poker")
DEST = pathlib.Path(r"C:\Users\Administrator\Desktop\portal-afiliacao\portal\public\assets\hot-poker\blog")
TMP = AQUI / "capas"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
DEST.mkdir(parents=True, exist_ok=True)
TMP.mkdir(exist_ok=True)

mock = (MOCK / "2-lambe-lambe.html").read_text(encoding="utf-8").splitlines()
texturas = "\n".join(l for l in mock[149:158] if l.strip().startswith("--"))
chama_svg = (MOCK / "chama.svg").read_text(encoding="utf-8")
# a chama aparece duas vezes por página: troca os ids para não colidir
def chama(sufixo):
    s = chama_svg.replace('xmlns="http://www.w3.org/2000/svg" ', 'xmlns="http://www.w3.org/2000/svg" class="chama" aria-hidden="true" ')
    for i in ["gA", "gB", "cA", "cB"]:
        s = s.replace(f'id="{i}"', f'id="{i}{sufixo}"').replace(f"url(#{i})", f"url(#{i}{sufixo})")
    s = re.sub(r'id="a"', f'id="a{sufixo}"', s); s = re.sub(r'id="b"', f'id="b{sufixo}"', s)
    s = s.replace('href="#a"', f'href="#a{sufixo}"').replace('href="#b"', f'href="#b{sufixo}"')
    return s

RAIO = ('<svg class="raio" viewBox="0 0 240 900" aria-hidden="true"><defs><filter id="tb" x="-5%" y="-5%" width="110%" height="110%">'
        '<feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="5" result="t"/>'
        '<feDisplacementMap in="SourceGraphic" in2="t" scale="3.5" xChannelSelector="R" yChannelSelector="G"/></filter></defs>'
        '<g filter="url(#tb)"><path d="M150 0 L92 312 L132 306 L58 566 L100 560 L18 900 L156 508 L114 514 L178 266 L138 272 L198 0 Z"/>'
        '<path d="M96 300 L52 372 L66 378 L20 470" fill="none" stroke-width="7"/>'
        '<path d="M70 560 L118 640 L104 646 L150 732" fill="none" stroke-width="6"/></g></svg>')

CSS = """
:root { %s
  --muro:#19191b; --giz:#d2d3ce; --papel:#e6e7e3; --laranja:#ef6b1b; --tinta:#141414; --tinta-laranja:#d4430f; --laranja-escura:#a63a0c; }
* { box-sizing:border-box; margin:0; }
html, body { width:1200px; height:630px; overflow:hidden; }
body { position:relative; background-color:var(--muro);
  background-image:var(--reboco), var(--areia), linear-gradient(180deg,#1c1c1f 0%%,#171719 60%%,#1b1b1d 100%%);
  background-size:640px 640px, 200px 200px, 100%% 100%%; font-family:"Barlow", sans-serif; color:var(--tinta); }
.resto { position:absolute; background:#29292c; opacity:.6; }
.folha { position:absolute; background-color:var(--papel);
  background-image:var(--grao), linear-gradient(103deg, transparent 0 37%%, rgba(255,255,255,.28) 38.5%%, transparent 40.5%%),
    linear-gradient(177deg, transparent 0 58%%, rgba(0,0,0,.045) 60%%, transparent 64%%);
  background-size:180px 180px,100%% 100%%,100%% 100%%;
  -webkit-mask: var(--rasgo-c) var(--rx,0px) 0 / 320px 18px repeat-x, var(--rasgo-b) var(--rx2,120px) 100%% / 320px 18px repeat-x, linear-gradient(#000 0 0) 0 50%% / 100%% calc(100%% - 32px) no-repeat; }
.folha.laranja { background-color:var(--laranja);
  background-image:var(--grao), linear-gradient(98deg, transparent 0 55%%, rgba(255,255,255,.16) 56.5%%, transparent 58.5%%), linear-gradient(183deg, transparent 0 30%%, rgba(0,0,0,.05) 32%%, transparent 36%%); }
.folha.preta { background-color:var(--tinta); background-image:var(--falha), var(--grao); background-size:220px 220px,180px 180px; color:var(--papel); }
.chapa { background-color:var(--tinta); background-image:var(--falha); background-size:220px 220px; color:var(--papel); padding:22px 28px 18px; }
.raio { position:absolute; height:700px; width:auto; fill:var(--laranja); stroke:var(--laranja); }
.selo { display:inline-block; font:700 26px/1 "Barlow Condensed", sans-serif; text-transform:uppercase; letter-spacing:.06em;
  padding:9px 14px 8px; background:var(--tinta); color:var(--laranja); }
.titulo { font-family:"Anton", sans-serif; text-transform:uppercase; line-height:.95; padding-top:.1em; text-wrap:balance; letter-spacing:.005em; font-weight:400; }
.apoio { font:700 34px/1.12 "Barlow Condensed", sans-serif; text-transform:uppercase; letter-spacing:.02em; color:var(--tinta-laranja); }
.laranja .apoio { color:var(--tinta); }
.preta .apoio, .chapa + .apoio-claro { color:var(--papel); }
.marca { display:flex; align-items:center; gap:10px; }
.marca .chama { width:34px; height:46px; }
.letreiro { font-family:"Archivo", sans-serif; font-weight:900; font-stretch:125%%; font-variation-settings:"wdth" 125; text-transform:uppercase; font-size:30px; line-height:1; }
.endereco { font:700 24px/1 "Barlow Condensed", sans-serif; letter-spacing:.06em; text-transform:lowercase; }
.mais18 { display:inline-grid; place-items:center; width:46px; height:46px; border-radius:50%%; border:3px solid currentColor; font:400 18px/1 "Anton", sans-serif; }
.tira { position:absolute; display:flex; align-items:center; gap:18px; padding:18px 22px 20px; background-color:var(--papel); background-image:var(--grao); background-size:180px 180px; }
.no-muro { color:var(--giz); }
.caixa-titulo { overflow:hidden; }
"""

LAYOUTS = {
# 1: folha branca à esquerda, raio laranja à direita, marca no muro
1: """
<div class="resto" style="left:820px;top:-40px;width:420px;height:300px;transform:rotate(4deg)"></div>
<div class="raio-wrap">%(raio)s</div>
<style>.raio{left:830px;top:-40px;}</style>
<div class="folha" style="left:46px;top:46px;width:760px;height:540px;transform:rotate(-1.1deg);--rx:-60px;padding:50px 48px 40px;">
  <span class="selo">%(selo)s</span>
  <div class="caixa-titulo" style="margin-top:22px;height:300px;width:664px"><h1 class="titulo" data-max="138">%(titulo)s</h1></div>
  <p class="apoio" style="margin-top:14px;width:640px">%(apoio)s</p>
</div>
<div class="tira" style="right:44px;bottom:50px;transform:rotate(-1.4deg)">
  <div class="marca">%(chama1)s<span class="letreiro">Hot Poker</span></div>
  <span class="endereco">hotpoker.club</span><span class="mais18">+18</span>
</div>
""",
# 2: folha laranja quase inteira, raio preto apagado, marca dentro do papel
2: """
<div class="folha laranja" style="left:40px;top:34px;width:1120px;height:566px;transform:rotate(.6deg);--rx:-150px;padding:54px 60px 44px;overflow:hidden">
  <div style="position:absolute;right:40px;top:-60px;opacity:.16">%(raio)s</div>
  <style>.raio{position:static;fill:var(--tinta);stroke:var(--tinta);height:720px}</style>
  <span class="selo">%(selo)s</span>
  <div class="caixa-titulo" style="margin-top:22px;height:276px;width:900px;position:relative"><h1 class="titulo" data-max="146">%(titulo)s</h1></div>
  <p class="apoio" style="margin-top:12px;width:1000px;position:relative">%(apoio)s</p>
  <div style="position:absolute;left:60px;right:60px;bottom:44px;display:flex;justify-content:space-between;align-items:center">
    <div class="marca">%(chama1)s<span class="letreiro">Hot Poker</span></div>
    <div style="display:flex;gap:14px;align-items:center"><span class="endereco">hotpoker.club</span><span class="mais18">+18</span></div>
  </div>
</div>
""",
# 3: folha branca com chapa preta para o título (cartaz da abertura), raio cruzando a direita
3: """
<div class="resto" style="left:-30px;top:420px;width:300px;height:260px;transform:rotate(-6deg)"></div>
<div class="folha" style="left:60px;top:40px;width:880px;height:556px;transform:rotate(-.5deg);--rx:-40px;padding:34px 34px 30px;">
  <div class="chapa" style="height:330px;display:flex;flex-direction:column;justify-content:space-between">
    <span class="selo" style="background:var(--laranja);color:var(--tinta);align-self:flex-start">%(selo)s</span>
    <div class="caixa-titulo" data-fixa="1" style="height:236px;width:740px;display:flex;align-items:flex-end"><h1 class="titulo" data-max="132">%(titulo)s</h1></div>
  </div>
  <p class="apoio" style="margin-top:22px;width:760px">%(apoio)s</p>
  <div style="position:absolute;left:34px;right:34px;bottom:34px;display:flex;justify-content:space-between;align-items:center">
    <div class="marca">%(chama1)s<span class="letreiro">Hot Poker</span></div>
    <div style="display:flex;gap:14px;align-items:center"><span class="endereco">hotpoker.club</span><span class="mais18">+18</span></div>
  </div>
</div>
%(raio)s<style>.raio{left:880px;top:-50px;height:740px}</style>
<div class="no-muro" style="position:absolute;right:18px;bottom:56px;width:150px;text-align:center;font:700 22px/1.2 'Barlow Condensed';letter-spacing:.06em;text-transform:uppercase">Clube<br><span style="font:400 40px/1 Anton;color:var(--laranja)">33548</span><br>Agente<br><span style="font:400 40px/1 Anton;color:var(--laranja)">768286</span></div>
""",
# 4: folha laranja à direita, marca grande no muro à esquerda, raio no muro
4: """
<div class="no-muro" style="position:absolute;left:52px;top:62px;width:300px">
  %(chama1)s
  <div class="letreiro" style="font-size:46px;margin-top:14px;color:var(--papel)">Hot<br>Poker</div>
  <div class="endereco" style="margin-top:18px">hotpoker.club</div>
  <div style="margin-top:14px"><span class="mais18">+18</span></div>
</div>
<style>.no-muro .chama{width:86px;height:116px}</style>
%(raio)s<style>.raio{left:296px;top:-70px;height:780px}</style>
<div class="folha laranja" style="left:400px;top:50px;width:752px;height:530px;transform:rotate(1.2deg);--rx:-150px;padding:48px 46px 40px;">
  <span class="selo">%(selo)s</span>
  <div class="caixa-titulo" style="margin-top:22px;height:300px;width:660px"><h1 class="titulo" data-max="136">%(titulo)s</h1></div>
  <p class="apoio" style="margin-top:14px;width:640px">%(apoio)s</p>
</div>
""",
# 5: folha branca + folhinha laranja colada por cima com o selo grande, raio preto no papel
5: """
<div class="resto" style="left:900px;top:380px;width:360px;height:300px;transform:rotate(5deg)"></div>
<div class="folha" style="left:40px;top:60px;width:850px;height:530px;transform:rotate(.8deg);--rx:-100px;padding:56px 50px 40px;overflow:hidden">
  <div style="position:absolute;right:-30px;top:-40px;opacity:.12">%(raio)s</div>
  <style>.raio{position:static;fill:var(--tinta);stroke:var(--tinta);height:640px}</style>
  <div class="caixa-titulo" style="height:300px;width:690px;position:relative"><h1 class="titulo" data-max="136">%(titulo)s</h1></div>
  <p class="apoio" style="margin-top:16px;width:700px;position:relative">%(apoio)s</p>
  <div style="position:absolute;left:50px;right:50px;bottom:40px;display:flex;justify-content:space-between;align-items:center">
    <div class="marca">%(chama1)s<span class="letreiro">Hot Poker</span></div>
    <div style="display:flex;gap:14px;align-items:center"><span class="endereco">hotpoker.club</span><span class="mais18">+18</span></div>
  </div>
</div>
<div class="folha laranja" style="left:850px;top:70px;width:300px;height:230px;transform:rotate(-3deg);--rx:-220px;--rx2:40px;padding:40px 26px 30px;display:flex;align-items:center">
  <p class="titulo" style="font-size:44px;line-height:1">%(selo)s</p>
</div>
""",
# 6: folha preta com título laranja, tira branca com a marca, raio laranja no muro
6: """
%(raio)s<style>.raio{left:960px;top:-60px;height:760px}</style>
<div class="folha preta" style="left:50px;top:36px;width:930px;height:490px;transform:rotate(-.8deg);--rx:-30px;padding:50px 54px 40px;">
  <span class="selo" style="background:var(--laranja);color:var(--tinta)">%(selo)s</span>
  <div class="caixa-titulo" style="margin-top:22px;height:270px;width:820px"><h1 class="titulo" data-max="136" style="color:var(--laranja)">%(titulo)s</h1></div>
  <p class="apoio" style="margin-top:12px;width:800px">%(apoio)s</p>
</div>
<div class="tira" style="left:560px;top:534px;transform:rotate(1.6deg)">
  <div class="marca">%(chama1)s<span class="letreiro">Hot Poker</span></div>
  <span class="endereco">hotpoker.club</span><span class="mais18">+18</span>
</div>
""",
}

FIT = """
<script>
document.fonts.ready.then(function(){
  document.querySelectorAll('.caixa-titulo').forEach(function(cx){
    var h=cx.querySelector('.titulo'); var t=+h.dataset.max;
    h.style.fontSize=t+'px';
    while((h.scrollHeight>cx.clientHeight || h.scrollWidth>cx.clientWidth) && t>40){ t-=2; h.style.fontSize=t+'px'; }
    if(!cx.dataset.fixa) cx.style.height='auto';
  });
  document.body.dataset.pronto='1';
});
</script>
"""

def pagina(slug, c):
    corpo = LAYOUTS[c["variante"]] % {
        "titulo": html.escape(c["titulo"]), "apoio": html.escape(c["apoio"]), "selo": html.escape(c["selo"]),
        "raio": RAIO, "chama1": chama("1"),
    }
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{html.escape(c['titulo'])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wdth,wght@125,900&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600&display=swap">
<style>{CSS % texturas}</style></head><body>{corpo}{FIT}</body></html>"""

capas = json.loads((AQUI / "capas.json").read_text(encoding="utf-8"))
alvos = sys.argv[1:] or list(capas)
for slug in alvos:
    c = capas[slug]
    arq = TMP / f"{slug}.html"
    arq.write_text(pagina(slug, c), encoding="utf-8")
    png = TMP / f"{slug}.png"
    if png.exists(): png.unlink()
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=1200,630", "--virtual-time-budget=10000", f"--screenshot={png}", arq.as_uri()],
                   capture_output=True, timeout=120)
    im = Image.open(png).convert("RGB")
    if im.size != (1200, 630): print("tamanho inesperado", slug, im.size); im = im.crop((0, 0, 1200, 630))
    im.save(DEST / f"{slug}.jpg", "JPEG", quality=85, optimize=True, progressive=True)
    print("ok", slug, (DEST / f"{slug}.jpg").stat().st_size // 1024, "KB")
