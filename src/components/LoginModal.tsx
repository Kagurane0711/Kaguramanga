import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import useUsers from '../store/users.ts';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoginModal({ open, onClose, onSuccess }: LoginModalProps) {
  const { user, signInWithGoogle } = useUsers();
  const [submitting, setSubmitting] = useState(false);
  const completedInModalRef = useRef(false);

  // Close automatically if the user is already signed in when opening
  useEffect(() => {
    if (!open) {
      completedInModalRef.current = false;
      return;
    }
    if (user && !completedInModalRef.current) {
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    }
  }, [open, user, onClose, onSuccess]);

  // Lock background scrolling and allow Escape to close
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      completedInModalRef.current = true;
      await signInWithGoogle();
      toast.success('Signed in with Google.');
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err) {
      completedInModalRef.current = false;
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        toast.info('Sign-in canceled.');
      } else if (code === 'auth/popup-blocked') {
        toast.error('Please allow pop-ups in your browser to sign in with Google.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to sign in right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/50 dark:bg-black/65 backdrop-blur-md transition-opacity"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md bg-white/95 dark:bg-[#18181b]/95 amoled:bg-black/95 border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-800 rounded-2xl shadow-2xl p-7 sm:p-8 space-y-6 transition-colors">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="font-display text-lg font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 inline-flex items-center gap-2">
              <img
                src="/assets/aistudio/Code_Generated_Image_2__522eac25.png"
                alt=""
                aria-hidden="true"
                className="w-6 h-6 rounded-md object-cover shrink-0"
              />
              <span>Kagura Manga</span>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              aria-label="Close sign in window"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 amoled:hover:bg-zinc-900 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h2
            id="login-modal-title"
            className="font-display text-2xl font-bold text-zinc-950 dark:text-zinc-50 pt-1"
          >
            Sign in to sync your library
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Save favorite manga &amp; manhwa and resume chapters across all your devices with your Google account.
          </p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleGoogleSignIn()}
            className="w-full inline-flex items-center justify-center gap-3 py-3 px-4 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-rose-600 dark:hover:text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.72 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.14 14.69 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.17s4.01 8.97 8.97 8.97c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.04-.14-1.27z"
              />
            </svg>
            <span>{submitting ? 'Signing in...' : 'Continue with Google'}</span>
          </button>

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-[#111114] amoled:bg-[#0e0e11] border border-zinc-200/80 dark:border-zinc-800 amoled:border-zinc-900">
            <ShieldCheck className="w-4 h-4 text-rose-600 dark:text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Protected by Firebase Authentication. Your bookmarks and reading history stay private to your verified account.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 amoled:border-zinc-900 text-center">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Continue browsing without signing in &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
