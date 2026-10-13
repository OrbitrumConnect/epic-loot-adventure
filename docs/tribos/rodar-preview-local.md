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
