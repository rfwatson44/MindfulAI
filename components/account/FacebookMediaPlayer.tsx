import React from 'react';

interface FacebookMediaPlayerProps {
  url: string;
}

const getFacebookEmbedUrl = (url: string): string | null => {
  // Accepts both video and post links
  // Example: https://www.facebook.com/zleaguegg/videos/1234567890/
  //          https://www.facebook.com/zleaguegg/posts/1234567890
  if (!url) return null;
  const videoMatch = url.match(/facebook.com\/(?:.+)\/videos\/(\d+)/);
  if (videoMatch) {
    return `https://www.facebook.com/video/embed?video_id=${videoMatch[1]}`;
  }
  // Fallback: try to embed any FB link
  return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0&width=560`;
};

const FacebookMediaPlayer: React.FC<FacebookMediaPlayerProps> = ({ url }) => {
  const embedUrl = getFacebookEmbedUrl(url);
  if (!embedUrl) return <div className="text-gray-400">No Facebook Preview Available</div>;
  return (
    <div className="w-full h-full flex flex-col flex-1 relative">
      <iframe
        src={embedUrl}
        title="Facebook Preview"
        className="w-full h-full flex-1 min-h-0 rounded object-contain"
        style={{ minHeight: 0 }}
        frameBorder={0}
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
    </div>
  );
};

export default FacebookMediaPlayer;
