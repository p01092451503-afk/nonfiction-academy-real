import { useEffect, useState } from "react";
import { Video as VideoIcon } from "lucide-react";

interface VideoThumbnailProps {
  src?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
}

/**
 * 영상 썸네일 렌더러. src가 없거나 로드 실패 시 기본 비디오 아이콘 표시.
 */
export const VideoThumbnail = ({
  src,
  alt = "",
  className = "w-full h-full",
  iconClassName = "h-4 w-4 text-muted-foreground",
}: VideoThumbnailProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showFallback = !src || failed;

  return (
    <div className={`relative bg-muted flex items-center justify-center overflow-hidden ${className}`}>
      {!showFallback && (
        <img
          src={src as string}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
      {showFallback && <VideoIcon className={iconClassName} />}
    </div>
  );
};

export default VideoThumbnail;
