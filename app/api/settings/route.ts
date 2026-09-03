import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/settings';

function envApiKey(): string {
  return process.env.INKPULSE_AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
}

function snapshot() {
  return {
    baseUrl: getSetting('ai.baseUrl') || 'https://api.deepseek.com',
    model: getSetting('ai.model') || 'deepseek-chat',
    hasApiKey: Boolean(getSetting('ai.apiKey') || envApiKey()),
  };
}

export async function GET() {
  return NextResponse.json(snapshot());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.baseUrl === 'string' && body.baseUrl.trim()) {
    setSetting('ai.baseUrl', body.baseUrl.trim());
  }
  if (typeof body?.model === 'string' && body.model.trim()) {
    setSetting('ai.model', body.model.trim());
  }
  if (typeof body?.apiKey === 'string' && body.apiKey.trim()) {
    setSetting('ai.apiKey', body.apiKey.trim());
  }
  return NextResponse.json(snapshot());
}
