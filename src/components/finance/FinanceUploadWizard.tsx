import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type UploadState = "idle" | "processing" | "success" | "partial" | "error";

interface Warning {
  line: number;
  message: string;
}

interface ImportResult {
  success: boolean;
  rows_inserted: number;
  warnings_count: number;
  warnings: Warning[];
  error?: string;
}

interface FinanceUploadWizardProps {
  monthReference: string; // YYYY-MM-DD
  onImportComplete?: () => void;
}

export default function FinanceUploadWizard({ monthReference, onImportComplete }: FinanceUploadWizardProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Apenas ficheiros .csv são aceites");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máx. 5 MB)");
      return;
    }

    setFileName(file.name);
    setState("processing");

    try {
      const csvContent = await file.text();

      const { data, error } = await supabase.functions.invoke("finance-import", {
        body: { csv_content: csvContent, month_reference: monthReference },
      });

      if (error) throw error;

      const res = data as ImportResult;
      setResult(res);

      if (!res.success) {
        setState("error");
        toast.error(res.error || "Erro ao processar ficheiro");
      } else if (res.warnings_count > 0) {
        setState("partial");
        toast.warning(`${res.rows_inserted} linhas importadas com ${res.warnings_count} avisos`);
      } else {
        setState("success");
        toast.success(`${res.rows_inserted} linhas importadas com sucesso!`);
      }

      onImportComplete?.();
    } catch (err: any) {
      setState("error");
      setResult({ success: false, rows_inserted: 0, warnings_count: 0, warnings: [], error: err.message });
      toast.error("Falha na importação");
    }
  }, [monthReference, onImportComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="space-y-4">
      {/* ── Dropzone ── */}
      <AnimatePresence mode="wait">
        {state === "idle" && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`
              relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300
              ${dragOver
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border/40 hover:border-primary/40 hover:bg-muted/30"
              }
            `}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              Arraste o ficheiro CSV aqui
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              ou clique para selecionar • apenas .csv • máx. 5 MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </motion.div>
        )}

        {/* ── Processing ── */}
        {state === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-card rounded-xl p-8 text-center"
          >
            <Loader2 className="w-10 h-10 mx-auto mb-3 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">Processando {fileName}...</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
              Normalizando registos e validando dados
            </p>
          </motion.div>
        )}

        {/* ── Success ── */}
        {state === "success" && result && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-primary/30 bg-primary/5 p-6"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">
                  Importação concluída com sucesso!
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {result.rows_inserted} registos inseridos • {fileName}
                </p>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Partial (success + warnings) ── */}
        {state === "partial" && result && (
          <motion.div
            key="partial"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-neon-amber/30 bg-neon-amber/5 p-5 space-y-3"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-neon-amber mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">
                  Importação parcial — {result.rows_inserted} registos OK
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {result.warnings_count} linha(s) com problemas
                </p>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <Accordion type="single" collapsible defaultValue="warnings">
              <AccordionItem value="warnings" className="border-neon-amber/20">
                <AccordionTrigger className="text-xs font-mono text-neon-amber hover:no-underline py-2">
                  Ver {result.warnings_count} aviso(s)
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="flex gap-2 text-[10px] font-mono bg-background/50 rounded-md p-2">
                        <span className="text-neon-amber font-bold shrink-0">
                          Linha {w.line}:
                        </span>
                        <span className="text-muted-foreground">{w.message}</span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        )}

        {/* ── Error ── */}
        {state === "error" && result && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-6"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Erro na importação</p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {result.error || "Erro desconhecido"}
                </p>
              </div>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Upload another ── */}
      {(state === "success" || state === "partial" || state === "error") && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={reset}
          className="flex items-center gap-2 text-xs font-mono text-primary hover:text-primary/80 transition-colors mx-auto"
        >
          <FileText className="w-3.5 h-3.5" />
          Importar outro ficheiro
        </motion.button>
      )}
    </div>
  );
}
