# apishape

[English](README.md) · Português · [日本語](README.ja.md)

Pegue **mudanças que quebram sua API JSON** antes dos seus usuários. O apishape salva a *forma* de cada resposta (caminhos dos campos e tipos) e falha no CI quando um campo some ou muda de tipo.

Os snapshots **não guardam valores** (nada de emails, ids ou tokens), então dá para comitar com segurança. Não precisa de OpenAPI. Zero dependências.

```bash
npx @guihakka2/apishape https://api.example.com/v1/users     # 1ª vez: salva o snapshot; depois: compara
npx @guihakka2/apishape https://api.example.com/me -H 'Authorization: Bearer ${API_TOKEN}'
npx @guihakka2/apishape                                       # todos os endpoints do apishape.json
```

- **Quebra**: campo removido, tipo mudou (inclusive passar a aceitar `null`), status HTTP mudou.
- **Não quebra**: campo novo (falha só com `--strict`), array vazio desta vez, campo que era sempre `null` e agora tem valor.
- **Segurança**: `${VAR}` vem do ambiente e nunca é mostrado nem salvo; URLs aparecem sem a query string; redirects não são seguidos; respostas limitadas a 10 MB.

Opções: `--update`, `--strict`, `-H`, `--name`, `--config`, `--timeout`, `--json`. Detalhes no [README em inglês](README.md) e em [SECURITY.md](SECURITY.md).

**Sem Node.js?** Cada [release](https://github.com/Guihakka2/apishape/releases/latest) tem um programa pronto para Windows, macOS e Linux (x64 e ARM): baixe, descompacte e rode `apishape` no terminal. Gerado pelo GitHub Actions, com `SHA256SUMS.txt` e atestado de procedência. Ainda sem assinatura paga: na primeira vez, o Windows mostra o SmartScreen ("Mais informações" → "Executar assim mesmo") e no macOS rode `xattr -d com.apple.quarantine apishape` uma vez.
