/**
 * Slack Webhook通知のfetchタイムアウト（ms）。
 * Webhook側の遅延・無応答が承認依頼やStripe Webhook処理等の主処理をブロックしないよう短めに設定する。
 */
export const SLACK_WEBHOOK_TIMEOUT_MS = 5_000;
