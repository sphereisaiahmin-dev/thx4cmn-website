import { readFile } from 'node:fs/promises';
import path from 'node:path';

const allowedFiles = new Set(['thx4cmnlogo.glb', 'samplepack.glb', 'thxc.glb']);

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: { file: string } },
): Promise<Response> {
  const { file } = context.params;

  if (!allowedFiles.has(file)) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = path.join(process.cwd(), '3dfiles', file);

  try {
    const data = await readFile(filePath);

    return new Response(data, {
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return new Response('Not found', { status: 404 });
  }
}
