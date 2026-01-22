"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Brand colors
const brandColors = {
  primary: "#1F6F43",
  secondary: "#8B5E3C",
  accent: "#2F80ED",
  bgPrimary: "#F7F7F4",
};

// Validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

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

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // Use our API endpoint which handles email sending via Resend
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to send reset link");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

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
          <h1
            className="text-2xl font-bold"
            style={{ color: brandColors.primary }}
          >
            Maiyuri Bricks
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            AI-Powered Lead Management
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
          {success ? (
            <>
              <div className="text-center">
                <div
                  className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${brandColors.primary}20` }}
                >
                  <svg
                    className="w-8 h-8"
                    style={{ color: brandColors.primary }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                  Check your email
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  We've sent a password reset link to your email address. Click
                  the link to reset your password.
                </p>
                <Link
                  href="/login"
                  className="inline-block py-2.5 px-6 text-white font-medium rounded-lg transition-colors"
                  style={{ backgroundColor: brandColors.primary }}
                >
                  Back to login
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Forgot your password?
              </h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Enter your email address and we'll send you a link to reset your
                password.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    {...register("email")}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    style={
                      {
                        "--tw-ring-color": brandColors.primary,
                      } as React.CSSProperties
                    }
                    placeholder="you@example.com"
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-red-500 text-sm mt-1.5">
                      {errors.email.message}
                    </p>
                  )}
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
                  style={
                    {
                      backgroundColor: brandColors.primary,
                      "--tw-ring-color": brandColors.primary,
                    } as React.CSSProperties
                  }
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#185835")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      brandColors.primary)
                  }
                >
                  {isLoading ? (
                    <>
                      <LoadingSpinner className="w-5 h-5" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </button>

                {/* Back to login */}
                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-sm font-medium hover:underline"
                    style={{ color: brandColors.primary }}
                  >
                    Back to login
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
