export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold">オフラインです</h1>
      <p className="mt-3 text-muted-foreground">
        通信が復旧したら、もう一度ページを開いてください。
      </p>
    </main>
  );
}
