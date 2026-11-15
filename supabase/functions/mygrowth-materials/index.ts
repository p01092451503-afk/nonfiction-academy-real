import { validateEnvelope, MAX_BYTES } from './format.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Disposition' };
const json = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
// Transport uses native fetch only: no dependency registry calls in an isolated worker.
Deno.serve(async req => {
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return json(405,'지원하지 않는 요청입니다.');
 const base=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),auth=req.headers.get('Authorization');
 if(!base||!anon||!service||!auth)return json(401,'로그인이 필요합니다.');
 const caller={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
 const admin={apikey:service,Authorization:'Bearer '+service};
 async function rpc(name:string,body:unknown){const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:caller,body:JSON.stringify(body)});if(!r.ok)throw new Error('권한 또는 입력을 확인하십시오.');return await r.json();}
 try {
 const identity=await fetch(base+'/auth/v1/user',{headers:caller});if(!identity.ok)return json(401,'로그인을 다시 확인하십시오.');const user=await identity.json();
 if(req.headers.get('Content-Type')?.includes('multipart/form-data')){
  if(Number(req.headers.get('Content-Length')??0)>MAX_BYTES+65536)return json(413,'파일은 50MB 이하만 가능합니다.');
  const form=await req.formData(),file=form.get('file'),training=form.get('training');
  if(!(file instanceof File)||typeof training!=='string'||file.size>MAX_BYTES)return json(400,'파일과 교육을 확인하십시오.');
  if(!await rpc('mygrowth_session_scope',{_id:training}))return json(403,'등록 권한이 없습니다.');
  const bytes=new Uint8Array(await file.arrayBuffer());const safeName=file.name.replace(/^.*[\\/]/,'');const ext=validateEnvelope(safeName,bytes);
  if(ext.endsWith('x')){
   const view=new DataView(bytes.buffer);const names=new Set<string>();
   for(let i=0;i+46<=bytes.length;i++)if(view.getUint32(i,true)===0x02014b50){const n=view.getUint16(i+28,true),extra=view.getUint16(i+30,true),comment=view.getUint16(i+32,true);if(i+46+n+extra+comment>bytes.length)throw new Error();const offset=view.getUint32(i+42,true);if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw new Error();names.add(new TextDecoder().decode(bytes.slice(i+46,i+46+n)));i+=45+n+extra+comment;}
   const target=ext==='docx'?'word/document.xml':ext==='xlsx'?'xl/workbook.xml':'ppt/presentation.xml';
   if(!names.has('[Content_Types].xml')||!names.has(target))return json(400,'확장자와 실제 문서 형식이 다릅니다.');
  }
  const reserved=await rpc('mygrowth_material_reserve',{_training:training,_filename:safeName,_bytes:bytes.length});
  const saved=await fetch(base+'/storage/v1/object/mygrowth-materials/'+reserved.path,{method:'POST',headers:{...admin,'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});
  if(!saved.ok)return json(500,'파일을 저장하지 못했습니다. 다시 등록하십시오.');
  if(!await rpc('mygrowth_session_scope',{_id:training}))return json(403,'담당 범위가 변경되어 자료를 공개하지 않았습니다.');
  const finalized=await fetch(base+'/rest/v1/mygrowth_materials?id=eq.'+reserved.id+'&uploaded_by=eq.'+user.id,{method:'PATCH',headers:{...admin,'Content-Type':'application/json'},body:JSON.stringify({ready:true})});
  if(!finalized.ok)return json(500,'자료 등록 결과를 확인하지 못했습니다.');
  return json(200,'교육자료를 등록했습니다.');
 }
 const body=await req.json();let material;
 try{material=await rpc('mygrowth_material_redeem',{_ticket:body.ticket});}catch{return json(403,'다운로드 권한이 만료됐거나 현재 열람 범위가 아닙니다.');}
 const file=await fetch(base+'/storage/v1/object/authenticated/mygrowth-materials/'+material.path,{headers:admin});
 if(!file.ok)return json(404,'파일을 확인하지 못했습니다.');
 const blob=await file.blob();await rpc('mygrowth_material_redeem',{_ticket:body.ticket});
 return new Response(blob,{headers:{...cors,'Content-Type':'application/octet-stream','Cache-Control':'no-store','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(material.filename)}`}});
 }catch(e){console.error('교육자료 처리 실패', e instanceof Error ? e.message : '알 수 없는 오류');return json(400,'자료 형식과 현재 담당·참석 권한을 확인하십시오.');}
});
