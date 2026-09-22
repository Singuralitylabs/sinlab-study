import { USER_STATUS } from "@/app/constants/user";
import type { UserStatusType } from "@/app/types";

/** ウェルカムダイアログの1ステップ定義 */
export type WelcomeDialogStep = {
  id: string;
  title: string;
  body: string;
  /** true のとき trial ユーザーにのみ表示する */
  trialOnly: boolean;
  /** true のとき Stripe 有効時のみ /upgrade へのリンクを案内する */
  showsUpgradeLink: boolean;
};

/** はじめかたチェックリストの1項目定義 */
export type GettingStartedStep = {
  key: string;
  label: string;
  description: string;
};

export const WELCOME_DIALOG_STEPS: readonly WelcomeDialogStep[] = [
  {
    id: "welcome",
    title: "ようこそ",
    body: "「AIと学ぶ実践Web技術講座」の学習サイトへようこそ。学習コンテンツはテーマ → フェーズ → 週 → コンテンツの4階層で構成されています。",
    trialOnly: false,
    showsUpgradeLink: false,
  },
  {
    id: "how-to-learn",
    title: "学習の進め方",
    body: "動画・テキスト・スライドを見たら「完了」ボタンで進捗を記録します。演習はコードまたはURLを提出でき、提出後にAIレビューを受けられます（AIレビューは1コンテンツにつき1回です）。",
    trialOnly: false,
    showsUpgradeLink: false,
  },
  {
    id: "plan",
    title: "プランについて",
    body: "無料プランではお試し公開コンテンツのみ閲覧・提出でき、鍵アイコンのコンテンツは本登録後に閲覧できます。本登録は管理者による承認で行います。",
    trialOnly: true,
    showsUpgradeLink: true,
  },
  {
    id: "help",
    title: "困ったときは",
    body: "不明点がある場合は、管理者にお問い合わせください。",
    trialOnly: false,
    showsUpgradeLink: false,
  },
] as const;

/**
 * ステータスに応じて表示するダイアログステップを絞り込む。
 * trial のときのみ trialOnly のステップ（プランについて）を含める。
 */
export function getWelcomeStepsForStatus(status: UserStatusType | null): WelcomeDialogStep[] {
  if (status === USER_STATUS.TRIAL) {
    return [...WELCOME_DIALOG_STEPS];
  }
  return WELCOME_DIALOG_STEPS.filter((step) => !step.trialOnly);
}

export const GETTING_STARTED_STEPS: readonly GettingStartedStep[] = [
  {
    key: "complete-content",
    label: "学習コンテンツを1つ完了する",
    description: "動画・テキスト・スライドを見て「完了」ボタンで進捗を記録しましょう。",
  },
  {
    key: "submit-exercise",
    label: "演習課題を提出する",
    description: "演習コンテンツからコードまたはURLを提出しましょう。",
  },
  {
    key: "receive-ai-review",
    label: "AIレビューを受ける",
    description: "提出後にAIレビューを受けてフィードバックを確認しましょう。",
  },
] as const;
