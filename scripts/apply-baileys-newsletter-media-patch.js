import fs from 'node:fs';

const packageJson = 'node_modules/@whiskeysockets/baileys/package.json';
if (!fs.existsSync(packageJson)) {
  throw new Error('Baileys no está instalado; ejecuta npm install primero.');
}

const version = JSON.parse(fs.readFileSync(packageJson, 'utf8')).version;
if (version !== '7.0.0-rc13') {
  throw new Error(`Versión de Baileys no compatible: ${version}. El parche espera 7.0.0-rc13.`);
}

const files = {
  defaults: 'node_modules/@whiskeysockets/baileys/lib/Defaults/index.js',
  media: 'node_modules/@whiskeysockets/baileys/lib/Utils/messages-media.js',
  messages: 'node_modules/@whiskeysockets/baileys/lib/Utils/messages.js',
  send: 'node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js'
};

function edit(file, before, after, marker) {
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes(marker)) return;
  if (!source.includes(before)) throw new Error(`Código inesperado de Baileys rc13 en ${file}`);
  fs.writeFileSync(file, source.replace(before, after));
}

edit(files.defaults,
  "    'biz-cover-photo': '/pps/biz-cover-photo'\n};\nexport const MEDIA_HKDF_KEY_MAPPING",
  "    'biz-cover-photo': '/pps/biz-cover-photo'\n};\nexport const NEWSLETTER_MEDIA_PATH_MAP = {\n    image: '/newsletter/newsletter-image',\n    video: '/newsletter/newsletter-video',\n    document: '/newsletter/newsletter-document',\n    audio: '/newsletter/newsletter-audio',\n    gif: '/newsletter/newsletter-gif',\n    ptt: '/newsletter/newsletter-ptt',\n    ptv: '/newsletter/newsletter-ptv',\n    sticker: '/newsletter/newsletter-sticker-pack',\n    'thumbnail-link': '/newsletter/newsletter-image'\n};\nexport const MEDIA_HKDF_KEY_MAPPING",
  'NEWSLETTER_MEDIA_PATH_MAP');
edit(files.media,
  "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP } from '../Defaults/index.js';",
  "import { DEFAULT_ORIGIN, MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP } from '../Defaults/index.js';",
  'NEWSLETTER_MEDIA_PATH_MAP');
edit(files.media,
  'return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {',
  'return async (filePath, { mediaType, fileEncSha256B64, timeoutMs, newsletter }) => {',
  'timeoutMs, newsletter }) => {');
edit(files.media,
  'const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
  "const mediaPath = (newsletter ? NEWSLETTER_MEDIA_PATH_MAP[mediaType] : undefined) || MEDIA_PATH_MAP[mediaType];\n            let url = `https://${hostname}${mediaPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;\n            if (newsletter) {\n                url += '&server_thumb_gen=1';\n            }",
  'server_thumb_gen=1');
edit(files.messages,
  'const { mediaUrl, directPath } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs\n        });',
  'const { directPath } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs,\n            newsletter: true\n        });',
  'newsletter: true');
edit(files.messages,
  '                url: mediaUrl,\n                directPath,',
  '                // Newsletter media must use the raw CDN direct path only.\n                directPath,',
  'Newsletter media must use the raw CDN direct path only');
edit(files.send,
  '                    attrs: {},\n                    content: bytes',
  '                    attrs: mediaType ? { mediatype: mediaType } : {},\n                    content: bytes',
  'attrs: mediaType ? { mediatype: mediaType } : {}');

console.log('Parche de multimedia para canales verificado.');
