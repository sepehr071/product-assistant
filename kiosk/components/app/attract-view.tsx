'use client';

import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { BarcodeIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import { useCameraBarcode } from '@/hooks/useCameraBarcode';
import { useHidBarcode } from '@/hooks/useHidBarcode';

type Sample = { barcode: string; name: string; brand: string; category: string };

const FALLBACK: Sample[] = [
  { barcode: '5901234123457', name: 'Meadow Fresh Greek Yogurt Plain', brand: 'Meadow Fresh', category: 'Dairy' },
  { barcode: '5449000000996', name: 'Classic Cola 1.5 L', brand: 'House Brand', category: 'Soft drinks' },
  { barcode: '5000112637908', name: 'Stone Oven Wholemeal Bread', brand: 'Stone Oven', category: 'Bakery' },
];

interface AttractViewProps {
  onScan: (barcode: string) => void;
  error?: string | null;
}

export function AttractView({ onScan, error, ref }: ComponentProps<'div'> & AttractViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [samples, setSamples] = useState<Sample[]>(FALLBACK);
  const [hint, setHint] = useState('USB scanner or hold a barcode to the camera');
  const [configError, setConfigError] = useState<string | null>(null);
  const [cameraLive, setCameraLive] = useState(false);

  const handleScan = useCallback(
    (barcode: string) => {
      onScan(barcode);
    },
    [onScan]
  );

  useHidBarcode(handleScan);
  useCameraBarcode(videoRef, true, handleScan);

  useEffect(() => {
    void fetch('/api/catalog')
      .then((res) => res.json())
      .then((body: { products?: Sample[] }) => {
        if (body.products?.length) {
          setSamples(body.products);
        }
      })
      .catch(() => {
        setHint('Demo samples below — add LiveKit keys to talk');
      });
    void fetch('/api/health')
      .then((res) => res.json())
      .then((body: { livekit?: boolean }) => {
        if (body.livekit === false) {
          setConfigError('This kiosk cannot mint LiveKit tokens (server env missing).');
        }
      })
      .catch(() => {
        setConfigError('Cannot reach /api/health. Use the Turkey HTTPS URL, not localhost.');
      });
  }, []);

  const problem = error || configError;

  return (
    <div
      ref={ref}
      className="flex h-svh w-full flex-col overflow-y-auto px-5 py-6 sm:px-8 md:px-16 md:py-10 lg:overflow-hidden"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="size-2 rounded-full bg-[var(--laser)] shadow-[0_0_10px_var(--laser)]" />
            Product Talk
          </p>
          <h1 className="mt-3 max-w-3xl text-5xl leading-[0.92] font-semibold tracking-[-0.035em] text-balance md:text-7xl">
            Scan a product.
            <span className="block text-[var(--ticket)]">Talk to it.</span>
          </h1>
        </div>
        <p className="max-w-sm text-base leading-relaxed text-muted-foreground md:text-right">
          Ask about protein, sugar, allergens or diet fit. Answers come from the pack files and are
          spoken back to you.
        </p>
      </header>

      <div className="laser-line mt-6 shrink-0 md:mt-8" />

      <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-6 md:mt-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-10">
        <div className="relative min-h-72 overflow-hidden rounded-md border border-white/10 bg-[radial-gradient(ellipse_at_center,#13201b_0%,#050807_75%)]">
          <video
            ref={videoRef}
            className="h-full w-full object-cover opacity-80"
            muted
            playsInline
            autoPlay
            onPlaying={() => setCameraLive(true)}
          />
          <div className="viewfinder-corners pointer-events-none absolute inset-6" />
          <div className="laser-sweep pointer-events-none absolute inset-x-10 h-px bg-[var(--laser)] shadow-[0_0_18px_2px_var(--laser)]" />
          {!cameraLive && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center p-8 text-center">
              <div>
                <BarcodeIcon className="mx-auto size-14 text-white/25" weight="thin" />
                <p className="mt-3 text-lg font-medium text-white/80">Hold a barcode up to the camera</p>
                <p className="mt-1 text-sm text-white/45">or scan it with the handheld scanner</p>
              </div>
            </div>
          )}
          <p className="absolute right-12 bottom-10 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur">
            <span
              className={`size-1.5 rounded-full ${cameraLive ? 'bg-emerald-400' : 'bg-white/30'}`}
            />
            {cameraLive ? 'Camera on' : 'Waiting for camera'}
          </p>
        </div>

        <div className="flex min-h-0 flex-col">
          {problem ? (
            <p
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-md border border-[var(--laser)]/35 bg-[var(--laser)]/10 px-4 py-3 text-sm text-[#ffb3a8]"
            >
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="bold" />
              {problem}
            </p>
          ) : null}

          <h2 className="text-xl font-semibold tracking-tight">No barcode handy? Tap a sample.</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>

          <ul className="mt-5 flex flex-col gap-3">
            {samples.map((sample) => (
              <li key={sample.barcode}>
                <button
                  type="button"
                  onClick={() => handleScan(sample.barcode)}
                  className="group flex w-full items-center justify-between gap-4 rounded-md border border-white/10 bg-[var(--card)] py-3 pr-3 pl-5 text-left transition-colors hover:border-[var(--ticket)]/70 hover:bg-[#18221e] focus-visible:ring-2 focus-visible:ring-[var(--ticket)] focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-medium">{sample.name}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="rounded-full border border-white/10 px-2 py-px text-xs whitespace-nowrap">
                        {sample.category}
                      </span>
                      {sample.brand}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-center rounded-sm bg-[#f4f1e6] px-2 pt-2 pb-1 text-[#0b1210] sm:px-3">
                    <span aria-hidden className="barcode-bars block h-7 w-20 sm:w-28" />
                    <span className="mt-1 font-mono text-[9px] tracking-[0.08em] sm:text-[11px] sm:tracking-[0.18em]">
                      {sample.barcode}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-auto pt-8 text-xs leading-relaxed text-muted-foreground">
            Not medical advice. Read the pack, and ask a pharmacist or doctor about diet conditions.
          </p>
        </div>
      </div>
    </div>
  );
}
