'use client';

import { useEffect, useRef } from 'react';

type DetectedBarcode = { rawValue?: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };

const BARCODE = /^[0-9]{8,14}$/;

export function useCameraBarcode(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  onScan: (barcode: string) => void
) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
      }
    ).BarcodeDetector;

    let stream: MediaStream | undefined;
    let timer = 0;
    let stopped = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
      } catch {
        return;
      }
      if (!DetectorCtor) {
        return;
      }
      const detector = new DetectorCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      });
      const tick = async () => {
        if (stopped || video.readyState < 2) {
          return;
        }
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue?.replace(/\D/g, '') ?? '';
          if (BARCODE.test(value)) {
            onScanRef.current(value);
          }
        } catch {
          // detector can throw if the frame is not ready
        }
      };
      timer = window.setInterval(tick, 400);
    };

    void start();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [enabled, videoRef]);
}
