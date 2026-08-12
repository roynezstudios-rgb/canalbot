import { guardianModeFromSettings } from './mode.js';

const DEFAULT_GROUP_RULES = [
  'Respeta a los demás: nada de insultos, amenazas, acoso o peleas.',
  'No spam, flood, cadenas, stickers repetidos ni contenido para saturar el chat.',
  'No enlaces sospechosos, promociones o contenido externo sin permiso de admins.',
  'No chats de voz. Si aparece uno, usa !cerrarvoz y quedará infracción auditable.',
  'No contenido sexual, violento, ilegal o que ponga en riesgo a menores.',
  'Si ves un problema, responde al mensaje y usa !report; con 3 reportes se elimina y queda infracción.'
];

export function guardianRulesText({ settings = null, rules = DEFAULT_GROUP_RULES } = {}) {
  return [
    'Reglas del grupo',
    '',
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
    '',
    'Comandos útiles:',
    '!report - reportar un mensaje respondiéndolo',
    '!parametros - ver reportes, infracciones y sanciones',
    '!cerrarvoz - pedir cierre/rechazo de chat de voz',
    '!comandos - ver comandos disponibles',
    '',
    `Modo GuardianBot: ${guardianModeFromSettings(settings)}`
  ].join('\n');
}
