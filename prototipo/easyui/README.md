# Protótipo de UI · EasyUI

Protótipo estático da interface do Fin Dash com os elementos visuais do [EasyUI](https://easyui.site/): paleta monocromática zinc, fonte Geist, raio de 14px, sombras sutis e indicadores em pill que deslizam entre itens.

Abra `index.html` direto no navegador (não precisa de build). Os números são **dados de exemplo** gerados no próprio arquivo: 5 ativos, aporte mensal de R$ 1.500 desde jan/24.

| Tela | Componentes do EasyUI usados |
|---|---|
| Carteira | Animated Number Morph (patrimônio), Badge, Stat Card com sparkline, Interactive Area Chart (troca de período com morphing e tooltip ao arrastar), SlidePagination/Animated Tabs (períodos), Donut Chart, Expandable Data Row (ativos), Neon Edge Button (atualizar), Gooey Menu (atalho no celular), Undo Toast |
| Análise | Activity Heatmap (retornos mensais), Bar Chart (resultado mensal), OriginDropdown (carteira ou ativo) |
| Lançar | Animated Tabs (compra/venda), OriginDropdown (ativo), LockInput, Morphing Button, validação de venda acima do saldo |
| Ajustes | Liquid Toggle, Animated Tabs (tema e período padrão), UnfoldAccordion |
| Navegação | Pill Navigation (celular) e Sidebar com pill deslizante (≥ 1024px) |

Tema claro e escuro seguem o sistema, com opção manual em Ajustes. Nada aqui altera o app em `src/`.
