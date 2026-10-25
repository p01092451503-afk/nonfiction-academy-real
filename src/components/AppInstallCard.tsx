import { useEffect, useState } from "react";
import { Smartphone, Download, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import {
  subscribeInstallState,
  triggerInstall,
  isAppInstalled,
  isIOSDevice,
  isAndroidDevice,
  getBrowserHint,
} from "@/lib/pwaInstall";

type Lang = "ko" | "en" | "ja" | "zh-CN";

const STRINGS: Record<Lang, Record<string, string>> = {
  ko: {
    title: "앱으로 설치하기",
    desc: "홈 화면에서 빠르게 학습하고 알림도 받아보세요. 한 번 설치하면 브라우저를 열지 않아도 바로 실행됩니다.",
    installed: "설치 완료",
    install: "설치",
    howTo: "설치 방법 보기",
    toastDone: "설치 완료",
    toastDoneDesc: "홈 화면에서 NONFICTION Academy를 실행할 수 있어요.",
    toastCancel: "설치가 취소되었습니다",
    toastCancelDesc: "원하실 때 다시 설치할 수 있어요.",
    toastUnavailable: "자동 설치를 사용할 수 없어요",
    toastUnavailableDesc: "아래 단계별 안내에 따라 직접 설치해 주세요.",
    manualIntro: "팝업이 차단되었거나 자동 설치 안내가 뜨지 않는 경우, 아래 방법으로 직접 설치해 주세요.",
    iosStep1Pre: "Safari 하단 가운데의 ",
    iosStep1Bold: "공유 버튼",
    iosStep1Post: " (네모+화살표 아이콘)을 누르세요.",
    iosStep2Pre: "메뉴에서 ",
    iosStep2Bold: "홈 화면에 추가",
    iosStep2Post: "를 선택하세요.",
    iosStep3Pre: "오른쪽 상단의 ",
    iosStep3Bold: "추가",
    iosStep3Post: "를 누르면 설치가 완료됩니다.",
    iosStep4Pre: "※ iPhone에서는 반드시 ",
    iosStep4Bold: "Safari",
    iosStep4Post: "에서 진행해야 합니다 (Chrome/네이버 앱 ❌).",
    androidStep1Pre: "브라우저 우측 상단의 ",
    androidStep1Bold: "⋮ 메뉴",
    androidStep1Post: "를 누르세요.",
    androidStep2Samsung: "'페이지 추가 → 홈 화면'",
    androidStep2Other: "'앱 설치' 또는 '홈 화면에 추가'",
    androidStep2Post: " 항목을 선택하세요.",
    androidStep3Pre: "안내에 따라 ",
    androidStep3Bold: "설치",
    androidStep3Post: "를 누르면 홈 화면에 아이콘이 생성됩니다.",
    androidStep4: "※ Chrome / Samsung Internet 사용을 권장합니다 (인앱 브라우저 ❌).",
    desktopStep1Pre: "주소창 오른쪽 끝의 ",
    desktopStep1Bold1: "설치 아이콘",
    desktopStep1Mid: " (모니터+⬇️) 또는 ",
    desktopStep1Bold2: "⋮ 메뉴 → 'NONFICTION Academy 설치'",
    desktopStep1Post: "를 선택하세요.",
    desktopStep2Pre: "팝업이 뜨면 ",
    desktopStep2Bold: "설치",
    desktopStep2Post: "를 클릭하세요.",
    desktopStep3Pre: "설치 아이콘이 보이지 않는다면 주소창 좌측의 ",
    desktopStep3Bold1: "자물쇠/사이트 정보",
    desktopStep3Mid: " → ",
    desktopStep3Bold2: "사이트 설정 → 팝업 차단 해제",
    desktopStep3Post: " 후 페이지를 새로고침하세요.",
    desktopStep4: "※ Chrome, Edge, Brave 등 Chromium 기반 브라우저에서만 설치가 지원됩니다.",
    footerPre: "💡 설치 후 이 페이지에 다시 방문하면 버튼이 ",
    footerBold: "'설치 완료'",
    footerPost: "로 자동 변경됩니다.",
  },
  en: {
    title: "Install as App",
    desc: "Learn faster from your home screen and receive notifications. Once installed, launch instantly without opening a browser.",
    installed: "Installed",
    install: "Install",
    howTo: "How to install",
    toastDone: "Installation complete",
    toastDoneDesc: "You can now launch NONFICTION Academy from your home screen.",
    toastCancel: "Installation cancelled",
    toastCancelDesc: "You can install it again anytime.",
    toastUnavailable: "Automatic install is unavailable",
    toastUnavailableDesc: "Please install manually using the steps below.",
    manualIntro: "If pop-ups are blocked or the auto-install prompt does not appear, install manually using the steps below.",
    iosStep1Pre: "Tap the ",
    iosStep1Bold: "Share button",
    iosStep1Post: " (square + arrow icon) at the bottom center of Safari.",
    iosStep2Pre: "From the menu, choose ",
    iosStep2Bold: "Add to Home Screen",
    iosStep2Post: ".",
    iosStep3Pre: "Tap ",
    iosStep3Bold: "Add",
    iosStep3Post: " in the top right to finish.",
    iosStep4Pre: "※ On iPhone, this must be done in ",
    iosStep4Bold: "Safari",
    iosStep4Post: " (Chrome / Naver in-app browser ❌).",
    androidStep1Pre: "Tap the ",
    androidStep1Bold: "⋮ menu",
    androidStep1Post: " at the top right of the browser.",
    androidStep2Samsung: "'Add page to → Home screen'",
    androidStep2Other: "'Install app' or 'Add to Home screen'",
    androidStep2Post: " from the menu.",
    androidStep3Pre: "Follow the prompt and tap ",
    androidStep3Bold: "Install",
    androidStep3Post: ". An icon will appear on your home screen.",
    androidStep4: "※ Chrome / Samsung Internet recommended (in-app browsers ❌).",
    desktopStep1Pre: "At the right end of the address bar, choose the ",
    desktopStep1Bold1: "install icon",
    desktopStep1Mid: " (monitor + ⬇️) or ",
    desktopStep1Bold2: "⋮ menu → 'Install NONFICTION Academy'",
    desktopStep1Post: ".",
    desktopStep2Pre: "When the prompt appears, click ",
    desktopStep2Bold: "Install",
    desktopStep2Post: ".",
    desktopStep3Pre: "If you can't see the install icon, open the ",
    desktopStep3Bold1: "lock / site info",
    desktopStep3Mid: " icon on the left of the address bar → ",
    desktopStep3Bold2: "Site settings → Allow pop-ups",
    desktopStep3Post: ", then refresh the page.",
    desktopStep4: "※ Installation is only supported on Chromium-based browsers (Chrome, Edge, Brave, etc.).",
    footerPre: "💡 After installation, when you revisit this page the button will automatically change to ",
    footerBold: "'Installed'",
    footerPost: ".",
  },
  ja: {
    title: "アプリとしてインストール",
    desc: "ホーム画面から素早く学習し、通知も受け取れます。一度インストールすればブラウザを開かずにすぐ起動できます。",
    installed: "インストール済み",
    install: "インストール",
    howTo: "インストール方法を見る",
    toastDone: "インストール完了",
    toastDoneDesc: "ホーム画面から NONFICTION Academy を起動できます。",
    toastCancel: "インストールがキャンセルされました",
    toastCancelDesc: "いつでも再度インストールできます。",
    toastUnavailable: "自動インストールは利用できません",
    toastUnavailableDesc: "以下の手順に従って手動でインストールしてください。",
    manualIntro: "ポップアップがブロックされている、または自動インストール案内が表示されない場合は、以下の方法で手動インストールしてください。",
    iosStep1Pre: "Safari下部中央の ",
    iosStep1Bold: "共有ボタン",
    iosStep1Post: "(四角+矢印アイコン)をタップします。",
    iosStep2Pre: "メニューから ",
    iosStep2Bold: "ホーム画面に追加",
    iosStep2Post: " を選択します。",
    iosStep3Pre: "右上の ",
    iosStep3Bold: "追加",
    iosStep3Post: " をタップするとインストール完了です。",
    iosStep4Pre: "※ iPhoneでは必ず ",
    iosStep4Bold: "Safari",
    iosStep4Post: " で行ってください(Chrome/Naverアプリ ❌)。",
    androidStep1Pre: "ブラウザ右上の ",
    androidStep1Bold: "⋮ メニュー",
    androidStep1Post: " をタップします。",
    androidStep2Samsung: "「ページを追加 → ホーム画面」",
    androidStep2Other: "「アプリをインストール」または「ホーム画面に追加」",
    androidStep2Post: " を選択します。",
    androidStep3Pre: "案内に従って ",
    androidStep3Bold: "インストール",
    androidStep3Post: " をタップするとホーム画面にアイコンが作成されます。",
    androidStep4: "※ Chrome / Samsung Internet の使用を推奨します(アプリ内ブラウザ ❌)。",
    desktopStep1Pre: "アドレスバー右端の ",
    desktopStep1Bold1: "インストールアイコン",
    desktopStep1Mid: "(モニター+⬇️)または ",
    desktopStep1Bold2: "⋮ メニュー → 「NONFICTION Academy をインストール」",
    desktopStep1Post: " を選択します。",
    desktopStep2Pre: "ポップアップが表示されたら ",
    desktopStep2Bold: "インストール",
    desktopStep2Post: " をクリックします。",
    desktopStep3Pre: "インストールアイコンが表示されない場合は、アドレスバー左の ",
    desktopStep3Bold1: "鍵 / サイト情報",
    desktopStep3Mid: " → ",
    desktopStep3Bold2: "サイト設定 → ポップアップ許可",
    desktopStep3Post: " の後、ページを再読み込みしてください。",
    desktopStep4: "※ Chrome、Edge、Brave など Chromium 系ブラウザでのみインストール可能です。",
    footerPre: "💡 インストール後、このページに再訪問するとボタンが ",
    footerBold: "「インストール済み」",
    footerPost: " に自動的に変わります。",
  },
  "zh-CN": {
    title: "安装为应用",
    desc: "从主屏幕快速学习并接收通知。安装一次后,无需打开浏览器即可立即启动。",
    installed: "已安装",
    install: "安装",
    howTo: "查看安装方法",
    toastDone: "安装完成",
    toastDoneDesc: "可从主屏幕启动 NONFICTION Academy。",
    toastCancel: "已取消安装",
    toastCancelDesc: "您可以随时重新安装。",
    toastUnavailable: "无法使用自动安装",
    toastUnavailableDesc: "请按照以下步骤手动安装。",
    manualIntro: "如果弹窗被拦截或自动安装提示未出现,请按照以下方法手动安装。",
    iosStep1Pre: "点击 Safari 底部中央的 ",
    iosStep1Bold: "分享按钮",
    iosStep1Post: "(方框+箭头图标)。",
    iosStep2Pre: "在菜单中选择 ",
    iosStep2Bold: "添加到主屏幕",
    iosStep2Post: "。",
    iosStep3Pre: "点击右上角的 ",
    iosStep3Bold: "添加",
    iosStep3Post: " 即可完成安装。",
    iosStep4Pre: "※ 在 iPhone 上必须使用 ",
    iosStep4Bold: "Safari",
    iosStep4Post: " 进行(Chrome / Naver 内置浏览器 ❌)。",
    androidStep1Pre: "点击浏览器右上角的 ",
    androidStep1Bold: "⋮ 菜单",
    androidStep1Post: "。",
    androidStep2Samsung: "「添加页面 → 主屏幕」",
    androidStep2Other: "「安装应用」或「添加到主屏幕」",
    androidStep2Post: " 选项。",
    androidStep3Pre: "按提示点击 ",
    androidStep3Bold: "安装",
    androidStep3Post: ",主屏幕将生成图标。",
    androidStep4: "※ 推荐使用 Chrome / Samsung Internet(应用内浏览器 ❌)。",
    desktopStep1Pre: "在地址栏最右侧选择 ",
    desktopStep1Bold1: "安装图标",
    desktopStep1Mid: "(显示器+⬇️)或 ",
    desktopStep1Bold2: "⋮ 菜单 →「安装 NONFICTION Academy」",
    desktopStep1Post: "。",
    desktopStep2Pre: "出现弹窗时点击 ",
    desktopStep2Bold: "安装",
    desktopStep2Post: "。",
    desktopStep3Pre: "如果看不到安装图标,请打开地址栏左侧的 ",
    desktopStep3Bold1: "锁 / 网站信息",
    desktopStep3Mid: " → ",
    desktopStep3Bold2: "网站设置 → 允许弹窗",
    desktopStep3Post: ",然后刷新页面。",
    desktopStep4: "※ 仅支持 Chromium 内核浏览器(Chrome、Edge、Brave 等)。",
    footerPre: "💡 安装后再次访问此页面时,按钮将自动变为 ",
    footerBold: "「已安装」",
    footerPost: "。",
  },
};

const AppInstallCard = () => {
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const lang: Lang = (i18n.language === "yue" ? "zh-CN" : ["ko", "en", "ja", "zh-CN"].includes(i18n.language) ? i18n.language : "ko") as Lang;
  const t = STRINGS[lang];

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
      toast({ title: t.toastDone, description: t.toastDoneDesc });
    } else if (result === "dismissed") {
      toast({ title: t.toastCancel, description: t.toastCancelDesc });
    } else {
      setShowManual(true);
      toast({ title: t.toastUnavailable, description: t.toastUnavailableDesc });
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
            <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
          </div>
        </div>

        {installed ? (
          <Button size="sm" variant="outline" disabled className="rounded-lg gap-1.5 shrink-0">
            <Check className="h-3.5 w-3.5" />
            {t.installed}
          </Button>
        ) : available ? (
          <Button size="sm" onClick={handleInstall} className="rounded-lg gap-1.5 shrink-0">
            <Download className="h-3.5 w-3.5" />
            {t.install}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManual((v) => !v)}
            className="rounded-lg gap-1.5 shrink-0"
          >
            <Info className="h-3.5 w-3.5" />
            {t.howTo}
          </Button>
        )}
      </div>

      {!installed && showManual && (
        <div className="rounded-lg bg-secondary/40 border border-border p-4 text-xs text-foreground/80 space-y-3">
          <p className="font-medium text-foreground">{t.manualIntro}</p>

          {ios && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>{t.iosStep1Pre}<strong>{t.iosStep1Bold}</strong>{t.iosStep1Post}</li>
              <li>{t.iosStep2Pre}<strong>{t.iosStep2Bold}</strong>{t.iosStep2Post}</li>
              <li>{t.iosStep3Pre}<strong>{t.iosStep3Bold}</strong>{t.iosStep3Post}</li>
              <li>{t.iosStep4Pre}<strong>{t.iosStep4Bold}</strong>{t.iosStep4Post}</li>
            </ol>
          )}

          {android && !ios && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>{t.androidStep1Pre}<strong>{t.androidStep1Bold}</strong>{t.androidStep1Post}</li>
              <li>{browser === "samsung" ? t.androidStep2Samsung : t.androidStep2Other}{t.androidStep2Post}</li>
              <li>{t.androidStep3Pre}<strong>{t.androidStep3Bold}</strong>{t.androidStep3Post}</li>
              <li>{t.androidStep4}</li>
            </ol>
          )}

          {!ios && !android && (
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>
                {t.desktopStep1Pre}<strong>{t.desktopStep1Bold1}</strong>{t.desktopStep1Mid}
                <strong>{t.desktopStep1Bold2}</strong>{t.desktopStep1Post}
              </li>
              <li>{t.desktopStep2Pre}<strong>{t.desktopStep2Bold}</strong>{t.desktopStep2Post}</li>
              <li>
                {t.desktopStep3Pre}<strong>{t.desktopStep3Bold1}</strong>{t.desktopStep3Mid}
                <strong>{t.desktopStep3Bold2}</strong>{t.desktopStep3Post}
              </li>
              <li>{t.desktopStep4}</li>
            </ol>
          )}

          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
            {t.footerPre}<strong>{t.footerBold}</strong>{t.footerPost}
          </p>
        </div>
      )}
    </div>
  );
};

export default AppInstallCard;
