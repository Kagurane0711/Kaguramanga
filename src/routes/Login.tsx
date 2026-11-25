import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'react-toastify';
import ImgLogin from '../assets/ImgLogin.jpg';
import ThemeToggle from '../components/ThemeToggle.tsx';
import useUsers from '../store/users.ts';

export default function Login() {
  const navigate = useNavigate();
  const { user, signInWithGoogle } = useUsers();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/library', { replace: true });
    }
  }, [user, navigate]);

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
      toast.success('Signed in with Google.');
      navigate('/library');
    } catch (err) {
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
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen w-full bg-[#faf9f7] text-zinc-900 dark:bg-[#111114] dark:text-zinc-100 amoled:bg-black amoled:text-zinc-50 transition-colors">
      <div className="hidden lg:block relative overflow-hidden bg-zinc-950 amoled:bg-black">
        <img
          className="w-full h-full object-cover opacity-85"
          src={ImgLogin}
          alt="Manga reading library"
        />
      </div>

      <div className="flex flex-col justify-center px-6 py-12">
        <div className="max-w-md w-full mx-auto bg-white dark:bg-[#18181b] amoled:bg-black p-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 amoled:border-zinc-900 space-y-6 transition-colors">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/"
                className="font-display text-lg font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 inline-flex items-center gap-2"
              >
                <img
                  src="/assets/aistudio/Code_Generated_Image_2__522eac25.png"
                  alt=""
                  aria-hidden="true"
                  className="w-6 h-6 rounded-md object-cover shrink-0"
                />
                <span>Kagura Manga</span>
              </Link>
              <ThemeToggle variant="dropdown" compact />
            </div>
            <h1 className="font-display text-2xl font-bold text-zinc-950 dark:text-zinc-50">
              Sign in to sync your library
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
            <Link
              to="/"
              className="text-xs font-medium text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              Continue browsing without signing in &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
