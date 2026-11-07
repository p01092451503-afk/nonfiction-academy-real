import asyncio,contextlib,re,json,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ORIGIN='http://localhost:8080'
OUT=Path('/tmp/browser/mygrowth-check')
subprocess.run(['bash', '/dev-server/scripts/mygrowth-draft-isolation.sh', 'verify'], check=True, stdout=subprocess.DEVNULL)
OUT.mkdir(parents=True, exist_ok=True)
# 기존 예시 계정의 비밀번호는 출력하지 않고 로그인 입력에만 사용합니다.
seed=Path('/dev-server/db/seed.sql').read_text()
password=re.search(r"extensions.crypt\('([^']+)'",seed).group(1)
roles=[('학습자','growth-student@draft.invalid','/student'),('관리자','growth-admin@draft.invalid','/admin'),('최고관리자','growth-super@draft.invalid','/admin'),('러닝매니저','growth-manager@draft.invalid','/teacher'),('지정검수자','mygrowth-reviewer@example.com','/student')]
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  results=[]
  for idx,(label,email,home) in enumerate(roles):
   context=await browser.new_context(viewport={'width':1280,'height':1800},service_workers='block')
   async def to_draft_db(route):
    try:
     if not route.request.frame.url.startswith(ORIGIN+'/'):return await route.abort()
     url='http://127.0.0.1:8001'+route.request.url.split('/_port_8001',1)[1]
     await route.fulfill(response=await route.fetch(url=url,max_redirects=0,timeout=0))
    except Exception:
     with contextlib.suppress(Exception):await route.abort()
   await context.route(re.compile(r'^https?://[^/]+/_port_8001/'),to_draft_db)
   await context.add_init_script(r'''(() => { if (location.origin !== "http://localhost:8080") return; const W=WebSocket; WebSocket=new Proxy(W,{construct(t,a){a[0]=String(a[0]).replace(/^wss?:[/][/][^/]+[/]_port_8001(?=[/])/,"ws://127.0.0.1:8001");return Reflect.construct(t,a);}});})()''')
   async def block_external(route):
    if '/_port_8001/' in route.request.url or route.request.url.startswith(ORIGIN+'/'):return await route.fallback()
    await route.abort()
   await context.route('**/*',block_external)
   page=await context.new_page()
   errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(ORIGIN,wait_until='domcontentloaded')
   await page.locator('#login-email').fill(email)
   await page.locator('#login-password').fill(password)
   await page.locator('form button[type=submit]').click()
   await page.wait_for_timeout(4500)
   assert page.url==ORIGIN+home,(label,'로그인 직후 역할 화면 오류',page.url)
   await page.goto(ORIGIN+home)
   await page.wait_for_timeout(3500)
   assert page.url==ORIGIN+home,(label,'역할 화면 접근 실패',page.url)
   await page.screenshot(path=str(OUT/f'{idx}_home.png'))
   aside=await page.locator('aside').all_text_contents()
   assert not any('My Growth' in t or '마이그로스' in t for t in aside),'기존 메뉴에 새 기능 노출'
   data_before=None
   if idx==0:
    await page.goto(ORIGIN+'/student/courses/66666666-6666-4666-8666-666666666666/content/77777777-7777-4777-8777-777777777777?view=learn')
    await page.wait_for_timeout(6500)
    await page.screenshot(path=str(OUT/'student_learning.png'))
    assert await page.get_by_text('검수용 이미지 차시',exact=True).count()>0,'이미지 차시 미표시'
    await page.goto(ORIGIN+'/student/courses/66666666-6666-4666-8666-666666666666?view=learn')
    await page.wait_for_timeout(2500)
    await page.screenshot(path=str(OUT/'student_readback.png'))
   await page.goto(ORIGIN+'/my-growth')
   await page.wait_for_timeout(3000)
   if idx<4:assert page.url==ORIGIN+home,(label,'직접 접근 미차단',page.url)
   else:assert page.url==ORIGIN+'/my-growth','지정 검수자 차단됨'
   await page.screenshot(path=str(OUT/f'{idx}_gate.png'))
   # 현재 세션으로 실제 데이터 요청을 확인합니다. 세션은 출력하지 않습니다.
   db=await page.evaluate('''async () => {
    const key=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));
    const raw=key ? JSON.parse(localStorage.getItem(key)) : null;
    const token=raw?.access_token; if(!token)return {error:'세션 없음'};
    const url=Object.values(performance.getEntriesByType('resource')).map(x=>x.name).find(x=>x.includes('/_port_8001/'));
    const base=url?.split('/_port_8001/')[0]+'/_port_8001';
    const headers={Authorization:'Bearer '+token,apikey:token};
    const rpc=await fetch(base+'/rest/v1/rpc/is_mygrowth_reviewer',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
    const events=await fetch(base+'/rest/v1/mygrowth_events?select=id',{headers});
    const rows=await events.json();return {reviewer:await rpc.json(),eventsStatus:events.status,eventCount:Array.isArray(rows)?rows.length:null};
   }''')
   assert db.get('eventCount') == (7 if idx==4 else 0), '검수 명단 자료 차단 실패'
   assert db.get('reviewer') == (idx==4), '서버 검수자 판정 실패'
   results.append({'역할':label,'로그인':'통과','직접접근':'허용' if idx==4 else '차단','자료검사':db,'화면오류':errors})
   print(json.dumps(results[-1],ensure_ascii=False))
   if idx==1:
    await page.goto(ORIGIN+'/admin')
    await page.wait_for_timeout(2000)
    await page.locator('aside').evaluate('(e)=>{e.dataset.qaPersistent="yes"}')
    await page.locator('aside a[href="/admin/courses"]').click()
    await page.wait_for_timeout(2500)
    assert await page.locator('aside').get_attribute('data-qa-persistent')=='yes','메뉴 이동 중 좌측 메뉴 교체'
    await page.screenshot(path=str(OUT/'admin_navigation.png'))
   if idx==4:
    for payload in ['null', '{"message":"시험 오류"}']:
     async def rpc_failure(route):
      await route.fulfill(status=200 if payload=='null' else 500,content_type='application/json',body=payload)
     await context.route('**/rest/v1/rpc/is_mygrowth_reviewer',rpc_failure)
     await page.goto(ORIGIN+'/my-growth')
     await page.wait_for_timeout(2500)
     assert page.url==ORIGIN+'/student','서버 오류 또는 빈 응답 미차단'
     await context.unroute('**/rest/v1/rpc/is_mygrowth_reviewer',rpc_failure)
    await page.goto(ORIGIN+'/my-growth')
    await page.wait_for_timeout(2000)
    conn=['env','-u','PGSERVICE','-u','PGSERVICEFILE','psql','host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres','-X','-v','ON_ERROR_STOP=1']
    subprocess.run(conn+['-c',"delete from public.mygrowth_reviewers where user_id='11111111-1111-4111-8111-111111111111';"],check=True,stdout=subprocess.DEVNULL)
    try:
     await page.wait_for_timeout(17000)
     assert page.url==ORIGIN+'/student','명단 회수 후 화면 미차단'
     await page.screenshot(path=str(OUT/'revoked.png'))
    finally:
     subprocess.run(conn+['--single-transaction','-f','/dev-server/db/seed.sql'],check=True,stdout=subprocess.DEVNULL)
   await page.set_viewport_size({'width':390,'height':844})
   await page.goto(ORIGIN+('/my-growth' if idx==4 else home))
   await page.wait_for_timeout(3000)
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'휴대전화 가로 넘침'
   await page.screenshot(path=str(OUT/f'{idx}_mobile.png'))
   if idx==0:
    await page.goto(ORIGIN+'/student/courses/66666666-6666-4666-8666-666666666666/content/77777777-7777-4777-8777-777777777777?view=learn')
    await page.wait_for_timeout(3500)
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'휴대전화 학습 가로 넘침'
    await page.screenshot(path=str(OUT/'mobile_learning.png'))
   print(label+' 추가 검수 통과')
   await context.close()
  (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
  await browser.close()
asyncio.run(main())
