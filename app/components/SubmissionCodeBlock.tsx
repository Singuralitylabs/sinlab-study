import type { CodeFile } from "@/app/types";

interface SubmissionCodeBlockProps {
  files: CodeFile[];
  /** 各コードブロック（pre要素）に付与するクラス。表示箇所ごとの見た目を揃えるために指定する。 */
  preClassName?: string;
}

/**
 * 提出コードを表示する共通コンポーネント。
 * - 単一ファイル（ファイル名なし）: 従来どおりコードブロックのみ表示
 * - 複数ファイル: ファイル名・言語のヘッダー付きで各ファイルを表示
 */
export function SubmissionCodeBlock({ files, preClassName }: SubmissionCodeBlockProps) {
  if (files.length === 0) {
    return null;
  }

  // 単一ファイルかつファイル名なし（従来の単一ファイル提出）はそのまま表示
  if (files.length === 1 && !files[0].filename) {
    return <pre className={preClassName}>{files[0].content}</pre>;
  }

  return (
    <div className="space-y-3">
      {files.map((file, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 提出済みファイルの読み取り専用表示で並び替え・追加削除は発生せず、filename は空や重複がありうるため index を含める
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
