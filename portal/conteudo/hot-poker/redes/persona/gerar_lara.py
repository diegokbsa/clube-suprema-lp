"""Nova foto da Lara (persona de IA do Hot Poker, sempre a mesma pessoa) pelo gerador de imagem do Codex,
com a chama estampada no lado direito do peito (compor_capa.py).
  python gerar_lara.py <pasta_saida> "<cenário>"
  ex.: python gerar_lara.py ..\posts\2026-11-08 "sentada no sofá de casa à noite, luz quente de abajur, celular na mão"
Saída: <pasta>/lara.png (foto pura) e <pasta>/lara-chama.png (1080x1350 com a chama)."""
import subprocess, sys
from pathlib import Path
AQUI = Path(__file__).resolve().parent
REF = AQUI / "lara-referencia.png"
PYF = r"C:\Users\Administrator\Documents\Codex\2026-10-16\vej\outputs\chile-football-viral-cl\forge\.venv\Scripts\python.exe"
saida = Path(sys.argv[1]).resolve(); saida.mkdir(parents=True, exist_ok=True)
cenario = sys.argv[2] if len(sys.argv) > 2 else "sentada numa cafeteria perto da janela, luz natural da tarde"
alvo = saida / "lara.png"
pedido = (f"Gere UMA imagem (use a ferramenta de geração de imagem) e salve como PNG em {alvo}. "
          f"É a MESMA mulher da foto de referência {REF} (mesmo rosto, mesmo cabelo ruivo longo e ondulado, mesmas sardas, mesma idade): "
          f"mantenha a identidade dela fielmente. Cena nova: {cenario}. Foto realista de celular, luz natural, cores naturais, leve grão, "
          "camiseta preta lisa sem estampa (o lado direito do peito, de quem olha, livre e visível), sorriso espontâneo, enquadramento da cintura "
          "para cima, vertical 4:5, espaço livre acima da cabeça. Pessoa fictícia. Roupa comum, nada sensual. Sem texto, sem logo, sem bebida, "
          "sem cartas ou fichas na mão. Não faça mais nada além disso.")
subprocess.run(["codex", "exec", "--skip-git-repo-check", pedido], cwd=str(saida), timeout=900, shell=True)
if not alvo.exists():
    sys.exit("o gerador não salvou a foto")
subprocess.run([PYF, str(AQUI / "compor_capa.py"), str(alvo), str(saida / "lara-chama.png")], check=True)
print(saida / "lara-chama.png")
