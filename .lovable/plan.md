## 목표

망고보드처럼 **이미지 템플릿 위에 동영상을 특정 영역에 삽입**할 수 있는 기능을 추가합니다. 기존 "미디어 패키지" 차시 소스를 강화해서, 각 이미지 슬라이드마다 선택적으로 동영상을 오버레이할 수 있게 만듭니다.

## 동작 방식

1. 교수자가 "미디어 패키지" 차시에 이미지를 업로드 (예: Hospitality 템플릿 이미지)
2. 해당 이미지 옆 새 버튼 **"동영상 영역 추가"** 클릭
3. 동영상 파일 업로드 (Bunny Stream — 기존 로직 재사용)
4. 팝업에서 이미지 위에 표시된 **드래그/리사이즈 가능한 사각형**으로 동영상 영역 지정
5. 저장 → 학습자는 이미지 슬라이드 위에 정확한 위치/크기로 동영상이 박힌 화면을 봄

## 변경 사항

### 1) DB 스키마 (마이그레이션)

`media_package_items` 테이블에 동영상 오버레이용 컬럼 추가 (이미지 슬라이드일 때만 사용):

- `overlay_video_url` TEXT — 오버레이할 동영상 URL
- `overlay_video_provider` TEXT — bunny/custom 등
- `overlay_thumbnail_url` TEXT — 썸네일
- `overlay_x`, `overlay_y` NUMERIC — 이미지 기준 상대 위치 (0~1)
- `overlay_w`, `overlay_h` NUMERIC — 이미지 기준 상대 크기 (0~1)

기존 데이터에 영향 없음 (모두 nullable).

### 2) 편집기 (`src/pages/teacher/CreateCourse.tsx` 내 `PackageItemsEditor`)

이미지 항목에만 표시되는 새 액션:
- **"동영상 오버레이"** 버튼 — 동영상이 없으면 추가, 있으면 편집/제거
- 새 컴포넌트 `OverlayVideoEditorDialog`:
  - 동영상 파일 업로드 (기존 `uploadOneVideo` Bunny 함수 재사용)
  - 이미지 미리보기 위에 **드래그/리사이즈 가능한 사각형** (마우스 + 터치)
  - 좌표는 0~1 비율로 저장 → 어떤 해상도에서도 정확

### 3) 저장 로직 (CreateCourse 저장 시)

`media_package_items` insert 시 `package_items[i]`에 오버레이 필드가 있으면 함께 저장. 생성/수정 두 mutation 모두 업데이트.

### 4) 플레이어 (`src/components/MediaPackagePlayer.tsx`)

이미지 슬라이드 렌더링 시 오버레이 데이터가 있으면 절대 위치 `<video>`를 위에 띄움:

```tsx
<div className="relative">
  <img src={item.media_url} />
  {item.overlay_video_url && (
    <video
      src={item.overlay_video_url}
      controls playsInline
      className="absolute"
      style={{
        left: `${item.overlay_x * 100}%`,
        top: `${item.overlay_y * 100}%`,
        width: `${item.overlay_w * 100}%`,
        height: `${item.overlay_h * 100}%`,
      }}
    />
  )}
</div>
```

### 5) 타입 (`PackageItemDraft`)

`overlay_video_url`, `overlay_x/y/w/h` 등 선택 필드 추가.

## 진행 순서

1. DB 마이그레이션 제출 (사용자 승인 필요)
2. 승인 후 → 타입 / 편집기 / 저장 로직 / 플레이어 동시 작업
3. 미리보기에서 동작 확인

이대로 진행할까요?
