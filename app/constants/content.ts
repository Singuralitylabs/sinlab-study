import type { ContentType } from "@/app/types";

/** コンテンツ種別の許可値。バリデーション・ラベル表示・選択肢はこの1箇所から導出する */
export const CONTENT_TYPES: readonly ContentType[] = ["video", "text", "exercise", "slide"];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: "動画",
  text: "テキスト",
  exercise: "演習",
  slide: "スライド",
};

/** 一括操作APIへ一度に送るIDの上限。クライアント側の分割送信もこの値でチャンク化する */
export const MAX_BULK_CONTENT_IDS = 100;
