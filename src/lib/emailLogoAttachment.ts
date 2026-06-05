import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const EMAIL_LOGO_CID = 'thx4cmn-email-logo';
export const EMAIL_LOGO_FILENAME = 'thx4cmn-logo.png';
export const EMAIL_LOGO_CONTENT_TYPE = 'image/png';

export interface InlineEmailAttachment {
  content: string;
  filename: string;
  content_type: string;
  content_id: string;
}

export const readEmailLogoAttachment = (): InlineEmailAttachment => ({
  content: readFileSync(join(process.cwd(), 'public', EMAIL_LOGO_FILENAME)).toString('base64'),
  filename: EMAIL_LOGO_FILENAME,
  content_type: EMAIL_LOGO_CONTENT_TYPE,
  content_id: EMAIL_LOGO_CID,
});
