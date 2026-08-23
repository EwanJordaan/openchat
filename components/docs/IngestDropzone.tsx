"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileUp } from "lucide-react";

type Stage = "idle" | "presigning" | "uploading" | "finalizing" | "done" | "error";

export function IngestDropzone({ projectId, onComplete }: { projectId?: string | null; onComplete?: () => void }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      setError(null);
      for (const file of list) {
        try {
          setStage("presigning");
          setProgress(`Presigning ${file.name}…`);
          const presignRes = await fetch("/api/docs/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name, mime: file.type || "application/octet-stream", size: file.size, projectId: projectId ?? null }),
          });
          const presignJson = (await presignRes.json().catch(() => ({}))) as Record<string, unknown>;
          if (!presignRes.ok) throw new Error(String(presignJson["error"] ?? "presign failed"));
          const documentId = String(presignJson["documentId"] ?? presignJson["id"] ?? "");
          const uploadUrl = (presignJson["url"] as string) ?? (presignJson["presignedUrl"] as string) ?? null;
          const fields = (presignJson["fields"] as Record<string, string>) ?? null;

          setStage("uploading");
          setProgress(`Uploading ${file.name}…`);
          if (uploadUrl && fields) {
            const fd = new FormData();
            for (const [k, v] of Object.entries(fields)) fd.append(k, v);
            fd.append("file", file);
            const up = await fetch(uploadUrl, { method: "POST", body: fd });
            if (!up.ok) throw new Error(`S3 upload failed ${up.status}`);
          } else if (uploadUrl) {
            if (uploadUrl.startsWith("file://")) {
            } else {
              const up = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
              if (!up.ok) throw new Error(`PUT failed ${up.status}`);
            }
          }

          setStage("finalizing");
          setProgress(`Finalizing ${file.name}…`);
          if (documentId) {
            const fin = await fetch("/api/docs/upload-complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId }),
            });
            if (!fin.ok) {
              const j = (await fin.json().catch(() => ({}))) as Record<string, unknown>;
              throw new Error(String(j["error"] ?? "complete failed"));
            }
          }
          setStage("done");
          setProgress(`Added ${file.name}`);
          onComplete?.();
        } catch (e) {
          setStage("error");
          setError(e instanceof Error ? e.message : String(e));
          setProgress("");
          break;
        }
      }
      setTimeout(() => {
        setStage("idle");
        setProgress("");
      }, 1800);
    },
    [projectId, onComplete],
  );

  return (
    <div
      className={`dropzone ${isDragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging.current) {
          dragging.current = true;
          setIsDragging(true);
        }
      }}
      onDragLeave={() => {
        dragging.current = false;
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragging.current = false;
        setIsDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") inputRef.current?.click();
      }}
    >
      <input ref={inputRef} type="file" multiple onChange={(e) => e.target.files && void handleFiles(e.target.files)} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: "0.84rem", fontWeight: 600 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: stage === "idle" ? "var(--accent-soft)" : "var(--surface)",
            color: "var(--accent)",
            display: "grid",
            placeItems: "center",
            border: "1px solid var(--border)",
            flex: "0 0 28px",
          }}
        >
          {stage === "idle" ? <Upload size={14} /> : <FileUp size={14} />}
        </span>
        <span>{stage === "idle" ? "Drop files here" : progress || stage}</span>
      </div>
      <div style={{ fontSize: "0.72rem", marginTop: 6, color: "var(--text-muted)" }}>PDF, docx, md, csv · max 12 MB</div>
      {error ? <p style={{ margin: "8px 0 0", color: "var(--danger)", fontSize: "0.76rem" }}>{error}</p> : null}
    </div>
  );
}
