import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SmartQuoteImage } from "@maiyuri/shared";

const QUERY_KEY = ["smart-quote-images", "template"];

/**
 * Fetch all template images for Smart Quotes
 */
export function useTemplateImages() {
  return useQuery<SmartQuoteImage[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/smart-quotes/images?scope=template");
      if (!res.ok) {
        throw new Error("Failed to fetch template images");
      }
      const json = await res.json();
      return json.data ?? [];
    },
  });
}

interface UploadImageParams {
  file: File;
  pageKey: string;
}

/**
 * Upload a new template image
 */
export function useUploadImage() {
  const queryClient = useQueryClient();

  return useMutation<SmartQuoteImage, Error, UploadImageParams>({
    mutationFn: async ({ file, pageKey }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("page_key", pageKey);
      formData.append("scope", "template");

      const res = await fetch("/api/smart-quotes/images", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to upload image");
      }

      const json = await res.json();
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

interface DeleteImageParams {
  imageId: string;
}

/**
 * Delete a template image
 */
export function useDeleteImage() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteImageParams>({
    mutationFn: async ({ imageId }) => {
      const res = await fetch(`/api/smart-quotes/images/${imageId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to delete image");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
