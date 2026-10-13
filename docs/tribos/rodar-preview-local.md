# Rodar o jogo compilado localmente

No PowerShell, dentro do projeto:

```powershell
npm run build
npm run preview:local
```

Abra http://127.0.0.1:8004. Mantenha o terminal aberto; Ctrl+C encerra.
Se já existe um build atualizado, basta o segundo comando.
Após um novo build, reinicie o servidor para carregar o novo handler SSR.

O script usa o build Cloudflare gerado em `.output/` através de um adaptador
local. Não publica nem conecta persistência/multiplayer. `npm run preview`
continua sendo o preview padrão do Vite e não é o comando deste adaptador.

Se o shim do Node/Volta não resolver nesta máquina, o executável verificado é:

```powershell
& 'C:\Users\cleao\AppData\Local\Volta\tools\image\node\24.21.0\node.exe' art\preview-production.mjs
```

Porta opcional: defina `$env:PORT = '8005'` antes de iniciar.
Erro `EADDRINUSE` significa que a porta já está ocupada; use o servidor existente
ou escolha outra porta. Não encerre processos desconhecidos.

## O `npm run dev` e a pasta do TripoSR

Se o `npm run dev` subir mas **não servir página**, falhando com
`transport invoke timed out after 60000ms` ao buscar módulos do
`@tanstack/start-server`, a causa provável não é o código: é o número de
arquivos dentro de `art/`.

O pipeline de assets 3D cria `art/packs/01-ashland-lowpoly/.local-triposr`,
um venv Python com cache de modelo. Medido em 2026-10-12: **50.419 dos 50.836
arquivos** de `art/` estavam ali dentro. Com esse volume no diretório do
projeto, o servidor de desenvolvimento do Vite não responde.

Essa pasta já é `gitignored`, então nunca chega em quem clona o repositório —
o problema é só de quem roda o pipeline localmente. A solução é mantê-la
**fora** da pasta do projeto:

```powershell
Move-Item 'art\packs\01-ashland-lowpoly\.local-triposr' '..\_tribos-local-triposr'
```

Depois do move, `art/` fica com 577 arquivos e o dev volta a responder
HTTP 200. Nenhum script do pipeline referencia essa pasta por caminho fixo
(verificado por busca em `.py`, `.mjs`, `.ts`, `.tsx`, `.json` e `.md`), então
mover não quebra nada; aponte as ferramentas do TripoSR para o novo local
quando for usá-las.

Medições que isolaram a causa, em worktree separado compartilhando o mesmo
`node_modules`:

| cenário | resultado |
|---|---|
| sem o upgrade gráfico | HTTP 200 em 6,4 s |
| com o upgrade + os 4 GLB do jogo | HTTP 200 em 5,6 s |
| com o upgrade + `art/` sem `.local-triposr` | HTTP 200 em 5,8 s |
| com o upgrade + `art/` completo | nunca responde |

Aviso para quem for repetir esse teste: **não** ligue o `node_modules` de um
worktree descartável ao real por junction do Windows. O `git worktree remove
--force` apaga através da junction e esvazia o `node_modules/.bin` do projeto,
fazendo o dev falhar com `'vite' is not recognized`. Conserto: `npm install`.
Dentro do worktree, rode um `npm install` próprio.
