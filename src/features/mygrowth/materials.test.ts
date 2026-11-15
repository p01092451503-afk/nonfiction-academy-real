import { describe, it, expect } from 'vitest';
import { validateEnvelope, MAX_BYTES, LINK_SECONDS } from '../../../supabase/functions/mygrowth-materials/format';
describe('교육자료 확정 기준', () => {
  it('파일당 최대 50MB를 허용하고 한 바이트 초과는 거부한다', () => {
    expect(MAX_BYTES).toBe(52428800);
    const bytes = new Uint8Array(MAX_BYTES); bytes.set(new TextEncoder().encode('%PDF-'));
    expect(validateEnvelope('교육.pdf', bytes)).toBe('pdf');
    const over = new Uint8Array(MAX_BYTES + 1); over.set(bytes.subarray(0,5));
    expect(() => validateEnvelope('교육.pdf', over)).toThrow();
  });
  it('다운로드 링크는 일주일이다', () => { expect(LINK_SECONDS).toBe(604800); });
  it('워드 PDF 엑셀 PPT만 허용한다', () => {
    const zip = new Uint8Array([80,75,3,4]);
    for (const ext of ['docx','xlsx','pptx']) expect(validateEnvelope(`교육.${ext}`,zip)).toBe(ext);
    for (const [ext, marker] of [['doc','WordDocument'],['xls','Workbook'],['ppt','PowerPoint Document']]) {
      const bytes=new Uint8Array(100);bytes.set([208,207,17,224,161,177,26,225]);
      for(let i=0;i<marker.length;i++)bytes[10+i*2]=marker.charCodeAt(i);
      expect(validateEnvelope(`교육.${ext}`,bytes)).toBe(ext);
    }
    expect(validateEnvelope('교육.pdf',new TextEncoder().encode('%PDF-'))).toBe('pdf');
    expect(()=>validateEnvelope('교육.exe',zip)).toThrow();
  });
  it('확장자와 파일 형식 불일치를 거부한다', () => {
    expect(()=>validateEnvelope('교육.pdf',new Uint8Array([80,75,3,4]))).toThrow();
    expect(()=>validateEnvelope('교육.doc',new Uint8Array([80,75,3,4]))).toThrow();
  });
});