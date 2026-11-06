# Som dos reels do Hot Poker, gerado em código (sem música de terceiros): batida simples a 112 BPM (bumbo e chimbal),
# "tapa" de papel quando um cartaz cola, estalo de carta, zumbido do raio nos cortes, teclas e cliques do passo 1.
# Uso: python audio.py <eventos.json> <saida.wav>   (o eventos.json sai do render.mjs: {dur, eventos:[{t, tipo}]})
import json, sys, wave
import numpy as np

SR = 44100
info = json.load(open(sys.argv[1], encoding='utf-8'))
dur = float(info['dur'])
n = int(dur * SR) + SR
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)

def poe(sinal, t, ganho=1.0, pan=0.0):
    i = int(t * SR)
    if i < 0 or i >= n: return
    s = sinal[: n - i] * ganho
    L[i:i + len(s)] += s * (1 - max(0, pan)); R[i:i + len(s)] += s * (1 + min(0, pan))

def env(m, ataque, queda):
    t = np.arange(m) / SR
    return np.minimum(1, t / max(ataque, 1e-4)) * np.exp(-t / queda)

def passa_baixa(x, a):  # filtro de um polo (a perto de 1 = mais grave)
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)): acc = a * acc + (1 - a) * x[k]; y[k] = acc
    return y

m = int(.32 * SR); tt = np.arange(m) / SR
freq = 45 + 85 * np.exp(-tt / .035)
bumbo = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(m, .002, .11)
m = int(.05 * SR); chimbal = np.diff(rng.standard_normal(m + 1)) * env(m, .0005, .012) * .5
m = int(.16 * SR); tapa = passa_baixa(rng.standard_normal(m), .55) * env(m, .001, .03) * 1.6
tapa += np.sin(2 * np.pi * 90 * np.arange(m) / SR) * env(m, .001, .05) * .5
m = int(.07 * SR); carta = np.diff(rng.standard_normal(m + 1)) * env(m, .0005, .01) * .9
m = int(.45 * SR); tt = np.arange(m) / SR
zumbido = rng.standard_normal(m) * np.sin(np.pi * tt / tt[-1]) ** 2
zumbido = np.diff(np.concatenate([[0], passa_baixa(zumbido, .8)])) * 6
zap = np.sign(np.sin(2 * np.pi * (220 + 900 * np.exp(-tt / .05)) * tt)) * env(m, .001, .06) * .12
m = int(.03 * SR); tecla = np.diff(rng.standard_normal(m + 1)) * env(m, .0003, .004) * .35
m = int(.06 * SR); clique = np.sin(2 * np.pi * 1800 * np.arange(m) / SR) * env(m, .0005, .01) * .35

batida = 60 / 112
k = 0
while k * batida < dur - 0.9:
    t = k * batida
    poe(bumbo, t, .55)
    poe(chimbal, t + batida / 2, .22, pan=.3 if k % 2 else -.3)
    k += 1
for e in info['eventos']:
    t, tipo = e['t'], e['tipo']
    if tipo == 'cola': poe(tapa, t + .02, .55)
    elif tipo == 'carta': poe(carta, t + .25, .6, pan=.2)
    elif tipo == 'carimbo': poe(tapa, t + .1, .7); poe(bumbo, t + .1, .3)
    elif tipo == 'corte': poe(zumbido, t - .3, .35); poe(zap, t - .02, 1.0)
    elif tipo == 'tecla': poe(tecla, t, .8, pan=-.2)
    elif tipo == 'clique': poe(clique, t, .9)

st = np.stack([L, R], 1)[: int(dur * SR)]
fim = int(.9 * SR); st[-fim:] *= np.linspace(1, 0, fim)[:, None]
st = np.tanh(st * 1.2) / np.tanh(1.2)
st *= 0.6 / max(1e-6, np.abs(st).max())   # pico em torno de -4,4 dBFS
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok audio', sys.argv[2])
