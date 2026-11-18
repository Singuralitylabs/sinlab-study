"use client";

import { CircleHelp } from "lucide-react";
import { PLAYGROUND_MAX_FILES, PLAYGROUND_NAV_TITLE } from "@/app/constants/playground";
import { PYTHON_RUN_TIMEOUT_MS } from "@/app/lib/python-runner";
import { SQL_MAX_ROWS, SQL_RUN_TIMEOUT_MS } from "@/app/lib/sql-runner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const seconds = (ms: number) => ms / 1000;

// Limits come from the runners' own constants so the text cannot drift from what actually happens.
const CAN_DO = [
  "Web（HTML・CSS・JavaScript）、Python、SQL のコードを、このブラウザの中で動かせます。",
  `ファイルを追加して、複数のファイルに分けて書けます（${PLAYGROUND_MAX_FILES}個まで）。`,
  "書いたコードは、このブラウザに自動で保存されます。",
  "配られたリンクや QR コードから、ひな形のコードで始められます。",
];

const LIMITS: { title: string; items: string[] }[] = [
  {
    title: "Web（HTML・CSS・JavaScript）",
    items: [
      "安全のため、閉じた枠の中で動きます。alert() などのダイアログ、フォームの送信、localStorage・Cookie は使えません。",
      "npm のパッケージは入れられません。",
    ],
  },
  {
    title: "Python",
    items: [
      "標準ライブラリと、NumPy・pandas・matplotlib・BeautifulSoup・Pillow などが使えます。ほかのパッケージ（requests・openpyxl など）は追加できません。",
      "input() は使えません。値はコードの中に書いてください。",
      `1回の実行は${seconds(PYTHON_RUN_TIMEOUT_MS)}秒までです。最初の実行だけ、読み込みに時間がかかります。`,
    ],
  },
  {
    title: "SQL（PostgreSQL）",
    items: [
      "実行のたびに空のデータベースから始まります。表はコードの中で作ってください。",
      `1回の実行は${seconds(SQL_RUN_TIMEOUT_MS)}秒まで、結果の表示は${SQL_MAX_ROWS}行までです。拡張機能は使えません。`,
    ],
  },
  {
    title: "共通",
    items: [
      "AI レビューとシンラビへの相談はありません。講座の進捗や提出にもなりません。",
      "ほかの端末やブラウザでは、続きは見えません。",
      "ターミナルの操作や、サーバーを立てることはできません。ファイルは画面にあるものだけ使えます。",
    ],
  },
];

export function PlaygroundGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <CircleHelp className="h-4 w-4" />
          このページでできること
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>「{PLAYGROUND_NAV_TITLE}」でできること</DialogTitle>
          <DialogDescription>
            インストールなしで、ブラウザの中だけでコードを動かします。
          </DialogDescription>
        </DialogHeader>
        <section className="space-y-2">
          <h3 className="font-semibold">できること</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {CAN_DO.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">できないこと・制限</h3>
          {LIMITS.map((group) => (
            <div key={group.title} className="space-y-1">
              <h4 className="text-sm font-medium">{group.title}</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
