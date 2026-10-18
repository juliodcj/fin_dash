# Fin Dash

Painel simples para acompanhar uma carteira da B3: você cadastra as compras e vendas (ticker, data, quantidade e preço) e o app calcula a rentabilidade atualizada e compara com CDI e IPCA.

Feito primeiro para celular (testado na largura do Galaxy S23, 360 px), com layout próprio para telas a partir de 1024 px.

## O que tem

- **Carteira**: patrimônio, variação do dia, total investido e lucro; rentabilidade em 1M, 6M, 12M (padrão), 24M, ano e máximo contra CDI e IPCA, % do CDI, ganho real (IPCA + x% a.a., só para 12 meses ou mais) e gráfico. "Mais indicadores" traz max drawdown, volatilidade, índice de Sharpe, meses positivos e melhor/pior mês.
- **Ativo**: posição (quantidade, preço médio, resultado, lucro realizado), a mesma análise de rentabilidade e a lista de lançamentos, com exclusão.
- **Análise** (carteira ou um ativo, pela lista suspensa): tabela por período, aportes × rendimento mês a mês, drawdown, retornos mensais por ano e indicadores de 12 meses.
- **Lançar**: compra ou venda com preço por cota digitado por você; vendas acima do saldo são bloqueadas.
- **Ajustes**: anualizar períodos acima de 12 meses (ligado por padrão), período padrão, metas de alocação, modo demonstração, backup em arquivo e carteira exemplo (70% WRLD11 / 30% B5P211, aporte mensal de R$ 1.000 desde jan/24).

## Dados

- **Cotações**: Yahoo Finance, gratuito e sem token, com até 10 anos de histórico diário (fechamento e fechamento ajustado). O Yahoo não aceita chamadas direto do navegador, então `scripts/quotes.mjs` grava as cotações em `quotes/<TICKER>.json`:
  - no site publicado, o CI baixa os tickers de [`tickers.txt`](tickers.txt) a cada push e todo dia útil às 18h30 (Brasília). **Ativo novo na carteira? Inclua o ticker em `tickers.txt` e faça push.**
  - no `npm run dev`, qualquer ticker é buscado na hora.
- **CDI e IPCA**: CDI diário do Ipeadata (réplica da série 12 do Banco Central) e IPCA mensal do IBGE (SIDRA, tabela 1737), sem token. A API SGS do Banco Central deixou de responder de forma confiável, por isso não é mais usada. O mesmo script grava `rates/cdi.json` e `rates/ipca.json`, junto com as cotações.
- **Modo demonstração**: cotações e índices simulados, para ver o app sem internet ou sem token.
- Lançamentos, ajustes e cache de cotações ficam só no aparelho (localStorage). Use Ajustes › Backup para exportar.

## Como calcula

- Rentabilidade por cotas (TWR): o retorno de cada pregão é a média dos retornos dos ativos, ponderada pelo valor de cada posição no fechamento anterior. Aportes e vendas não distorcem o resultado. Usa o fechamento ajustado por proventos quando a fonte informa.
- CDI acumulado pelos fatores diários; IPCA mensal distribuído pelos dias corridos do mês (mês ainda não divulgado fica estável).
- Anualização: `(1 + r)^(365 / dias) − 1`, aplicada à carteira, ao CDI e ao IPCA quando o período passa de 12 meses e o ajuste está ligado. % do CDI usa sempre os valores acumulados.
- Volatilidade: desvio-padrão dos retornos diários × √252. Sharpe: (retorno a.a. − CDI a.a.) ÷ volatilidade, a partir de 6 meses.
- Preço médio inclui custos de compra; vendas realizam lucro pelo preço médio. Não considera IR.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes dos cálculos
npm run quotes   # baixa cotações (tickers.txt), CDI e IPCA para public/ (opcional antes do build)
npm run build    # gera dist/
```

## Publicar e instalar no celular

O workflow `.github/workflows/ci.yml` roda testes e build em todo push e publica no GitHub Pages a cada push na `main`. Para ativar: no GitHub, **Settings › Pages › Source: GitHub Actions**. Depois abra o endereço no Chrome do celular e use **Adicionar à tela inicial**.
