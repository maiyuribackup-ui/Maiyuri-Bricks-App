'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

// Brand colors
const brandColors = {
  primary: '#1F6F43',
  secondary: '#8B5E3C',
  accent: '#2F80ED',
  bgPrimary: '#F7F7F4',
};

// Validation schema
const acceptInviteSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type AcceptInviteFormData = z.infer<typeof acceptInviteSchema>;

interface InvitationData {
  email: string;
  name: string;
  role: string;
}

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteFormData>({
    resolver: zodResolver(acceptInviteSchema),
  });

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setValidationError('No invitation token provided');
        setIsValidating(false);
        return;
      }

      try {
        const response = await fetch(`/api/users/accept-invite?token=${token}`);
        const data = await response.json();

        if (!response.ok || !data.valid) {
          setValidationError(data.error || 'Invalid invitation');
        } else {
          setInvitation(data);
        }
      } catch (err) {
        setValidationError('Failed to validate invitation');
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const onSubmit = async (data: AcceptInviteFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/users/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to create account');
        return;
      }

      setSuccess(true);

      // Redirect to login after a delay
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Still validating
  if (isValidating) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-col items-center justify-center py-8">
          <LoadingSpinner className="w-8 h-8 text-slate-400 mb-4" />
          <p className="text-slate-600 dark:text-slate-400">Validating invitation...</p>
        </div>
      </div>
    );
  }

  // Invalid invitation
  if (validationError) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/20">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Invalid Invitation
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {validationError}
          </p>
          <Link
            href="/login"
            className="inline-block py-2.5 px-6 text-white font-medium rounded-lg transition-colors"
            style={{ backgroundColor: brandColors.primary }}
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
      {success ? (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brandColors.primary}20` }}>
            <svg className="w-8 h-8" style={{ color: brandColors.primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Welcome to Maiyuri Bricks!
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Your account has been created successfully. You will be redirected to the login page shortly.
          </p>
          <Link
            href="/login"
            className="inline-block py-2.5 px-6 text-white font-medium rounded-lg transition-colors"
            style={{ backgroundColor: brandColors.primary }}
          >
            Go to login
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Welcome, {invitation?.name}!
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            You've been invited to join Maiyuri Bricks as <strong className="capitalize">{invitation?.role}</strong>.
            Set your password below to complete your account.
          </p>

          {/* Invitation Details */}
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: brandColors.primary }}>
                {invitation?.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{invitation?.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{invitation?.email}</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Create password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ '--tw-ring-color': brandColors.primary } as React.CSSProperties}
                placeholder="Enter your password"
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1.5">{errors.password.message}</p>
              )}
            </div>

            {/* Confirm Password Field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register('confirmPassword')}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ '--tw-ring-color': brandColors.primary } as React.CSSProperties}
                placeholder="Confirm your password"
                disabled={isLoading}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm mt-1.5">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Password Requirements */}
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
              <p className="font-medium mb-1">Password requirements:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>At least 8 characters</li>
                <li>At least one uppercase letter</li>
                <li>At least one lowercase letter</li>
                <li>At least one number</li>
              </ul>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                backgroundColor: brandColors.primary,
                '--tw-ring-color': brandColors.primary,
              } as React.CSSProperties}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#185835'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = brandColors.primary}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner className="w-5 h-5" />
                  Creating account...
                </>
              ) : (
                'Create my account'
              )}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function AcceptInviteFormFallback() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
      <div className="animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-48 mb-2"></div>
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-6"></div>
        <div className="space-y-5">
          <div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1.5"></div>
            <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-1.5"></div>
            <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/logo.png"
              alt="Maiyuri Bricks"
              width={80}
              height={80}
              className="h-20 w-20"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: brandColors.primary }}>
            Maiyuri Bricks
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            AI-Powered Lead Management
          </p>
        </div>

        {/* Accept Invite Form - Wrapped in Suspense */}
        <Suspense fallback={<AcceptInviteFormFallback />}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  );
}
