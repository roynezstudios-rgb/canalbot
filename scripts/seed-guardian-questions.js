import { closePool, getPool } from '../src/db.js';

const categories = [
  'comida',
  'familia',
  'recuerdos',
  'musica',
  'peliculas',
  'viajes',
  'hogar',
  'amistad',
  'creatividad',
  'bienestar'
];

const stems = [
  'Que opcion eliges para empezar bien el dia',
  'Que detalle pequeno te alegra mas',
  'Que plan sencillo prefieres para hoy',
  'Que recuerdo bonito te gustaria repetir',
  'Que actividad te ayuda a relajarte',
  'Que cosa cotidiana valoras mas',
  'Que sabor se te antoja ahora',
  'Que tipo de musica mejora tu animo',
  'Que lugar tranquilo te gustaria visitar',
  'Que costumbre familiar te gusta conservar',
  'Que pelicula podrias volver a ver',
  'Que meta pequena quieres cumplir esta semana',
  'Que frase positiva compartirias hoy',
  'Que talento te gustaria practicar',
  'Que momento del dia disfrutas mas',
  'Que juego o dinamica te divierte mas',
  'Que tema ligero abre buena conversacion',
  'Que bebida prefieres para una charla',
  'Que estacion del ano te gusta mas',
  'Que gesto amable recuerdas con carino',
  'Que objeto de casa te resulta indispensable',
  'Que actividad harias con una hora libre',
  'Que comida casera recomendarías',
  'Que cancion te pone de buenas',
  'Que paisaje te da paz',
  'Que aprendizaje reciente te sirvio',
  'Que cosa simple merece mas reconocimiento',
  'Que personaje ficticio te cae bien',
  'Que olor te trae buenos recuerdos',
  'Que tradicion te gusta compartir',
  'Que habilidad practica vale la pena aprender',
  'Que foto te gustaria tomar hoy',
  'Que lugar de tu ciudad recomiendas',
  'Que postre escogerias',
  'Que palabra bonita usarias mas',
  'Que plan prefieres para un domingo',
  'Que consejo amable darias',
  'Que logro pequeno celebras',
  'Que tema curioso investigarias',
  'Que detalle hace agradable un grupo'
];

const optionSets = [
  ['Cafe', 'Te', 'Agua fresca', 'Chocolate'],
  ['Casa', 'Parque', 'Playa', 'Montana'],
  ['Musica', 'Pelicula', 'Libro', 'Charla'],
  ['Dulce', 'Salado', 'Picante', 'Fresco'],
  ['Manana', 'Tarde', 'Noche', 'Madrugada'],
  ['Cocinar', 'Caminar', 'Descansar', 'Ordenar'],
  ['Foto', 'Audio', 'Texto', 'Sticker'],
  ['Risa', 'Calma', 'Sorpresa', 'Inspiracion']
];

function buildQuestion(index) {
  const stem = stems[index % stems.length];
  const category = categories[index % categories.length];
  const options = optionSets[index % optionSets.length];
  return {
    question: `Pregunta del dia ${index + 1}: ${stem}?`,
    options,
    category
  };
}

async function main() {
  const pool = getPool();
  let inserted = 0;
  for (let index = 0; index < 365; index++) {
    const item = buildQuestion(index);
    const [result] = await pool.execute(
      `INSERT INTO wa_daily_questions
        (question_text, options_json, category, active)
       SELECT :questionText, :optionsJson, :category, 1
       WHERE NOT EXISTS (
         SELECT 1 FROM wa_daily_questions WHERE question_text = :questionText
       )`,
      {
        questionText: item.question,
        optionsJson: JSON.stringify(item.options),
        category: item.category
      }
    );
    inserted += result.affectedRows;
  }
  console.log(JSON.stringify({ ok: true, inserted, target: 365 }, null, 2));
  await closePool();
}

main().catch(async error => {
  console.error(error.message || error);
  await closePool().catch(() => {});
  process.exit(1);
});
