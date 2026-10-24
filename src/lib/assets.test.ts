import { describe as suite, expect, it } from 'vitest';
import { classOf, migrateTargets } from './assets';

suite('classes de ativo', () => {
  it('usa as classes conhecidas e a escolhida pelo usuário', () => {
    expect(classOf('WRLD11', {})).toBe('RV Internacional');
    expect(classOf('MUND11', {})).toBe('RV Internacional');
    expect(classOf('B5P211', {})).toBe('RF Brasil');
    expect(classOf('PETR4', {})).toBe('RV Brasil');
    expect(classOf('AAPL34', {})).toBe('RV Internacional');
    expect(classOf('PETR4', { PETR4: 'Outros' })).toBe('Outros');
  });

  it('converte metas antigas por ticker em metas por classe', () => {
    expect(migrateTargets({ WRLD11: 0.5, MUND11: 0.2, B5P211: 0.3 }, {})).toEqual({ 'RV Internacional': 0.7, 'RF Brasil': 0.3 });
    expect(migrateTargets({ 'RF Brasil': 0.4 }, {})).toEqual({ 'RF Brasil': 0.4 });
  });
});
