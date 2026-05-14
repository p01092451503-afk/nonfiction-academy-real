import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type CourseThumbnailProps = {
  src?: string | null;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  iconClassName?: string;
};

export const CourseThumbnail = ({
  src,
  alt,
  className,
  imageClassName,
  fallbackClassName,
  iconClassName,
}: CourseThumbnailProps) => {
  if (!src) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg bg-accent", fallbackClassName ?? className)} aria-hidden="true">
        <BookOpen className={cn("h-5 w-5 text-muted-foreground", iconClassName)} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn("block max-w-full rounded-lg object-contain", className, imageClassName)}
    />
  );
};

export default CourseThumbnail;