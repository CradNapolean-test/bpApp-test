'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4">
        <p className="text-sm font-medium text-white">Scan a barcode</p>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {cameraError ? (
        <p className="p-4 text-sm text-red-400">{cameraError} — use search instead.</p>
      ) : (
        <video ref={ref} className="min-h-0 flex-1 w-full object-cover" />
      )}
    </div>
  );
}
