import { Sidebar, TabBar } from './components/ui';
import { useRoute } from './router';
import { Ajustes } from './screens/Ajustes';
import { Analise } from './screens/Analise';
import { Ativo } from './screens/Ativo';
import { Carteira } from './screens/Carteira';
import { Lancamento } from './screens/Lancamento';

export function App() {
  const route = useRoute();
  let screen;
  switch (route.name) {
    case 'analise': screen = <Analise />; break;
    case 'ativo': screen = <Ativo key={route.ticker} ticker={route.ticker} />; break;
    case 'lancar': screen = <Lancamento key={route.ticker ?? ''} initialTicker={route.ticker} />; break;
    case 'ajustes': screen = <Ajustes />; break;
    default: screen = <Carteira />;
  }
  return (
    <div className={`app route-${route.name}`}>
      <Sidebar route={route} />
      <main className="main">{screen}</main>
      {route.name !== 'lancar' && route.name !== 'ativo' && <TabBar route={route} />}
    </div>
  );
}
