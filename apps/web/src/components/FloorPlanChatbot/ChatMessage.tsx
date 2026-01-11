'use client';

/**
 * ChatMessage Component
 *
 * Renders individual chat messages with support for different message types:
 * text, image, options, progress, and errors.
 */

import type { ChatMessageProps } from './types';

export function ChatMessage({ message, onOptionSelect, onFormSubmit }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // Text message
  if (message.type === 'text') {
    return (
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[85%] px-4 py-3 shadow-lg transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl rounded-br-md shadow-orange-500/20'
              : isSystem
              ? 'bg-slate-600/80 text-slate-200 rounded-2xl border border-slate-500/50 text-sm italic'
              : 'bg-slate-700/80 text-white rounded-2xl rounded-bl-md border border-slate-600/50 shadow-slate-900/30'
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          <p
            className={`text-[10px] mt-2 ${
              isUser ? 'text-amber-100/70' : 'text-slate-400'
            }`}
          >
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    );
  }

  // Image message
  if (message.type === 'image') {
    const imageSrc = message.imageBase64
      ? `data:image/png;base64,${message.imageBase64}`
      : message.imageUrl;

    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-slate-700/80 rounded-2xl rounded-bl-md border border-slate-600/50 shadow-lg p-3">
          {message.content && (
            <p className="text-sm text-white mb-3">{message.content}</p>
          )}
          {imageSrc && (
            <div className="relative group">
              <img
                src={imageSrc}
                alt="Floor plan"
                className="rounded-xl max-w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
                onClick={() => {
                  // Open in new tab for full view
                  window.open(imageSrc, '_blank');
                }}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                <span className="text-white/0 group-hover:text-white/80 text-sm transition-colors">
                  Click to enlarge
                </span>
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-2">
            {message.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    );
  }

  // Options message (rendered with QuickOptions component externally)
  if (message.type === 'options') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-slate-700/80 rounded-2xl rounded-bl-md border border-slate-600/50 shadow-lg p-4">
          <p className="text-sm text-white mb-3">{message.content}</p>
          {/* Options will be rendered by parent component using QuickOptions */}
        </div>
      </div>
    );
  }

  // Progress message
  if (message.type === 'progress' && message.progress) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-slate-700/80 rounded-2xl rounded-bl-md border border-slate-600/50 shadow-lg p-4">
          <p className="text-sm text-white mb-4">{message.content}</p>
          {/* Progress bar */}
          <div className="w-full bg-slate-600 rounded-full h-2 mb-4">
            <div
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${message.progress.percent}%` }}
            />
          </div>
          {/* Stages */}
          <div className="space-y-2">
            {message.progress.stages.map((stage) => (
              <div key={stage.id} className="flex items-center gap-3">
                <span className="text-lg">{stage.icon}</span>
                <span
                  className={`text-sm ${
                    stage.status === 'completed'
                      ? 'text-emerald-400'
                      : stage.status === 'in_progress'
                      ? 'text-amber-400'
                      : stage.status === 'failed'
                      ? 'text-red-400'
                      : 'text-slate-400'
                  }`}
                >
                  {stage.label}
                </span>
                {stage.status === 'in_progress' && (
                  <div className="flex gap-1 ml-auto">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                {stage.status === 'completed' && (
                  <span className="ml-auto text-emerald-400">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error message
  if (message.type === 'error') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] px-4 py-3 bg-red-500/20 border border-red-500/50 rounded-2xl rounded-bl-md">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400">⚠️</span>
            <span className="text-red-400 font-medium text-sm">Error</span>
          </div>
          <p className="text-sm text-red-200">{message.content}</p>
        </div>
      </div>
    );
  }

  // Form message (for dimension input etc.)
  if (message.type === 'form' && message.formFields) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-slate-700/80 rounded-2xl rounded-bl-md border border-slate-600/50 shadow-lg p-4">
          <p className="text-sm text-white mb-4">{message.content}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const values: Record<string, string> = {};
              message.formFields?.forEach((field) => {
                values[field.name] = formData.get(field.name) as string;
              });
              onFormSubmit?.(values);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              {message.formFields.map((field) => (
                <div key={field.name}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    name={field.name}
                    placeholder={field.placeholder}
                    required={field.required}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
                  />
                </div>
              ))}
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded-lg text-sm font-medium transition-all"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Default fallback
  return null;
}
