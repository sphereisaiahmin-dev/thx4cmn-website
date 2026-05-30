import { readFile } from 'node:fs/promises';
import path from 'node:path';

type Awaitable<T> = T | Promise<T>;

const allowedFiles = new Map<
  string,
  {
    contentType: string;
    diskPath: string[];
  }
>([
  [
    'thx4cmnlogo.glb',
    {
      contentType: 'model/gltf-binary',
      diskPath: ['thx4cmnlogo.glb'],
    },
  ],
  [
    'thx4cmnlogoheader.glb',
    {
      contentType: 'model/gltf-binary',
      diskPath: ['thx4cmnlogo.glb'],
    },
  ],
  [
    'samplepack.glb',
    {
      contentType: 'model/gltf-binary',
      diskPath: ['samplepack.glb'],
    },
  ],
  [
    'thxc.glb',
    {
      contentType: 'model/gltf-binary',
      diskPath: ['thxc.glb'],
    },
  ],
  [
    'need_some_space/scene.gltf',
    {
      contentType: 'model/gltf+json',
      diskPath: ['need_some_space', 'scene.gltf'],
    },
  ],
  [
    'need_some_space/scene.bin',
    {
      contentType: 'application/octet-stream',
      diskPath: ['need_some_space', 'scene.bin'],
    },
  ],
]);

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Awaitable<{ file?: string[] }> },
): Promise<Response> {
  const { file = [] } = await context.params;
  const requestedPath = file.join('/');
  const allowedFile = allowedFiles.get(requestedPath);

  if (!allowedFile) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), '3dfiles', ...allowedFile.diskPath);

  try {
    const data = await readFile(filePath);

    return new Response(data, {
      headers: {
        'Content-Type': allowedFile.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
