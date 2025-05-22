import React from "react";

interface AdDetailsModalProps {
  ad: any;
  onClose: () => void;
}

const AdDetailsModal: React.FC<AdDetailsModalProps> = ({ ad, onClose }) => {
  if (!ad) return null;

  // Prefer preview_url for video, fallback to instagram_permalink_url
  const videoUrl = ad.preview_url || "";
  const instaUrl = ad.instagram_permalink_url || "";

  // Handle bodies/titles/conversions
  const bodies = Array.isArray(ad.body) ? ad.body : ad.body ? [ad.body] : [];
  const titles = Array.isArray(ad.title) ? ad.title : ad.title ? [ad.title] : [];
  const conversions =
    ad.conversions && typeof ad.conversions === "object"
      ? Object.entries(ad.conversions)
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl flex overflow-hidden relative">
        {/* Close Button */}
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl font-bold"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {/* Left: Video/Media */}
        <div className="flex-1 bg-black flex items-center justify-center min-h-[320px] max-w-[50%]">
          {videoUrl ? (
            <video
              src={videoUrl}
              autoPlay
              loop
              muted
              controls
              className="w-full h-full object-contain rounded-l-lg"
            />
          ) : instaUrl ? (
            <iframe
              src={instaUrl}
              className="w-full h-full rounded-l-lg"
              title="Instagram Preview"
              allow="autoplay"
            />
          ) : (
            <div className="text-white">No preview available</div>
          )}
        </div>
        {/* Right: Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 break-all">{ad.name}</h2>
          {bodies.length > 0 && (
            <div className="mb-3">
              <div className="font-semibold text-gray-700">Bodies:</div>
              <ul className="list-disc ml-5 text-gray-800">
                {bodies.map((body: string, i: number) => (
                  <li key={i}>{body}</li>
                ))}
              </ul>
            </div>
          )}
          {titles.length > 0 && (
            <div className="mb-3">
              <div className="font-semibold text-gray-700">Titles:</div>
              <ul className="list-disc ml-5 text-gray-800">
                {titles.map((title: string, i: number) => (
                  <li key={i}>{title}</li>
                ))}
              </ul>
            </div>
          )}
          {conversions.length > 0 && (
            <div className="mb-3">
              <div className="font-semibold text-gray-700">Conversions:</div>
              <ul className="list-disc ml-5 text-gray-800">
                {conversions.map(([key, value]: [string, any], i: number) => (
                  <li key={i}>
                    <span className="font-medium">{key}:</span> {value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdDetailsModal;
