import { useEffect, useState } from "react";
import { Smartphone, Lightbulb, Download, Share, MoreVertical, Monitor, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { subscribeInstallState, triggerInstall, isAppInstalled, isIOSDevice } from "@/lib/pwaInstall";
import { normalizeLang, type SupportedLang } from "@/lib/i18nLang";

type S = {
  title: string; subtitle: string; cardDesc: string; button: string; installed: string;
  iosTitle: string; ios: string[]; androidTitle: string; android: string[];
  pcTitle: string; win: string[]; mac: string[]; tipsTitle: string; tips: string[];
  unavailable: string; iosToast: string;
};

const build = (h: string): Record<SupportedLang, S> => ({
  ko: {
    title: "앱 설치", subtitle: "휴대폰·PC 홈 화면에 설치해 앱처럼 바로 실행하세요.",
    cardDesc: "학습 환경에 따라 아래 안내 방법으로 설치해 주세요.", button: "앱 다운로드 · 설치", installed: "설치 완료",
    iosTitle: "아이폰 (iPhone)",
    ios: [
      `사파리에서 ${h}에 접속해 주세요.`, "로그인",
      "사파리 화면 하단(또는 상단)의 공유(Share) 버튼(네모 상자에 위쪽 화살표가 있는 아이콘) 또는 점 3개(···) 메뉴 버튼 중 하나가 보입니다. 두 버튼 중 화면에 보이는 쪽을 눌러 주세요.",
      "메뉴 창이 나타나면 아래로 스크롤하여 [홈 화면에 추가]를 선택합니다.",
      "오른쪽 위 '추가'를 누르면 홈 화면 추가가 완료됩니다.",
      "홈 화면에 생긴 N 아이콘으로 앱처럼 실행됩니다.",
    ],
    androidTitle: "안드로이드 (갤럭시 등)",
    android: [
      `브라우저(크롬)에서 ${h}에 접속해 주세요.`, "로그인",
      "화면 오른쪽 상단의 점 3개(⋮) 메뉴 아이콘을 누릅니다. 화면 하단이나 주소창 근처에 뜨는 '앱 설치' 배너를 바로 눌러도 됩니다.",
      "메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 누릅니다.",
      "팝업창이 뜨면 '설치' 또는 '추가'를 누릅니다.",
      "홈 화면과 앱 서랍에 N 아이콘이 생성되어 앱처럼 실행됩니다.",
    ],
    pcTitle: "PC (Chrome · Edge)",
    win: [
      `크롬 또는 엣지 브라우저에서 ${h}에 접속해 로그인해 주세요.`,
      "위의 [앱 다운로드 · 설치] 버튼을 누른 뒤 표시되는 확인 창에서 [설치]를 클릭합니다.",
      "엣지(Edge) 브라우저는 설치 후 [바탕화면에 바로가기 설치] 버튼이 한 번 더 표시될 수 있습니다. 이 버튼을 눌러야 바탕화면에 아이콘이 생성되므로, 표시되면 반드시 눌러 주세요.",
      "바탕화면에 생긴 앱 아이콘으로 실행하면 브라우저 주소창 없는 독립된 앱 창으로 열립니다.",
    ],
    mac: [
      `크롬 또는 엣지 브라우저에서 ${h}에 접속해 로그인해 주세요.`,
      "위의 [앱 다운로드 · 설치] 버튼을 누른 뒤 표시되는 확인 창에서 [설치]를 클릭합니다.",
      "사파리를 쓰는 경우 상단 메뉴의 [파일] → [Dock에 추가]를 선택한 뒤 [추가]를 누릅니다.",
      "Dock 또는 응용 프로그램 폴더에 생긴 앱 아이콘으로 실행하면 독립된 앱 창으로 열립니다.",
    ],
    tipsTitle: "이것만 알아두세요",
    tips: [
      "앱 스토어에서 받는 게 아니라, 인터넷 주소를 홈 화면에 넣는 방식이라 저장 공간을 거의 쓰지 않습니다.",
      "설치한 앱도 지금 쓰는 계정과 학습 기록이 그대로 이어집니다.",
      "영상 학습은 인터넷 연결이 필요합니다.",
    ],
    unavailable: "이 브라우저에서는 바로 설치할 수 없습니다. 아래 안내 방법으로 설치해 주세요.",
    iosToast: "아이폰은 아래 안내처럼 사파리의 [홈 화면에 추가]로 설치해 주세요.",
  },
  en: {
    title: "Install App", subtitle: "Add it to your phone or PC home screen and launch it like an app.",
    cardDesc: "Please install it using the guide below for your device.", button: "Download · Install App", installed: "Installed",
    iosTitle: "iPhone",
    ios: [
      `Open ${h} in Safari.`, "Log in.",
      "At the bottom (or top) of Safari you will see either the Share button (a square with an upward arrow) or the three-dot (···) menu button. Tap whichever one is shown.",
      "When the menu appears, scroll down and select [Add to Home Screen].",
      "Tap 'Add' in the top right to finish.",
      "Launch it like an app from the N icon on your home screen.",
    ],
    androidTitle: "Android (Galaxy, etc.)",
    android: [
      `Open ${h} in your browser (Chrome).`, "Log in.",
      "Tap the three-dot (⋮) menu icon at the top right. You can also tap the 'Install app' banner that appears at the bottom or near the address bar.",
      "Tap 'Install app' or 'Add to Home screen' in the menu.",
      "When the pop-up appears, tap 'Install' or 'Add'.",
      "The N icon appears on your home screen and app drawer and runs like an app.",
    ],
    pcTitle: "PC (Chrome · Edge)",
    win: [
      `Open ${h} in Chrome or Edge and log in.`,
      "Click the [Download · Install App] button above, then click [Install] in the confirmation window.",
      "In Edge, an [Install desktop shortcut] button may appear after installation. You must click it to create the desktop icon.",
      "Launching from the desktop icon opens a separate app window without the browser address bar.",
    ],
    mac: [
      `Open ${h} in Chrome or Edge and log in.`,
      "Click the [Download · Install App] button above, then click [Install] in the confirmation window.",
      "If you use Safari, choose [File] → [Add to Dock] from the top menu, then click [Add].",
      "Launching from the icon in the Dock or Applications folder opens a separate app window.",
    ],
    tipsTitle: "Good to know",
    tips: [
      "It is not downloaded from an app store — it adds the web address to your home screen, so it uses almost no storage.",
      "Your current account and learning history carry over to the installed app.",
      "Video lessons require an internet connection.",
    ],
    unavailable: "This browser cannot install directly. Please follow the guide below.",
    iosToast: "On iPhone, install using Safari's [Add to Home Screen] as shown below.",
  },
  ja: {
    title: "アプリのインストール", subtitle: "スマートフォン・PCのホーム画面に追加して、アプリのようにすぐ起動できます。",
    cardDesc: "ご利用の環境に合わせて、下記の手順でインストールしてください。", button: "アプリをダウンロード・インストール", installed: "インストール済み",
    iosTitle: "iPhone",
    ios: [
      `Safariで${h}にアクセスしてください。`, "ログイン",
      "Safari画面の下部（または上部）に、共有ボタン（四角に上向き矢印のアイコン）または「···」メニューボタンのどちらかが表示されます。表示されている方をタップしてください。",
      "メニューが表示されたら下にスクロールし、［ホーム画面に追加］を選択します。",
      "右上の「追加」をタップするとホーム画面への追加が完了します。",
      "ホーム画面に表示されたNアイコンからアプリのように起動できます。",
    ],
    androidTitle: "Android（Galaxyなど）",
    android: [
      `ブラウザ（Chrome）で${h}にアクセスしてください。`, "ログイン",
      "画面右上の「⋮」メニューアイコンをタップします。画面下部やアドレスバー付近に表示される「アプリをインストール」バナーをそのままタップしても構いません。",
      "メニューから「アプリをインストール」または「ホーム画面に追加」をタップします。",
      "ポップアップが表示されたら「インストール」または「追加」をタップします。",
      "ホーム画面とアプリ一覧にNアイコンが作成され、アプリのように起動できます。",
    ],
    pcTitle: "PC（Chrome・Edge）",
    win: [
      `ChromeまたはEdgeで${h}にアクセスしてログインしてください。`,
      "上の［アプリをダウンロード・インストール］ボタンを押し、表示される確認画面で［インストール］をクリックします。",
      "Edgeでは、インストール後に［デスクトップにショートカットをインストール］ボタンがもう一度表示される場合があります。このボタンを押さないとデスクトップにアイコンが作成されないため、表示されたら必ず押してください。",
      "デスクトップのアプリアイコンから起動すると、アドレスバーのない独立したアプリ画面で開きます。",
    ],
    mac: [
      `ChromeまたはEdgeで${h}にアクセスしてログインしてください。`,
      "上の［アプリをダウンロード・インストール］ボタンを押し、表示される確認画面で［インストール］をクリックします。",
      "Safariの場合は、上部メニューの［ファイル］→［Dockに追加］を選択し、［追加］を押します。",
      "Dockまたはアプリケーションフォルダのアイコンから起動すると、独立したアプリ画面で開きます。",
    ],
    tipsTitle: "ご確認ください",
    tips: [
      "アプリストアからのダウンロードではなく、ウェブアドレスをホーム画面に追加する方式のため、容量はほとんど使いません。",
      "インストールしたアプリでも、現在のアカウントと学習履歴がそのまま引き継がれます。",
      "動画学習にはインターネット接続が必要です。",
    ],
    unavailable: "このブラウザでは直接インストールできません。下記の手順でインストールしてください。",
    iosToast: "iPhoneでは、下記のようにSafariの［ホーム画面に追加］からインストールしてください。",
  },
  "zh-CN": {
    title: "安装应用", subtitle: "添加到手机或电脑主屏幕，像应用一样直接打开。",
    cardDesc: "请根据您的设备，按照下方说明进行安装。", button: "下载 · 安装应用", installed: "已安装",
    iosTitle: "iPhone",
    ios: [
      `请在 Safari 中打开 ${h}。`, "登录",
      "Safari 页面底部（或顶部）会显示分享按钮（方框加向上箭头的图标）或「···」菜单按钮，请点击页面上显示的那一个。",
      "出现菜单后向下滑动，选择［添加到主屏幕］。",
      "点击右上角的「添加」即可完成。",
      "通过主屏幕上的 N 图标即可像应用一样打开。",
    ],
    androidTitle: "安卓（Galaxy 等）",
    android: [
      `请在浏览器（Chrome）中打开 ${h}。`, "登录",
      "点击页面右上角的「⋮」菜单图标。也可以直接点击页面底部或地址栏附近出现的「安装应用」横幅。",
      "在菜单中点击「安装应用」或「添加到主屏幕」。",
      "弹出窗口后点击「安装」或「添加」。",
      "主屏幕和应用列表中会出现 N 图标，可像应用一样打开。",
    ],
    pcTitle: "电脑（Chrome · Edge）",
    win: [
      `请在 Chrome 或 Edge 浏览器中打开 ${h} 并登录。`,
      "点击上方的［下载 · 安装应用］按钮，在弹出的确认窗口中点击［安装］。",
      "使用 Edge 时，安装后可能还会出现［安装桌面快捷方式］按钮。必须点击它才会在桌面生成图标，出现时请务必点击。",
      "通过桌面上的应用图标打开，会以没有地址栏的独立应用窗口显示。",
    ],
    mac: [
      `请在 Chrome 或 Edge 浏览器中打开 ${h} 并登录。`,
      "点击上方的［下载 · 安装应用］按钮，在弹出的确认窗口中点击［安装］。",
      "使用 Safari 时，请在顶部菜单选择［文件］→［添加到程序坞］，然后点击［添加］。",
      "通过程序坞或应用程序文件夹中的图标打开，会以独立应用窗口显示。",
    ],
    tipsTitle: "温馨提示",
    tips: [
      "不是从应用商店下载，而是把网址添加到主屏幕，几乎不占用存储空间。",
      "安装后的应用会沿用当前账号和学习记录。",
      "观看视频课程需要网络连接。",
    ],
    unavailable: "此浏览器无法直接安装，请按照下方说明进行安装。",
    iosToast: "iPhone 请按照下方说明，通过 Safari 的［添加到主屏幕］安装。",
  },
  yue: {
    title: "安裝應用程式", subtitle: "加到手機或電腦主畫面，好似應用程式咁直接開啟。",
    cardDesc: "請按你嘅裝置，跟住下面嘅方法安裝。", button: "下載 · 安裝應用程式", installed: "已安裝",
    iosTitle: "iPhone",
    ios: [
      `請喺 Safari 開啟 ${h}。`, "登入",
      "Safari 畫面底部（或頂部）會見到分享按鈕（四方格加向上箭咀嘅圖示）或者「···」選單按鈕，撳畫面上見到嗰個就得。",
      "出咗選單之後向下碌，揀［加至主畫面］。",
      "撳右上角嘅「新增」就完成。",
      "用主畫面上嘅 N 圖示就可以好似應用程式咁開啟。",
    ],
    androidTitle: "Android（Galaxy 等）",
    android: [
      `請喺瀏覽器（Chrome）開啟 ${h}。`, "登入",
      "撳畫面右上角嘅「⋮」選單圖示。亦可以直接撳畫面底部或者網址列附近出現嘅「安裝應用程式」橫額。",
      "喺選單撳「安裝應用程式」或者「加至主畫面」。",
      "彈出視窗之後撳「安裝」或者「新增」。",
      "主畫面同應用程式列表會出現 N 圖示，可以好似應用程式咁開啟。",
    ],
    pcTitle: "電腦（Chrome · Edge）",
    win: [
      `請用 Chrome 或 Edge 開啟 ${h} 並登入。`,
      "撳上面嘅［下載 · 安裝應用程式］按鈕，喺確認視窗撳［安裝］。",
      "用 Edge 嘅話，安裝之後可能會再出［安裝桌面捷徑］按鈕。一定要撳佢先會喺桌面整到圖示，出現時請記得撳。",
      "用桌面嘅應用程式圖示開啟，會以冇網址列嘅獨立視窗顯示。",
    ],
    mac: [
      `請用 Chrome 或 Edge 開啟 ${h} 並登入。`,
      "撳上面嘅［下載 · 安裝應用程式］按鈕，喺確認視窗撳［安裝］。",
      "用 Safari 嘅話，喺頂部選單揀［檔案］→［加至 Dock］，再撳［新增］。",
      "用 Dock 或應用程式資料夾嘅圖示開啟，會以獨立視窗顯示。",
    ],
    tipsTitle: "溫馨提示",
    tips: [
      "唔係由應用程式商店下載，而係將網址加到主畫面，差唔多唔使用儲存空間。",
      "安裝咗嘅應用程式會沿用而家嘅帳戶同學習記錄。",
      "睇影片課程需要網絡連線。",
    ],
    unavailable: "呢個瀏覽器唔可以直接安裝，請跟住下面嘅方法安裝。",
    iosToast: "iPhone 請跟住下面嘅方法，用 Safari 嘅［加至主畫面］安裝。",
  },
});

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
          <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">{i + 1}</span>
          <span className="min-w-0">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function StudentAppInstall() {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const t = build(typeof window !== "undefined" ? window.location.host : "")[normalizeLang(i18n.language)];
  const [os, setOs] = useState<"win" | "mac">(
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "mac" : "win",
  );
  const [installed, setInstalled] = useState(isAppInstalled());
  useEffect(() => subscribeInstallState(() => setInstalled(isAppInstalled())), []);

  const onInstall = async () => {
    if (isIOSDevice()) return toast({ description: t.iosToast });
    const r = await triggerInstall();
    if (r === "unavailable") toast({ description: t.unavailable });
    if (r === "accepted") setInstalled(true);
  };

  const card = "rounded-xl border-2 border-border/80 bg-card p-5 sm:p-6 min-w-0";

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          {t.title}
        </h1>
        <p className="text-muted-foreground mt-1">{t.subtitle}</p>
      </div>

      <div className={`${card} flex flex-col sm:flex-row sm:items-center gap-4`}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <img src="/nonfiction-pwa-icon-192-v20261025.png" alt="NONFICTION" className="h-14 w-14 rounded-xl border border-border shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">NONFICTION Academy</p>
            <p className="text-sm text-muted-foreground">{t.cardDesc}</p>
          </div>
        </div>
        <Button onClick={onInstall} disabled={installed} className="rounded-full h-11 px-6 shrink-0">
          {installed ? <Check className="h-4 w-4 mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          {installed ? t.installed : t.button}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={card}>
          <p className="font-semibold flex items-center gap-2"><Share className="h-5 w-5" />{t.iosTitle}</p>
          <Steps items={t.ios} />
        </div>
        <div className={card}>
          <p className="font-semibold flex items-center gap-2"><MoreVertical className="h-5 w-5" />{t.androidTitle}</p>
          <Steps items={t.android} />
        </div>
        <div className={card}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-semibold flex items-center gap-2"><Monitor className="h-5 w-5" />{t.pcTitle}</p>
            <div className="flex gap-1 rounded-full bg-muted p-1">
              {(["win", "mac"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setOs(k)}
                  className={`px-3 py-1 text-xs rounded-full ${os === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {k === "win" ? "Windows" : "macOS"}
                </button>
              ))}
            </div>
          </div>
          <Steps items={os === "win" ? t.win : t.mac} />
        </div>
      </div>

      <div className={card}>
        <p className="font-semibold flex items-center gap-2"><Lightbulb className="h-4 w-4" />{t.tipsTitle}</p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {t.tips.map((x, i) => <li key={i}>· {x}</li>)}
        </ul>
      </div>
    </div>
  );
}
