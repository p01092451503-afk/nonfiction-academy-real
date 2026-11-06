"""초안 전용 읽기 검수입니다. 외부 전송과 자료 변경을 기본 차단합니다."""
import asyncio
import contextlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from playwright.async_api import async_playwright

ORIGIN = 'http://localhost:8080'
OUT = Path('/tmp/browser/mygrowth-zero')

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    events = []
    with open(Path.home() / '.cache/lovable-auth/session.json') as handle:
        minted = json.load(handle)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 1800}, service_workers='block')
        async def to_draft_db(route):
            try:
                if not route.request.frame.url.startswith(ORIGIN + '/'):
                    return await route.abort()
                suffix = route.request.url.split('/_port_8001', 1)[1]
                # No RPC execution, email, functions, signup or data writes during stage zero.
                safe = route.request.method in ['GET', 'HEAD'] and suffix.startswith(('/rest/v1/', '/auth/v1/user', '/auth/v1/settings', '/storage/v1/'))
                if not safe:
                    events.append({'차단경로': suffix.split('?')[0]})
                    return await route.abort()
                await route.fulfill(response=await route.fetch(url='http://127.0.0.1:8001' + suffix, max_redirects=0, timeout=0))
            except Exception:
                with contextlib.suppress(Exception):
                    await route.abort()
        async def boundary(route):
            target = urlsplit(route.request.url)
            if '/_port_8001/' in target.path:
                # This draft only; never proxy arbitrary external paths.
                if target.hostname != '32613697-36d8-44de-a44f-4b31fe45576b-thr_cefkhpj8hlht.lovableproject.com':
                    events.append({'차단대상': target.hostname})
                    return await route.abort()
                return await to_draft_db(route)
            if target.scheme == 'http' and target.netloc == 'localhost:8080':
                return await route.continue_()
            events.append({'차단대상': target.hostname})
            await route.abort()
        await context.route('**/*', boundary)
        # No backend realtime is needed for a read-only screen comparison.
        await context.route_web_socket(re.compile(r'.*'), lambda ws: ws.close())
        page = await context.new_page()
        await page.goto(ORIGIN)
        await page.evaluate('([k,v]) => localStorage.setItem(k,v)', [minted['storage_key'], json.dumps(minted['session'])])
        await page.goto(ORIGIN + '/admin')
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(OUT / 'verified-admin.png'))
        sidebar = await page.locator('aside').all_text_contents()
        await page.goto(ORIGIN + '/my-growth/isolation')
        await page.wait_for_timeout(3000)
        assert page.url == ORIGIN + '/admin', '미허용 관리자 직접 접근을 차단하지 못합니다'
        assert await page.locator('aside').all_text_contents() == sidebar, '기존 메뉴가 달라집니다'
        await page.screenshot(path=str(OUT / 'verified-direct.png'))
        # Deliberate harmless target: request must be blocked before it leaves the browser.
        await page.evaluate("fetch('https://academy.biz-nonfiction.com/').catch(() => null)")
        assert any(e.get('차단대상') == 'academy.biz-nonfiction.com' for e in events)
        summary = {'직접접근': '차단합니다', '최종경로': '/admin', '메뉴유지': True, '운영요청차단': True, '차단기록': events}
        (OUT / 'verified.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
        print('직접 접근 차단·기존 메뉴 유지·검수 브라우저 운영 요청 차단을 확인합니다.')
        await browser.close()

asyncio.run(main())