'use client';

import { useEffect, useState } from 'react';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [autoCheck, setAutoCheck] = useState(true);

  useEffect(() => {
    void fetch('/api/settings')
      .then((r) => r.json())
      .then((d: { baseUrl: string; model: string; hasApiKey: boolean; embedModel?: string; autoCheck?: boolean }) => {
        setBaseUrl(d.baseUrl);
        setModel(d.model);
        setHasKey(d.hasApiKey);
        setEmbedModel(d.embedModel ?? '');
        setAutoCheck(d.autoCheck ?? true);
      });
  }, []);

  async function save() {
    setBusy(true);
    setMessage('');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, model, apiKey, embedModel, autoCheck }),
    });
    setBusy(false);
    if (res.ok) {
      setHasKey(true);
      setApiKey('');
      setMessage('已保存');
    } else {
      setMessage('保存失败');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">AI 模型设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">关闭 ✕</button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex flex-col gap-1">
            接口地址
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="https://api.deepseek.com" />
          </label>
          <label className="flex flex-col gap-1">
            模型
            <input value={model} onChange={(e) => setModel(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="deepseek-chat" />
          </label>
          <label className="flex flex-col gap-1">
            嵌入模型（可选，用于语义检索）
            <input value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} className="rounded border border-gray-300 px-2 py-1" placeholder="留空则禁用，如 text-embedding-3-small" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
            保存后自动一致性检查
          </label>
          <label className="flex flex-col gap-1">
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1"
              placeholder={hasKey ? '已配置，留空则保持不变' : 'sk-…'}
            />
          </label>
          <p className="text-xs text-gray-400">密钥仅保存在本机数据目录，不会上传到除所选模型服务以外的任何地方。</p>
          {message && <p className="text-xs text-emerald-600">{message}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5">关闭</button>
          <button onClick={() => void save()} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">保存</button>
        </div>
      </div>
    </div>
  );
}
