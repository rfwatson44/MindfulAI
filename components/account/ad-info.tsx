"use client";
import React, { useState } from 'react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import FacebookMediaPlayer from './FacebookMediaPlayer';

interface InstagramMediaPlayerProps {
  url?: string;
  backupUrl?: string;
}

const getInstagramEmbedUrl = (url: string): string | null => {
  // Supports /p/, /reel/, /tv/ shortcodes
  const match = url.match(/instagram.com\/(p|reel|tv)\/([\w-]+)/);
  if (match) {
    return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
  }
  return null;
};

const InstagramMediaPlayer: React.FC<InstagramMediaPlayerProps> = ({ url, backupUrl }) => {
  const [failed, setFailed] = useState(false);
  const [usedBackup, setUsedBackup] = useState(false);

  let isMp4 = false;
  if (url && url.endsWith('.mp4')) isMp4 = true;

  // If url is direct video
  if (!failed && isMp4 && url) {
    return (
      <div className="w-full h-full flex flex-col flex-1 relative">
        <video
          src={url}
          controls
          className="w-full h-full flex-1 min-h-0 rounded bg-black object-contain"
          style={{ minHeight: 0 }}
          onError={() => {
            if (!usedBackup && backupUrl) {
              setUsedBackup(true);
              setFailed(true);
            } else {
              setFailed(true);
            }
          }}
        >
          Sorry, your browser doesn't support embedded videos.
        </video>

      </div>
    );
  }

  // If url is Instagram post/reel
  const embedUrl = url ? getInstagramEmbedUrl(url) : null;
  if (!failed && embedUrl) {
    return (
      <div className="w-full h-full flex flex-col flex-1 relative">
        <iframe
          src={embedUrl}
          title="Instagram Post"
          className="w-full h-full flex-1 min-h-0 rounded bg-white object-contain"
          style={{ minHeight: 0 }}
          frameBorder={0}
          allowFullScreen
          allow="autoplay; encrypted-media"
          onError={() => {
            if (!usedBackup && backupUrl) {
              setUsedBackup(true);
              setFailed(true);
            } else {
              setFailed(true);
            }
          }}
        />

      </div>
    );
  }

  // Try backupUrl as a last resort
  if (!failed && backupUrl) {
    // If backupUrl is .mp4, show video, else iframe
    if (backupUrl.endsWith('.mp4')) {
      return (
        <div className="w-full h-full flex flex-col flex-1 relative">
          <video
            src={backupUrl}
            controls
            className="w-full h-full flex-1 min-h-0 rounded bg-black object-contain"
            style={{ minHeight: 0 }}
            onError={() => setFailed(true)}
          >
            Sorry, your browser doesn't support embedded videos.
          </video>
        </div>
      );
    } else {
      return (
        <div className="w-full h-full flex flex-col flex-1 relative">
          <iframe
            src={backupUrl}
            title="Ad Preview"
            className="w-full h-full flex-1 min-h-0 rounded object-contain"
            style={{ minHeight: 0 }}
            frameBorder={0}
            allowFullScreen
            onError={() => setFailed(true)}
          />
        </div>
      );
    }
  }

  // If all fail
  return <div className="text-gray-400">No Preview Available</div>;
};

interface AdInfoProps {
  ad: any;
  onClose: () => void;
}

