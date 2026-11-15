export const MAX_BYTES = 50 * 1024 * 1024;
export const LINK_SECONDS = 7 * 24 * 60 * 60;
export function validateEnvelope(name: string, bytes: Uint8Array) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext || !['doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext) || /[/\\]/.test(name) || name.length > 200 || bytes.length < 1 || bytes.length > MAX_BYTES) throw new Error('허용 파일 종류와 50MB 이하 용량을 확인하십시오.');
  if (ext === 'pdf') {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF 형식이 아닙니다.');
  } else if (ext.endsWith('x')) {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error('문서 형식이 아닙니다.');
  } else {
    const magic = [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
    if (!magic.every((v,i) => bytes[i] === v)) throw new Error('문서 형식이 아닙니다.');
    const text = new TextDecoder('utf-16le').decode(bytes);
    const marker = ext === 'doc' ? 'WordDocument' : ext === 'xls' ? 'Workbook' : 'PowerPoint Document';
    if (!text.includes(marker) && !(ext === 'xls' && text.includes('Book'))) throw new Error('확장자와 문서 형식이 다릅니다.');
  }
  return ext;
}