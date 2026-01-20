"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@maiyuri/ui";
import { Eraser, Check, RotateCcw } from "lucide-react";

interface SignatureCaptureProps {
  onCapture: (signatureDataUrl: string) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
}

interface Point {
  x: number;
  y: number;
}

export function SignatureCapture({
  onCapture,
  onClear,
  width = 400,
  height = 200,
  strokeColor = "#000000",
  strokeWidth = 2,
  backgroundColor = "#ffffff",
}: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Configure stroke style
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [backgroundColor, strokeColor, strokeWidth]);

  // Get coordinates from event (supports both mouse and touch)
  const getCoordinates = useCallback(
    (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>,
    ): Point | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if ("touches" in event) {
        // Touch event
        const touch = event.touches[0];
        if (!touch) return null;
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      } else {
        // Mouse event
        return {
          x: (event.clientX - rect.left) * scaleX,
          y: (event.clientY - rect.top) * scaleY,
        };
      }
    },
    [],
  );

  // Draw line between two points
  const drawLine = useCallback((start: Point, end: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }, []);

  // Handle start drawing
  const handleStart = useCallback(
    (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>,
    ) => {
      event.preventDefault();
      const point = getCoordinates(event);
      if (!point) return;

      setIsDrawing(true);
      setLastPoint(point);
      setHasSignature(true);
    },
    [getCoordinates],
  );

  // Handle drawing move
  const handleMove = useCallback(
    (
      event:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>,
    ) => {
      event.preventDefault();
      if (!isDrawing || !lastPoint) return;

      const point = getCoordinates(event);
      if (!point) return;

      drawLine(lastPoint, point);
      setLastPoint(point);
    },
    [isDrawing, lastPoint, getCoordinates, drawLine],
  );

  // Handle stop drawing
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
    setLastPoint(null);
  }, []);

  // Clear the signature
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear?.();
  }, [backgroundColor, onClear]);

  // Capture the signature as data URL
  const handleCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const dataUrl = canvas.toDataURL("image/png");
    onCapture(dataUrl);
  }, [hasSignature, onCapture]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Sign below
      </div>

      {/* Signature canvas */}
      <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full touch-none cursor-crosshair"
          style={{ maxWidth: `${width}px` }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        />

        {/* Signature line guide */}
        <div
          className="absolute left-4 right-4 border-b border-slate-300 pointer-events-none"
          style={{ bottom: "30%" }}
        />

        {/* Placeholder text when empty */}
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-400 text-sm">
              Draw your signature here
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleClear}
          disabled={!hasSignature}
          className="flex-1"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Clear
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleCapture}
          disabled={!hasSignature}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-1" />
          Confirm
        </Button>
      </div>

      {/* Instructions */}
      <p className="text-xs text-slate-500 text-center">
        Use your finger or mouse to sign above
      </p>
    </div>
  );
}
