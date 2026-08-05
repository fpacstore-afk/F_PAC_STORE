import React, { useEffect, useRef, useState } from 'react';
import { parseVideoData, getVideoUrl } from '../services/cloudinary';
import { cn } from '../lib/utils';
import { RichVideoDetails, EstampaVideo } from '../types/video';

// ============================================================================
// CONFIGURATION CONSTANTS FOR SMART HYBRID ZOOM & ENQUADRAMENTO
// Adjust these constants to balance video coverage vs. cropping.
// ============================================================================

export const VIDEO_SCALE_MIN = 1.05; // For very vertical videos, minimize zoom to keep shirt visible (5% zoom)
export const VIDEO_SCALE_MAX = 1.28; // For almost square or horizontal videos, allow more zoom (28% zoom)
export const VIDEO_FOCUS_Y = -4;    // Subtle shift upward (in percentage) to focus on chest print / collar
export const VIDEO_FOCUS_X = 0;     // Horizontal centering

interface CloudinaryVideoPlayerProps {
  videoUrl?: string | RichVideoDetails | EstampaVideo;
  playlist?: (string | RichVideoDetails | EstampaVideo)[];
  isActive: boolean; // Triggers play when true, pause/reset when false
  isNearViewport: boolean; // Controls lazy loading of the video element
  onVideoReady: (ready: boolean) => void; // Callback when video is loaded and ready to play
  className?: string;
}

