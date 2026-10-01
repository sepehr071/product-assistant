'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSessionContext } from '@livekit/components-react';
import { AttractView } from '@/components/app/attract-view';
import { TalkView } from '@/components/app/talk-view';

const MotionAttract = motion.create(AttractView);
const MotionTalk = motion.create(TalkView);

const VIEW_MOTION_PROPS = {
  variants: {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: { duration: 0.4, ease: 'linear' },
};

export function ViewController() {
  const { isConnected, start, end } = useSessionContext();
  const [barcode, setBarcode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onScan = useCallback(
    async (code: string) => {
      setError(null);
      setBarcode(code);
      if (!isConnected) {
        try {
          await start();
        } catch (err) {
          setBarcode(null);
          const message = err instanceof Error ? err.message : String(err);
          setError(message || 'Could not start the voice session.');
        }
      }
    },
    [isConnected, start]
  );

  const onDone = useCallback(() => {
    setBarcode(null);
    end();
  }, [end]);

  return (
    <AnimatePresence mode="wait">
      {(!isConnected || !barcode) && (
        <MotionAttract key="attract" {...VIEW_MOTION_PROPS} onScan={onScan} error={error} />
      )}
      {isConnected && barcode && (
        <MotionTalk key="talk" {...VIEW_MOTION_PROPS} barcode={barcode} onDone={onDone} />
      )}
    </AnimatePresence>
  );
}
