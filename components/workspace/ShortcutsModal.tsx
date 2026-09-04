'use client';

const SHORTCUTS: Array<[string, string]> = [
  ['Alt + /', '在光标处触发三条续写方向'],
  ['Tab', '采纳第一条续写（生成完成后）'],
  ['Esc', '关闭 AI 浮层 / 选择菜单'],
  ['Ctrl / ⌘ + S', '立即保存当前正文'],
  ['正文 | 大纲', '编辑器顶部分段切换写作与大纲视图'],
];

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">快捷键与提示</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <kbd className="shrink-0 rounded border border-gray-300 bg-gray-50 px-2 py-0.5 font-mono text-xs">{key}</kbd>
              <span className="text-xs text-gray-600">{desc}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
        </div>
      </div>
    </div>
  );
}
