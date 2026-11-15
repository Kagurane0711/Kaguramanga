import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import ImgLogin from '../assets/ImgLogin.jpg';
import useUsers from '../store/users.ts';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useUsers();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.warn('Please enter your email address.');
      return;
    }
    setSubmitting(true);
    try {
      const [given, ...rest] = name.trim().split(/\s+/);
      await login({
        email: email.trim(),
        given_name: given || undefined,
        family_name: rest.join(' ') || undefined,
      });
      toast.success('Signed in successfully.');
      navigate('/library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setSubmitting(true);
    try {
      await login({ demo: true });
      toast.success('Signed in as Demo Reader.');
      navigate('/library');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen w-full bg-[#faf9f7]">
      <div className="hidden lg:block relative overflow-hidden bg-zinc-950">
        <img
          className="w-full h-full object-cover opacity-85"
          src={ImgLogin}
          alt="Manga reading library"
        />
      </div>

      <div className="flex flex-col justify-center px-6 py-12">
        <div className="max-w-md w-full mx-auto bg-white p-8 rounded-2xl border border-zinc-200 space-y-6">
          <div className="space-y-1.5">
            <Link
              to="/"
              className="font-display text-lg font-extrabold tracking-tight text-zinc-950 inline-block"
            >
              Polin Manga
            </Link>
            <h1 className="font-display text-2xl font-bold text-zinc-950">
              Sign in to sync your library
            </h1>
            <p className="text-sm text-zinc-500">
              Save favorite series and resume chapters from any device.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Akira Sato"
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:border-zinc-950"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-zinc-950 hover:bg-rose-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : 'Continue with Email'}
            </button>
          </form>

          <div className="pt-4 border-t border-zinc-100">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleDemo()}
              className="w-full py-2.5 px-4 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
            >
              Quick Demo Reader Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
