import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects } from '@/lib/db/projects';

export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: '项目标题不能为空' }, { status: 400 });
  const project = createProject({
    title,
    penName: typeof body?.penName === 'string' ? body.penName.trim() : '',
    description: typeof body?.description === 'string' ? body.description.trim() : '',
  });
  return NextResponse.json({ project }, { status: 201 });
}
