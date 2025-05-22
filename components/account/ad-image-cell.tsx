import React from "react";

interface AdImageCellProps {
  thumbnailUrl?: string;
  alt: string;
}

const AdImageCell: React.FC<AdImageCellProps> = ({ thumbnailUrl, alt }) => {
  const [imgSrc, setImgSrc] = React.useState<string>("/fallback-thumbnail.png");
  const [isLoaded, setIsLoaded] = React.useState(false);
  const hasValidThumbnail = thumbnailUrl && typeof thumbnailUrl === "string" && thumbnailUrl.trim() !== "";

  React.useEffect(() => {
    if (!hasValidThumbnail) return;
    const realImg = new window.Image();
    realImg.src = `/api/proxy-image?url=${encodeURIComponent(thumbnailUrl!)}`;
    realImg.onload = () => {
      setImgSrc(realImg.src);
      setIsLoaded(true);
    };
    // If error, keep fallback
  }, [thumbnailUrl, hasValidThumbnail]);

  // If showing placeholder, don't animate
  const isPlaceholder = imgSrc === "/fallback-thumbnail.png";

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={`h-full w-full object-cover transition-opacity duration-500 ${!isPlaceholder && isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: '#f3f3f3' }}
      onLoad={() => { if (!isPlaceholder) setIsLoaded(true); }}
    />
  );
};

export default AdImageCell;
