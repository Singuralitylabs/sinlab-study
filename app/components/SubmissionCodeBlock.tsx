import { HtmlPreviewNoSSR } from "@/app/components/HtmlPreviewNoSSR";
import { parseStarterFiles } from "@/app/lib/code-file-inputs";
import { resolvePreviewDisplay } from "@/app/lib/html-preview";
import { resolveSubmissionFileSlots } from "@/app/lib/submission-file-slots";
import type { CodeFile, Json } from "@/app/types";
import { cn } from "@/lib/utils";

/** Exercise settings. Omitted when the list could not read them: the submitted files decide. */
export interface SubmissionPreviewSource {
  submissionFileSlots: Json | null;
  starterFiles: Json | null;
  codeLanguage: string | null;
  showPreview: boolean | null;
  showConsole: boolean | null;
}

interface SubmissionCodeBlockProps {
  files: CodeFile[];
  preClassName?: string;
  previewSource?: SubmissionPreviewSource | null;
}

export function SubmissionCodeBlock({
  files,
  preClassName,
  previewSource,
}: SubmissionCodeBlockProps) {
  if (files.length === 0) {
    return null;
  }

  const display = previewSource
    ? resolvePreviewDisplay({
        files: resolveSubmissionFileSlots({
          submissionFileSlots: previewSource.submissionFileSlots,
          starterFiles: parseStarterFiles(previewSource.starterFiles),
          codeLanguage: previewSource.codeLanguage,
        }),
        showPreview: previewSource.showPreview,
        showConsole: previewSource.showConsole,
      })
    : resolvePreviewDisplay({ files, showPreview: null, showConsole: null });

  if (files.length === 1 && !files[0].filename && !display.preview && !display.console) {
    return <pre className={cn("max-w-full overflow-x-auto", preClassName)}>{files[0].content}</pre>;
  }

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {files.map((file, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: read-only list, filename may repeat
        <div key={`${index}-${file.filename}`} className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            {/* Filenames have no spaces; without a break they widen the card past the viewport. */}
            <span className="min-w-0 break-all font-mono">
              {file.filename || `ファイル${index + 1}`}
            </span>
            {file.language && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                {file.language}
              </span>
            )}
          </div>
          <pre className={cn("max-w-full overflow-x-auto", preClassName)}>{file.content}</pre>
        </div>
      ))}
      {(display.preview || display.console) && (
        <HtmlPreviewNoSSR
          files={files}
          collapsible
          showPreviewFrame={display.preview}
          showConsolePanel={display.console}
        />
      )}
    </div>
  );
}
