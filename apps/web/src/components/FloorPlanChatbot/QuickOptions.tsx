'use client';

/**
 * QuickOptions Component
 *
 * Renders quick-select option chips for single or multi-select questions.
 */

import { useState } from 'react';
import type { QuickOptionsProps } from './types';

export function QuickOptions({
  options,
  onSelect,
  multiSelect = false,
  selectedValues = [],
  disabled = false,
}: QuickOptionsProps) {
  const [selected, setSelected] = useState<string[]>(selectedValues);

  const handleSelect = (value: string) => {
    if (disabled) return;

    if (multiSelect) {
      const newSelected = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      setSelected(newSelected);
    } else {
      onSelect(value);
    }
  };

  const handleConfirmMulti = () => {
    if (selected.length > 0) {
      onSelect(selected.join(','));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = multiSelect
            ? selected.includes(option.value)
            : selectedValues.includes(option.value);

          return (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              disabled={disabled || option.disabled}
              className={`
                group relative px-4 py-3 rounded-2xl text-left transition-all duration-200
                ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30'
                    : 'bg-slate-700/60 hover:bg-slate-600/80 text-white border border-slate-600/50 hover:border-amber-500/50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}
                ${option.recommended && !isSelected ? 'ring-2 ring-amber-500/30' : ''}
              `}
            >
              <div className="flex items-center gap-2">
                {option.icon && <span className="text-lg">{option.icon}</span>}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{option.label}</span>
                    {option.recommended && !isSelected && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  {option.description && (
                    <p className={`text-xs mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                      {option.description}
                    </p>
                  )}
                </div>
              </div>
              {/* Checkmark for multi-select */}
              {multiSelect && isSelected && (
                <span className="absolute top-2 right-2 text-white">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Confirm button for multi-select */}
      {multiSelect && (
        <button
          onClick={handleConfirmMulti}
          disabled={selected.length === 0 || disabled}
          className={`
            w-full py-2.5 px-4 rounded-xl font-medium text-sm transition-all
            ${
              selected.length > 0
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500'
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          {selected.length > 0
            ? `Continue with ${selected.length} selected`
            : 'Select at least one option'}
        </button>
      )}
    </div>
  );
}
