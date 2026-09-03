'use client';

export default function InspectorPanel(_props: { chapter: unknown; saveState: string; wordCount: number; onRestored: () => void }) {
  return (
    <aside className="w-72 border-l border-gray-200 bg-white p-3 text-sm text-gray-400">
      右栏将在 Task 15 接入。
    </aside>
  );
}
