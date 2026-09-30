"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EMAIL_KIND_LABELS,
  EMAIL_KIND_WITH_SEND_WEEKDAY,
  EMAIL_KINDS_WITH_SEND_DAYS,
  EMAIL_SEND_DAY_MAX,
  EMAIL_SEND_DAY_MIN,
  type EmailKind,
  PROMOTIONAL_EMAIL_KINDS,
  TRANSACTIONAL_DISABLE_IMPACT,
  WEEKLY_DIGEST_WEEKDAY,
} from "@/app/constants/notifications";
import type { EmailKindSetting } from "@/app/lib/email-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WEEKDAY_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Settings = {
  kinds: EmailKindSetting[];
  digestDailyLimit: number;
  digestUpdatedAt: string;
  digestUpdatedBy: number | null;
  editorNames: Record<number, string>;
};

function formatUpdated(
  updatedAt: string,
  updatedBy: number | null,
  editorNames: Record<number, string>
) {
  const who = updatedBy !== null ? (editorNames[updatedBy] ?? "不明") : "初期値";
  return `${new Date(updatedAt).toLocaleString("ja-JP")}（${who}）`;
}

async function putSettings(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/email-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "保存に失敗しました";
    }
    return null;
  } catch {
    return "エラーが発生しました";
  }
}

function KindRow({
  setting,
  editorNames,
  onSaved,
}: {
  setting: EmailKindSetting;
  editorNames: Record<number, string>;
  onSaved: () => void;
}) {
  const kind = setting.kind;
  const hasDays = EMAIL_KINDS_WITH_SEND_DAYS.includes(kind);
  const hasWeekday = kind === EMAIL_KIND_WITH_SEND_WEEKDAY;
  const isPromotional = (PROMOTIONAL_EMAIL_KINDS as readonly EmailKind[]).includes(kind);

  const [enabled, setEnabled] = useState(setting.enabled);
  const [daysText, setDaysText] = useState((setting.sendDays ?? []).join(", "));
  const [weekday, setWeekday] = useState(setting.sendWeekday ?? WEEKLY_DIGEST_WEEKDAY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const save = async () => {
    const body: Record<string, unknown> = { kind, enabled };
    // Sent only when edited, so a kind can be disabled even while the days field is blank.
    if (hasDays && daysText !== (setting.sendDays ?? []).join(", ")) {
      const tokens = daysText
        .split(/[,\s、]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const days = tokens.map(Number);
      if (tokens.length === 0 || days.some((d) => !Number.isInteger(d))) {
        setMessage({ text: "送る日は数字をカンマ区切りで入力してください", isError: true });
        return;
      }
      body.send_days = days;
    }
    if (hasWeekday) {
      body.send_weekday = weekday;
    }
    if (!isPromotional && setting.enabled && !enabled) {
      const impact = TRANSACTIONAL_DISABLE_IMPACT[kind] ?? "本人への通知が届かなくなります。";
      if (
        !confirm(
          `「${EMAIL_KIND_LABELS[kind]}」のメールを無効にしますか？\n\n影響: ${impact}\n登録・承認・お支払いの処理自体は行われますが、メールでは通知されません。`
        )
      ) {
        return;
      }
    }

    setSaving(true);
    setMessage(null);
    const error = await putSettings(body);
    setSaving(false);
    if (error) {
      setMessage({ text: error, isError: true });
      return;
    }
    setMessage({ text: "保存しました", isError: false });
    onSaved();
  };

  return (
    <tr className="border-b last:border-b-0 align-top">
      <td className="px-4 py-3">
        <p className="font-medium">{EMAIL_KIND_LABELS[kind]}</p>
        <Badge variant={isPromotional ? "secondary" : "outline"} className="mt-1">
          {isPromotional ? "案内系" : "手続き通知"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            aria-label={`${EMAIL_KIND_LABELS[kind]} を有効にする`}
          />
          {enabled ? "有効" : "無効"}
        </label>
      </td>
      <td className="px-4 py-3">
        {hasDays && (
          <div className="space-y-1">
            <Input
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
              className="w-40"
              aria-label={`${EMAIL_KIND_LABELS[kind]} の送る日`}
            />
            <p className="text-xs text-muted-foreground">
              登録から N 日目（{EMAIL_SEND_DAY_MIN}〜{EMAIL_SEND_DAY_MAX}、カンマ区切り）
            </p>
          </div>
        )}
        {hasWeekday && (
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className={SELECT_CLASS}
            aria-label="週次進捗の送信曜日"
          >
            {WEEKDAY_LABELS.map((label, value) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        {!hasDays && !hasWeekday && <span className="text-muted-foreground">-</span>}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {formatUpdated(setting.updatedAt, setting.updatedBy, editorNames)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1 items-start">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
          </Button>
          {message && (
            <span className={`text-xs ${message.isError ? "text-destructive" : "text-green-600"}`}>
              {message.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export function EmailSettingsForm({
  settings,
  digestDailyLimitMax,
}: {
  settings: Settings;
  digestDailyLimitMax: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(settings.digestDailyLimit));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const saveLimit = async () => {
    const value = Number(limit);
    if (!Number.isInteger(value)) {
      setMessage({ text: "整数で入力してください", isError: true });
      return;
    }
    setSaving(true);
    setMessage(null);
    const error = await putSettings({ digest_daily_limit: value });
    setSaving(false);
    if (error) {
      setMessage({ text: error, isError: true });
      return;
    }
    setMessage({ text: "保存しました", isError: false });
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {["種別", "状態", "送るタイミング", "最終更新", ""].map((head) => (
                <th key={head || "action"} scope="col" className="text-left px-4 py-3 font-medium">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.kinds.map((setting) => (
              <KindRow
                key={setting.kind}
                setting={setting}
                editorNames={settings.editorNames}
                onSaved={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="font-medium">案内系メールの1日の上限</h3>
        <p className="text-xs text-muted-foreground">
          1〜{digestDailyLimitMax} 通（Resend 無料枠の1日100通に、手続き通知の余裕を残すため）。
          最終更新:{" "}
          {formatUpdated(settings.digestUpdatedAt, settings.digestUpdatedBy, settings.editorNames)}
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={digestDailyLimitMax}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-28"
            aria-label="1日の上限"
          />
          <Button size="sm" onClick={saveLimit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
          </Button>
          {message && (
            <span className={`text-xs ${message.isError ? "text-destructive" : "text-green-600"}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
