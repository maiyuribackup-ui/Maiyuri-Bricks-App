"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSupabase } from "@/lib/supabase";

// Brand colors from Brandguidelines.md
const brandColors = {
  primary: "#1F6F43", // Earth Green
  secondary: "#8B5E3C", // Clay Brown
  accent: "#2F80ED", // Peacock Blue
  bgPrimary: "#F7F7F4", // Page background
};

// Validation schema
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const redirectTo = searchParams.get("redirect") || "/dashboard";

  // Check for recovery token in URL hash and redirect to reset-password
  // This happens when Supabase redirects after password reset link click
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get("access_token");
    const type = hashParams.get("type");

    if (accessToken && type === "recovery") {
      // Redirect to reset-password page, preserving the hash fragment
      window.location.href = "/reset-password" + window.location.hash;
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setError("Invalid email or password");
        } else {
          setError(authError.message);
        }
        return;
      }

      // Redirect to dashboard or original destination
      // Use hard navigation to ensure cookies are sent with the new request
      window.location.href = redirectTo;
      return;
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
        Sign in to your account
      </h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        method="POST"
        className="space-y-5"
      >
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
              { "--tw-ring-color": brandColors.primary } as React.CSSProperties
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

        {/* Password Field */}
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            style={
              { "--tw-ring-color": brandColors.primary } as React.CSSProperties
            }
            placeholder="Enter your password"
            disabled={isLoading}
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1.5">
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Forgot Password Link */}
        <div className="text-right">
          <a
            href="/forgot-password"
            className="text-sm font-medium hover:underline"
            style={{ color: brandColors.primary }}
          >
            Forgot your password?
          </a>
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
            (e.currentTarget.style.backgroundColor = brandColors.primary)
          }
        >
          {isLoading ? (
            <>
              <LoadingSpinner className="w-5 h-5" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </div>
  );
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

function LoginFormFallback() {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
      <div className="animate-pulse">
        <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-48 mb-6"></div>
        <div className="space-y-5">
          <div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-1.5"></div>
            <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div>
            <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-1.5"></div>
            <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div className="h-11 bg-slate-200 dark:bg-slate-700 rounded"></div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
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

        {/* Login Form Card - Wrapped in Suspense */}
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Contact your administrator if you need access
        </p>
      </div>
    </div>
  );
}
