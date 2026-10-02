'use client';

import { useState } from 'react';
import { Flashlight, FlashlightOff, Keyboard, X } from 'lucide-react';
import { useZxing } from 'react-zxing';
import type { BarcodeFormat } from 'barcode-detector/ponyfill';
import { Button } from '@/app/_components/Button';

// Only the product barcodes on food (EAN/UPC). Without this the scanner also reads the other codes
// printed on a pack -- a store's internal label, a batch code -- and returns text that is not a
// product number, so nothing matches.
const PRODUCT_FORMATS: BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualValue, setManualValue] = useState('');

  const { ref, torch } = useZxing({
    paused,
    formats: PRODUCT_FORMATS,
    // A sharper picture (and continuous focus where the phone offers it) so small or curved
    // barcodes decode from a comfortable distance.
    constraints: {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      },
    },
    // Tries extra rotation angles on a failed frame -- real-world packaging (a barcode on a
    // curved tin, or held at a slight angle) is the common case react-zxing's default straight-
    // on decode misses, not a rare edge case.
    trySkew: true,
    onDecodeResult(result) {
      setPaused(true);
      onDetected(result.rawValue);
    },
    onError(error) {
      setCameraError(error instanceof Error ? error.message : 'Camera unavailable');
    },
  });

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = manualValue.trim();
    if (!value) return;
    onDetected(value);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <p className="text-sm font-medium text-white">Scan a barcode</p>
        <div className="flex items-center gap-2">
          {!cameraError && torch.isAvailable && (
            <button
              onClick={() => (torch.isOn ? torch.off() : torch.on())}
              aria-label={torch.isOn ? 'Turn off flashlight' : 'Turn on flashlight'}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              {torch.isOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {cameraError ? (
        <p className="p-4 text-sm text-red-400">{cameraError} — use search instead, or enter the barcode below.</p>
      ) : (
        <div className="relative min-h-0 flex-1">
          <video ref={ref} className="h-full w-full object-cover" />
          {/* Aiming guide only -- react-zxing scans the full frame regardless, this just gives
              the user a target so they hold the barcode steady in the camera's sweet spot. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-44 w-[94%] max-w-lg rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
      )}

      <div className="space-y-2 p-4">
        {!manualEntry ? (
          <button
            type="button"
            onClick={() => setManualEntry(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-white/20 py-2.5 text-sm font-medium text-white hover:bg-white/10"
          >
            <Keyboard className="h-4 w-4" />
            Can&apos;t scan it? Enter the barcode number
          </button>
        ) : (
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="Barcode number"
              className="min-w-0 flex-1 rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <Button type="submit" variant="primary" disabled={!manualValue.trim()}>
              Look up
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
