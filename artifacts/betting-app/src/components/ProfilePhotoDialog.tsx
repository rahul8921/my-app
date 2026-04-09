import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(url, {
    ...options,
    headers: { ...(options.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  open: boolean;
  onClose: () => void;
  currentPhoto?: string;
  username?: string;
}

function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ProfilePhotoDialog({ open, onClose, currentPhoto, username }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    resizeImage(file).then(setPreview).catch(() => {
      toast({ variant: "destructive", title: "Could not read image" });
    });
  }

  async function handleSave() {
    if (!preview) return;
    setUploading(true);
    try {
      const res = await authFetch(`${BASE}/api/me/photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: preview }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Upload failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      toast({ title: "Profile photo updated!" });
      setPreview(null);
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to upload", description: err.message });
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    setPreview(null);
    onClose();
  }

  const displayPhoto = preview ?? currentPhoto;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm bg-card border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white font-display">Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-2">
          <div className="relative group">
            {displayPhoto ? (
              <img
                src={displayPhoto}
                alt={username}
                className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/30"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-secondary flex items-center justify-center text-5xl font-bold text-white ring-4 ring-white/10">
                {username?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <button
              onClick={() => inputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Camera className="h-8 w-8 text-white" />
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex gap-3 w-full">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 bg-secondary/50 text-sm font-medium text-white hover:bg-secondary transition-colors"
            >
              <Upload className="h-4 w-4" />
              Choose Photo
            </button>

            {preview && (
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {uploading ? "Saving…" : "Save"}
              </button>
            )}
          </div>

          {preview && (
            <button
              onClick={() => setPreview(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-white transition-colors"
            >
              <X className="h-3 w-3" /> Cancel selection
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
