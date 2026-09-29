"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_MEMBERSHIP_LABELS,
  ANNOUNCEMENT_TARGET_STATUS_LABELS,
  ANNOUNCEMENT_TARGET_STATUSES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "@/app/constants/announcements";
import { MEMBERSHIP_TYPES, USER_STATUS } from "@/app/constants/user";
import { formatDate } from "@/app/lib/format-date";
import type { Announcement, MembershipType, UserStatusType } from "@/app/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AnnouncementFormProps {
  initialData?: Announcement;
  mode: "create" | "edit";
}

function toggle<T>(values: T[], value: T, checked: boolean): T[] {
  return checked
    ? [...values.filter((v) => v !== value), value]
    : values.filter((v) => v !== value);
}

export function AnnouncementForm({ initialData, mode }: AnnouncementFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [targetStatuses, setTargetStatuses] = useState<UserStatusType[]>(
    (initialData?.target_statuses as UserStatusType[] | undefined) ?? [
      ...ANNOUNCEMENT_TARGET_STATUSES,
    ]
  );
  const [allMembershipTypes, setAllMembershipTypes] = useState(
    (initialData?.target_membership_types ?? null) === null
  );
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>(
    (initialData?.target_membership_types as MembershipType[] | null | undefined) ?? []
  );
  const [sendEmail, setSendEmail] = useState(initialData?.send_email ?? false);
  const [isPublished, setIsPublished] = useState((initialData?.published_at ?? null) !== null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 会員種別はお試しユーザーには無いため、種別を絞るときはお試しユーザーを対象にできない
  // （API の入力検証と同じ条件。フォームで先に分かるようにする）
  const membershipConflictsWithTrial =
    !allMembershipTypes && targetStatuses.includes(USER_STATUS.TRIAL);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const payload = {
      title,
      body,
      target_statuses: targetStatuses,
      target_membership_types: allMembershipTypes ? null : membershipTypes,
      send_email: sendEmail,
      is_published: isPublished,
    };

    try {
      const url =
        mode === "create"
          ? "/api/manage/announcements"
          : `/api/manage/announcements/${initialData?.id}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push("/manage/announcements");
        router.refresh();
        return;
      }
      const data = await response.json().catch(() => null);
      setMessage({ type: "error", text: data?.error || "保存に失敗しました" });
    } catch {
      setMessage({ type: "error", text: "保存中にエラーが発生しました" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="title">タイトル</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
              placeholder="例: 10月のもくもく会のご案内"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">本文（Markdown）</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
              className="min-h-[240px] font-mono text-sm"
              required
            />
            <p className="text-sm text-muted-foreground">
              見出し（#）・箇条書き（-）・太字（**）・リンク（[文字](https://...)）が使えます。
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">対象ステータス</legend>
            {ANNOUNCEMENT_TARGET_STATUSES.map((status) => (
              <div key={status} className="flex items-center gap-2">
                <input
                  id={`status-${status}`}
                  type="checkbox"
                  checked={targetStatuses.includes(status)}
                  onChange={(e) =>
                    setTargetStatuses((values) => toggle(values, status, e.target.checked))
                  }
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor={`status-${status}`}>
                  {ANNOUNCEMENT_TARGET_STATUS_LABELS[status]}
                </Label>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">対象の会員種別</legend>
            <div className="flex items-center gap-2">
              <input
                id="membership-all"
                type="checkbox"
                checked={allMembershipTypes}
                onChange={(e) => setAllMembershipTypes(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="membership-all">すべての会員種別</Label>
            </div>
            {!allMembershipTypes &&
              MEMBERSHIP_TYPES.map((type) => (
                <div key={type} className="flex items-center gap-2 pl-6">
                  <input
                    id={`membership-${type}`}
                    type="checkbox"
                    checked={membershipTypes.includes(type)}
                    onChange={(e) =>
                      setMembershipTypes((values) => toggle(values, type, e.target.checked))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor={`membership-${type}`}>
                    {ANNOUNCEMENT_MEMBERSHIP_LABELS[type]}
                  </Label>
                </div>
              ))}
            {membershipConflictsWithTrial && (
              <p className="text-sm text-destructive">
                お試しユーザーには会員種別が無いため、会員種別を絞るときはお試しユーザーを対象から外してください。
              </p>
            )}
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                id="sendEmail"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="sendEmail">メールでも送る</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              メールはこの画面からすぐには送らず、公開後の毎朝のバッチ（JST 8 時台）で送ります。
              対象者が多い日は数日に分けて送ります。配信停止しているユーザーには送りません。
              {initialData?.email_sent_at &&
                `（送信済み: ${formatDate(initialData.email_sent_at)}）`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isPublished"
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="isPublished">公開する</Label>
          </div>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={
                isLoading ||
                !title.trim() ||
                !body.trim() ||
                targetStatuses.length === 0 ||
                (!allMembershipTypes && membershipTypes.length === 0) ||
                membershipConflictsWithTrial
              }
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {mode === "create" ? "作成" : "更新"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/manage/announcements")}
            >
              キャンセル
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