const AdInfo: React.FC<AdInfoProps> = ({ ad, onClose }) => {
  // Prefer preview_url, fallback to instagram_permalink_url
  const previewUrl = ad.preview_url || ad.instagram_permalink_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl flex flex-col h-[98vh]">
        <div className="flex items-center justify-between border-b p-4 flex-shrink-0">
          <h2 className="text-base font-semibold break-words text-left px-2" title={ad.name} style={{wordBreak: 'break-word', whiteSpace: 'pre-line', margin: 0}}>{ad.name}</h2>
          <button
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2 py-1"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 min-h-0 h-0">
          {/* Left: Preview */}
          <div className="flex flex-col flex-1 min-h-0 h-full bg-gray-50 border-r">
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 min-h-0 h-full flex flex-col w-full overflow-hidden">
                {ad.instagram_permalink_url ? (
                  <InstagramMediaPlayer url={ad.instagram_permalink_url} backupUrl={ad.preview_url} />
                ) : ad.preview_url ? (
                  /**** Image fallback logic ****/
                  (() => {
                    const url = ad.preview_url.toLowerCase();
                    // Regex: ends with image extension, possibly followed by ? or # and anything
                    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)([?#].*)?$/i.test(url);
                    if (isImage) {
                      return (
                        <img
                          src={ad.preview_url}
                          alt="Ad Preview"
                          className="w-full h-full object-contain rounded bg-black flex-1"
                          style={{ minHeight: 0 }}
                        />
                      );
                    }
                    return <FacebookMediaPlayer url={ad.preview_url} />;
                  })()
                ) : (
                  <div className="text-gray-400">No Preview Available</div>
                )}
              </div>
              <div className="w-full flex flex-col items-center pb-4 mt-auto">
                {ad.instagram_permalink_url && (
                  <a href={ad.instagram_permalink_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline mb-1">Instagram Link</a>
                )}
                {ad.preview_url && (
                  <a href={ad.preview_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Preview Link</a>
                )}
              </div>
            </div>
          </div>
          {/* Right: Info */}
          <div className="flex-1 h-full min-h-0 p-6 overflow-y-auto">
            <Accordion type="multiple" className="w-full">
              <AccordionItem value="main-info">
                <AccordionTrigger>Main Info</AccordionTrigger>
                <AccordionContent>
                  <div className="mb-2"><span className="font-semibold">Ad ID:</span> {ad.ad_id || '--'}</div>
                  <div className="mb-2"><span className="font-semibold">Campaign:</span> {ad.campaign_id || '--'}</div>
                  <div className="mb-2"><span className="font-semibold">Status:</span> {ad.status || '--'}</div>
                  <div className="mb-2">
                    <span className="font-semibold">Titles:</span>
                    <ul className="list-disc ml-5 text-gray-800">
                      {(() => {
                        let titles: string[] = [];
                        if (ad.asset_feed_spec && ad.asset_feed_spec.titles) {
                          if (Array.isArray(ad.asset_feed_spec.titles)) {
                            titles = ad.asset_feed_spec.titles.flatMap((t: any) => {
                              if (typeof t === 'string') return t.split('\n');
                              if (typeof t === 'object' && t && typeof t.text === 'string') return t.text.split('\n');
                              return [];
                            });
                          } else if (typeof ad.asset_feed_spec.titles === 'string') {
                            titles = ad.asset_feed_spec.titles.split('\n');
                          }
                        }
                        if (titles.length === 0) return <li>--</li>;
                        return titles.map((t: string, i: number) => <li key={i}>{t}</li>);
                      })()}
                    </ul>
                  </div>
                  <div className="mb-2">
                    <span className="font-semibold">Body:</span>
                    <ul className="list-disc ml-5 text-gray-800">
                      {(() => {
                        let bodies: string[] = [];
                        if (ad.asset_feed_spec && ad.asset_feed_spec.bodies) {
                          if (Array.isArray(ad.asset_feed_spec.bodies)) {
                            bodies = ad.asset_feed_spec.bodies.map((b: any) => {
                              if (typeof b === 'string') return b;
                              if (typeof b === 'object' && b && typeof b.text === 'string') return b.text;
                              return '';
                            }).filter(Boolean);
                          } else if (typeof ad.asset_feed_spec.bodies === 'string') {
                            bodies = ad.asset_feed_spec.bodies.split('\n');
                          }
                        }
                        if (bodies.length === 0) return <li>--</li>;
                        return bodies.map((b: string, i: number) => <li key={i}>{b}</li>);
                      })()}
                    </ul>
                  </div>
                  {/* Add more main info fields as needed */}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="metrics">
                <AccordionTrigger>Metrics</AccordionTrigger>
                <AccordionContent>
                  <div className="mb-2"><span className="font-semibold">Conversions:</span></div>
                  {ad.conversions === undefined || ad.conversions === null ? (
                    <div>--</div>
                  ) : typeof ad.conversions === 'object' ? (
                    <ul className="ml-2 list-disc list-inside">
                      {Object.entries(ad.conversions).map(([key, value]) => (
                        <li key={key} className="text-xs"><span className="font-semibold">{key}:</span> {String(value)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div>{ad.conversions}</div>
                  )}
                  {/* Add other metrics here, e.g., spend, impressions, etc. */}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="raw-data">
                <AccordionTrigger>Raw Data</AccordionTrigger>
                <AccordionContent>
                  <pre className="bg-gray-100 p-2 rounded text-xs mt-1 overflow-x-auto max-h-40">{JSON.stringify(ad, null, 2)}</pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdInfo;
