import i18n from '@/i18n';
// Interface labels only: record text, server values and Korean exports are never translated.
const T: Record<string, [string, string, string, string]> = {
"본사 교육팀 직원 상세·매니저 코칭 공개": ["Open staff details and manager coaching to HQ education team", "本社教育チームに従業員詳細・マネージャーコーチングを公開", "向总部教育团队公开员工详情及经理辅导", "向總部教育團隊公開員工詳情及經理指導"],
"켜면 본사 교육팀이 모든 지점 직원의 상세 기록과 매니저 코칭 원문·실행 계획·후속 판정 이력을 읽을 수 있습니다. 판정 작성은 지점 담당자만 할 수 있습니다.": ["When on, the HQ education team can read every store's staff details, manager coaching notes, action plans and follow-up history. Only store staff in charge can write assessments.", "オンにすると本社教育チームは全店舗の従業員詳細、マネージャーコーチング原文、実行計画、フォローアップ履歴を閲覧できます。判定の作成は店舗担当者のみ可能です。", "开启后，总部教育团队可查看所有门店员工的详情、经理辅导原文、行动计划及跟进记录。仅门店负责人可填写评估。", "開啟後，總部教育團隊可查看所有分店員工的詳情、經理指導原文、行動計劃及跟進記錄。只有分店負責人可填寫評估。"],
"끄면 매니저 코칭 원문은 작성한 매니저 본인만 볼 수 있습니다.": ["When off, only the authoring manager can read manager coaching notes.", "オフにするとマネージャーコーチング原文は作成したマネージャー本人のみ閲覧できます。", "关闭后，经理辅导原文仅作者本人可查看。", "關閉後，經理指導原文僅作者本人可查看。"],
"공개 중": ["Open", "公開中", "公开中", "公開中"],
"비공개": ["Private", "非公開", "不公开", "不公開"],
"설정을 바꾸지 못했습니다. 다시 시도해 주세요.": ["Could not change the setting. Please try again.", "設定を変更できませんでした。もう一度お試しください。", "无法更改设置，请重试。", "無法更改設定，請重試。"],
"담당 직원": ["My staff", "担当従業員", "负责员工", "負責員工"],
"팀 성장 현황": ["Team growth", "チーム成長状況", "团队成长概况", "團隊成長概況"],
"직원 계획·후속 확인": ["Staff plans · Follow-up", "従業員の計画・確認", "员工计划 · 跟进", "員工計劃 · 跟進"],
"현장 코칭 등록": ["Register field coaching", "現場コーチング登録", "登记现场辅导", "登記現場指導"],
"매니저 코칭 등록": ["Register manager coaching", "マネージャーコーチング登録", "登记经理辅导", "登記經理指導"],
"지점 관리·팀 현황": ["Stores · Team overview", "店舗管理・チーム状況", "门店管理 · 团队概况", "分店管理 · 團隊概況"],
"담당자 지정": ["Assign staff", "担当者指定", "指定负责人", "指定負責人"],
"교육·코칭 시간 보고서": ["Learning and coaching time report", "学習・コーチング時間レポート", "学习及辅导时间报表", "學習及指導時間報表"],
"{{noun}} 등록": ["Register {{noun}}", "{{noun}}を登録", "登记{{noun}}", "登記{{noun}}"],
" · 선택": [
" · Optional",
" · 任意",
" · 可选",
" · 可選"
],
" · 수료": [
" · Completed",
" · 修了",
" · 完成",
" · 完成"
],
" · 진행 중": [
" · In progress",
" · 進行中",
" · 进行中",
" · 進行中"
],
"% · 수료": [
"% · Completed",
"% · 修了",
"% · 完成",
"% · 完成"
],
"/5000자": [
"/5000 chars",
"/5000文字",
"/5000字",
"/5000字"
],
"· 계획 읽기 전용": [
"· Plan read-only",
"· 計画は閲覧のみ",
"· 计划只读",
"· 計劃唯讀"
],
"· 선임매니저": [
"· Senior manager",
"· シニアマネージャー",
"· 资深经理",
"· 資深經理"
],
"· 실제": [
"· Actual",
"· 実績",
"· 实际",
"· 實際"
],
"· 참석": [
"· Attended",
"· 出席",
"· 出席",
"· 出席"
],
"· 참석 대상": [
"· Attendees",
"· 出席対象",
"· 出席对象",
"· 出席對象"
],
"강의 학습하기": [
"Study course",
"講義を受講",
"学习课程",
"學習課程"
],
"건": [
" records",
"件",
"条",
"項"
],
"검색 결과 전체 선택": [
"Select all results",
"検索結果をすべて選択",
"全选搜索结果",
"全選搜尋結果"
],
"검수 전용": [
"Review only",
"検収専用",
"仅供验收",
"僅供驗收"
],
"계획": [
"Plan",
"計画",
"计划",
"計劃"
],
"계획 또는 판정이 변경되었습니다. 최신 내용을 확인한 뒤 다시 판정해 주십시오.": [
"The plan or assessment changed. Check the latest version and assess again.",
"計画または判定が変更されました。最新内容を確認して再度判定してください。",
"计划或判定已变更。请确认最新内容后重新判定。",
"計劃或判定已變更。請確認最新內容後重新判定。"
],
"계획 보기·수정": [
"View/edit plan",
"計画を表示・編集",
"查看/修改计划",
"查看/修改計劃"
],
"계획 시간": [
"Planned time",
"予定時間",
"计划时间",
"計劃時間"
],
"계획 시간 (분)": [
"Planned time (min)",
"予定時間（分）",
"计划时间（分钟）",
"計劃時間（分鐘）"
],
"계획 작성": [
"Write plan",
"計画を作成",
"填写计划",
"填寫計劃"
],
"계획을 확인하지 못했습니다.": [
"Could not load the plan.",
"計画を確認できませんでした。",
"无法确认计划。",
"無法確認計劃。"
],
"고객 확인 대기": [
"Awaiting customer confirmation",
"顧客確認待ち",
"等待客户确认",
"等待客戶確認"
],
"과 담당 범위를 확인하지 못했습니다.": [
" and access scope could not be verified.",
"と担当範囲を確認できませんでした。",
"及负责范围无法确认。",
"及負責範圍無法確認。"
],
"관찰": [
"Observation",
"観察",
"观察",
"觀察"
],
"광동어": [
"Cantonese",
"広東語",
"粤语",
"廣東話"
],
"교육": [
"Training",
"研修",
"培训",
"培訓"
],
"교육 시간": [
"Training time",
"研修時間",
"培训时间",
"培訓時間"
],
"교육 유형": [
"Training type",
"研修種別",
"培训类型",
"培訓類型"
],
"교육 핵심 정리": [
"Training key points",
"研修の要点",
"培训要点",
"培訓重點"
],
"교육 핵심 정리 · 선택": [
"Training key points · Optional",
"研修の要点 · 任意",
"培训要点 · 可选",
"培訓重點 · 可選"
],
"교육·코칭 기록과 이러닝 학습 이력을 한곳에서 확인합니다.": [
"View training, coaching and e-learning history in one place.",
"研修・コーチング記録とeラーニング履歴をまとめて確認します。",
"在一处查看培训、辅导及在线学习记录。",
"在一處查看培訓、指導及網上學習記錄。"
],
"교육·코칭 내용을 현장에서 어떻게 실천할지 적어 주십시오.": [
"Describe how you will apply this training or coaching on the floor.",
"研修・コーチング内容を現場でどう実践するか記入してください。",
"请写下如何在门店实践培训或辅导内容。",
"請寫下如何在分店實踐培訓或指導內容。"
],
"교육자료": [
"Training materials",
"研修資料",
"培训资料",
"培訓資料"
],
"교육자료 내려받기": [
"Download materials",
"研修資料をダウンロード",
"下载培训资料",
"下載培訓資料"
],
"교육자료를 등록했습니다.": [
"Material uploaded.",
"研修資料を登録しました。",
"已上传培训资料。",
"已上載培訓資料。"
],
"교육자료와 열람 권한을 확인하지 못했습니다.": [
"Could not verify materials and access.",
"研修資料と閲覧権限を確認できませんでした。",
"无法确认培训资料及查看权限。",
"無法確認培訓資料及查閱權限。"
],
"권한과 지정 내역을 확인하지 못했습니다.": [
"Could not verify access and assignments.",
"権限と指定内容を確認できませんでした。",
"无法确认权限及指定记录。",
"無法確認權限及指定記錄。"
],
"기록 내용": [
"Record details",
"記録内容",
"记录内容",
"記錄內容"
],
"기록 제목 검색": [
"Search record titles",
"記録タイトルを検索",
"搜索记录标题",
"搜尋記錄標題"
],
"기존 학습 기록 원본을 참고만 합니다. 여기서 값을 바꾸지 않습니다.": [
"Existing learning records are shown for reference only and are not changed here.",
"既存の学習記録は参照のみで、ここでは変更しません。",
"仅参考现有学习记录，此处不会修改。",
"只參考現有學習記錄，此處不會修改。"
],
"나의 교육 · 코칭 · 성장 활동": [
"My training · coaching · growth",
"私の研修・コーチング・成長活動",
"我的培训 · 辅导 · 成长活动",
"我的培訓 · 指導 · 成長活動"
],
"나의 담당 범위": [
"My scope",
"私の担当範囲",
"我的负责范围",
"我的負責範圍"
],
"나의 학습 목록": [
"My learning list",
"私の学習一覧",
"我的学习列表",
"我的學習列表"
],
"내 강의": [
"My courses",
"マイ講義",
"我的课程",
"我的課程"
],
"내 계획": [
"My plans",
"私の計画",
"我的计划",
"我的計劃"
],
"내려받기": [
"Download",
"ダウンロード",
"下载",
"下載"
],
"년 성장 이력": [
" growth history",
"年の成長履歴",
"年成长记录",
"年成長記錄"
],
"논픽션": [
"NONFICTION",
"NONFICTION",
"NONFICTION",
"NONFICTION"
],
"논픽션 아카데미": [
"NONFICTION Academy",
"NONFICTION アカデミー",
"NONFICTION 学院",
"NONFICTION 學院"
],
"논픽션 아카데미 홈": [
"NONFICTION Academy home",
"NONFICTION アカデミーホーム",
"NONFICTION 学院首页",
"NONFICTION 學院首頁"
],
"다른 담당자가 참석 내역을 변경했습니다. 최신 내역을 확인한 뒤 다시 선택해 주십시오.": [
"Another staff member changed attendance. Check the latest and select again.",
"別の担当者が出席内容を変更しました。最新内容を確認して再度選択してください。",
"其他负责人已变更出席记录。请确认最新内容后重新选择。",
"其他負責人已變更出席記錄。請確認最新內容後重新選擇。"
],
"다시 확인": [
"Retry",
"再確認",
"重新确认",
"重新確認"
],
"다음 실행": [
"Next action",
"次の実行",
"下一步行动",
"下一步行動"
],
"닫기": [
"Close",
"閉じる",
"关闭",
"關閉"
],
"담당 교육·코칭 대상 직원": [
"Employees in your training and coaching scope",
"担当する研修・コーチング対象の従業員",
"负责的培训及辅导对象员工",
"負責的培訓及指導對象員工"
],
"담당 범위: 본인 소속 지점": [
"Scope: your current store",
"担当範囲：所属店舗",
"负责范围：所属门店",
"負責範圍：所屬分店"
],
"담당 직원 계획": [
"Staff plans",
"担当従業員の計画",
"负责员工计划",
"負責員工計劃"
],
"담당자": [
"Staff in charge",
"担当者",
"负责人",
"負責人"
],
"담당자 관리": [
"Staff assignments",
"担当者管理",
"负责人管理",
"負責人管理"
],
"담당자 선택": [
"Select staff",
"担当者を選択",
"选择负责人",
"選擇負責人"
],
"담당자 지정을 해제했습니다.": [
"Assignment removed.",
"担当者の指定を解除しました。",
"已取消负责人指定。",
"已取消負責人指定。"
],
"담당자 피드백": [
"Staff feedback",
"担当者のフィードバック",
"负责人反馈",
"負責人回饋"
],
"담당자를 지정했습니다.": [
"Staff assigned.",
"担当者を指定しました。",
"已指定负责人。",
"已指定負責人。"
],
"대면 교육 · 참석 관리": [
"In-person training · Attendance",
"対面研修・出席管理",
"面授培训 · 出席管理",
"面授培訓 · 出席管理"
],
"대상": [
"Targets",
"対象",
"对象",
"對象"
],
"대상 없음": [
"No targets",
"対象なし",
"无对象",
"沒有對象"
],
"대시보드": [
"Dashboard",
"ダッシュボード",
"仪表板",
"儀表板"
],
"뒤로가기": [
"Back",
"戻る",
"返回",
"返回"
],
"등록": [
"Register",
"登録",
"登记",
"登記"
],
"등록된": [
"Registered",
"登録済み",
"已登记",
"已登記"
],
"등록된 교육자료가 없습니다.": [
"No materials uploaded.",
"登録された研修資料はありません。",
"没有已上传的培训资料。",
"沒有已上載的培訓資料。"
],
"등록된 나의 학습 기록이 없습니다.": [
"You have no learning records.",
"登録された学習記録はありません。",
"没有您的学习记录。",
"沒有您的學習記錄。"
],
"등록된 상세 내용이 없습니다.": [
"No details recorded.",
"登録された詳細はありません。",
"没有登记的详细内容。",
"沒有登記的詳細內容。"
],
"등록된 참석 대상이 없습니다.": [
"No attendees registered.",
"登録された出席対象はいません。",
"没有登记的出席对象。",
"沒有登記的出席對象。"
],
"등록하지 못했습니다. 담당 범위, 실제 문서 형식과 파일당 50MB 이하 용량을 확인하십시오.": [
"Upload failed. Check your scope, the document format and the 50MB per-file limit.",
"登録できませんでした。担当範囲、文書形式、1ファイル50MB以下を確認してください。",
"上传失败。请确认负责范围、文件格式及每个文件不超过50MB。",
"上載失敗。請確認負責範圍、文件格式及每個檔案不超過50MB。"
],
"링크 유효기간은 발급 후 일주일입니다.": [
"Links are valid for one week after issue.",
"リンクの有効期間は発行後1週間です。",
"链接有效期为发放后一周。",
"連結有效期為發出後一星期。"
],
"링크가 만료됐거나 현재 참석·소속·담당 권한이 없습니다. 원래 교육 상세에서 다시 확인하십시오.": [
"The link has expired or you no longer have access. Check again from the training details.",
"リンクの期限切れ、または現在の権限がありません。研修詳細から再確認してください。",
"链接已过期或您目前没有权限。请从培训详情重新确认。",
"連結已過期或您目前沒有權限。請從培訓詳情重新確認。"
],
"매니저 코칭": [
"Manager coaching",
"マネージャーコーチング",
"经理辅导",
"經理指導"
],
"매니저 피드백": [
"Manager feedback",
"マネージャーのフィードバック",
"经理反馈",
"經理回饋"
],
"매니저 피드백 · 참석 관리": [
"Manager feedback · Attendance",
"マネージャーのフィードバック・出席管理",
"经理反馈 · 出席管理",
"經理回饋 · 出席管理"
],
"메뉴 닫기": [
"Close menu",
"メニューを閉じる",
"关闭菜单",
"關閉選單"
],
"메뉴 열기": [
"Open menu",
"メニューを開く",
"打开菜单",
"打開選單"
],
"명": [
" people",
"名",
"人",
"人"
],
"명 / 미참석": [
" people / Absent",
"名 / 欠席",
"人 / 缺席",
"人 / 缺席"
],
"명 · 미참석": [
" people · Absent",
"名・欠席",
"人 · 缺席",
"人 · 缺席"
],
"명 선택": [
" selected",
"名を選択",
"人已选",
"人已選"
],
"모든 달": [
"All months",
"すべての月",
"所有月份",
"所有月份"
],
"모든 상태": [
"All statuses",
"すべての状態",
"所有状态",
"所有狀態"
],
"목록": [
"List",
"一覧",
"列表",
"列表"
],
"미기록": [
"Not recorded",
"未記録",
"未记录",
"未記錄"
],
"미지정": [
"Unassigned",
"未指定",
"未指定",
"未指定"
],
"미참석자": [
"Absent",
"欠席者",
"缺席者",
"缺席者"
],
"미참석자가 없습니다.": [
"No absentees.",
"欠席者はいません。",
"没有缺席者。",
"沒有缺席者。"
],
"보고서": [
"Reports",
"レポート",
"报表",
"報表"
],
"본사 한국 교육팀 · 지점 선임매니저": [
"HQ Korea education team · Store senior managers",
"本社韓国教育チーム・店舗シニアマネージャー",
"总部韩国教育团队 · 门店资深经理",
"總部韓國教育團隊 · 分店資深經理"
],
"불러오는 중": [
"Loading",
"読み込み中",
"加载中",
"載入中"
],
"불러오는 중입니다.": [
"Loading.",
"読み込み中です。",
"正在加载。",
"正在載入。"
],
"상세 보기": [
"View details",
"詳細を見る",
"查看详情",
"查看詳情"
],
"상태": [
"Status",
"状態",
"状态",
"狀態"
],
"선택 해제": [
"Clear selection",
"選択解除",
"取消选择",
"取消選擇"
],
"성장 기록": [
"Growth records",
"成長記録",
"成长记录",
"成長記錄"
],
"성장 활동": [
"Growth activity",
"成長活動",
"成长活动",
"成長活動"
],
"수강 중인 강의가 없습니다.": [
"No courses in progress.",
"受講中の講義はありません。",
"没有正在学习的课程。",
"沒有正在學習的課程。"
],
"수강 중인 온라인 강의가 없습니다.": [
"No online courses in progress.",
"受講中のオンライン講義はありません。",
"没有正在学习的在线课程。",
"沒有正在學習的網上課程。"
],
"수료": [
"Completed",
"修了",
"完成",
"完成"
],
"수료 횟수": [
"Completions",
"修了回数",
"完成次数",
"完成次數"
],
"시작일": [
"Start date",
"開始日",
"开始日期",
"開始日期"
],
"실제 시간": [
"Actual time",
"実施時間",
"实际时间",
"實際時間"
],
"실제 시간 (분) · 선택": [
"Actual time (min) · Optional",
"実施時間（分）・任意",
"实际时间（分钟）· 可选",
"實際時間（分鐘）· 可選"
],
"실제 참석 직원": [
"Employees who attended",
"実際の出席従業員",
"实际出席员工",
"實際出席員工"
],
"실행 계획": [
"Action plans",
"行動計画",
"行动计划",
"行動計劃"
],
"실행 계획·코칭 결과": [
"Action plans · Coaching results",
"行動計画・コーチング結果",
"行动计划 · 辅导结果",
"行動計劃 · 指導結果"
],
"아직 기록이 없습니다. 교육이나 코칭이 등록되면 여기에 보입니다.": [
"No records yet. Training and coaching will appear here once registered.",
"まだ記録はありません。研修やコーチングが登録されるとここに表示されます。",
"暂无记录。登记培训或辅导后会显示在这里。",
"暫無記錄。登記培訓或指導後會顯示在這裡。"
],
"아직 작성하지 않음": [
"Not written yet",
"未作成",
"尚未填写",
"尚未填寫"
],
"아카데미 메뉴": [
"Academy menu",
"アカデミーメニュー",
"学院菜单",
"學院選單"
],
"역할과 소속 지점": [
"Role and store",
"役割と所属店舗",
"角色及所属门店",
"角色及所屬分店"
],
"영어": [
"English",
"英語",
"英语",
"英文"
],
"예정": [
"Scheduled",
"予定",
"计划中",
"計劃中"
],
"오프라인 교육": [
"Offline training",
"集合研修",
"线下培训",
"線下培訓"
],
"오프라인 교육 목록": [
"Offline training list",
"集合研修一覧",
"线下培训列表",
"線下培訓列表"
],
"온라인 학습": [
"Online learning",
"オンライン学習",
"在线学习",
"網上學習"
],
"온라인 학습 진행률": [
"Online learning progress",
"オンライン学習の進捗",
"在线学习进度",
"網上學習進度"
],
"온라인 학습시간": [
"Online learning time",
"オンライン学習時間",
"在线学习时间",
"網上學習時間"
],
"완료 · 참석 확인": [
"Completed · Attendance confirmed",
"完了・出席確認",
"完成 · 已确认出席",
"完成 · 已確認出席"
],
"운영": [
"Operations",
"運営",
"运营",
"營運"
],
"워드·PDF·엑셀·PPT · 파일당 최대 50MB": [
"Word·PDF·Excel·PPT · Up to 50MB per file",
"Word・PDF・Excel・PPT・1ファイル最大50MB",
"Word·PDF·Excel·PPT · 每个文件最大50MB",
"Word·PDF·Excel·PPT · 每個檔案最大50MB"
],
"원문 언어": [
"Original language",
"原文の言語",
"原文语言",
"原文語言"
],
"월": [
" ",
"月",
"月",
"月"
],
"유형": [
"Type",
"種別",
"类型",
"類型"
],
"을 확인할 수 없습니다.": [
" cannot be verified.",
"を確認できません。",
"无法确认。",
"無法確認。"
],
"이 기간에 조회 가능한 기록이 없습니다.": [
"No viewable records in this period.",
"この期間に閲覧可能な記録はありません。",
"此期间没有可查看的记录。",
"此期間沒有可查看的記錄。"
],
"이 없습니다.": [
" not found.",
"がありません。",
"不存在。",
"不存在。"
],
"이 화면은 허용된 교육·코칭 기록만 포함합니다. 직원 전체 학습·팀 공개 및 보고 집계 범위는 확정 전입니다.": [
"This screen shows only permitted training and coaching records. Full learning, team visibility and reporting scope are not yet confirmed.",
"この画面は許可された研修・コーチング記録のみ表示します。全体学習・チーム公開・集計範囲は未確定です。",
"此页面仅包含获准的培训及辅导记录。员工全部学习、团队公开及报表范围尚未确定。",
"此頁面只包含獲准的培訓及指導記錄。員工全部學習、團隊公開及報表範圍尚未確定。"
],
"이러닝": [
"E-learning",
"eラーニング",
"在线课程",
"網上課程"
],
"이러닝 학습 이력": [
"E-learning history",
"eラーニング履歴",
"在线课程记录",
"網上課程記錄"
],
"이어서 학습": [
"Continue learning",
"続きから学習",
"继续学习",
"繼續學習"
],
"이행 상태": [
"Progress status",
"実行状況",
"执行状态",
"執行狀態"
],
"이행 판정": [
"Follow-up assessment",
"実行判定",
"执行判定",
"執行判定"
],
"일본어": [
"Japanese",
"日本語",
"日语",
"日文"
],
"일자": [
"Date",
"日付",
"日期",
"日期"
],
"읽기 전용": [
"Read-only",
"閲覧のみ",
"只读",
"唯讀"
],
"자": [
" chars",
"文字",
"字",
"字"
],
"자료 등록": [
"Upload material",
"資料を登録",
"上传资料",
"上載資料"
],
"자료를 불러오는 중입니다.": [
"Loading materials.",
"資料を読み込み中です。",
"正在加载资料。",
"正在載入資料。"
],
"작성 언어": [
"Writing language",
"作成言語",
"填写语言",
"填寫語言"
],
"장소": [
"Location",
"場所",
"地点",
"地點"
],
"저장": [
"Save",
"保存",
"保存",
"儲存"
],
"저장 결과를 확인하지 못했습니다. 입력을 그대로 두고 다시 저장하면 중복 없이 확인합니다.": [
"Could not confirm the save. Keep your input and save again; duplicates are prevented.",
"保存結果を確認できませんでした。入力はそのままで再保存すると重複なく確認します。",
"无法确认保存结果。保留输入后再次保存，不会重复。",
"無法確認儲存結果。保留輸入後再次儲存，不會重複。"
],
"저장 권한이 없습니다. 현재 담당 범위를 다시 확인해 주십시오.": [
"You do not have permission to save. Check your current scope.",
"保存権限がありません。現在の担当範囲を確認してください。",
"没有保存权限。请重新确认目前负责范围。",
"沒有儲存權限。請重新確認目前負責範圍。"
],
"저장하지 못했습니다.": [
"Could not save.",
"保存できませんでした。",
"保存失败。",
"儲存失敗。"
],
"저장하지 못했습니다. 담당 권한과 직원의 소속을 다시 확인해 주십시오.": [
"Could not save. Check your permission and the employee's store.",
"保存できませんでした。担当権限と従業員の所属を確認してください。",
"保存失败。请确认负责权限及员工所属门店。",
"儲存失敗。請確認負責權限及員工所屬分店。"
],
"저장하지 못했습니다. 현재 담당 범위와 입력을 확인한 뒤 다시 저장해 주십시오.": [
"Could not save. Check your scope and input, then try again.",
"保存できませんでした。担当範囲と入力を確認して再度保存してください。",
"保存失败。请确认负责范围及输入后重新保存。",
"儲存失敗。請確認負責範圍及輸入後重新儲存。"
],
"저장했습니다.": [
"Saved.",
"保存しました。",
"已保存。",
"已儲存。"
],
"전체": [
"All",
"すべて",
"全部",
"全部"
],
"제목 검색": [
"Search titles",
"タイトルを検索",
"搜索标题",
"搜尋標題"
],
"조건에 맞는 기록이 없습니다.": [
"No matching records.",
"条件に合う記録はありません。",
"没有符合条件的记录。",
"沒有符合條件的記錄。"
],
"조회 가능한 직원이 없습니다.": [
"No employees to view.",
"閲覧可能な従業員はいません。",
"没有可查看的员工。",
"沒有可查看的員工。"
],
"조회 실패": [
"Load failed",
"取得失敗",
"查询失败",
"查詢失敗"
],
"종료일": [
"End date",
"終了日",
"结束日期",
"結束日期"
],
"종료일을 시작일 이후로 선택해 주십시오.": [
"Choose an end date after the start date.",
"終了日は開始日以降を選択してください。",
"请选择开始日期之后的结束日期。",
"請選擇開始日期之後的結束日期。"
],
"중국어": [
"Chinese",
"中国語",
"中文",
"中文"
],
"지점": [
"Store",
"店舗",
"门店",
"分店"
],
"지점 선택": [
"Select store",
"店舗を選択",
"选择门店",
"選擇分店"
],
"지점 전체 직원의 성장 기록과 다른 담당자의 민감한 코칭을 공개하는 범위는 확정되지 않았습니다.": [
"Visibility of all store employees' growth records and other staff's sensitive coaching is not yet confirmed.",
"店舗全従業員の成長記録と他担当者の機微なコーチングの公開範囲は未確定です。",
"门店全体员工成长记录及其他负责人敏感辅导的公开范围尚未确定。",
"分店全體員工成長記錄及其他負責人敏感指導的公開範圍尚未確定。"
],
"지점을 선택해 주십시오.": [
"Please select a store.",
"店舗を選択してください。",
"请选择门店。",
"請選擇分店。"
],
"지정": [
"Assign",
"指定",
"指定",
"指定"
],
"지정 가능한 선임매니저가 없습니다.": [
"No senior managers available to assign.",
"指定可能なシニアマネージャーはいません。",
"没有可指定的资深经理。",
"沒有可指定的資深經理。"
],
"지정됨": [
"Assigned",
"指定済み",
"已指定",
"已指定"
],
"직원 관리": [
"Staff management",
"従業員管理",
"员工管理",
"員工管理"
],
"직원 성장 여정": [
"Employee growth journey",
"従業員の成長の歩み",
"员工成长历程",
"員工成長歷程"
],
"직원 실행 계획": [
"Employee action plans",
"従業員の行動計画",
"员工行动计划",
"員工行動計劃"
],
"직원 이름 검색": [
"Search employee name",
"従業員名を検索",
"搜索员工姓名",
"搜尋員工姓名"
],
"직원 학습·코칭 상세": [
"Employee learning · coaching details",
"従業員の学習・コーチング詳細",
"员工学习 · 辅导详情",
"員工學習 · 指導詳情"
],
"진도": [
"Progress",
"進捗",
"进度",
"進度"
],
"진행 중": [
"In progress",
"進行中",
"进行中",
"進行中"
],
"차 ·": [
" ·",
"回目・",
"次 ·",
"次 ·"
],
"참석": [
"Attended",
"出席",
"出席",
"出席"
],
"참석 관리": [
"Attendance",
"出席管理",
"出席管理",
"出席管理"
],
"참석 기록": [
"Attendance records",
"出席記録",
"出席记录",
"出席記錄"
],
"참석 내역과 담당 권한을 확인하지 못했습니다.": [
"Could not verify attendance and permissions.",
"出席内容と担当権限を確認できませんでした。",
"无法确认出席记录及负责权限。",
"無法確認出席記錄及負責權限。"
],
"참석 내역을 불러오는 중입니다.": [
"Loading attendance.",
"出席内容を読み込み中です。",
"正在加载出席记录。",
"正在載入出席記錄。"
],
"참석 내역을 저장했습니다.": [
"Attendance saved.",
"出席内容を保存しました。",
"已保存出席记录。",
"已儲存出席記錄。"
],
"참석 대상": [
"Attendees",
"出席対象",
"出席对象",
"出席對象"
],
"참석 대상 이름 검색": [
"Search attendee name",
"出席対象者名を検索",
"搜索出席对象姓名",
"搜尋出席對象姓名"
],
"참석 등록": [
"Record attendance",
"出席を登録",
"登记出席",
"登記出席"
],
"참석 변경 이력": [
"Attendance history",
"出席変更履歴",
"出席变更记录",
"出席變更記錄"
],
"참석 선택을 확인해 주십시오.": [
"Please check the attendance selection.",
"出席の選択を確認してください。",
"请确认出席选择。",
"請確認出席選擇。"
],
"참석 수정": [
"Edit attendance",
"出席を修正",
"修改出席",
"修改出席"
],
"참석 저장": [
"Save attendance",
"出席を保存",
"保存出席",
"儲存出席"
],
"참석 직원 검색": [
"Search attendees",
"出席従業員を検索",
"搜索出席员工",
"搜尋出席員工"
],
"참석 확인 대기": [
"Awaiting attendance confirmation",
"出席確認待ち",
"等待确认出席",
"等待確認出席"
],
"참석자": [
"Attendees",
"出席者",
"出席者",
"出席者"
],
"참석자가 없습니다.": [
"No attendees.",
"出席者はいません。",
"没有出席者。",
"沒有出席者。"
],
"참석한 교육·코칭마다 현장 실천 계획을 작성합니다.": [
"Write an on-the-floor action plan for each training or coaching you attended.",
"出席した研修・コーチングごとに現場での実践計画を作成します。",
"为每次出席的培训或辅导填写门店实践计划。",
"為每次出席的培訓或指導填寫分店實踐計劃。"
],
"처리하지 못했습니다. 지정 권한과 현재 소속을 다시 확인해 주십시오.": [
"Could not complete. Check your assignment permission and current store.",
"処理できませんでした。指定権限と現在の所属を確認してください。",
"处理失败。请确认指定权限及目前所属门店。",
"處理失敗。請確認指定權限及目前所屬分店。"
],
"초기화": [
"Reset",
"リセット",
"重置",
"重設"
],
"최근 저장": [
"Last saved",
"最終保存",
"最近保存",
"最近儲存"
],
"최종 저장": [
"Save final",
"最終保存",
"最终保存",
"最終儲存"
],
"추가 판정·정정": [
"Add assessment / correction",
"追加判定・訂正",
"追加判定 · 更正",
"追加判定 · 更正"
],
"취소": [
"Cancel",
"キャンセル",
"取消",
"取消"
],
"코칭": [
"Coaching",
"コーチング",
"辅导",
"指導"
],
"코칭 기록": [
"Coaching record",
"コーチング記録",
"辅导记录",
"指導記錄"
],
"코칭 시간": [
"Coaching time",
"コーチング時間",
"辅导时间",
"指導時間"
],
"코칭 유형": [
"Coaching type",
"コーチング種別",
"辅导类型",
"指導類型"
],
"코칭·실행 계획": [
"Coaching · Action plans",
"コーチング・行動計画",
"辅导 · 行动计划",
"指導 · 行動計劃"
],
"통합 기록": [
"Combined records",
"統合記録",
"综合记录",
"綜合記錄"
],
"파일 저장": [
"Save file",
"ファイルを保存",
"保存文件",
"儲存檔案"
],
"파일 확인": [
"Check file",
"ファイルを確認",
"检查文件",
"檢查檔案"
],
"파일 확인 중": [
"Checking file",
"ファイル確認中",
"正在检查文件",
"正在檢查檔案"
],
"파일을 내려받지 못했습니다. 현재 참석·소속·담당 권한을 다시 확인하십시오.": [
"Download failed. Check your current attendance, store and permissions.",
"ダウンロードできませんでした。現在の出席・所属・担当権限を確認してください。",
"下载失败。请确认目前的出席、所属及负责权限。",
"下載失敗。請確認目前的出席、所屬及負責權限。"
],
"판정 당시 실행 계획": [
"Plan at time of assessment",
"判定時の行動計画",
"判定时的行动计划",
"判定時的行動計劃"
],
"판정 의견·정정 사유": [
"Comment / correction reason",
"判定意見・訂正理由",
"判定意见 · 更正原因",
"判定意見 · 更正原因"
],
"판정 이력": [
"Assessment history",
"判定履歴",
"判定记录",
"判定記錄"
],
"판정 이력과 접근 권한을 확인하지 못했습니다.": [
"Could not verify assessment history and access.",
"判定履歴とアクセス権限を確認できませんでした。",
"无法确认判定记录及访问权限。",
"無法確認判定記錄及存取權限。"
],
"판정 이후 실행 계획이 수정되었습니다.": [
"The plan was edited after assessment.",
"判定後に行動計画が修正されました。",
"判定后行动计划已修改。",
"判定後行動計劃已修改。"
],
"판정 입력을 확인해 주십시오.": [
"Please check the assessment input.",
"判定入力を確認してください。",
"请确认判定输入。",
"請確認判定輸入。"
],
"판정 저장": [
"Save assessment",
"判定を保存",
"保存判定",
"儲存判定"
],
"판정 전": [
"Not assessed",
"判定前",
"未判定",
"未判定"
],
"판정을 저장했습니다.": [
"Assessment saved.",
"判定を保存しました。",
"已保存判定。",
"已儲存判定。"
],
"표시할 계획이 없습니다.": [
"No plans to display.",
"表示する計画はありません。",
"没有可显示的计划。",
"沒有可顯示的計劃。"
],
"피드백": [
"Feedback",
"フィードバック",
"反馈",
"回饋"
],
"필드 코칭": [
"Field coaching",
"フィールドコーチング",
"现场辅导",
"現場指導"
],
"학습": [
"Learning",
"学習",
"学习",
"學習"
],
"학습 기록을 불러오는 중입니다.": [
"Loading learning records.",
"学習記録を読み込み中です。",
"正在加载学习记录。",
"正在載入學習記錄。"
],
"학습 기록을 확인하지 못했습니다.": [
"Could not load learning records.",
"学習記録を確認できませんでした。",
"无法确认学习记录。",
"無法確認學習記錄。"
],
"한국어": [
"Korean",
"韓国語",
"韩语",
"韓文"
],
"해당 직원이 없습니다.": [
"No matching employees.",
"該当する従業員はいません。",
"没有符合的员工。",
"沒有符合的員工。"
],
"해제": [
"Remove",
"解除",
"取消",
"取消"
],
"핵심 정리": [
"Key points",
"要点",
"要点",
"重點"
],
"현장 관찰": [
"Field observation",
"現場観察",
"现场观察",
"現場觀察"
],
"현장 코칭 · 참석 관리": [
"Field coaching · Attendance",
"現場コーチング・出席管理",
"现场辅导 · 出席管理",
"現場指導 · 出席管理"
],
"현재 지정된 담당 역할이 없습니다.": [
"You have no assigned staff role.",
"現在指定された担当役割はありません。",
"目前没有指定的负责角色。",
"目前沒有指定的負責角色。"
],
"회": [
" times",
"回",
"次",
"次"
],
"후속 확인": [
"Follow-up",
"フォローアップ確認",
"跟进确认",
"跟進確認"
],
"후속 확인을 불러오는 중입니다.": [
"Loading follow-up.",
"フォローアップを読み込み中です。",
"正在加载跟进确认。",
"正在載入跟進確認。"
],
"휴대전화 아카데미 메뉴": [
"Mobile academy menu",
"モバイルアカデミーメニュー",
"手机学院菜单",
"手機學院選單"
],
"휴대전화 전체 메뉴": [
"Mobile full menu",
"モバイル全体メニュー",
"手机完整菜单",
"手機完整選單"
],
"트레이너": [
"Trainer",
"トレーナー",
"培训师",
"培訓師"
],
"스토어매니저": [
"Store manager",
"ストアマネージャー",
"门店经理",
"分店經理"
],
"완료": [
"Completed",
"完了",
"完成",
"完成"
],
"참석 확인": [
"Attendance confirmed",
"出席確認",
"已确认出席",
"已確認出席"
],
"이행 완료": [
"Done",
"実行済み",
"已执行",
"已執行"
],
"미이행": [
"Not done",
"未実行",
"未执行",
"未執行"
],
"{{n}}분": [
"{{n}} min",
"{{n}}分",
"{{n}}分钟",
"{{n}}分鐘"
],
"{{title}} 진행률": [
"{{title}} progress",
"{{title}}の進捗",
"{{title}}进度",
"{{title}}進度"
],
"{{title}} 이어서 학습": [
"Continue {{title}}",
"{{title}}の続きを学習",
"继续学习{{title}}",
"繼續學習{{title}}"
],
"{{title}} 상세 보기": [
"View {{title}} details",
"{{title}}の詳細",
"查看{{title}}详情",
"查看{{title}}詳情"
],
"{{year}}년 {{month}}월 성장 이력": [
"{{year}}-{{month}} growth history",
"{{year}}年{{month}}月の成長履歴",
"{{year}}年{{month}}月成长记录",
"{{year}}年{{month}}月成長記錄"
],
"{{month}}월 성장 기록": [
"Month {{month}} growth records",
"{{month}}月の成長記録",
"{{month}}月成长记录",
"{{month}}月成長記錄"
],
"{{noun}}과 참석 대상을 저장했습니다.": [
"{{noun}} and attendees saved.",
"{{noun}}と出席対象を保存しました。",
"已保存{{noun}}及出席对象。",
"已儲存{{noun}}及出席對象。"
],
"{{noun}} 제목": [
"{{noun}} title",
"{{noun}}タイトル",
"{{noun}}标题",
"{{noun}}標題"
],
"{{noun}} 일자": [
"{{noun}} date",
"{{noun}}日付",
"{{noun}}日期",
"{{noun}}日期"
],
"{{noun}} 장소": [
"{{noun}} location",
"{{noun}}場所",
"{{noun}}地点",
"{{noun}}地點"
],
"{{noun}} 유형": [
"{{noun}} type",
"{{noun}}種別",
"{{noun}}类型",
"{{noun}}類型"
],
"{{name}} 선택": [
"Select {{name}}",
"{{name}}を選択",
"选择{{name}}",
"選擇{{name}}"
],
"{{name}} 참석": [
"{{name}} attended",
"{{name}}出席",
"{{name}}出席",
"{{name}}出席"
],
"{{name}} 내려받기": [
"Download {{name}}",
"{{name}}をダウンロード",
"下载{{name}}",
"下載{{name}}"
],
" · 수료 {{n}}회": [
" · Completed {{n}} times",
" · 修了{{n}}回",
" · 完成{{n}}次",
" · 完成{{n}}次"
],
"{{n}}회": [
"{{n}} times",
"{{n}}回",
"{{n}}次",
"{{n}}次"
],
"작성됨 · {{at}}": [
"Written · {{at}}",
"作成済み · {{at}}",
"已填写 · {{at}}",
"已填寫 · {{at}}"
],
"전체 {{total}}건 · 조회 {{shown}}건": [
"{{total}} total · {{shown}} shown",
"全{{total}}件・表示{{shown}}件",
"共{{total}}条 · 显示{{shown}}条",
"共{{total}}項 · 顯示{{shown}}項"
]
};
const IDX: Record<string, number> = { en: 0, ja: 1, 'zh-CN': 2, zh: 2, yue: 3 };
export function k(ko: string, vars?: Record<string, string | number>): string {
  const lang = i18n.language || 'ko';
  const i = IDX[lang] ?? IDX[lang.split('-')[0]];
  let s = (i === undefined ? ko : T[ko]?.[i]) ?? ko;
  if (vars) for (const [key, v] of Object.entries(vars)) s = s.split(`{{${key}}}`).join(String(v));
  return s;
}
export const uiTextKeys = Object.keys(T);
export const uiTextTable = T;
/** Map whose Korean label values are translated at read time (safe for module-level constants). */
export function kMap<T extends object>(map: T): T {
  return new Proxy(map, { get(target, prop, recv) { const v = Reflect.get(target, prop, recv); return typeof v === 'string' ? k(v) : v; } });
}
