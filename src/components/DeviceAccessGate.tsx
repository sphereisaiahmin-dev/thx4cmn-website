'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export const DeviceAccessGate = () => {
  const router = useRouter();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [labelClickCount, setLabelClickCount] = useState(0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/device/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        throw new Error('Invalid PIN.');
      }

      setPin('');
      setIsPromptOpen(false);
      setLabelClickCount(0);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Access failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
        <div className="rounded-[1.75rem] border border-black/10 bg-white/80 px-8 py-6 text-center shadow-[0_16px_40px_rgba(0,0,0,0.12)] backdrop-blur-sm">
          <button
            type="button"
            className="text-xs uppercase tracking-[0.4em] text-black/55 transition hover:text-black"
            onClick={() => {
              setError(null);
              setLabelClickCount((currentCount) => {
                const nextCount = currentCount + 1;
                if (nextCount >= 5) {
                  setIsPromptOpen(true);
                  return 0;
                }

                return nextCount;
              });
            }}
          >
            hx01
          </button>
          <h1 className="mt-2 text-2xl uppercase tracking-[0.3em]">Coming soon..</h1>
        </div>
      </div>

      {isPromptOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hx01-access-title"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-[1.75rem] border border-black/10 bg-white/90 p-6 shadow-[0_16px_40px_rgba(0,0,0,0.12)]"
          >
            <div className="space-y-2 text-center">
              <h2 id="hx01-access-title" className="text-sm uppercase tracking-[0.34em]">
                hx01 access
              </h2>
              <p className="text-xs uppercase tracking-[0.22em] text-black/50">
                Enter PIN
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="w-full rounded-full border border-black/18 bg-white/80 px-4 py-3 text-center text-sm tracking-[0.3em] outline-none transition focus:border-black/32"
                aria-label="hx01 access PIN"
              />
              {error ? <p className="text-center text-xs text-red-600">{error}</p> : null}
            </div>

            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsPromptOpen(false);
                  setPin('');
                  setError(null);
                  setLabelClickCount(0);
                }}
                className="rounded-full border border-black/20 px-5 py-2 text-xs uppercase tracking-[0.28em] text-black/60 transition hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || pin.trim().length === 0}
                className="device-connect-hover-cycle rounded-full border border-black/30 px-5 py-2 text-xs uppercase tracking-[0.28em] transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Checking...' : 'Enter'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
};
