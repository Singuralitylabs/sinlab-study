import type { CodeFile } from "@/app/types";

interface SubmissionCodeBlockProps {
  files: CodeFile[];
  preClassName?: string;
}

export function SubmissionCodeBlock({ files, preClassName }: SubmissionCodeBlockProps) {
  if (files.length === 0) {
    return null;
  }

  if (files.length === 1 && !files[0].filename) {
    return <pre className={preClassName}>{files[0].content}</pre>;
  }

  return (
    <div className="space-y-3">
      {files.map((file, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: read-only list, filename may repeat
        <div key={`${index}-${file.filename}`}>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="font-mono">{file.filename || `ファイル${index + 1}`}</span>
            {file.language && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
                {file.language}
              </span>
            )}
          </div>
          <pre className={preClassName}>{file.content}</pre>
        </div>
      ))}
    </div>
  );
}