export const CloudinaryVideoPlayer: React.FC<CloudinaryVideoPlayerProps> = ({
  videoUrl,
  playlist,
  isActive,
  isNearViewport,
  onVideoReady,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);

  // Serialize playlist and videoUrl to maintain a stable dependency array and prevent infinite loops
  const serializedPlaylist = React.useMemo(() => JSON.stringify(playlist), [playlist]);
  const serializedVideoUrl = React.useMemo(() => {
    if (!videoUrl) return '';
    return typeof videoUrl === 'string' ? videoUrl : JSON.stringify(videoUrl);
  }, [videoUrl]);

  // Construct the normalized playlist of secure URLs
  const resolvedPlaylist = React.useMemo(() => {
    const rawList: (string | RichVideoDetails | EstampaVideo)[] = [];
    if (playlist && playlist.length > 0) {
      rawList.push(...playlist);
    } else if (videoUrl) {
      rawList.push(videoUrl);
    }

    return rawList
      .map(item => {
        const parsed = parseVideoData(item);
        const raw = getVideoUrl(item);
        return {
          parsedUrl: parsed.url,
          isValid: parsed.isValid,
          rawUrl: raw
        };
      })
      .filter(item => item.isValid);
  }, [serializedPlaylist, serializedVideoUrl]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  const activeVideoItem = resolvedPlaylist[currentIndex];
  const [currentUrl, setCurrentUrl] = useState<string>(activeVideoItem?.parsedUrl || '');
  const [isUsingFallback, setIsUsingFallback] = useState<boolean>(false);

  const rawUrl = activeVideoItem?.rawUrl || '';

  // Synchronize source when active video item changes
  useEffect(() => {
    if (activeVideoItem) {
      setCurrentUrl(activeVideoItem.parsedUrl);
      setIsUsingFallback(false);
      setHasError(false);
      setIsLoaded(false);
    }
  }, [activeVideoItem?.parsedUrl]);

  // Reset to first video when active state is lost (e.g. hovered out, leaves screen)
  useEffect(() => {
    if (!isActive) {
      setCurrentIndex(0);
      setIsSwitching(false);
    }
  }, [isActive]);

  // ResizeObserver to measure container dimension dynamically (responsive across all devices)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Handle Play / Pause + Reset state for both video players
  useEffect(() => {
    const video = videoRef.current;
    const bgVideo = bgVideoRef.current;
    if (!video || resolvedPlaylist.length === 0 || hasError || isSwitching) return;

    if (isActive) {
      // Sync foreground video play
      const playPromise = video.play();
      
      // Sync background video play
      if (bgVideo) {
        bgVideo.play().catch(() => {});
      }

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          // Robust error handling for browser autoplay policies
          console.warn('Autoplay prevented or interrupted:', error);
        });
      }
    } else {
      video.pause();
      if (bgVideo) bgVideo.pause();
      try {
        video.currentTime = 0;
        if (bgVideo) bgVideo.currentTime = 0;
      } catch (e) {
        // Safe guard in case video stream isn't fully initialized
      }
    }
  }, [isActive, hasError, currentUrl, isSwitching, resolvedPlaylist.length]);

  // If there are no videos, do not render player
  if (resolvedPlaylist.length === 0) {
    return null;
  }

  // Performance Optimization: Do not render the actual <video> tags if not near viewport
  if (!isNearViewport) {
    return null;
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoSize({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  const handleLoadedData = () => {
    setIsLoaded(true);
    setIsSwitching(false); // Video is ready, turn off transition mode to fade in
    onVideoReady(true);
  };

  const handleError = () => {
    console.warn(`Error loading video in playlist index ${currentIndex}: ${currentUrl}`);

    if (!isUsingFallback && rawUrl && rawUrl !== currentUrl) {
      console.warn(`Failed to play optimized video. Falling back to original: ${rawUrl}`);
      setIsUsingFallback(true);
      setCurrentUrl(rawUrl);
    } else {
      // Robust error handling: skip to next video in sequence if load fails
      if (resolvedPlaylist.length > 1) {
        console.warn(`Skipping failing video and advancing to next in playlist.`);
        setIsSwitching(true);
        setTimeout(() => {
          setCurrentIndex((prevIndex) => (prevIndex + 1) % resolvedPlaylist.length);
        }, 300);
      } else {
        setHasError(true);
        setIsLoaded(false);
        onVideoReady(false);
      }
    }
  };

  const handleVideoEnded = () => {
    if (resolvedPlaylist.length <= 1) {
      // Simple loop for single-video stamps
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      return;
    }

    // Smooth sequence transition
    setIsSwitching(true);
    
    // Soft fadeout to reveal underlying mockup image during transit
    setTimeout(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % resolvedPlaylist.length);
    }, 350);
  };

  // Smooth fade-in/out of the video
  const showVideo = isActive && isLoaded && !hasError && !isSwitching;

  // Dynamic Scale and Translation calculations based on aspect ratio mapping
  let dynamicScale = 1.12;
  let dynamicTranslateY = "-2%";

  if (videoSize.width > 0 && videoSize.height > 0 && containerSize.width > 0 && containerSize.height > 0) {
    const vRatio = videoSize.width / videoSize.height;

    if (vRatio < 0.8) {
      // Very vertical video (e.g. 9:16 = 0.56)
      // Keep scale minimal to prevent cropping the shirt collar and bottom hem
      dynamicScale = VIDEO_SCALE_MIN;
      dynamicTranslateY = `${VIDEO_FOCUS_Y}%`;
    } else if (vRatio > 1.3) {
      // Landscape/Horizontal video (e.g. 16:9 = 1.77)
      // We can apply more zoom to maximize card coverage since vertical room is spacious
      dynamicScale = VIDEO_SCALE_MAX;
      dynamicTranslateY = "0%";
    } else {
      // Square or near-square format
      // Interpolate scale and vertical shift dynamically
      const progress = (vRatio - 0.8) / 0.5; // 0 to 1 mapping
      const clampedProgress = Math.max(0, Math.min(1, progress));
      dynamicScale = VIDEO_SCALE_MIN + (VIDEO_SCALE_MAX - VIDEO_SCALE_MIN) * clampedProgress;
      
      const yFocus = VIDEO_FOCUS_Y * (1 - clampedProgress);
      dynamicTranslateY = `${yFocus}%`;
    }
  }

  // Preloading the next video in sequence
  const nextIndex = (currentIndex + 1) % resolvedPlaylist.length;
  const nextVideoItem = resolvedPlaylist[nextIndex];

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden flex items-center justify-center transition-all duration-700",
        showVideo ? "bg-zinc-950" : "bg-transparent",
        className
      )}
    >
      {/* Background Layer: Blurred and zoomed-in video to cover any aspect-ratio sidebars/letterboxes */}
      <video
        ref={bgVideoRef}
        src={currentUrl}
        muted
        playsInline
        loop={resolvedPlaylist.length === 1}
        preload={isActive ? "auto" : "metadata"}
        className={cn(
          "absolute inset-0 w-full h-full object-cover blur-xl opacity-0 scale-125 pointer-events-none transition-all duration-700 ease-in-out z-0",
          showVideo ? "opacity-35" : "opacity-0"
        )}
      />

      {/* Foreground Layer: Sharp, smart scaled and centered video */}
      <video
        ref={videoRef}
        src={currentUrl}
        muted
        playsInline
        loop={resolvedPlaylist.length === 1}
        preload={isActive ? "auto" : "metadata"}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onEnded={handleVideoEnded}
        onError={handleError}
        className={cn(
          "absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-700 ease-in-out z-10",
          showVideo ? "opacity-100" : "opacity-0"
        )}
        style={{
          transform: `scale(${dynamicScale}) translate(${VIDEO_FOCUS_X}%, ${dynamicTranslateY})`,
          transformOrigin: 'center center',
        }}
      />

      {/* Preload Layer: Invisible preloader for the next sequential video to enable instant transitions */}
      {resolvedPlaylist.length > 1 && nextVideoItem && (
        <video
          key={`preload-${nextIndex}-${nextVideoItem.parsedUrl}`}
          src={nextVideoItem.parsedUrl}
          preload="auto"
          muted
          playsInline
          className="hidden"
        />
      )}
    </div>
  );
};
