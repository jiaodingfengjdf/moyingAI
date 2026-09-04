'use client';

interface Props {
  value: string;
  onChange: (md: string) => void;
}

export default function MarkdownSourceView({ value, onChange }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="border-b border-gray-100 px-8 py-2 text-xs text-gray-400">
        {'Markdown 源码（写入即自动保存；支持 # 标题、**加粗**、*斜体*、- 列表、> 引用、代码块）'}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="# 从这里开始以 Markdown 写作…"
        className="min-h-0 w-full flex-1 resize-none px-8 py-4 font-mono text-sm leading-6 focus:outline-none"
      />
    </div>
  );
}
