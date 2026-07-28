'use client';

import { useState } from 'react';
import { useZxing } from 'react-zxing';

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const { ref } = useZxing({
    paused,
    constraints: { video: { facingMode: 'environment' } },
    onDecodeResult(result) {
      setPaused(true);
      onDetected(result.rawValue);
    },
    onError(error) {
      setCameraError(error instanceof Error ? error.message : 'Camera unavailable');
    },
  });

  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Scan a barcode</p>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:underline">
          Close
        </button>
      </div>
      {cameraError ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {cameraError} — use search instead.
        </p>
      ) : (
        <video ref={ref} className="mt-2 w-full rounded-md" />
      )}
    </div>
  );
}
