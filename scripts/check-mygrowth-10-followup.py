"""초안 전용 후속 확인 화면 검사: 실제 로그인·저장·응답 유실 재시도·새로고침·정정·소유자 조회·무단 접근 차단."""
import asyncio,contextlib,re,json,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
ORIGIN='http://localhost:8080'
OUT=Path('/tmp/browser/followup')
subprocess.run(['bash','scripts/mygrowth-draft-isolation.sh','verify'],check=True,stdout=subprocess.DEVNULL)
seed=Path('/dev-server/db/seed.sql').read_text()
password=re.search(r"extensions.crypt\('([^']+)'",seed).group(1)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  errors=[]
  for email,staff in [('growth-senior-a@draft.invalid',True),('growth-regular@draft.invalid',False),('growth-admin@draft.invalid',None)]:
   context=await browser.new_context(viewport={'width':1280,'height':1800},service_workers='block')
   async def to_draft_db(route):
    try:
     if not route.request.frame.url.startswith(ORIGIN+'/'):return await route.abort()
     url='http://127.0.0.1:8001'+route.request.url.split('/_port_8001',1)[1]
     await route.fulfill(response=await route.fetch(url=url,max_redirects=0,timeout=0))
    except Exception:
     with contextlib.suppress(Exception):await route.abort()
   await context.route(re.compile(r'^https?://[^/]+/_port_8001/'),to_draft_db)
   await context.add_init_script(r'''(() => { if (location.origin !== "http://localhost:8080") return; const W=WebSocket; WebSocket=new Proxy(W,{construct(t,a){a[0]=String(a[0]).replace(/^wss?:[/][/][^/]+[/]_port_8001(?=[/])/,'ws://127.0.0.1:8001');return Reflect.construct(t,a);}});})()''')
   async def block_external(route):
    if '/_port_8001/' in route.request.url or route.request.url.startswith(ORIGIN+'/'):return await route.fallback()
    await route.abort()
   await context.route('**/*',block_external)
   page=await context.new_page()
   page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(ORIGIN)
   await page.locator('#login-email').fill(email)
   await page.locator('#login-password').fill(password)
   await page.locator('form button[type=submit]').click()
   await page.wait_for_timeout(3500)
   await page.goto(ORIGIN+'/my-growth/plans')
   await page.wait_for_timeout(2000)
   if staff is None:
    assert page.url==ORIGIN+'/admin','비검수자 화면 미차단'
    result=await page.evaluate('''async () => {const k=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));const t=JSON.parse(localStorage.getItem(k)).access_token;const u=performance.getEntriesByType('resource').map(x=>x.name).find(x=>x.includes('/_port_8001/'));const base=u.split('/_port_8001/')[0]+'/_port_8001';const r=await fetch(base+'/rest/v1/rpc/mygrowth_followup_detail',{method:'POST',headers:{Authorization:'Bearer '+t,apikey:t,'Content-Type':'application/json'},body:JSON.stringify({_plan_id:'f0000000-0000-4000-8000-000000000003'})}); return r.status;}''')
    assert result==403,'비검수자 판정 조회 미차단'
    print('검수 명단 밖 관리자 화면 및 판정 호출 차단 통과')
   else:
    if staff:await page.get_by_role('tab',name='담당 직원 계획').click()
    row=page.get_by_role('listitem').filter(has_text='후속 확인 검수용 고객 응대 교육')
    await row.wait_for()
    if staff:
     for status,note in [('진행 중','일주일간 응대 순서 적용을 확인했습니다.'),('이행 완료','추가 관찰 결과 일관된 실천을 확인해 정정합니다.')]:
      await row.get_by_role('button',name=re.compile('이행 판정|추가 판정·정정')).click()
      await row.get_by_role('combobox').click()
      await page.get_by_role('option',name=status,exact=True).click()
      await row.get_by_label('판정 의견·정정 사유').fill(note)
      before=await row.locator('summary').filter(has_text=re.compile('판정 이력')).all_text_contents()
      if status=='진행 중':
       async def lose_response(route):
        await route.fetch()
        await route.fulfill(status=503,content_type='application/json',body='{"message":"시험 응답 유실"}')
       await context.route('**/rest/v1/rpc/mygrowth_save_followup',lose_response)
       await row.get_by_role('button',name='판정 저장').click()
       await row.get_by_role('status').filter(has_text='저장 결과를 확인하지 못했습니다.').wait_for()
       await context.unroute('**/rest/v1/rpc/mygrowth_save_followup',lose_response)
      await row.get_by_role('button',name='판정 저장').click()
      await row.get_by_text('판정을 저장했습니다.',exact=True).first.wait_for()
      await page.reload()
      await page.get_by_role('tab',name='담당 직원 계획').click()
      row=page.get_by_role('listitem').filter(has_text='후속 확인 검수용 고객 응대 교육')
      await row.get_by_text(note,exact=True).first.wait_for()
      after=await row.locator('summary').filter(has_text=re.compile('판정 이력')).all_text_contents()
      b=int(re.search(r'(\d+)건',before[0]).group(1)) if before else 0
      a=int(re.search(r'(\d+)건',after[0]).group(1))
      assert a==b+1,'응답 유실 재시도 중복 저장'
      if status=='진행 중':print('저장 응답 유실 후 재시도 중복 방지 통과')
     await row.locator('summary').filter(has_text=re.compile('판정 이력')).click()
     assert await row.get_by_text('일주일간 응대 순서 적용을 확인했습니다.',exact=True).count()>0
     await page.screenshot(path=str(OUT/'trainer_history.png'))
     print('담당자 저장·새로고침·정정·이전 이력 보존 통과')
    else:
     await row.get_by_role('button',name='계획 보기·수정').click()
     await row.get_by_text('추가 관찰 결과 일관된 실천을 확인해 정정합니다.',exact=True).first.wait_for()
     assert await row.get_by_role('button',name=re.compile('이행 판정|추가 판정·정정')).count()==0
     await row.locator('summary').filter(has_text=re.compile('판정 이력')).click()
     await page.screenshot(path=str(OUT/'employee_history.png'))
     print('직원 본인 판정·이력 읽기 전용 확인 통과')
    await page.set_viewport_size({'width':390,'height':844})
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),'휴대전화 가로 넘침'
    await page.screenshot(path=str(OUT/('trainer_mobile.png' if staff else 'employee_mobile.png')))
   await context.close()
  assert not errors, errors
  print('화면 오류 0건')
  await browser.close()
asyncio.run(main())
