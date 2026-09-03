'use client';

export default function ChapterEditor(props: { title: string; initialContent: string; onChange: (md: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto bg-white p-8">
      <h2 className="mb-4 text-center font-medium">{props.title}</h2>
      <p className="text-gray-400">编辑器将在 Task 14 接入。</p>
    </div>
  );
}
