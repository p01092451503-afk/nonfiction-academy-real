export interface VideoPackageItemDraft {
  tempId: string;
  video_asset_id: string | null;
  video_url: string;
  video_provider: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  title: string;
}
