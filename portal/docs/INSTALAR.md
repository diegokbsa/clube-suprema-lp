# Instalar o Portal SX em outro computador

Guia curto para rodar o Portal (edição SX + Geral) num computador novo. O banco começa vazio e é criado sozinho na primeira vez.

## 1. O que precisa

- **Node.js 24**: https://nodejs.org (baixe a versão 24 e instale com tudo no padrão).
- **Git**: https://git-scm.com
- Não precisa de `npm install`: o Portal não usa pacotes extras (o banco é o `node:sqlite` do próprio Node).

Confira no terminal:

```bash
node -v
```

Tem que aparecer `v24.x`.

## 2. Baixar

```bash
git clone -b portal/PA-160-afiliacao https://github.com/diegokbsa/clube-suprema-lp.git
```

```bash
cd clube-suprema-lp
```

## 3. Rodar as duas edições (Geral na 3400 e SX na 3401)

No Windows (Prompt de Comando):

```bash
set PORTAL_PORT=3400:geral,3401:sx && npm run portal
```

No Linux ou Mac:

```bash
PORTAL_PORT=3400:geral,3401:sx npm run portal
```

Abra:

- SX: http://localhost:3401/admin/
- Geral: http://localhost:3400/admin/

## 4. Primeiro acesso

Na primeira vez, o Portal cria o banco em `portal/data/` e grava o e-mail e a senha do primeiro administrador em:

```
portal/data/credenciais-iniciais.txt
```

Entre com eles e troque a senha no primeiro acesso. Depois disso, apague esse arquivo.

## 5. Visual

O painel abre no **vidro branco com roxo**. O botão **Visual**, embaixo à esquerda, troca para os outros modelos; a escolha fica salva no navegador.

## 6. Recomendações

- **Guarde a pasta `portal/data/`**: é ali que ficam o banco (`portal.db`) e os backups. Faça uma cópia dela com frequência.
- **Defina uma chave própria** antes de cadastrar integrações (Search Console, Telegram, Hotmart). Ela protege as credenciais guardadas no cofre do Portal:

  ```bash
  set PORTAL_SECRET_KEY=uma-frase-longa-e-aleatoria-so-sua
  ```

  Use sempre a mesma chave; se mudar, as credenciais salvas deixam de abrir.
- **Para acessar de fora do computador** (celular, outro PC), defina a origem pública e use um túnel (por exemplo, o Cloudflare Tunnel):

  ```bash
  set PORTAL_ORIGIN=https://seu-endereco
  ```

- **Testes** (opcional, para quem vai mexer no código):

  ```bash
  npm run portal:test
  ```

- **Atualizar** para a versão mais nova:

  ```bash
  git pull
  ```

  Depois feche e rode de novo o passo 3.

## 7. Documentação técnica

- `portal/docs/ARQUITETURA.md`: como o Portal é organizado.
- `portal/deploy/LEIA-ME.md`: instalação no servidor (Bigue) da operação original.
