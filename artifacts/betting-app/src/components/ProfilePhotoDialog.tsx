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
import { Camera, Upload, X, RefreshCw } from "lucide-react";
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
  const [useDefault, setUseDefault] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUseDefault(false);
    resizeImage(file).then(setPreview).catch(() => {
      toast({ variant: "destructive", title: "Could not read image" });
    });
  }

  async function handleSave() {
    setUploading(true);
    try {
      const imageData = useDefault ? null : preview;
      const res = await authFetch(`${BASE}/api/me/photo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Upload failed");
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] });
      toast({ title: useDefault ? "Reverted to default avatar!" : "Profile photo updated!" });
      setPreview(null);
      setUseDefault(false);
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    setPreview(null);
    setUseDefault(false);
    onClose();
  }

  // What to show in the preview circle
  const hasChange = preview || useDefault;
  let displayPhoto: string | undefined;
  if (useDefault) displayPhoto = undefined;
  else displayPhoto = preview ?? currentPhoto;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm bg-card border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white font-display">Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          {/* Avatar preview */}
          <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
            {displayPhoto ? (
              <img src={displayPhoto} alt={username}
                className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/30" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-secondary flex items-center justify-center text-5xl font-bold text-white ring-4 ring-white/10">
                {username?.[0]?.toUpperCase() || "U"}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-8 w-8 text-white" />
            </div>
            {useDefault && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground font-medium whitespace-nowrap">
                default
              </div>
            )}
          </div>

          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* Action buttons */}
          <div className="flex gap-2 w-full">
            <button
              onClick={() => { setUseDefault(false); inputRef.current?.click(); }}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-secondary/50 text-sm font-medium text-white hover:bg-secondary transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload Photo
            </button>

            {currentPhoto && (
              <button
                onClick={() => { setPreview(null); setUseDefault(true); }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  useDefault
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                    : "border-white/10 bg-secondary/50 text-muted-foreground hover:text-white hover:bg-secondary"
                }`}
                title="Revert to default avatar"
              >
                <RefreshCw className="h-4 w-4" />
                Default
              </button>
            )}
          </div>

          {/* Save / cancel */}
          {hasChange && (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setPreview(null); setUseDefault(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-muted-foreground hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {uploading ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
