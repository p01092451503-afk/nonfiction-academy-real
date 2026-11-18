import { afterEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { k, kMap, uiTextTable } from './uiText';

afterEach(() => { void i18n.changeLanguage('ko'); });

describe('My Growth interface labels', () => {
  it('keeps Korean as-is in Korean', async () => {
    await i18n.changeLanguage('ko');
    expect(k('참석 저장')).toBe('참석 저장');
  });
  it('translates labels into all four other languages', async () => {
    for (const [lang, want] of [['en', 'Save attendance'], ['ja', '出席を保存'], ['zh-CN', '保存出席'], ['yue', '儲存出席']] as const) {
      await i18n.changeLanguage(lang);
      expect(k('참석 저장')).toBe(want);
    }
  });
  it('fills names and numbers into templates', async () => {
    await i18n.changeLanguage('en');
    expect(k('전체 {{total}}건 · 조회 {{shown}}건', { total: 5, shown: 2 })).toBe('5 total · 2 shown');
  });
  it('returns unknown text such as record titles untouched', async () => {
    await i18n.changeLanguage('en');
    expect(k('홍길동 매장 교육 원문')).toBe('홍길동 매장 교육 원문');
  });
  it('translates module-level label maps at read time', async () => {
    const m = kMap({ done: '완료' });
    await i18n.changeLanguage('ja');
    expect(m.done).toBe('完了');
  });
  it('has a translation for every language on every label', () => {
    for (const [ko, v] of Object.entries(uiTextTable)) expect(v.every(s => s.length > 0), ko).toBe(true);
  });
});
