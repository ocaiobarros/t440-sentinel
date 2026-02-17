import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  currentUrl?: string;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}

export default function ImageUploader({ currentUrl, onUploaded, onRemove }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon", "image/gif"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato não suportado", description: "Use PNG, JPG, SVG, ICO, GIF ou WebP", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Não autenticado");

      const userId = session.session.user.id;
      const ext = file.name.split(".").pop() || "png";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("dashboard-assets")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("dashboard-assets")
        .getPublicUrl(path);

      onUploaded(urlData.publicUrl);
      toast({ title: "Upload concluído!" });
    } catch (err) {
      toast({ title: "Erro no upload", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {currentUrl ? (
        <div className="relative rounded-md overflow-hidden border border-border/50">
          <img src={currentUrl} alt="Asset" className="w-full h-auto max-h-[120px] object-contain bg-background/50" />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="absolute top-1 right-1 h-5 w-5 bg-background/80 hover:bg-destructive/80"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 border-2 border-dashed border-border/50 rounded-md flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors cursor-pointer"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span className="text-[9px]">PNG, SVG, ICO, JPG</span>
            </>
          )}
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
    </div>
  );
}
