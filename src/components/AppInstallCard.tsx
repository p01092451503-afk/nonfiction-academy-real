import { useEffect, useState } from "react";
import { Smartphone, Download, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  subscribeInstallState,
  triggerInstall,
  isAppInstalled,
  isIOSDevice,
  isAndroidDevice,
  getBrowserHint,
} from "@/lib/pwaInstall";

/**
 * App install card for MyPage.
 *
 * - Installed (standalone) → 비활성화 + "설치 완료"
 * - beforeinstallprompt 캡처됨 → 활성화된 "설치" 버튼
 * - 캡처 안됨 (팝업 차단 / iOS / 미지원 브라우저) → 수동 설치 안내 단계별 표시
 */
const AppInstallCard = () => {
  const { toast } = useToast();
  const [installed, setInstalled] = useState(isAppInstalled());
  const [available, setAvailable] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const unsub = subscribeInstallState((ok) => {
      setAvailable(ok);
      setInstalled(isAppInstalled());
    });
    return unsub;
  }, []);

  const handleInstall = async () => {
    const result = await triggerInstall();
    if (result === "accepted") {
      toast({ title: "설치 완료", description: "홈 화면에서 NONFICTION Academy를 실행할 수 있어요." });
    } else if (result === "dismissed") {
      toast({ title: "설치가 취소되었습니다", description: "원하실 때 다시 설치할 수 있어요." });
    } else {
      // unavailable — show manual guide
      setShowManual(true);
      toast({
        title: "자동 설치를 사용할 수 없어요",
        description: "아래 단계별 안내에 따라 직접 설치해 주세요.",
      });
    }
  };

  const ios = isIOSDevice();
  const android = isAndroidDevice();
  const browser = getBrowserHint();

  return (
    <div className="border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold text-foreground">앱으로 설치하기</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              홈 화면에서 빠르게 학습하고 알림도 받아보세요. 한 번 설치하면 브라우저를 열지 않아도 바로 실행됩니다.
            </p>
          </div>
        </div>

        {installed ? (
          <Button size="sm" variant="outline" disabled className="rounded-lg gap-1.5 shrink-0">
            <Check className="h-3.5 w-3.5" />
            설치 완료
          </Button>
        ) : available ? (
          <Button size="sm" onClick={handleInstall} className="rounded-lg gap-1.5 shrink-0">
            <Download className="h-3.5 w-3.5" />
            설치
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManual((v) => !v)}
            className="rounded-lg gap-1.5 shrink-0"
          >
            <Info className="h-3.5 w-3.5" />
            설치 방법 보기
          </Button>
        )}
      </div>

      {!installed && (showManual || !available) && (
        <div className="rounded-lg bg-secondary/40 border border-border p-4 text-xs text-foreground/80 space-y-3">
          <p className="font-medium text-foreground">
            팝업이 차단되었거나 자동 설치 안내가 뜨지 않는 경우, 아래 방법으로 직접 설치해 주세요.
          </p>

          {ios && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>Safari 하단 가운데의 <strong>공유 버튼</strong> (네모+화살표 아이콘)을 누르세요.</li>
              <li>메뉴에서 <strong>홈 화면에 추가</strong>를 선택하세요.</li>
              <li>오른쪽 상단의 <strong>추가</strong>를 누르면 설치가 완료됩니다.</li>
              <li>※ iPhone에서는 반드시 <strong>Safari</strong>에서 진행해야 합니다 (Chrome/네이버 앱 ❌).</li>
            </ol>
          )}

          {android && !ios && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>브라우저 우측 상단의 <strong>⋮ 메뉴</strong>를 누르세요.</li>
              <li>
                {browser === "samsung"
                  ? "‘페이지 추가 → 홈 화면’"
                  : "‘앱 설치’ 또는 ‘홈 화면에 추가’"}{" "}
                항목을 선택하세요.
              </li>
              <li>안내에 따라 <strong>설치</strong>를 누르면 홈 화면에 아이콘이 생성됩니다.</li>
              <li>※ Chrome / Samsung Internet 사용을 권장합니다 (인앱 브라우저 ❌).</li>
            </ol>
          )}

          {!ios && !android && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>
                주소창 오른쪽 끝의 <strong>설치 아이콘</strong> (모니터+⬇️) 또는{" "}
                <strong>⋮ 메뉴 → ‘NONFICTION Academy 설치’</strong>를 선택하세요.
              </li>
              <li>팝업이 뜨면 <strong>설치</strong>를 클릭하세요.</li>
              <li>
                설치 아이콘이 보이지 않는다면 주소창 좌측의 <strong>자물쇠/사이트 정보</strong> →{" "}
                <strong>사이트 설정 → 팝업 차단 해제</strong> 후 페이지를 새로고침하세요.
              </li>
              <li>※ Chrome, Edge, Brave 등 Chromium 기반 브라우저에서만 설치가 지원됩니다.</li>
            </ol>
          )}

          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
            💡 설치 후 이 페이지에 다시 방문하면 버튼이 <strong>‘설치 완료’</strong>로 자동 변경됩니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default AppInstallCard;
