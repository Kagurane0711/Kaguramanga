import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';

interface DeleteAccountModalProps {
  open: boolean;
  email: string;
  bookmarksCount: number;
  historyCount: number;
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
}

const CONFIRM_KEYWORD = 'DELETE';

function formatDeleteError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google verification was cancelled. Your account and data were not deleted.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Pop-up was blocked by your browser. Please allow pop-ups to verify your identity before deleting.';
  }
  if (code === 'auth/user-mismatch') {
    return 'Please select the exact same Google account you are currently signed in with.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'A fresh Google sign-in is required to delete your account. Please try again.';
  }
  if (err instanceof Error && err.message) {
    if (err.message.startsWith('{') && err.message.includes('"operationType"')) {
      return 'Unable to delete your cloud data due to a database permission error. Please sign out, sign back in, and try again.';
    }
    return err.message;
  }
  return 'Unable to delete your account right now. Please try again.';
}

export default function DeleteAccountModal({
  open,
  email,
  bookmarksCount,
  historyCount,
  onClose,
  onConfirmDelete,
}: DeleteAccountModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setConfirmText('');
      setError(null);
      setDeleting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || step !== 2) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, deleting, onClose]);

  if (!open) return null;

  const isMatch = confirmText === CONFIRM_KEYWORD;

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatch || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirmDelete();
    } catch (err) {
      setError(formatDeleteError(err));
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !deleting) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-[#18181b] amoled:bg-black border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/70 flex items-center justify-center shrink-0">
              {step === 1 ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 font-mono-nums">
                Step {step} of 2
              </p>
              <h2
                id="delete-account-modal-title"
                className="font-display text-lg font-bold text-zinc-950 dark:text-zinc-50 leading-snug"
              >
                {step === 1 ? 'Delete & Wipe Account?' : 'Final Confirmation'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {step === 1 ? (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              This will permanently wipe all of your data from Firebase and delete your account
              {email ? (
                <>
                  {' '}
                  (<span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span>)
                </>
              ) : null}
              . This action cannot be undone.
            </p>

            <div className="rounded-xl bg-zinc-50 dark:bg-[#111114] amoled:bg-[#0e0e11] border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 p-3.5 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                The following will be permanently erased:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Your Firebase Authentication account and profile record</li>
                <li>
                  All saved manga &amp; manhwa bookmarks{' '}
                  <span className="font-mono-nums text-zinc-500 dark:text-zinc-400">
                    ({bookmarksCount})
                  </span>
                </li>
                <li>
                  All reading history &amp; chapter progress{' '}
                  <span className="font-mono-nums text-zinc-500 dark:text-zinc-400">
                    ({historyCount})
                  </span>
                </li>
                <li>Local guest bookmarks and reading cache on this device</li>
              </ul>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              For your security, Google may ask you to re-verify your sign-in before the deletion
              proceeds.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirmText('');
                  setStep(2);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleFinalSubmit(e)} className="px-6 py-5 space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
              To confirm permanent deletion, type{' '}
              <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                {CONFIRM_KEYWORD}
              </span>{' '}
              in the box below.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-delete-input"
                className="block text-xs font-medium text-zinc-700 dark:text-zinc-300"
              >
                Confirmation phrase (case-sensitive)
              </label>
              <input
                ref={inputRef}
                id="confirm-delete-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={CONFIRM_KEYWORD}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-zinc-50 dark:bg-[#111114] amoled:bg-[#0e0e11] border border-zinc-300 dark:border-zinc-700 amoled:border-zinc-800 rounded-lg text-zinc-950 dark:text-zinc-50 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-rose-600 dark:focus:border-rose-500 disabled:opacity-60 transition-colors"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/70 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300 leading-relaxed"
              >
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                className="px-3.5 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors cursor-pointer"
              >
                &larr; Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 amoled:bg-zinc-900 amoled:hover:bg-zinc-800 rounded-lg disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isMatch || deleting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:pointer-events-none rounded-lg transition-colors cursor-pointer"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Wiping Account...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Forever</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
