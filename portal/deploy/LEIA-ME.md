# Portal no Bigue: um servidor, um banco, duas edições

| | Edição SX | Edição Geral |
|---|---|---|
| Para quem | grupo SX: clubes de poker, agentes e afiliados | todos os produtos e programas de afiliação |
| Endereço | `https://sx.kbsa.app` | `https://portal.kbsa.app` (atalho `kbsa.app/portal`) |
| Porta local | `127.0.0.1:3401` | `127.0.0.1:3400` |

As duas portas são servidas pelo **mesmo processo** (tarefa `Portal - Servidor`) sobre **o mesmo banco**
(`E:\LioraServidor\dados\portal\portal.db`). A edição vem do endereço que a pessoa abriu.
Cada operação (ex.: Clube 123123) nasce com portal e CRM próprios e só enxerga os clientes que chegaram por ela;
a pessoa existe uma vez na base (`contacts`) e o superadmin vê a base inteira de cada edição.

## Instalar ou atualizar (PowerShell como Administrador no Bigue)

```powershell
powershell -ExecutionPolicy Bypass -File E:\LioraServidor\apps\portal-afiliacao\portal\deploy\instalar-bigue.ps1
```

Na primeira vez depois das edições separadas, o script:
1. para os servidores antigos;
2. faz backup dos dois bancos (`backups\antes-de-unificar-*.db` em cada pasta de dados);
3. junta o banco da SX (`dados\portal-sx`) no banco único — operações dela entram como edição SX, usuários e pessoas com o mesmo e-mail viram um só;
4. guarda o token antigo da SX em `token-servico-extra.txt` (o pesquisador de IA continua funcionando sem mudar nada);
5. remove as tarefas `Portal SX - Servidor` e `Portal SX - Backup` e sobe `Portal - Servidor` com as duas portas;
6. confere `127.0.0.1:3400 -> geral` e `127.0.0.1:3401 -> sx`.

A pasta `dados\portal-sx` fica como cópia (com `UNIFICADO.txt` dentro). O túnel e o DNS não mudam.
O acesso dos dois painéis passa a ser o do banco da Geral (a senha da SX antiga deixa de valer; o e-mail é o mesmo).

## Conferir

```powershell
curl.exe -s https://portal.kbsa.app/api/edition
curl.exe -s https://sx.kbsa.app/api/edition
```

## Voltar atrás

Parar `Portal - Servidor`, copiar de volta o `antes-de-unificar-*.db` de cada pasta para `portal.db` e reinstalar a versão anterior
(commit `fd8f9ae` da branch) com as edições separadas.
