/**
 * consulta.js — BIIO System (formato Full Training, 6 microciclos)
 *
 * NOTA HISTÒRICA: el fitxer es deia training_online.js fins al 2026-05-26.
 * Renombrat a "consulta" perquè és més precís (la secció ja no és només
 * "training online"; ara inclou menús, mediciones, cuestionari, etc.).
 * La clau interna `tob_online_v2` i la secció GitHub `training_online`
 * NO han canviat — preserven el PIN i les dades existents.
 *
 * Modelo de datos en localStorage 'tob_online_v2':
 *
 *   { clientes: [...], plantillas: [...] }
 *
 * plantilla = {
 *   id, nombre, categoria, sexo: 'H'|'M'|'U',
 *   entrenos: [
 *     { id:'A', letra:'A', ejercicios: [
 *         { id, orden, nombre, subtitle,
 *           tipo: 'normal' | 'circuito',
 *           // Para 'circuito':
 *           circuitoLineas: ['EJ1','EJ2','EJ3'],
 *           // Plan común a todos los microciclos. Si distinto por micro, plan[microNum] override:
 *           planBase: { series:3, repsTarget:[15,12,10], pausa:"1'30''" },
 *           planByMicro: { 1:{...}, 2:{...}, ... 6:{...} }  // opcional, override
 *         }
 *     ]}, { id:'B', ... }
 *   ]
 * }
 *
 * asignacion = {
 *   id, plantillaId, fechaInicio, estado, notas,
 *   rutina: <copia editable>,
 *   iteraciones: [
 *     { id, numero:1,
 *       sesiones: {
 *         <microNum>: { <entrenoId>: {
 *             fecha, aerobica: { tipo, tiempo, intensidad },
 *             ejs: { <ejId>: { series:[{kg,reps}], lineas:[{kg,reps}] }}
 *         }}
 *       }
 *     }
 *   ]
 * }
 *
 * Microciclos siempre numerados 1..6 (formato Full Training).
 */

const TOB_KEY = 'tob_online_v2';
const TOB_NUM_MICRO = 6;  // default histórico — cada plantilla puede tener su propio numMicro (3-7 según BIIO)
// Devuelve el número de microciclos de una plantilla o de la rutina copiada en
// una asignación. Fallback a 6 (asignaciones antiguas sin el campo numMicro).
function tobNumMicroOf(o){ return (o && o.numMicro) || TOB_NUM_MICRO; }
// Colores por iteración (informe sobre fondo blanco → It. 2 antes era #e0e0e0 = invisible).
// It. 1 ámbar, It. 2 violeta, It. 3 azul, It. 4 verde, It. 5 rojo, It. 6 turquesa, It. 7 naranja, It. 8 fucsia.
const TOB_IT_COLORS = ['#f5a623','#8b5cf6','#2563eb','#10b981','#dc2626','#06b6d4','#f97316','#db2777'];

// Versión de las descripciones. Al subirla, el backfill reaplica los textos.
const TOB_DESC_VERSION = 6;

// Descripciones por categoría — texto que aparece en el PDF de la rutina que
// recibe el cliente. Resumen del esquema BIIO MODIFICADO real (1º macrociclo),
// con lenguaje claro pero respetando reps/series/intensidades originales.
// Estructura: TOB_DESC_CATEGORIAS[categoria][idioma] → string descripción.
// Idiomas: ca (català, default), es (castellano), en (english).
// Compatibilidad: p.descripcion legacy guarda solo la versión castellana;
// en los PDFs leemos TOB_DESC_CATEGORIAS[p.categoria][L] con fallback a p.descripcion.
const TOB_DESC_CATEGORIAS = {
  'Reacondicionamiento': {
    es:
      'OBJETIVO: Volver al gimnasio o empezar una nueva etapa. Recuperas técnica, mueves rangos medios de repeticiones, preparas el cuerpo para mesociclos más exigentes.\n\n' +
      'CÓMO PROGRESA: 6 microciclos (bloques) — cada pareja sube un escalón. Onda 15/12/10 > 12/10/8 > 10/8/6. Vas a tu ritmo, sin calendario fijo.\n\n' +
      'REPETICIONES: 3 series por ejercicio principal, con onda descendente (1ª serie más reps a peso menor, 3ª serie menos reps a peso mayor).\n\n' +
      'PESOS: Que te cueste pero pudiendo completar todas las repeticiones con técnica correcta. La 1ª serie de cada par de bloques debería ser asequible — sube algo en el siguiente.\n\n' +
      'DESCANSOS: 1\'30" en los primeros bloques · 1\'45" en los del medio · 2\'00" en los últimos. El circuito accesorio con 30" entre ejercicios.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana (Lun-Mié-Vie). División A+B (simil full body). En accesorios va circuito sin pausa (jump set). Foco en técnica y recorrido completo.',
    ca:
      'OBJECTIU: Tornar al gimnàs o començar una nova etapa. Recuperes la tècnica, treballes rangs mitjans de repeticions, prepares el cos per a mesociclos més exigents.\n\n' +
      'COM PROGRESSA: 6 microciclos (blocs) — cada parella puja un esglaó. Ona 15/12/10 > 12/10/8 > 10/8/6. Vas al teu ritme, sense calendari fix.\n\n' +
      'REPETICIONS: 3 sèries per exercici principal, amb ona descendent (1a sèrie més reps a pes menor, 3a sèrie menys reps a pes major).\n\n' +
      'PESOS: Que et costi però podent completar totes les repeticions amb tècnica correcta. La 1a sèrie de cada parell de blocs hauria de ser assequible — puja una mica al següent.\n\n' +
      'DESCANSOS: 1\'30" als primers blocs · 1\'45" als del mig · 2\'00" als últims. El circuit accessori amb 30" entre exercicis.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana (Dl-Dc-Dv). Divisió A+B (similar full body). Als accessoris va circuit sense pausa (jump set). Focus en tècnica i recorregut complet.',
    en:
      'GOAL: Get back to the gym or start a new phase. Recover technique, work mid-range reps, and prepare the body for more demanding mesocycles.\n\n' +
      'PROGRESSION: 6 microcycles (blocks) — each pair moves up one step. Wave 15/12/10 > 12/10/8 > 10/8/6. Move at your own pace, no fixed calendar.\n\n' +
      'REPS: 3 sets per main exercise, with descending wave (1st set more reps at lower weight, 3rd set fewer reps at higher weight).\n\n' +
      'WEIGHTS: It should be challenging but still allow you to complete every rep with clean technique. The 1st set of each block-pair should feel manageable — bump it up in the next.\n\n' +
      'REST: 1\'30" on early blocks · 1\'45" on middle ones · 2\'00" on the last. Accessory circuit with 30" between exercises.\n\n' +
      'TIPS: At least 3 days per week (Mon-Wed-Fri). A+B split (full-body style). Accessories run as a circuit with no rest (jump set). Focus on technique and full range of motion.'
  },

  'Preparación fuerza': {
    es:
      'OBJETIVO: Trabajar fuerza con ondas 8-6-4 en los ejercicios grandes. Es el paso intermedio antes de Fuerza 1.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO + descarga técnica. En la app salen como 6 bloques: los 1-2 son el "primer micro BIIO" con pausa 2\', los 3-4 son el "segundo micro" con pausa 2\'30, y los 5-6 son la descarga técnica (8 series de 3 reps con pausa corta).\n\n' +
      'REPETICIONES: Onda 8/6/4 en grandes (3 series). En apoyos onda 10/8/6 (3 series). Descarga = 8×3 cluster.\n\n' +
      'PESOS: RPE 10 — al fallo técnico en cada serie. Si en la 1ª serie del 1º bloque consigues las 8 repeticiones target, sube un kg en cada ejercicio para el siguiente bloque.\n\n' +
      'DESCANSOS: 2\'00" en bloques 1-2, 2\'30" en bloques 3-4, 1\'00" en descarga.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana (Lun-Mié-Vie). División A+B+C: piernas-hombros-abdomen / pecho-tríceps-piernas (recall) / espalda-bíceps-abdomen-cuádriceps.',
    ca:
      'OBJECTIU: Treballar força amb ones 8-6-4 als exercicis grans. És el pas intermedi abans de Força 1.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO + descàrrega tècnica. A l\'app surten com a 6 blocs: els 1-2 són el "primer micro BIIO" amb pausa 2\', els 3-4 són el "segon micro" amb pausa 2\'30, i els 5-6 són la descàrrega tècnica (8 sèries de 3 reps amb pausa curta).\n\n' +
      'REPETICIONS: Ona 8/6/4 als grans (3 sèries). Als auxiliars ona 10/8/6 (3 sèries). Descàrrega = 8×3 clúster.\n\n' +
      'PESOS: RPE 10 — fins a la fallada tècnica a cada sèrie. Si a la 1a sèrie del 1r bloc aconsegueixes les 8 repeticions target, puja un kg a cada exercici per al bloc següent.\n\n' +
      'DESCANSOS: 2\'00" als blocs 1-2, 2\'30" als blocs 3-4, 1\'00" a la descàrrega.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana (Dl-Dc-Dv). Divisió A+B+C: cames-espatlles-abdomen / pit-tríceps-cames (recall) / esquena-bíceps-abdomen-quàdriceps.',
    en:
      'GOAL: Build strength with 8-6-4 waves on big lifts. The bridge between Reconditioning and Strength 1.\n\n' +
      'PROGRESSION: 3 BIIO microcycles + technical deload. In the app they show as 6 blocks: 1-2 are the "first BIIO micro" with 2\' rest, 3-4 are the "second micro" with 2\'30 rest, and 5-6 are the technical deload (8 sets of 3 reps with short rest).\n\n' +
      'REPS: 8/6/4 wave on big lifts (3 sets). 10/8/6 wave on accessories (3 sets). Deload = 8×3 cluster.\n\n' +
      'WEIGHTS: RPE 10 — train to technical failure every set. If you hit the target 8 reps on the 1st set of the 1st block, add 1 kg to each exercise for the next block.\n\n' +
      'REST: 2\'00" on blocks 1-2, 2\'30" on blocks 3-4, 1\'00" on deload.\n\n' +
      'TIPS: At least 3 days per week (Mon-Wed-Fri). A+B+C split: legs-shoulders-core / chest-triceps-legs (recall) / back-biceps-core-quads.'
  },

  'Especialización técnica': {
    es:
      'OBJETIVO: Pulir la técnica con peso medio-alto. Ondas 345 BUFFER — 8×3, 7×4, 6×5 al 75% del 1RM, luego repite al 80%, cierra con descarga 8×2 al 85%.\n\n' +
      'CÓMO PROGRESA: 7 microciclos BIIO (mapeados a 6 bloques de la app). Bloques 1-3 al 75% con series clúster decreciente, bloques 4-5 al 80%, bloque 6 = descarga técnica al 85% con buffer.\n\n' +
      'REPETICIONES: 8×3, 7×4, 6×5 alternando — siempre series clúster (varias series de pocas reps con pausa corta).\n\n' +
      'PESOS: Buffer — guarda 1-2 repeticiones en el depósito en cada serie. La idea es velocidad y técnica perfecta, no fallo.\n\n' +
      'DESCANSOS: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). En descarga 1\'30" para todas.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana. Fase concéntrica explosiva, pausa isométrica abajo y arriba de 1". Es el bloque de calidad técnica antes de Fuerza 1 y 2.',
    ca:
      'OBJECTIU: Polir la tècnica amb pes mig-alt. Ones 345 BUFFER — 8×3, 7×4, 6×5 al 75% del 1RM, després repeteix al 80%, tanca amb descàrrega 8×2 al 85%.\n\n' +
      'COM PROGRESSA: 7 microciclos BIIO (mapejats a 6 blocs de l\'app). Blocs 1-3 al 75% amb sèries clúster decreixents, blocs 4-5 al 80%, bloc 6 = descàrrega tècnica al 85% amb buffer.\n\n' +
      'REPETICIONS: 8×3, 7×4, 6×5 alternant — sempre sèries clúster (diverses sèries de poques reps amb pausa curta).\n\n' +
      'PESOS: Buffer — guarda 1-2 repeticions al dipòsit a cada sèrie. La idea és velocitat i tècnica perfecta, no fallada.\n\n' +
      'DESCANSOS: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). A la descàrrega 1\'30" per a totes.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana. Fase concèntrica explosiva, pausa isomètrica abaix i amunt d\'1". És el bloc de qualitat tècnica abans de Força 1 i 2.',
    en:
      'GOAL: Sharpen technique with medium-high weights. 345 BUFFER waves — 8×3, 7×4, 6×5 at 75% of 1RM, then repeat at 80%, finish with 8×2 deload at 85%.\n\n' +
      'PROGRESSION: 7 BIIO microcycles (mapped to 6 app blocks). Blocks 1-3 at 75% with decreasing cluster sets, blocks 4-5 at 80%, block 6 = technical deload at 85% with buffer.\n\n' +
      'REPS: 8×3, 7×4, 6×5 alternating — always cluster sets (multiple sets of few reps with short rest).\n\n' +
      'WEIGHTS: Buffer — keep 1-2 reps in the tank every set. The goal is speed and clean technique, not failure.\n\n' +
      'REST: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). 1\'30" for everything on deload.\n\n' +
      'TIPS: At least 3 days per week. Explosive concentric phase, 1" isometric pause at top and bottom. This is the technical-quality block before Strength 1 and 2.'
  },

  'Fuerza 1': {
    es:
      'OBJETIVO: Subir intensidad real. 4×4 progresivo del 80% al 87.5% del 1RM con RPE creciente.\n\n' +
      'CÓMO PROGRESA: 5 microciclos BIIO (mapeados a 6 bloques de la app). 1º: 80% RPE 7/8. 2º: 82.5% RPE 8/9. 3º: 85% RPE 9/10. 4º: 87.5% RPE 10. Bloques 5-6: descarga técnica 8×3 al 75%.\n\n' +
      'REPETICIONES: 4 series de 4 reps en los grandes. Accesorios con jump set 3×12.\n\n' +
      'PESOS: Sube ~2.5% del 1RM cada bloque. La técnica manda — si se rompe, baja peso. Subida explosiva, control en la bajada.\n\n' +
      'DESCANSOS: 3\'00" entre series en los grandes (necesitas estar fresco). 1\'00" en descarga. 30" entre ejercicios del jump set.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana. Foco en arrancadas (sin rebote en peso muerto), pausa al pecho en banca, dominadas explosivas hasta el pecho.',
    ca:
      'OBJECTIU: Pujar intensitat de debò. 4×4 progressiu del 80% al 87.5% del 1RM amb RPE creixent.\n\n' +
      'COM PROGRESSA: 5 microciclos BIIO (mapejats a 6 blocs de l\'app). 1r: 80% RPE 7/8. 2n: 82.5% RPE 8/9. 3r: 85% RPE 9/10. 4t: 87.5% RPE 10. Blocs 5-6: descàrrega tècnica 8×3 al 75%.\n\n' +
      'REPETICIONS: 4 sèries de 4 reps als grans. Accessoris amb jump set 3×12.\n\n' +
      'PESOS: Puja ~2.5% del 1RM cada bloc. La tècnica mana — si es trenca, baixa el pes. Pujada explosiva, control a la baixada.\n\n' +
      'DESCANSOS: 3\'00" entre sèries als grans (cal estar fresc). 1\'00" a la descàrrega. 30" entre exercicis del jump set.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana. Focus en arrancades (sense rebot al pes mort), pausa al pit al banc, dominades explosives fins al pit.',
    en:
      'GOAL: Real intensity step-up. Progressive 4×4 from 80% to 87.5% of 1RM with rising RPE.\n\n' +
      'PROGRESSION: 5 BIIO microcycles (mapped to 6 app blocks). 1st: 80% RPE 7/8. 2nd: 82.5% RPE 8/9. 3rd: 85% RPE 9/10. 4th: 87.5% RPE 10. Blocks 5-6: technical deload 8×3 at 75%.\n\n' +
      'REPS: 4 sets of 4 reps on the big lifts. Accessories with jump set 3×12.\n\n' +
      'WEIGHTS: Add ~2.5% of 1RM each block. Technique comes first — if it breaks, drop the weight. Explosive lift, controlled descent.\n\n' +
      'REST: 3\'00" between sets on big lifts (you need to be fresh). 1\'00" on deload. 30" between exercises in the jump set.\n\n' +
      'TIPS: At least 3 days per week. Focus on clean starts (no bounce on deadlift), pause at the chest on bench, explosive pull-ups all the way to the chest.'
  },

  'Fuerza 2': {
    es:
      'OBJETIVO: Demostrar la fuerza ganada. Clúster cargado al 87.5% / 90% / 92.5% con rest-pause de 15"/20"/25", y al final 2 sesiones de MAXIMALES para batir tu 1RM.\n\n' +
      'CÓMO PROGRESA: 4 microciclos BIIO + 2 sesiones de máximos. En la app, los bloques 1-2 son el 87.5% con RP 15", el 3 es 90% RP 20", el 4 es 92.5% RP 25", y los 5-6 son la descarga 10×1 al 95%. El entreno "Maximales" va aparte.\n\n' +
      'REPETICIONES: Cada serie son 8 reps simples con una pausa corta entre cada una (rest-pause) — sueltas la barra entre reps pero sin bajar peso. El objetivo es completar las 8 con técnica perfecta.\n\n' +
      'PESOS: % del 1RM. Si completas las 8 reps con técnica correcta en una serie, suma 2.5% al peso para esa serie en el siguiente bloque.\n\n' +
      'DESCANSOS: 4\'00" entre series clúster. 2\'00" en descarga. 5-6\' antes de cada intento de máximo.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana + 2 sesiones de Maximales separadas (1ª: Squat/Press Militar/Press Estrecho. 2ª: Peso Muerto/Jalones invertidos/Curl con barra). Calentamiento progresivo siempre antes de cada intento de máximo.',
    ca:
      'OBJECTIU: Demostrar la força guanyada. Clúster carregat al 87.5% / 90% / 92.5% amb rest-pause de 15"/20"/25", i al final 2 sessions de MÀXIMS per batre el teu 1RM.\n\n' +
      'COM PROGRESSA: 4 microciclos BIIO + 2 sessions de màxims. A l\'app, els blocs 1-2 són el 87.5% amb RP 15", el 3 és 90% RP 20", el 4 és 92.5% RP 25", i els 5-6 són la descàrrega 10×1 al 95%. L\'entrenament "Màxims" va a part.\n\n' +
      'REPETICIONS: Cada sèrie són 8 reps simples amb una pausa curta entre cadascuna (rest-pause) — deixes anar la barra entre reps però sense baixar el pes. L\'objectiu és completar les 8 amb tècnica perfecta.\n\n' +
      'PESOS: % del 1RM. Si completes les 8 reps amb tècnica correcta en una sèrie, suma 2.5% al pes per a aquella sèrie al bloc següent.\n\n' +
      'DESCANSOS: 4\'00" entre sèries clúster. 2\'00" a la descàrrega. 5-6\' abans de cada intent màxim.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana + 2 sessions de Màxims separades (1a: Squat/Press Militar/Press Estret. 2a: Pes Mort/Jalons invertits/Curl amb barra). Escalfament progressiu sempre abans de cada intent màxim.',
    en:
      'GOAL: Show the strength you\'ve built. Loaded cluster at 87.5% / 90% / 92.5% with rest-pause of 15"/20"/25", and 2 final MAXES sessions to beat your 1RM.\n\n' +
      'PROGRESSION: 4 BIIO microcycles + 2 maxes sessions. In the app, blocks 1-2 are 87.5% with RP 15", block 3 is 90% RP 20", block 4 is 92.5% RP 25", and 5-6 are the 10×1 deload at 95%. The "Maxes" workout is separate.\n\n' +
      'REPS: Each set is 8 single reps with a short pause between each (rest-pause) — release the bar between reps but don\'t lower the weight. Goal is to complete all 8 with perfect technique.\n\n' +
      'WEIGHTS: % of 1RM. If you complete the 8 reps with clean technique on a set, add 2.5% to that set\'s weight for the next block.\n\n' +
      'REST: 4\'00" between cluster sets. 2\'00" on deload. 5-6\' before each max attempt.\n\n' +
      'TIPS: At least 3 days per week + 2 separate Maxes sessions (1st: Squat/Overhead Press/Close-Grip Press. 2nd: Deadlift/Inverted Rows/Barbell Curl). Always warm up progressively before each max attempt.'
  },

  'Hibrido': {
    es:
      'OBJETIVO: Mezclar fuerza e hipertrofia en la misma sesión. Trabaja al fallo técnico con ondas 4-6-8 + DROP al final.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO (mapeados a 6 bloques). 1º (bloques 1-2): 3×4/6/8 + DROP al fallo, al 85/75/65% del 1RM. 2º (bloques 3-4): 2×20 Rest-Pause al 70% del 1RM. 3º (bloques 5-6): descarga parcial.\n\n' +
      'REPETICIONES: En el principal, 3 series con onda 4-6-8 reps + serie extra DROP (bajada de peso al fallo). En el Rest-Pause, 20 reps totales con pausa breve de respiración SIN soltar la barra.\n\n' +
      'PESOS: 1ª serie 85% (apunta 4 reps), 2ª 75% (6 reps), 3ª 65% (8 reps). Si llegas al numero target, añade el DROP. En Rest-Pause empieza al 70%.\n\n' +
      'DESCANSOS: 2\'00" entre series en bloque 1, 3\'00" en bloque 2 (Rest-Pause), 2\'30" en descarga.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana. División A+B+C: piernas-hombros-abdomen / pecho-tríceps / espalda-bíceps. Todas las series al fallo técnico (RPE 10).',
    ca:
      'OBJECTIU: Barrejar força i hipertròfia a la mateixa sessió. Treballa fins a la fallada tècnica amb ones 4-6-8 + DROP al final.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO (mapejats a 6 blocs). 1r (blocs 1-2): 3×4/6/8 + DROP fins a la fallada, al 85/75/65% del 1RM. 2n (blocs 3-4): 2×20 Rest-Pause al 70% del 1RM. 3r (blocs 5-6): descàrrega parcial.\n\n' +
      'REPETICIONS: Al principal, 3 sèries amb ona 4-6-8 reps + sèrie extra DROP (baixada de pes fins a la fallada). Al Rest-Pause, 20 reps totals amb pausa breu de respiració SENSE deixar anar la barra.\n\n' +
      'PESOS: 1a sèrie 85% (apunta 4 reps), 2a 75% (6 reps), 3a 65% (8 reps). Si arribes al número target, afegeix el DROP. Al Rest-Pause comença al 70%.\n\n' +
      'DESCANSOS: 2\'00" entre sèries al bloc 1, 3\'00" al bloc 2 (Rest-Pause), 2\'30" a la descàrrega.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana. Divisió A+B+C: cames-espatlles-abdomen / pit-tríceps / esquena-bíceps. Totes les sèries fins a la fallada tècnica (RPE 10).',
    en:
      'GOAL: Blend strength and hypertrophy in the same session. Train to technical failure with 4-6-8 waves + a DROP at the end.\n\n' +
      'PROGRESSION: 3 BIIO microcycles (mapped to 6 blocks). 1st (blocks 1-2): 3×4/6/8 + DROP to failure, at 85/75/65% of 1RM. 2nd (blocks 3-4): 2×20 Rest-Pause at 70% of 1RM. 3rd (blocks 5-6): partial deload.\n\n' +
      'REPS: On the main lift, 3 sets with 4-6-8 rep wave + an extra DROP set (lower weight, lift to failure). On Rest-Pause, 20 total reps with a brief breathing pause WITHOUT releasing the bar.\n\n' +
      'WEIGHTS: 1st set 85% (aim for 4 reps), 2nd 75% (6 reps), 3rd 65% (8 reps). If you hit the target, add the DROP. Start Rest-Pause at 70%.\n\n' +
      'REST: 2\'00" between sets in block 1, 3\'00" in block 2 (Rest-Pause), 2\'30" on deload.\n\n' +
      'TIPS: At least 3 days per week. A+B+C split: legs-shoulders-core / chest-triceps / back-biceps. All sets to technical failure (RPE 10).'
  },

  'Hipertrofia': {
    es:
      'OBJETIVO: Masa muscular pura. Onda 8-6-4 al fallo técnico + Rest Pause 20"/20" para apurar al máximo cada serie.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO (en la app 6 bloques). 1º (bloques 1-2): 3×8/6/4 + Rest Pause al 75% del 1RM. 2º (bloques 3-4): mismo esquema, sube 1% si alcanzaste reps target. 3º (bloques 5-6): descarga parcial 8×3 al 75%.\n\n' +
      'REPETICIONES: 3 series con onda 8-6-4. Después de la última, Rest Pause: descansa 20", coge más reps; descansa 20" otra vez, coge más reps. En apoyos jump set 20/12 reps.\n\n' +
      'PESOS: 75% del 1RM. Si alcanzas las 8/6/4 reps target, +1% para la próxima sesión.\n\n' +
      'DESCANSOS: 2\'00" entre series. 30" entre ejercicios del jump set. En descarga 1\'00".\n\n' +
      'CONSEJOS: Mínimo 3 días por semana. División A+B+C. Foco en SENTIR el músculo, técnica estricta. Hay BURNS (parciales hasta el fallo) en algunos accesorios.',
    ca:
      'OBJECTIU: Massa muscular pura. Ona 8-6-4 fins a la fallada tècnica + Rest Pause 20"/20" per apurar al màxim cada sèrie.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO (a l\'app 6 blocs). 1r (blocs 1-2): 3×8/6/4 + Rest Pause al 75% del 1RM. 2n (blocs 3-4): mateix esquema, puja 1% si has assolit les reps target. 3r (blocs 5-6): descàrrega parcial 8×3 al 75%.\n\n' +
      'REPETICIONS: 3 sèries amb ona 8-6-4. Després de l\'última, Rest Pause: descansa 20", aconsegueix més reps; descansa 20" altra vegada, aconsegueix més reps. Als auxiliars jump set 20/12 reps.\n\n' +
      'PESOS: 75% del 1RM. Si assoleixes les 8/6/4 reps target, +1% per a la propera sessió.\n\n' +
      'DESCANSOS: 2\'00" entre sèries. 30" entre exercicis del jump set. A la descàrrega 1\'00".\n\n' +
      'CONSELLS: Mínim 3 dies per setmana. Divisió A+B+C. Focus en SENTIR el múscul, tècnica estricta. Hi ha BURNS (parcials fins a la fallada) en alguns accessoris.',
    en:
      'GOAL: Pure muscle mass. 8-6-4 wave to technical failure + Rest Pause 20"/20" to squeeze every set to the max.\n\n' +
      'PROGRESSION: 3 BIIO microcycles (6 app blocks). 1st (blocks 1-2): 3×8/6/4 + Rest Pause at 75% of 1RM. 2nd (blocks 3-4): same scheme, +1% if you hit the target reps. 3rd (blocks 5-6): partial deload 8×3 at 75%.\n\n' +
      'REPS: 3 sets with 8-6-4 wave. After the last, Rest Pause: rest 20", grab more reps; rest 20" again, grab more reps. Accessories with jump set 20/12 reps.\n\n' +
      'WEIGHTS: 75% of 1RM. If you hit the 8/6/4 target reps, +1% for the next session.\n\n' +
      'REST: 2\'00" between sets. 30" between jump-set exercises. 1\'00" on deload.\n\n' +
      'TIPS: At least 3 days per week. A+B+C split. Focus on FEELING the muscle, strict technique. BURNS (partials to failure) on some accessories.'
  },

  'Calidad muscular': {
    es:
      'OBJETIVO: Calidad y definición muscular. Clúster al 75% / 77.5% con tempo 3232, accesorios en SUPERSERIE / TRISERIE buscando MAX PUMP.\n\n' +
      'CÓMO PROGRESA: 6 microciclos BIIO. Bloques 1-3 al 75% del 1RM (8×2, 8×3, 8×3 alternando). Bloques 4-6 al 77.5% (mismo esquema). Cardio progresivo de 15\' a 50\' al 60-70% del FCM.\n\n' +
      'REPETICIONES: Series clúster — 8 series de 2-3 reps con pausa 1\'. Accesorios MAX PUMP 10-12 reps en SUPERSERIE (2 ejs alternados) o TRISERIE (3 ejs alternados).\n\n' +
      'PESOS: % del 1RM. Tempo crítico: 3 segundos eccéntrica · 2 segundos pausa abajo · 3 segundos concéntrica · 2 segundos pausa arriba (3232).\n\n' +
      'DESCANSOS: 1\'00" entre series clúster, 1\'30" entre superseries / triseries. En accesorios solo el tiempo de alternar.\n\n' +
      'CONSEJOS: Mínimo 3 días por semana. División A+B+C. El tempo 3232 es lo que da la calidad — sin él pierdes el objetivo. En el último ejercicio de cada grupo se hacen STRIPPING (drop sets) para apurar.',
    ca:
      'OBJECTIU: Qualitat i definició muscular. Clúster al 75% / 77.5% amb tempo 3232, accessoris en SUPERSÈRIE / TRISÈRIE buscant MAX PUMP.\n\n' +
      'COM PROGRESSA: 6 microciclos BIIO. Blocs 1-3 al 75% del 1RM (8×2, 8×3, 8×3 alternant). Blocs 4-6 al 77.5% (mateix esquema). Cardio progressiu de 15\' a 50\' al 60-70% del FCM.\n\n' +
      'REPETICIONS: Sèries clúster — 8 sèries de 2-3 reps amb pausa 1\'. Accessoris MAX PUMP 10-12 reps en SUPERSÈRIE (2 exs alternats) o TRISÈRIE (3 exs alternats).\n\n' +
      'PESOS: % del 1RM. Tempo crític: 3 segons excèntrica · 2 segons pausa abaix · 3 segons concèntrica · 2 segons pausa amunt (3232).\n\n' +
      'DESCANSOS: 1\'00" entre sèries clúster, 1\'30" entre supersèries / trisèries. Als accessoris només el temps d\'alternar.\n\n' +
      'CONSELLS: Mínim 3 dies per setmana. Divisió A+B+C. El tempo 3232 és el que dóna la qualitat — sense això perds l\'objectiu. A l\'últim exercici de cada grup es fan STRIPPING (drop sets) per apurar.',
    en:
      'GOAL: Muscle quality and definition. Cluster at 75% / 77.5% with 3232 tempo, accessories as SUPERSET / TRISET chasing MAX PUMP.\n\n' +
      'PROGRESSION: 6 BIIO microcycles. Blocks 1-3 at 75% of 1RM (8×2, 8×3, 8×3 alternating). Blocks 4-6 at 77.5% (same scheme). Progressive cardio from 15\' to 50\' at 60-70% of max HR.\n\n' +
      'REPS: Cluster sets — 8 sets of 2-3 reps with 1\' rest. MAX PUMP accessories 10-12 reps in SUPERSET (2 exercises alternated) or TRISET (3 exercises alternated).\n\n' +
      'WEIGHTS: % of 1RM. Critical tempo: 3 seconds eccentric · 2 seconds pause at bottom · 3 seconds concentric · 2 seconds pause at top (3232).\n\n' +
      'REST: 1\'00" between cluster sets, 1\'30" between supersets / trisets. On accessories, just the time to alternate.\n\n' +
      'TIPS: At least 3 days per week. A+B+C split. The 3232 tempo is what brings the quality — without it you lose the goal. On the last exercise of each group, STRIPPING (drop sets) to push past failure.'
  }
};

// Devuelve la descripción de la categoría en el idioma indicado.
// Si la categoría tiene formato nuevo {ca, es, en} → escoge según `lang` con
// fallback a CA → ES → EN → primera disponible. Si tiene formato legacy
// (string plano), devuelve la string directamente. Si no existe la categoría,
// devuelve null (el caller usará p.descripcion como fallback).
function tobDescOf(categoria, lang){
  const entry = TOB_DESC_CATEGORIAS[categoria];
  if(!entry) return null;
  if(typeof entry === 'string') return entry;
  return entry[lang] || entry.ca || entry.es || entry.en || null;
}

// Versión del plan oficial. v4 reemplaza ENTERAMENTE entrenos+ejercicios+
// planByMicro+numMicro desde TOB_BIIO_DATA (más fiel al BIIO real: 3-7 micros
// y 2-3 entrenos según el mesociclo).
// (TOB_FIXED_PLANS — la tabla legacy por categoría que se usaba antes de v4 —
//  se eliminó: TOB_BIIO_DATA contiene los planes reales por ejercicio.)
const TOB_PLAN_VERSION = 4;

// Aliases de ejercicios: nombres equivalentes mapeados a un nombre canónico.
// Se aplica en tobLoad() por backfill — preserva IDs (sesiones quedan intactas).
const TOB_EJ_ALIASES = {
  'REMO O SEAL ROW': 'REMO',
  'REMO o SEAL ROW': 'REMO',
  'Remo o Seal Row': 'REMO',
  'DOMINADAS O LAT MACHINE': 'DOMINADAS',
  'DOMINADAS o LAT MACHINE': 'DOMINADAS',
  'Dominadas o Lat Machine': 'DOMINADAS'
};

// Campos de medición (composición corporal — antropometría tipo ISAK,
// formato del informe Full Training). [key interna, {ca, es, en}].
// La etiqueta visible depende del idioma del cliente (cli.idioma).
const TOB_MED_PLECS = [
  ['triceps',     { ca:'Tríceps',         es:'Tríceps',          en:'Triceps' }],
  ['subescapular',{ ca:'Subescapular',    es:'Subescapular',     en:'Subscapular' }],
  // ISAK: en inglés el sitio Supraespinale (no confundir con Suprailiac, que es
  // un sitio distinto en otras escalas como Jackson-Pollock).
  ['supraespinal',{ ca:'Supraespinal',    es:'Supraespinal',     en:'Supraspinale' }],
  ['abdominal',   { ca:'Abdominal',       es:'Abdominal',        en:'Abdominal' }],
  ['cuixa',       { ca:'Cuixa Mitjana',   es:'Muslo Medio',      en:'Mid-Thigh' }],
  ['panxell',     { ca:'Panxell Mitjà',   es:'Pantorrilla Media',en:'Medial Calf' }]
];
const TOB_MED_PERIM = [
  ['mesoesternal',{ ca:'Mesoesternal',    es:'Mesoesternal',     en:'Mesosternale' }],
  // ISAK: "Arm girth, flexed and tensed" — versión completa más fiel.
  ['brac',        { ca:'Braç en Tensió',  es:'Brazo en Tensión', en:'Arm (flexed and tensed)' }],
  ['cintura',     { ca:'Cintura',         es:'Cintura',          en:'Waist' }],
  ['malucs',      { ca:'Malucs',          es:'Caderas',          en:'Hips' }],
  ['cuixa',       { ca:'Cuixa Mitjana',   es:'Muslo Medio',      en:'Mid-Thigh' }],
  ['panxell',     { ca:'Panxell Mitjà',   es:'Pantorrilla Media',en:'Medial Calf' }]
];
// Helper: devuelve la etiqueta visible de un campo de medición según idioma.
function tobMedLabel(def, lang){
  const m = def[1];
  if(typeof m === 'string') return m;  // compatibilidad con formato viejo
  return m[lang] || m.ca || m.es || def[0];
}

// ─────────────────────────────────────────────────────────────────────
// i18n de los PDFs entregables al cliente.
// Cada cliente tiene cli.idioma ('ca' | 'es' | 'en'). Default 'ca'.
// tobT(key, lang, params) → string con interpolación tipo "{var}".
// ─────────────────────────────────────────────────────────────────────
const TOB_PDF_I18N = {
  // Cover y comunes
  'cover.iteracion':     { ca:'Iteració {numero}',     es:'Iteración {numero}',  en:'Iteration {numero}' },
  'cover.inicio':        { ca:'Inici: {fecha}',        es:'Inicio: {fecha}',     en:'Start: {fecha}' },
  'cover.periodo':       { ca:'Període: {desde}  —  {hasta}', es:'Período: {desde}  —  {hasta}', en:'Period: {desde}  —  {hasta}' },
  'unit.kg':             { ca:' kg',  es:' kg',  en:' kg' },
  'unit.mm':             { ca:' mm',  es:' mm',  en:' mm' },
  'unit.cm':             { ca:' cm',  es:' cm',  en:' cm' },
  // CA: en català es diu "el gràfic" (masc.), no "la gràfica" — calc del castellà.
  'error.no_grafica':    { ca:'(gràfic no disponible)', es:'(gráfica no disponible)', en:'(chart unavailable)' },

  // PDF rutina interactiva (tobGeneratePdf)
  'it.entreno':          { ca:'ENTRENAMENT {letra}', es:'ENTRENAMIENTO {letra}', en:'WORKOUT {letra}' },
  'it.label.fecha':      { ca:'Data:',     es:'Fecha:',  en:'Date:' },
  'it.label.plan':       { ca:'Pla:',      es:'Plan:',   en:'Plan:' },
  // Forma "Sèrie 1 / Serie 1 / Set 1" es más limpia que "1a Sèrie" y evita el
  // problema de los ordinals catalans masc./fem. variables (1r, 2n, 3r, 4t...).
  'it.ej.serie':         { ca:'Sèrie {n}',   es:'Serie {n}',  en:'Set {n}' },
  // "Ex." abreviatura universal d'exercici/ejercicio/exercise; evita el ordinal
  // catalán variable que fallaría con {n}=1 ("1è" → "1r" forma correcta).
  'it.ej.circuito_linea':{ ca:'Ex. {n}',     es:'Ej. {n}',    en:'Ex. {n}' },
  // Format jerárquic: primer "Aeròbic tipus" com a cabecera de la secció, després
  // les files secundàries indentades amb 2 espais. Coincideix amb l'estil original
  // (la font Helvetica del PDF no és monoespai, però els 2 espais visuals donen
  // la pista jerárquica al lector).
  'it.aer.tipo':         { ca:'Aeròbic tipus',  es:'Aeróbico tipo',   en:'Cardio type' },
  'it.aer.tiempo':       { ca:'  temps',        es:'  tiempo',         en:'  time' },
  'it.aer.intensidad':   { ca:'  intensitat',   es:'  intensidad',     en:'  intensity' },

  // PDF mediciones
  'med.cover.titulo':    { ca:"INFORME D'EVOLUCIÓ — COMPOSICIÓ CORPORAL", es:'INFORME DE EVOLUCIÓN — COMPOSICIÓN CORPORAL', en:'PROGRESS REPORT — BODY COMPOSITION' },
  'med.kpi.mediciones':  { ca:'MESURES',         es:'MEDICIONES',          en:'MEASUREMENTS' },
  'med.kpi.peso_actual': { ca:'PES ACTUAL',      es:'PESO ACTUAL',         en:'CURRENT WEIGHT' },
  'med.kpi.suma_6_plecs':{ ca:'SUMA DE 6 PLECS', es:'SUMA DE 6 PLIEGUES',  en:'SUM OF 6 SKINFOLDS' },
  // CA "vs inici" (sust. inicio) / ES "vs inicio" / EN "vs baseline" (terme
  // habitual en fitness reports en anglès).
  'med.kpi.vs_inicio':   { ca:' vs inici',       es:' vs inicio',          en:' vs baseline' },
  'med.evol.titulo':     { ca:'EVOLUCIÓ DE MESURES', es:'EVOLUCIÓN DE MEDIDAS', en:'EVOLUTION OF MEASUREMENTS' },
  'med.evol.peso_corporal':{ ca:'PES CORPORAL (kg)',  es:'PESO CORPORAL (kg)',  en:'BODY WEIGHT (kg)' },
  'med.evol.sum_plecs':  { ca:'SUMATORI DE PLECS (mm)',  es:'SUMATORIO DE PLIEGUES (mm)', en:'SUM OF SKINFOLDS (mm)' },
  'med.evol.ratio_plecs_pes':   { ca:'RÀTIO PLECS / PES',    es:'RATIO PLIEGUES / PESO', en:'SKINFOLDS / WEIGHT RATIO' },
  'med.evol.ratio_cintura_maluc':{ ca:'RÀTIO CINTURA / MALUC', es:'RATIO CINTURA / CADERA', en:'WAIST / HIP RATIO' },
  'med.comp.titulo':     { ca:'COMPOSICIÓ — INICIAL vs ACTUAL', es:'COMPOSICIÓN — INICIAL vs ACTUAL', en:'COMPOSITION — INITIAL vs CURRENT' },
  'med.comp.perimetros': { ca:'PERÍMETRES (cm)',  es:'PERÍMETROS (cm)',  en:'GIRTHS (cm)' },
  'med.comp.plecs_cutanis':{ ca:'PLECS CUTANIS (mm)', es:'PLIEGUES CUTÁNEOS (mm)', en:'SKINFOLDS (mm)' },
  'med.sexo.dona':       { ca:'Dona',  es:'Mujer',  en:'Female' },
  'med.sexo.home':       { ca:'Home',  es:'Hombre', en:'Male' },
  'med.detalle.titulo':  { ca:'COMPOSICIÓ CORPORAL', es:'COMPOSICIÓN CORPORAL', en:'BODY COMPOSITION' },
  'med.detalle.nombre':  { ca:'Nom',   es:'Nombre',  en:'Name' },
  'med.detalle.edad':    { ca:'Edat',  es:'Edad',    en:'Age' },
  'med.detalle.sexo':    { ca:'Sexe',  es:'Sexo',    en:'Sex' },
  'med.detalle.peso':    { ca:'Pes (kg)',          es:'Peso (kg)',           en:'Weight (kg)' },
  'med.detalle.estatura':{ ca:'Estatura (cm)',     es:'Estatura (cm)',       en:'Height (cm)' },
  'med.detalle.data_medicion':{ ca:'Data de la mesura', es:'Fecha de medición', en:'Measurement date' },
  'med.tabla.plecs_titulo':{ ca:'PLECS (mm)',      es:'PLIEGUES (mm)',       en:'SKINFOLDS (mm)' },
  'med.tabla.suma6plecs':{ ca:'Suma de 6 Plecs',   es:'Suma de 6 Pliegues',  en:'Sum of 6 Skinfolds' },
  'med.ratio.cintura_maluc':{ ca:'Ràtio Cintura/Maluc: {val}', es:'Ratio Cintura/Cadera: {val}', en:'Waist/Hip Ratio: {val}' },
  'med.ratio.plecs_pes': { ca:'Ràtio Plecs/Pes: {val}',  es:'Ratio Pliegues/Peso: {val}', en:'Skinfolds/Weight Ratio: {val}' },
  'med.detalle.notas':   { ca:'Notes: {texto}',  es:'Notas: {texto}',  en:'Notes: {texto}' },

  // PDF resumen última rutina
  'resum.cover.titulo':  { ca:'RESUM DE LA RUTINA',  es:'RESUMEN DE LA RUTINA',  en:'ROUTINE SUMMARY' },
  'resum.kpi.sesiones':  { ca:'SESSIONS',    es:'SESIONES',    en:'SESSIONS' },
  'resum.kpi.iteraciones':{ ca:'ITERACIONS', es:'ITERACIONES', en:'ITERATIONS' },
  'resum.kpi.estado':    { ca:'ESTAT',       es:'ESTADO',      en:'STATUS' },
  'resum.estado.en_curso':{ ca:'en curs',    es:'en curso',    en:'in progress' },
  'resum.records.titulo':{ ca:'RÈCORDS DE LA RUTINA', es:'RÉCORDS DE LA RUTINA', en:'ROUTINE RECORDS' },
  'resum.progres.titulo':{ ca:'PROGRÉS PER EXERCICI - VOLUM (kg x reps)', es:'PROGRESO POR EJERCICIO - VOLUMEN (kg x reps)', en:'PROGRESS BY EXERCISE - VOLUME (kg x reps)' },
  'resum.progres.titulo_cont':{ ca:'PROGRÉS PER EXERCICI (cont.)', es:'PROGRESO POR EJERCICIO (cont.)', en:'PROGRESS BY EXERCISE (cont.)' },
  'resum.progres.titulo_vacio':{ ca:'PROGRÉS PER EXERCICI', es:'PROGRESO POR EJERCICIO', en:'PROGRESS BY EXERCISE' },
  'resum.progres.vacio_msg':{ ca:'Encara no hi ha sessions amb dades registrades en aquesta rutina.', es:'Aún no hay sesiones con datos registrados en esta rutina.', en:"No sessions with data have been recorded in this routine yet." },
  'resum.notas.titulo':  { ca:"NOTES DE L'ENTRENADOR", es:'NOTAS DEL ENTRENADOR', en:'COACH NOTES' },

  // PDF rutina BIIO con histórico
  'rut.kpi.sesiones_reg':{ ca:'SESSIONS REGISTRADES', es:'SESIONES REGISTRADAS', en:'RECORDED SESSIONS' },
  'rut.kpi.de_x':        { ca:'de {total} ({micros} microcicles × {entrenos} entrenaments)', es:'de {total} ({micros} microciclos × {entrenos} entrenos)', en:'of {total} ({micros} microcycles × {entrenos} workouts)' },
  'rut.desc.titulo':     { ca:'LA RUTINA',  es:'LA RUTINA',  en:'THE ROUTINE' },
  'rut.page.entrenamiento':{ ca:'ENTRENAMENT {letra}{sufijo}', es:'ENTRENAMIENTO {letra}{sufijo}', en:'WORKOUT {letra}{sufijo}' },
  'rut.page.entrenamiento_cont':{ ca:'ENTRENAMENT {letra} (cont.)', es:'ENTRENAMIENTO {letra} (cont.)', en:'WORKOUT {letra} (cont.)' },
  'rut.col.fecha':       { ca:'Data',         es:'Fecha',         en:'Date' },
  'rut.col.microciclo':  { ca:'Microcicle',   es:'Microciclo',    en:'Microcycle' },
  'rut.col.series':      { ca:'Sèries',       es:'Series',        en:'Sets' },
  'rut.col.kg':          { ca:'Kg',           es:'Kg',            en:'Kg' },
  'rut.col.reps':        { ca:'Reps',         es:'Reps',          en:'Reps' },
  'rut.col.descanso':    { ca:'Descans',      es:'Descanso',      en:'Rest' },
  'rut.aer.tipo':        { ca:'Tipus',        es:'Tipo',          en:'Type' },
  'rut.aer.tiempo':      { ca:'Temps',        es:'Tiempo',        en:'Time' },
  'rut.aer.intensidad':  { ca:'Intensitat',   es:'Intensidad',    en:'Intensity' },
  // Unificat amb "Aeròbic" / "Aeróbico" (masc., elidint "exercici"/"ejercicio")
  // per consistència amb 'it.aer.tipo'.
  'rut.aer.linea':       { ca:'Aeròbic · {label}',  es:'Aeróbico · {label}',  en:'Cardio · {label}' },
  'rut.aer.linea_cont':  { ca:'         · {label}', es:'         · {label}',  en:'         · {label}' },

  // PDF histórico
  'hist.cover.titulo':   { ca:'HISTÒRIC COMPLET',   es:'HISTÓRICO COMPLETO',   en:'COMPLETE HISTORY' },
  'hist.kpi.rutinas':    { ca:'RUTINES',       es:'RUTINAS',       en:'ROUTINES' },
  'hist.kpi.sesiones':   { ca:'SESSIONS',      es:'SESIONES',      en:'SESSIONS' },
  'hist.kpi.mediciones': { ca:'MESURES',       es:'MEDICIONES',    en:'MEASUREMENTS' },
  'hist.kpi.peso_actual':{ ca:'PES ACTUAL',    es:'PESO ACTUAL',   en:'CURRENT WEIGHT' },
  'hist.pr.titulo':      { ca:'RÈCORDS PERSONALS', es:'RÉCORDS PERSONALES', en:'PERSONAL RECORDS' },
  'hist.pr.subtitulo':   { ca:"PR màxim assolit per exercici · comparat amb la primera rutina de l'històric", es:'PR máximo alcanzado por ejercicio · comparado con la primera rutina del histórico', en:'Max PR achieved per exercise · compared to the first routine on record' },
  'hist.pr.kg_pr':       { ca:'kg PR',  es:'kg PR',  en:'kg PR' },
  'hist.pr.en_asig':     { ca:'a {rutina}',  es:'en {rutina}',  en:'in {rutina}' },
  'hist.pr.vs_asig':     { ca:'vs {rutina} ({kg} kg)',  es:'vs {rutina} ({kg} kg)',  en:'vs {rutina} ({kg} kg)' },
  // CA: "Darrera" és la forma genuïna catalana per "última" (préstec del castellà).
  'hist.pr.ultima':      { ca:'Darrera: {fecha}',  es:'Última: {fecha}',  en:'Latest: {fecha}' },
  'hist.rutinas.titulo': { ca:'HISTORIAL DE RUTINES',     es:'HISTORIAL DE RUTINAS',     en:'ROUTINE HISTORY' },
  'hist.rutinas.titulo_cont':{ ca:'HISTORIAL DE RUTINES (cont.)', es:'HISTORIAL DE RUTINAS (cont.)', en:'ROUTINE HISTORY (cont.)' },
  'hist.rutinas.subtitulo':{ ca:'Línia de temps cronològica · cada rutina amb els seus PRs principals', es:'Línea de tiempo cronológica · cada rutina con sus PRs principales', en:'Chronological timeline · each routine with its main PRs' },
  'hist.estado.en_curso':{ ca:'en curs', es:'en curso', en:'in progress' },
  'hist.rutinas.col.sesiones':   { ca:'Sessions',     es:'Sesiones',     en:'Sessions' },
  'hist.rutinas.col.iteraciones':{ ca:'Iteracions',   es:'Iteraciones',  en:'Iterations' },
  // Unificat amb "PRs" en minúscula la 's' (convenció tipogràfica): més net que "PRS".
  'hist.rutinas.col.prs':        { ca:'PRs DE LA RUTINA', es:'PRs DE LA RUTINA', en:'ROUTINE PRs' },
  'hist.progres.titulo':         { ca:'PROGRESSIÓ PER EXERCICI — VOLUM (kg × reps)', es:'PROGRESIÓN POR EJERCICIO — VOLUMEN (kg × reps)', en:'PROGRESS BY EXERCISE — VOLUME (kg × reps)' },
  'hist.progres.titulo_cont':    { ca:'PROGRESSIÓ PER EXERCICI (cont.)', es:'PROGRESIÓN POR EJERCICIO (cont.)', en:'PROGRESS BY EXERCISE (cont.)' },
  'hist.progres.subtitulo':      { ca:'Una línia per exercici · totes les sessions del client · pic marcat en taronja', es:'Una línea por ejercicio · todas las sesiones del cliente · pico marcado en naranja', en:'One line per exercise · all client sessions · peak marked in orange' },
  'hist.vacio_msg':              { ca:'Aquest client encara no té rutines ni mesures registrades.', es:'Este cliente aún no tiene rutinas ni mediciones registradas.', en:'This client has no recorded routines or measurements yet.' }
};

// Devuelve el idioma del cliente, con fallback a 'ca' (catalán por defecto).
function tobLangOf(cli){ return (cli && cli.idioma) || 'ca'; }

// Traduce una key con interpolación tipo "{var}". Si la key no existe,
// devuelve la propia key como fallback visible (para detectar typos).
function tobT(key, lang, params){
  const entry = TOB_PDF_I18N[key];
  if(!entry){ console.warn('[i18n] key faltante:', key); return key; }
  let s = entry[lang] || entry.ca || entry.es || key;
  if(params){
    Object.keys(params).forEach(k => {
      s = s.replace(new RegExp('\\{'+k+'\\}','g'), params[k] == null ? '' : String(params[k]));
    });
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────
// Sanitiza una string para que sea seguro pasarla a pdf-lib (Helvetica
// StandardFont usa WinAnsi y peta con chars Unicode fuera de Latin-1).
// Mapea símbolos comunes a equivalentes ASCII/Latin-1; cualquier otro
// char fuera de WinAnsi se elimina.
// USAR siempre que el texto pueda contener input del usuario o símbolos
// Unicode (descripciones, nombres custom de ejercicios, notas, etc).
// ─────────────────────────────────────────────────────────────────────
const TOB_PDF_CHAR_MAP = {
  '→': '>',     // → flecha derecha (causa el error WinAnsi)
  '←': '<',     // ← flecha izquierda
  '↑': '^',     // ↑ flecha arriba
  '↓': 'v',     // ↓ flecha abajo
  '↔': '<>',    // ↔
  '⇒': '=>',    // ⇒
  '⇐': '<=',    // ⇐
  '≈': '~',     // ≈ aproximadamente
  '≤': '<=',    // ≤
  '≥': '>=',    // ≥
  '≠': '!=',    // ≠
  '∞': 'inf',   // ∞
  '✓': 'v',     // ✓ check
  '✗': 'x',     // ✗ cross
  '✕': 'x',     // ✕
  '·': '·',     // · ya está en WinAnsi, mantenemos
};
// Chars WinAnsi-1252 que están en el rango 0x80-0x9F y son legítimos en PDF:
// 0x80 €, 0x82 ‚, 0x83 ƒ, 0x84 „, 0x85 …, 0x86 †, 0x87 ‡, 0x88 ˆ, 0x89 ‰,
// 0x8A Š, 0x8B ‹, 0x8C Œ, 0x8E Ž, 0x91 ‘, 0x92 ’, 0x93 “, 0x94 ”, 0x95 •,
// 0x96 –, 0x97 —, 0x98 ˜, 0x99 ™, 0x9A š, 0x9B ›, 0x9C œ, 0x9E ž, 0x9F Ÿ.
const TOB_PDF_WINANSI_EXTRA = new Set([
  '€','‚','ƒ','„','…','†','‡','ˆ','‰',
  'Š','‹','Œ','Ž','‘','’','“','”','•',
  '–','—','˜','™','š','›','œ','ž','Ÿ'
]);

function tobPdfSafe(s){
  if(s == null) return '';
  // OJO con la regex: `[^\x20-\xFF]` (chars FUERA del rango 0x20-0xFF) —
  // forma escapada explícita para evitar el bug del space-en-el-class.
  // Antes era `[^ -ÿ]` (con espacio entre ^ y -) pero un edit anterior se
  // comió el espacio y se quedó como `[^-ÿ]` que JS interpreta como "NOT
  // (- or ÿ)", borrando todo el alfabeto y dejando solo '-' literales. Esto
  // vaciaba PDFs enteros (nombres ejercicios, descripciones, etc).
  return String(s).replace(/[^\x20-\xFF]/g, ch => {
    if(TOB_PDF_CHAR_MAP[ch] != null) return TOB_PDF_CHAR_MAP[ch];
    if(TOB_PDF_WINANSI_EXTRA.has(ch)) return ch;
    return '';  // strip silently — mejor que pete el PDF
  });
}

let tobDB = { clientes: [], plantillas: [] };
let tobCurrentAsig = null;     // {clienteId, asigId}
let tobCurrentItId = null;
let tobCurrentEntrenoId = null;
let tobCharts = {};             // {ejId: Chart instance}

function tobUid(prefix){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function tobEsc(s){ return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]); }
// Nombre de rutina sin el sufijo " — Hombre/Mujer/Unisex" (admite em-dash,
// en-dash o guion normal). Centralizado para que todos los PDFs y la UI
// muestren el mismo nombre y los filenames queden limpios.
function tobRutinaShortName(pl){
  if(!pl) return '(plantilla eliminada)';
  const s = String(pl.nombre || '').replace(/\s*[—–-]\s*(Hombre|Mujer|Unisex)\s*$/i, '').trim();
  return s || '(rutina)';
}

function tobLoad(){
  // Registrar plugin datalabels (idempotente con try/catch)
  if(window.Chart && window.ChartDataLabels){
    try { Chart.register(ChartDataLabels); } catch(e){}
  }
  try {
    const raw = localStorage.getItem(TOB_KEY);
    if(raw){
      tobDB = JSON.parse(raw);
      if(!tobDB.clientes) tobDB.clientes = [];
      if(!tobDB.plantillas) tobDB.plantillas = [];
    }
  } catch(e){ console.warn('tobLoad:', e); }

  // Backfill: si plantillas no tienen macrociclo, asignar "1º Powerbuilding"
  let backfilled = false;
  tobDB.plantillas.forEach(p => {
    if(!p.macrociclo){ p.macrociclo = '1º Powerbuilding'; backfilled = true; }
  });
  // Backfill: añadir entreno "Maximales" a plantillas Fuerza 2 que no lo tengan
  tobDB.plantillas.forEach(p => {
    if(p.categoria !== 'Fuerza 2') return;
    if((p.entrenos||[]).find(e => e.letra === 'MX')) return;
    const planMax = {};
    for(let mn=1; mn<=tobNumMicroOf(p); mn++){
      planMax[mn] = { series: 1, repsTarget: [1], pausa: "5'00''" };
    }
    const maxNames = ['BOX SQUAT', 'PRESS BANCA', 'PESO MUERTO', 'PRESS MILITAR', 'REMO', 'DOMINADAS'];
    const ejMax = maxNames.map((n, i) => ({
      id: tobUid('ej'), orden: i, nombre: n,
      subtitle: 'Intento máximo (1RM)',
      tipo: 'normal',
      planByMicro: planMax
    }));
    p.entrenos.push({ id:'MX', letra:'MX', nombre:'Maximales', ejercicios: ejMax });
    backfilled = true;
  });
  // También backfill las asignaciones existentes que tengan plantilla Fuerza 2
  // sin Maximales en su rutina copiada.
  tobDB.clientes.forEach(c => {
    (c.asignaciones||[]).forEach(a => {
      const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
      if(!pl || pl.categoria !== 'Fuerza 2') return;
      if(!a.rutina || !a.rutina.entrenos) return;
      if(a.rutina.entrenos.find(e => e.letra === 'MX')) return;
      const mx = (pl.entrenos||[]).find(e => e.letra === 'MX');
      if(mx){
        a.rutina.entrenos.push(JSON.parse(JSON.stringify(mx)));
        backfilled = true;
      }
    });
  });

  // Backfill: descripciones de categoría. Versionado con _descV: si la plantilla
  // no está en la versión actual, se reaplica el texto. Esto fuerza la actualización
  // cuando subimos TOB_DESC_VERSION (p.ej. al cambiar el tono de los textos).
  tobDB.plantillas.forEach(p => {
    if(!p.categoria || !TOB_DESC_CATEGORIAS[p.categoria]) return;
    if(p._descV !== TOB_DESC_VERSION){
      // p.descripcion guarda la versión castellana como canónica/legacy.
      // En los PDFs se lee tobDescOf(categoria, lang) con fallback aquí.
      p.descripcion = tobDescOf(p.categoria, 'es') || p.descripcion;
      p._descV = TOB_DESC_VERSION;
      backfilled = true;
    }
  });

  // Backfill v4: reemplaza ENTERAMENTE entrenos+ejercicios+planByMicro+numMicro
  // desde TOB_BIIO_DATA, que tiene la estructura BIIO real (3-7 micros, 2-3
  // entrenos A+B+C, planes por-ejercicio reales). Preserva el id de la plantilla
  // y su macrociclo/nombre/sexo. Las asignaciones ya creadas no se tocan —
  // tienen su propia copia de la rutina.
  tobDB.plantillas.forEach(p => {
    if(!p.categoria || !TOB_BIIO_DATA[p.categoria]) return;
    if((p._planV || 0) >= TOB_PLAN_VERSION) return;
    const data = TOB_BIIO_DATA[p.categoria];
    p.numMicro = data.numMicro;
    p.entrenos = data.entrenos.map(en => ({
      id: en.letra,
      letra: en.letra,
      nombre: en.nombre || ('Entreno ' + en.letra),
      ejercicios: en.ejercicios.map((ej, i) => ({
        id: tobUid('ej'),
        orden: i,
        nombre: ej.nombre,
        subtitle: ej.subtitle || '',
        tipo: ej.tipo || 'normal',
        ...(ej.tipo === 'circuito' ? { circuitoLineas: ej.circuitoLineas || [] } : {}),
        planByMicro: JSON.parse(JSON.stringify(ej.planByMicro))
      }))
    }));
    p._planV = TOB_PLAN_VERSION;
    backfilled = true;
  });

  // Backfill: normalizar nombres de ejercicios con aliases.
  // Preserva IDs — las sesiones logueadas siguen vinculadas.
  const renameEj = (ej) => {
    const canonical = TOB_EJ_ALIASES[ej.nombre];
    if(canonical && canonical !== ej.nombre){ ej.nombre = canonical; backfilled = true; }
  };
  tobDB.plantillas.forEach(p =>
    (p.entrenos||[]).forEach(en =>
      (en.ejercicios||[]).forEach(renameEj)));
  tobDB.clientes.forEach(c =>
    (c.asignaciones||[]).forEach(a =>
      (a.rutina?.entrenos||[]).forEach(en =>
        (en.ejercicios||[]).forEach(renameEj))));

  // Backfill: todos los clientes tienen array de mediciones
  tobDB.clientes.forEach(c => {
    if(!c.mediciones){ c.mediciones = []; backfilled = true; }
  });

  if(backfilled) tobSave(true);

  // Migrar de v1 si existía (estructura distinta)
  try {
    const v1 = localStorage.getItem('tob_online_v1');
    if(v1 && !tobDB.plantillas.length){
      // No migramos automáticamente — solo limpiamos
      localStorage.removeItem('tob_online_v1');
    }
  } catch(e){}

  if(!tobDB.plantillas.length){
    tobDB.plantillas = tobBuildSeedPlantillas();
    tobSave(true);
  }

  // Re-aplicar backfill de descripciones y planes oficiales BIIO después del
  // seed — porque el seed usa valores antiguos. Esto asegura que aunque sea
  // primera carga, las plantillas quedan con los textos y planes correctos.
  let postSeedBackfilled = false;
  tobDB.plantillas.forEach(p => {
    if(p.categoria && TOB_DESC_CATEGORIAS[p.categoria] && p._descV !== TOB_DESC_VERSION){
      p.descripcion = tobDescOf(p.categoria, 'es') || p.descripcion;
      p._descV = TOB_DESC_VERSION;
      postSeedBackfilled = true;
    }
    // V4: reemplaza entrenos completos desde TOB_BIIO_DATA (BIIO real)
    if(p.categoria && TOB_BIIO_DATA[p.categoria] && (p._planV || 0) < TOB_PLAN_VERSION){
      const data = TOB_BIIO_DATA[p.categoria];
      p.numMicro = data.numMicro;
      p.entrenos = data.entrenos.map(en => ({
        id: en.letra,
        letra: en.letra,
        nombre: en.nombre || ('Entreno ' + en.letra),
        ejercicios: en.ejercicios.map((ej, i) => ({
          id: tobUid('ej'),
          orden: i,
          nombre: ej.nombre,
          subtitle: ej.subtitle || '',
          tipo: ej.tipo || 'normal',
          ...(ej.tipo === 'circuito' ? { circuitoLineas: ej.circuitoLineas || [] } : {}),
          planByMicro: JSON.parse(JSON.stringify(ej.planByMicro))
        }))
      }));
      p._planV = TOB_PLAN_VERSION;
      postSeedBackfilled = true;
    }
  });
  if(postSeedBackfilled) tobSave(true);

  tobRenderClientes();
  tobRenderPlantillas();
}

function tobSave(silent){
  try { localStorage.setItem(TOB_KEY, JSON.stringify(tobDB)); }
  catch(e){ console.error('tobSave:', e); }
  if(!silent && typeof GitHubSync !== 'undefined' && GitHubSync.markDirty){ GitHubSync.markDirty(); }
  tobBadge('💾 guardado');
}

function tobBadge(text){
  const el = document.getElementById('tobSaveBadge'); if(!el) return;
  el.textContent = text;
  clearTimeout(tobBadge._t);
  tobBadge._t = setTimeout(() => el.textContent = '', 2000);
}

function tobToast(msg, type){
  const t = document.getElementById('tobToast'); if(!t) return;
  t.textContent = msg;
  t.className = 'tob-toast show ' + (type || '');
  clearTimeout(tobToast._t);
  tobToast._t = setTimeout(() => t.className = 'tob-toast', 2500);
}

// ═══ NAVEGACIÓN ═══
function tobShowTab(name, btn){
  document.querySelectorAll('.tob-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tob-' + name).classList.add('active');
  if(btn) btn.classList.add('active');
  else document.querySelectorAll('.tob-tab').forEach(t => {
    if(t.getAttribute('onclick')?.includes(`'${name}'`)) t.classList.add('active');
  });
  // Al abrir la pestaña Menús, renderizar la sub-pestaña activa (si no,
  // la lista sale vacía hasta que cambias de sub-pestaña y vuelves).
  if(name === 'menus' && typeof tobMenuShowTab === 'function'){
    const subActiva = document.querySelector('.tob-sub-tab.active') ||
                      document.querySelector('.tob-sub-tab');
    if(subActiva) tobMenuShowTab(subActiva.dataset.mtab || 'ingredientes', subActiva);
  }
}

// ═══ HELPERS PLAN ═══
function tobPlanFor(ej, microNum){
  if(ej.planByMicro && ej.planByMicro[microNum]) return ej.planByMicro[microNum];
  return ej.planBase || { series:3, repsTarget:[10], pausa:'' };
}
function tobPlanLabel(plan){
  if(plan.label) return plan.label;  // override completo (raro)
  const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
  const note = plan.note ? ' ' + plan.note : '';
  return `${plan.series}×${reps}${note}`;
}

// ═══ CLIENTES ═══
function tobRenderClientes(){
  const tbody = document.getElementById('tobClientesBody');
  const empty = document.getElementById('tobClientesEmpty');
  if(!tobDB.clientes.length){ tbody.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = tobDB.clientes.map(c => {
    const last = (c.asignaciones||[]).slice(-1)[0];
    const lastInfo = last
      ? tobPlantillaName(last.plantillaId) + ` <span class="tob-badge ${last.estado}">${last.estado}</span>`
      : '<span style="color:var(--mute2)">—</span>';
    const sexoCls = c.sexo==='M'?'m':c.sexo==='H'?'h':'u';
    const sexoTxt = c.sexo==='M'?'♀':c.sexo==='H'?'♂':'U';
    return `<tr>
      <td style="cursor:pointer;" onclick="tobOpenFicha('${c.id}')" title="Abrir ficha histórica"><strong>${tobEsc(c.nombre)}</strong></td>
      <td><span style="color:var(--mute);font-family:DM Mono,monospace;font-size:.78rem;">${tobEsc(c.contacto||'—')}</span></td>
      <td><span class="tob-badge ${sexoCls}">${sexoTxt}</span></td>
      <td class="num">${(c.asignaciones||[]).length}</td>
      <td>${lastInfo}</td>
      <td class="actions">
        <button class="tob-action btn-xs" onclick="tobAbrirUltimaRutina('${c.id}')" title="Abrir la última rutina del cliente">🏋 Rutina</button>
        <button class="tob-action btn-xs" onclick="tobAbrirMediciones('${c.id}')" title="Ver/añadir mediciones de composición corporal">📏 Med</button>
        <button class="tob-action ghost btn-xs" onclick="tobOpenFicha('${c.id}')" title="Ficha general — rutinas + mediciones + histórico">📋 Ficha</button>
      </td>
    </tr>`;
  }).join('');
}

function tobPlantillaName(plantId){
  const p = tobDB.plantillas.find(p => p.id === plantId);
  if(!p) return '(plantilla eliminada)';
  const mc = p.macrociclo ? `<span style="font-size:.65rem;color:var(--mute);font-family:DM Mono,monospace;">[${tobEsc(p.macrociclo)}]</span> ` : '';
  return mc + tobEsc(p.nombre);
}

function tobOpenClienteModal(cli){
  document.getElementById('tobClienteModalTitle').textContent = cli ? 'Editar cliente' : 'Nuevo cliente';
  document.getElementById('tobCliNombre').value = cli?.nombre || '';
  document.getElementById('tobCliSexo').value = cli?.sexo || 'H';
  document.getElementById('tobCliContacto').value = cli?.contacto || '';
  document.getElementById('tobCliAlta').value = cli?.alta || new Date().toISOString().slice(0,10);
  document.getElementById('tobCliNacimiento').value = cli?.nacimiento || '';
  // Idioma de los PDFs (default 'ca' catalán para clientes nuevos)
  document.getElementById('tobCliIdioma').value = cli?.idioma || 'ca';
  const sel = document.getElementById('tobCliPlantilla');
  sel.innerHTML = '<option value="">— Ninguna —</option>' +
    tobDB.plantillas.map(p => `<option value="${p.id}">${tobEsc(p.nombre)}</option>`).join('');
  sel.value = '';
  document.getElementById('tobClienteModalBg').dataset.editId = cli?.id || '';
  document.getElementById('tobCliDelBtn').style.display = cli ? '' : 'none';
  document.getElementById('tobClienteModalBg').classList.add('on');
}
function tobCloseClienteModal(){ document.getElementById('tobClienteModalBg').classList.remove('on'); }
function tobDelClienteFromModal(){
  const editId = document.getElementById('tobClienteModalBg').dataset.editId;
  if(!editId) return;
  tobCloseClienteModal();
  // Cerrar también la ficha si estaba abierta (para no quedar mostrando datos eliminados)
  if(tobCurrentFichaId === editId) tobCloseFicha();
  tobDelCliente(editId);
}

function tobSaveCliente(){
  const nombre = document.getElementById('tobCliNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const cli = {
    nombre,
    sexo: document.getElementById('tobCliSexo').value,
    contacto: document.getElementById('tobCliContacto').value.trim(),
    alta: document.getElementById('tobCliAlta').value,
    nacimiento: document.getElementById('tobCliNacimiento').value || '',
    // Idioma de los PDFs entregables ('ca' / 'es' / 'en'). Default catalán.
    idioma: document.getElementById('tobCliIdioma').value || 'ca'
  };
  const editId = document.getElementById('tobClienteModalBg').dataset.editId;
  if(editId){
    const c = tobDB.clientes.find(c => c.id === editId);
    if(c) Object.assign(c, cli);
  } else {
    cli.id = tobUid('cli');
    cli.asignaciones = [];
    const plantId = document.getElementById('tobCliPlantilla').value;
    if(plantId){ const a = tobCreateAsignacion(plantId); if(a) cli.asignaciones.push(a); }
    tobDB.clientes.push(cli);
  }
  tobSave();
  tobCloseClienteModal();
  tobRenderClientes();
  tobToast('✓ Cliente guardado', 'green');
}

function tobEditCliente(id){
  const c = tobDB.clientes.find(c => c.id === id);
  if(c) tobOpenClienteModal(c);
}
function tobDelCliente(id){
  const c = tobDB.clientes.find(c => c.id === id);
  if(!c) return;
  tobConfirm(`Eliminar a ${c.nombre}?`, 'Se borran todas sus rutinas e iteraciones. No se puede deshacer.', () => {
    tobDB.clientes = tobDB.clientes.filter(x => x.id !== id);
    tobSave();
    tobRenderClientes();
    tobToast('Eliminado', 'green');
  });
}

function tobCreateAsignacion(plantId){
  const pl = tobDB.plantillas.find(p => p.id === plantId);
  if(!pl) return null;
  return {
    id: tobUid('asig'),
    plantillaId: plantId,
    fechaInicio: new Date().toISOString().slice(0,10),
    estado: 'en_curso',
    notas: '',
    // Copia el numMicro de la plantilla (3-7) para que la asignación use las
    // columnas correctas en su tabla aunque luego la plantilla cambie.
    rutina: JSON.parse(JSON.stringify({ entrenos: pl.entrenos, numMicro: tobNumMicroOf(pl) })),
    iteraciones: [
      { id: tobUid('it'), numero: 1, sesiones: {} }
    ]
  };
}

function tobAbrirCliente(cliId){
  // Abre la última rutina (uso común). Para ver el histórico → tobOpenFicha
  tobAbrirUltimaRutina(cliId);
}

function tobAbrirUltimaRutina(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c) return;
  if(!c.asignaciones || !c.asignaciones.length){
    tobOpenAsignarModal(c);
    return;
  }
  // Ordenar por fechaInicio desc, abrir la última
  const sorted = [...c.asignaciones].sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||''));
  tobOpenAsignacion(c.id, sorted[0].id);
}

// Abre la ficha posicionada en el bloque de mediciones. Si el cliente aún no
// tiene ninguna, lanza directamente el formulario de "+ Nueva medición".
function tobAbrirMediciones(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c) return;
  tobOpenFicha(cliId);
  if(!c.mediciones || !c.mediciones.length){
    setTimeout(() => tobOpenMedicionModal(), 100);
    return;
  }
  setTimeout(() => {
    const block = document.getElementById('tobFichaMedicionesBlock');
    if(block) block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// Botón "+ Rutina" desde la ficha: abre el selector de plantillas.
function tobNuevaRutinaDesdeFicha(){
  if(!tobCurrentFichaId) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(cli) tobOpenAsignarModal(cli);
}

// Botón "✓ Completar y abrir nueva rutina": cuando la rutina actual aún no
// está marcada como completada, la marca y abre el selector para la siguiente.
// Si ya está completada, abre el selector directamente.
function tobCompletarYNuevaRutina(){
  if(!tobCurrentFichaId) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const sorted = [...(cli.asignaciones||[])].sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||''));
  const lastA = sorted[0];
  if(lastA && lastA.estado !== 'completada'){
    const pl = tobDB.plantillas.find(p => p.id === lastA.plantillaId);
    tobConfirm('Completar y abrir nueva rutina',
      `Voy a marcar <strong>${tobEsc(tobRutinaShortName(pl))}</strong> como completada y abrir el selector para asignar una rutina nueva. ¿Continuar?`,
      () => {
        lastA.estado = 'completada';
        tobSave();
        tobRenderFicha();
        tobOpenAsignarModal(cli);
      });
  } else {
    tobOpenAsignarModal(cli);
  }
}

function tobBackToFicha(){
  if(tobCurrentAsig){
    const cliId = tobCurrentAsig.clienteId;
    tobCloseAsignacion();
    tobOpenFicha(cliId);
  } else {
    tobCloseAsignacion();
  }
}

function tobOpenAsignarModal(cli){
  // Agrupar asignaciones existentes por macrociclo
  const byMacro = {};
  (cli.asignaciones||[]).forEach(a => {
    const p = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const mc = p?.macrociclo || '(Sin macrociclo)';
    if(!byMacro[mc]) byMacro[mc] = [];
    byMacro[mc].push({ a, p });
  });
  const existing = Object.entries(byMacro).map(([mc, items]) => {
    return `<div style="margin-bottom:10px;">
      <div style="font-family:DM Mono,monospace;font-size:.7rem;color:var(--acc);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">${tobEsc(mc)}</div>
      ${items.map(({a, p}) => `<button class="tob-action ghost" style="margin:2px 0;text-align:left;width:100%;display:block;" onclick="tobCloseConfirm();tobOpenAsignacion('${cli.id}','${a.id}')">
        <strong>${p ? tobEsc(p.nombre) : '(plantilla eliminada)'}</strong>
        <span style="color:var(--mute);font-size:.72rem;float:right;">${a.estado} · ${a.fechaInicio||''}</span>
      </button>`).join('')}
    </div>`;
  }).join('');

  // Plantillas para nueva, agrupadas por macrociclo en un optgroup
  const macroGroups = {};
  tobDB.plantillas.forEach(p => {
    const mc = p.macrociclo || '(Sin macrociclo)';
    if(!macroGroups[mc]) macroGroups[mc] = [];
    macroGroups[mc].push(p);
  });
  const newOptions = Object.entries(macroGroups).sort().map(([mc, list]) =>
    `<optgroup label="${tobEsc(mc)}">` +
    list.map(p => `<option value="${p.id}">${tobEsc(p.nombre)}</option>`).join('') +
    `</optgroup>`
  ).join('');
  document.getElementById('tobConfirmTitle').textContent = tobEsc(cli.nombre);
  document.getElementById('tobConfirmMsg').innerHTML = `
    ${existing ? '<div style="margin-bottom:14px;"><div class="tob-lbl">Rutinas existentes:</div>' + existing + '</div>' : ''}
    <div class="tob-lbl">Crear nueva rutina con plantilla:</div>
    <select class="tob-select" id="tobAsigNewPlant">${newOptions}</select>
  `;
  const ok = document.getElementById('tobConfirmOk');
  ok.textContent = '+ Crear rutina';
  ok.classList.remove('danger');
  ok.onclick = function(){
    const plId = document.getElementById('tobAsigNewPlant').value;
    const a = tobCreateAsignacion(plId);
    if(!a){ tobToast('Plantilla no encontrada', 'red'); return; }
    cli.asignaciones.push(a);
    tobSave();
    tobCloseConfirm();
    tobOpenAsignacion(cli.id, a.id);
    tobToast('✓ Rutina creada', 'green');
  };
  document.getElementById('tobConfirmBg').classList.add('on');
}

// ═══ PLANTILLAS ═══
function tobRenderPlantillas(){
  const cont = document.getElementById('tobPlantillasGroups');
  const empty = document.getElementById('tobPlantillasEmpty');
  if(!tobDB.plantillas.length){ cont.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';

  // Agrupar por macrociclo
  const groups = {};
  tobDB.plantillas.forEach(p => {
    const mc = p.macrociclo || '(Sin macrociclo)';
    if(!groups[mc]) groups[mc] = [];
    groups[mc].push(p);
  });

  // Ordenar macrociclos por nombre, plantillas dentro por categoría+sexo
  const sortedMacros = Object.keys(groups).sort();

  cont.innerHTML = sortedMacros.map(mc => {
    const list = groups[mc].sort((a,b) => {
      const c = (a.categoria||'').localeCompare(b.categoria||'');
      if(c) return c;
      return (a.sexo==='H'?0:a.sexo==='M'?1:2) - (b.sexo==='H'?0:b.sexo==='M'?1:2);
    });
    return `<div class="tob-mc-group">
      <div class="tob-mc-hdr" onclick="this.parentElement.classList.toggle('collapsed')">
        <span class="caret">▾</span>
        <span class="name">${tobEsc(mc)}</span>
        <span class="count">${list.length} plantilla${list.length===1?'':'s'}</span>
      </div>
      <table class="tob-table">
        <thead><tr>
          <th>Nombre</th><th>Categoría</th><th>Sexo</th>
          <th class="num">Entrenos</th><th class="num">Ej.</th><th></th>
        </tr></thead>
        <tbody>
          ${list.map(p => {
            const sexoBadge = `<span class="tob-badge ${p.sexo==='M'?'m':p.sexo==='H'?'h':'u'}">${p.sexo==='M'?'♀':p.sexo==='H'?'♂':'U'}</span>`;
            const nEj = (p.entrenos||[]).reduce((s,e) => s + (e.ejercicios||[]).length, 0);
            return `<tr>
              <td><strong>${tobEsc(p.nombre)}</strong></td>
              <td><span style="color:var(--mute);font-size:.78rem;">${tobEsc(p.categoria||'—')}</span></td>
              <td>${sexoBadge}</td>
              <td class="num">${(p.entrenos||[]).length}</td>
              <td class="num">${nEj}</td>
              <td class="actions">
                <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobPreviewPlantillaPdf('${p.id}')" title="Ver el PDF de la plantilla en blanco (campos editables)">👁</button>
                <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobDownloadPlantillaPdf('${p.id}')" title="Descargar el PDF de la plantilla en blanco">📄</button>
                <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobEditarPlantilla('${p.id}')">✏️</button>
                <button class="tob-action danger" style="padding:4px 9px;" onclick="tobDelPlantilla('${p.id}')">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }).join('');
}

function tobOpenPlantillaModal(pl){
  document.getElementById('tobPlantillaModalTitle').textContent = pl ? 'Editar plantilla' : 'Nueva plantilla';
  document.getElementById('tobPlMacrociclo').value = pl?.macrociclo || '1º Powerbuilding';
  document.getElementById('tobPlNombre').value = pl?.nombre || '';
  document.getElementById('tobPlCategoria').value = pl?.categoria || 'Reacondicionamiento';
  document.getElementById('tobPlSexo').value = pl?.sexo || 'H';
  document.getElementById('tobPlDescripcion').value = pl?.descripcion || '';
  document.getElementById('tobPlDef').value = pl ? tobPlantillaToText(pl) : '';
  document.getElementById('tobPlantillaModalBg').dataset.editId = pl?.id || '';
  // Mostrar el editor por-ejercicio solo si la plantilla ya existe (tiene id)
  const wrap = document.getElementById('tobPlEjListWrap');
  if(wrap) wrap.style.display = pl ? '' : 'none';
  if(pl) tobRenderPlEjList(pl);
  document.getElementById('tobPlantillaModalBg').classList.add('on');
}
function tobClosePlantillaModal(){ document.getElementById('tobPlantillaModalBg').classList.remove('on'); }

function tobPlantillaToText(pl){
  const lines = [];
  (pl.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => {
      const plan = ej.planBase || tobPlanFor(ej, 1);
      const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
      let line = `${en.letra} | ${ej.nombre} | ${ej.tipo||'normal'} | ${ej.subtitle||''} | ${plan.series} | ${reps} | ${plan.pausa||''}`;
      if(ej.tipo === 'circuito' && Array.isArray(ej.circuitoLineas)) line += ` | ${ej.circuitoLineas.join(';')}`;
      lines.push(line);
    });
  });
  return lines.join('\n');
}

function tobParsePlantillaDef(text){
  const entrenosMap = {};
  text.split('\n').forEach(raw => {
    const l = raw.trim();
    if(!l || l.startsWith('#')) return;
    const parts = l.split('|').map(s => s.trim());
    if(parts.length < 6) return;
    const [letra, nombre, tipo, subtitle, seriesStr, repsStr, pausa, circLineas] = parts;
    if(!entrenosMap[letra]){
      entrenosMap[letra] = { id: letra, letra, nombre: 'Entreno ' + letra, ejercicios: [] };
    }
    const series = parseInt(seriesStr) || 3;
    const repsTarget = String(repsStr||'').split('/').map(x => x.trim()).filter(Boolean);
    const ej = {
      id: tobUid('ej'),
      orden: entrenosMap[letra].ejercicios.length,
      nombre,
      subtitle: subtitle || '',
      tipo: tipo === 'circuito' ? 'circuito' : 'normal',
      planBase: { series, repsTarget, pausa: pausa || '' }
    };
    if(ej.tipo === 'circuito' && circLineas){
      ej.circuitoLineas = circLineas.split(';').map(x => x.trim()).filter(Boolean);
    }
    entrenosMap[letra].ejercicios.push(ej);
  });
  return Object.values(entrenosMap);
}

function tobSavePlantilla(){
  const nombre = document.getElementById('tobPlNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const macrociclo = document.getElementById('tobPlMacrociclo').value.trim() || '(Sin macrociclo)';
  const categoria = document.getElementById('tobPlCategoria').value;
  const sexo = document.getElementById('tobPlSexo').value;
  const descripcion = document.getElementById('tobPlDescripcion').value.trim();
  const entrenos = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
  if(!entrenos.length){ tobToast('Define al menos un ejercicio', 'red'); return; }
  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId){
    const p = tobDB.plantillas.find(p => p.id === editId);
    if(p){
      // PRESERVAR IDs: match por entreno+nombre con los ejercicios antiguos
      const oldMap = {};
      (p.entrenos||[]).forEach(en => {
        (en.ejercicios||[]).forEach(ej => { oldMap[en.letra + ':' + ej.nombre] = ej.id; });
      });
      entrenos.forEach(en => {
        (en.ejercicios||[]).forEach(ej => {
          const key = en.letra + ':' + ej.nombre;
          if(oldMap[key]) ej.id = oldMap[key];
        });
      });
      Object.assign(p, { macrociclo, nombre, categoria, sexo, descripcion, entrenos });
    }
  } else {
    tobDB.plantillas.push({ id: tobUid('pl'), macrociclo, nombre, categoria, sexo, descripcion, entrenos });
  }
  tobSave();
  tobClosePlantillaModal();
  tobRenderPlantillas();
  tobToast('✓ Guardado', 'green');
}

function tobEditarPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(p) tobOpenPlantillaModal(p);
}
function tobDelPlantilla(id){
  const p = tobDB.plantillas.find(p => p.id === id);
  if(!p) return;
  tobConfirm(`Eliminar plantilla "${p.nombre}"?`, 'Las asignaciones existentes mantienen su copia. Solo se quita del catálogo.', () => {
    tobDB.plantillas = tobDB.plantillas.filter(x => x.id !== id);
    tobSave();
    tobRenderPlantillas();
    tobToast('Eliminada', 'green');
  });
}

// ═══ ASIGNACIÓN (rutina del cliente) ═══
function tobAsig(){
  if(!tobCurrentAsig) return null;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  return cli?.asignaciones.find(a => a.id === tobCurrentAsig.asigId);
}

function tobOpenAsignacion(cliId, asigId){
  tobCurrentAsig = { clienteId: cliId, asigId };
  const cli = tobDB.clientes.find(c => c.id === cliId);
  const asig = cli?.asignaciones.find(a => a.id === asigId);
  if(!cli || !asig){ tobToast('No encontrado', 'red'); return; }
  const pl = tobDB.plantillas.find(p => p.id === asig.plantillaId);

  // Garantizar estructura
  if(!asig.iteraciones || !asig.iteraciones.length){
    asig.iteraciones = [{ id: tobUid('it'), numero: 1, sesiones: {} }];
  }
  tobCurrentItId = asig.iteraciones[asig.iteraciones.length-1].id;
  tobCurrentEntrenoId = asig.rutina?.entrenos?.[0]?.id || 'A';

  document.getElementById('tobTabAsig').style.display = '';
  tobShowTab('asignacion');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tobTabAsig').classList.add('active');

  document.getElementById('tobAsigTitulo').textContent = `${cli.nombre} — ${tobRutinaShortName(pl)}`;
  document.getElementById('tobAsigSubtitulo').textContent = pl?.categoria || '';

  document.getElementById('tobAsigEstado').value = asig.estado;
  document.getElementById('tobAsigNotas').value = asig.notas || '';

  tobRenderItTabs();
  tobRenderEntTabs();
  tobRenderEntreno();
  tobRenderCharts();
}

function tobCloseAsignacion(){
  tobCurrentAsig = null;
  // Destruir charts para liberar memoria
  Object.values(tobCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobCharts = {};
  document.getElementById('tobTabAsig').style.display = 'none';
  tobShowTab('clientes');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(".tob-tab[onclick*='clientes']")?.classList.add('active');
}

function tobAsigUpdateEstado(v){ const a=tobAsig(); if(a){a.estado=v;tobSave();tobRenderClientes();} }
function tobAsigUpdateNotas(v){ const a=tobAsig(); if(a){a.notas=v;tobSave();} }

function tobDeleteAsignacion(){
  if(!tobCurrentAsig) return;
  tobConfirm('¿Eliminar esta rutina?', 'Se borra TODO el progreso de TODAS las iteraciones.', () => {
    const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
    if(cli){
      cli.asignaciones = cli.asignaciones.filter(a => a.id !== tobCurrentAsig.asigId);
      tobSave();
      tobCloseAsignacion();
      tobRenderClientes();
      tobToast('Rutina eliminada', 'green');
    }
  });
}

function tobRenderItTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobItTabs');
  cont.innerHTML = a.iteraciones.map((it, i) => {
    const color = TOB_IT_COLORS[i % TOB_IT_COLORS.length];
    const active = it.id === tobCurrentItId ? 'active' : '';
    const borderStyle = it.id === tobCurrentItId ? `style="border-color:${color};color:${color};"` : '';
    return `<button class="tob-it-tab ${active}" ${borderStyle} onclick="tobSetIt('${it.id}')">
      <span class="dot" style="background:${color}"></span> Iteración ${it.numero}
    </button>`;
  }).join('') + `
    <button class="tob-action ghost" style="padding:5px 12px;font-size:.75rem;" onclick="tobAddIteracion()">+ Nueva iteración</button>
    ${a.iteraciones.length > 1 ? `<button class="tob-action danger" style="padding:5px 12px;font-size:.75rem;" onclick="tobDelIteracion()">🗑 Esta iteración</button>` : ''}
  `;
}

function tobSetIt(id){ tobCurrentItId = id; tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts(); }

function tobAddIteracion(){
  const a = tobAsig(); if(!a) return;
  const num = Math.max(...a.iteraciones.map(i => i.numero)) + 1;
  const it = { id: tobUid('it'), numero: num, sesiones: {} };
  a.iteraciones.push(it);
  tobCurrentItId = it.id;
  tobSave();
  tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts();
  tobToast(`✓ Iteración ${num} creada`, 'green');
}

function tobDelIteracion(){
  const a = tobAsig(); if(!a || a.iteraciones.length < 2) return;
  const it = a.iteraciones.find(i => i.id === tobCurrentItId);
  tobConfirm(`Eliminar iteración ${it.numero}?`, 'Se borran todos los kg/reps de esta iteración.', () => {
    a.iteraciones = a.iteraciones.filter(i => i.id !== tobCurrentItId);
    // Renumerar
    a.iteraciones.forEach((x,i) => x.numero = i+1);
    tobCurrentItId = a.iteraciones[a.iteraciones.length-1].id;
    tobSave();
    tobRenderItTabs(); tobRenderEntreno(); tobRenderCharts();
  });
}

function tobIt(){ const a=tobAsig(); return a?.iteraciones.find(i => i.id === tobCurrentItId); }

function tobRenderEntTabs(){
  const a = tobAsig(); if(!a) return;
  const cont = document.getElementById('tobEntTabs');
  cont.innerHTML = (a.rutina?.entrenos||[]).map(en =>
    `<button class="tob-ent-tab ${tobCurrentEntrenoId===en.id?'active':''}" onclick="tobSetEntreno('${en.id}')">
      Entreno ${en.letra}
    </button>`
  ).join('');
}

function tobSetEntreno(id){ tobCurrentEntrenoId = id; tobRenderEntTabs(); tobRenderEntreno(); }

function tobGetSesion(microNum, entId){
  const it = tobIt(); if(!it) return null;
  if(!it.sesiones[microNum]) it.sesiones[microNum] = {};
  if(!it.sesiones[microNum][entId]){
    it.sesiones[microNum][entId] = { fecha:'', aerobica:{tipo:'',tiempo:'',intensidad:''}, ejs:{} };
  }
  return it.sesiones[microNum][entId];
}

function tobRenderEntreno(){
  const a = tobAsig(); if(!a) return;
  const en = a.rutina?.entrenos.find(e => e.id === tobCurrentEntrenoId);
  if(!en){ document.getElementById('tobEntContent').innerHTML = '<div class="tob-card">Selecciona un entreno</div>'; return; }

  const it = tobIt();
  const microHeaders = Array.from({length: tobNumMicroOf(a.rutina)}, (_,i) => i+1);
  const micros = microHeaders.map(n => `${n}º`);

  const ejercicios = (en.ejercicios||[]).sort((x,y) => (x.orden||0)-(y.orden||0));

  // Fila de fechas en cabecera de la sección
  const fechasRow = microHeaders.map(mn => {
    const s = it ? (it.sesiones[mn]?.[en.id]) : null;
    return `<td class="micro-col"><input class="fecha" type="date" value="${s?.fecha||''}"
      onchange="tobSetFecha(${mn},'${en.id}',this.value)"></td>`;
  }).join('');

  let html = `<div class="tob-card">
    <table class="tob-ej-grid">
      <thead><tr>
        <th class="row-lbl" style="width:170px;">Fecha</th>
        ${microHeaders.map(n => `<th class="micro-col">µ${n}</th>`).join('')}
      </tr></thead>
      <tbody>
        <tr class="fecha-row"><td class="row-lbl">Fecha sesión</td>${fechasRow}</tr>
      </tbody>
    </table>
  </div>`;

  ejercicios.forEach(ej => {
    html += tobRenderEjBlock(ej, en, microHeaders, it);
  });

  // Botón añadir ejercicio (al final de la lista del entreno actual)
  html += `<div style="margin:10px 0 16px;">
    <button class="tob-action ghost" style="font-size:.78rem;" onclick="tobAddEjToEntreno('${en.id}')" title="Añadir un nuevo ejercicio a este entreno">+ Añadir ejercicio</button>
  </div>`;

  // Aeróbica
  html += `<div class="tob-card">
    <div class="tob-card-title">Eventual actividad aeróbica</div>
    <table class="tob-ej-grid">
      <tbody>
        ${['tipo','tiempo','intensidad'].map(field => {
          const lblMap = {tipo:'Tipo',tiempo:'Tiempo',intensidad:'Intensidad'};
          return `<tr><td class="row-lbl" style="width:170px;">${lblMap[field]}</td>${microHeaders.map(mn => {
            const s = it ? (it.sesiones[mn]?.[en.id]) : null;
            const v = s?.aerobica?.[field] || '';
            return `<td class="micro-col"><input class="cell" style="width:90%;" value="${tobEsc(v)}" onchange="tobSetAerobica(${mn},'${en.id}','${field}',this.value)"></td>`;
          }).join('')}</tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  document.getElementById('tobEntContent').innerHTML = html;
}

function tobRenderEjBlock(ej, en, microHeaders, it){
  // Plan por microciclo (fila plan)
  const planRow = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    return `<td class="micro-col">${tobEsc(tobPlanLabel(plan))}</td>`;
  }).join('');

  // Reps target por microciclo (filas — una por cada repsTarget index)
  // Estilo Full Training: muestra 3 valores apilados de reps target (15/12/10 → 15, 12, 10 en celdas separadas?
  // Mejor: ponerlos en una sola celda como "15 / 12 / 10" en plan row. Ya está.

  const seriesN = Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series || 3));
  const rows = [];

  // Filas de series (kg + rep por columna)
  for(let s = 0; s < seriesN; s++){
    const cells = microHeaders.map(mn => {
      const plan = tobPlanFor(ej, mn);
      if(s >= plan.series) return `<td class="micro-col" style="color:var(--mute2)">—</td>`;
      const ses = it ? (it.sesiones[mn]?.[en.id]) : null;
      const sr = ses?.ejs?.[ej.id]?.series?.[s] || { kg:null, reps:null };
      const repsTarget = Array.isArray(plan.repsTarget) ? (plan.repsTarget[s] || plan.repsTarget[0]) : plan.repsTarget;
      return `<td class="micro-col">
        <span class="tob-kgrp">
          <input class="cell" type="number" step="0.5" placeholder="kg" value="${sr.kg==null?'':sr.kg}"
            onchange="tobSetSerieKg('${ej.id}','${en.id}',${mn},${s},this.value)">
          <input class="cell" type="number" placeholder="${repsTarget||'rep'}" value="${sr.reps==null?'':sr.reps}"
            onchange="tobSetSerieReps('${ej.id}','${en.id}',${mn},${s},this.value)">
        </span>
      </td>`;
    }).join('');
    rows.push(`<tr><td class="row-lbl">${s+1}ª Serie</td>${cells}</tr>`);
  }

  // Para circuito, las "series" son en realidad "ejercicios alternados"
  let bodyRows;
  if(ej.tipo === 'circuito' && Array.isArray(ej.circuitoLineas) && ej.circuitoLineas.length){
    // Una fila por ejercicio del circuito
    bodyRows = ej.circuitoLineas.map((lineaName, i) => {
      const cells = microHeaders.map(mn => {
        const ses = it ? (it.sesiones[mn]?.[en.id]) : null;
        const sr = ses?.ejs?.[ej.id]?.lineas?.[i] || { kg:null, reps:null };
        return `<td class="micro-col">
          <span class="tob-kgrp">
            <input class="cell" type="number" step="0.5" placeholder="kg" value="${sr.kg==null?'':sr.kg}"
              onchange="tobSetLineaKg('${ej.id}','${en.id}',${mn},${i},this.value)">
            <input class="cell" type="number" placeholder="rep" value="${sr.reps==null?'':sr.reps}"
              onchange="tobSetLineaReps('${ej.id}','${en.id}',${mn},${i},this.value)">
          </span>
        </td>`;
      }).join('');
      return `<tr><td class="row-lbl">${tobEsc(lineaName)}</td>${cells}</tr>`;
    }).join('');
  } else {
    bodyRows = rows.join('');
  }

  // Plan label row con detalles de reps target
  const planDetail = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    const repsArr = Array.isArray(plan.repsTarget) ? plan.repsTarget : [plan.repsTarget];
    return `<td class="micro-col">${plan.series}×${tobEsc(repsArr.join('/'))}</td>`;
  }).join('');

  // Pausa row
  const pausaRow = microHeaders.map(mn => {
    const plan = tobPlanFor(ej, mn);
    return `<td class="micro-col">${tobEsc(plan.pausa||'—')}</td>`;
  }).join('');

  const subTitle = ej.subtitle ? `<span class="tob-ej-sub">${tobEsc(ej.subtitle)}</span>` : '';
  const tipoLabel = ej.tipo === 'circuito' ? '<span class="tob-ej-sub" style="color:var(--acc2);">· circuito ·</span>' : '';

  return `<div class="tob-ej-block">
    <div class="tob-ej-head">
      <span class="tob-ej-name">${tobEsc(ej.nombre)}</span>
      ${tipoLabel}
      ${subTitle}
      <button class="tob-action ghost" style="margin-left:auto;padding:4px 10px;font-size:.7rem;" onclick="tobOpenEjEditor('${en.id}','${ej.id}')" title="Editar este ejercicio (renombrar, cambiar plan, eliminar) — preserva los datos registrados">✏️ Editar</button>
    </div>
    <table class="tob-ej-grid">
      <thead><tr>
        <th class="row-lbl" style="width:170px;">SERIES × REPS</th>
        ${arrayHeaders()}
      </tr></thead>
      <tbody>
        <tr class="plan-row"><td class="row-lbl">Plan</td>${planDetail}</tr>
        ${bodyRows}
        <tr class="pausa-row"><td class="row-lbl">Pausa series</td>${pausaRow}</tr>
      </tbody>
    </table>
  </div>`;
  function arrayHeaders(){
    return microHeaders.map(n => `<th class="micro-col">µ${n}</th>`).join('');
  }
}

function tobSetFecha(microNum, entId, val){
  const s = tobGetSesion(microNum, entId); if(s){ s.fecha = val; tobSave(); tobRenderCharts(); }
}
function tobSetAerobica(microNum, entId, field, val){
  const s = tobGetSesion(microNum, entId); if(s){ s.aerobica[field] = val; tobSave(); }
}
function tobSetSerieKg(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'kg', val, 'series'); }
function tobSetSerieReps(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'reps', val, 'series'); }
function tobSetLineaKg(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'kg', val, 'lineas'); }
function tobSetLineaReps(ejId, entId, microNum, idx, val){ tobSetEjVal(ejId, entId, microNum, idx, 'reps', val, 'lineas'); }
function tobSetEjVal(ejId, entId, microNum, idx, field, val, arrName){
  const s = tobGetSesion(microNum, entId); if(!s) return;
  if(!s.ejs[ejId]) s.ejs[ejId] = {};
  if(!s.ejs[ejId][arrName]) s.ejs[ejId][arrName] = [];
  while(s.ejs[ejId][arrName].length <= idx) s.ejs[ejId][arrName].push({kg:null,reps:null});
  const v = val === '' ? null : parseFloat(val);
  s.ejs[ejId][arrName][idx][field] = isNaN(v) ? null : v;
  tobSave();
  tobRenderCharts();
}

// ═══ CHARTS ═══
function tobRenderCharts(){
  const a = tobAsig(); if(!a) return;
  const grid = document.getElementById('tobChartsGrid');
  // Destruir charts previos
  Object.values(tobCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobCharts = {};

  // Recolectar TODOS los ejercicios principales (tipo normal) de TODOS los entrenos
  const mainEjs = [];
  (a.rutina?.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => {
      if(ej.tipo !== 'circuito') mainEjs.push({ej, entId: en.id});
    });
  });

  if(!mainEjs.length){
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mute2);padding:30px;">Aún no hay ejercicios principales con datos.</div>';
    return;
  }

  grid.innerHTML = mainEjs.map(({ej}) =>
    `<div class="tob-chart-card">
      <div class="hdr">${tobEsc(ej.nombre)}</div>
      <div class="body"><canvas id="tobChart_${ej.id}"></canvas></div>
    </div>`
  ).join('');

  // Plot — una línea por iteración
  if(window.ChartDataLabels && Chart.register){
    try { Chart.register(ChartDataLabels); } catch(e){}
  }

  mainEjs.forEach(({ej, entId}) => {
    const canvas = document.getElementById('tobChart_' + ej.id);
    if(!canvas) return;
    const datasets = [];
    a.iteraciones.forEach((it, idx) => {
      const color = TOB_IT_COLORS[idx % TOB_IT_COLORS.length];
      const points = [];
      const labels = [];
      for(let mn = 1; mn <= tobNumMicroOf(a.rutina); mn++){
        const ses = it.sesiones[mn]?.[entId];
        if(!ses) continue;
        const series = ses.ejs?.[ej.id]?.series;
        if(!series || !series.length) continue;
        const volume = series.reduce((sum, sr) => sum + (sr.kg||0) * (sr.reps||0), 0);
        if(volume <= 0) continue;
        points.push(volume);
        labels.push(ses.fecha || `µ${mn}`);
      }
      if(!points.length) return;
      datasets.push({
        label: 'It. ' + it.numero,
        data: points,
        _labels: labels,
        borderColor: color, borderWidth: 2.5,
        // Relleno en degradado igual que mediciones.
        backgroundColor: (c) => {
          const ch = c.chart, area = ch.chartArea;
          if(!area) return color + '22';
          const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, color + '55');
          g.addColorStop(1, color + '08');
          return g;
        },
        pointBackgroundColor: '#13130f',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        tension: 0.3, fill: true, spanGaps: true
      });
    });

    // Combinar todas las labels en una secuencia única (ordenadas por fecha si posible)
    const allLabels = new Set();
    datasets.forEach(ds => ds._labels.forEach(l => allLabels.add(l)));
    let labels = [...allLabels];
    // Si parecen fechas YYYY-MM-DD, ordenar como fechas; si no, dejar como están
    if(labels.every(l => /^\d{4}-\d{2}-\d{2}/.test(l))){
      labels.sort();
      labels = labels.map(l => l.split('-').reverse().join('/'));
    }

    // Re-alinear cada dataset a esos labels (con null para huecos)
    datasets.forEach(ds => {
      const map = {};
      ds._labels.forEach((l, i) => {
        const key = /^\d{4}-\d{2}-\d{2}/.test(l) ? l.split('-').reverse().join('/') : l;
        map[key] = ds.data[i];
      });
      ds.data = labels.map(l => map[l] != null ? map[l] : null);
      delete ds._labels;
    });

    if(!datasets.length){
      canvas.getContext('2d').fillStyle = '#5a5240';
      canvas.getContext('2d').font = '12px DM Mono';
      canvas.getContext('2d').textAlign = 'center';
      canvas.getContext('2d').fillText('Sin datos aún', canvas.width/2, canvas.height/2);
      return;
    }

    tobCharts[ej.id] = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 20, right: 14, left: 4, bottom: 2 } },
        plugins: {
          legend: { labels: { color:'#cbd5e1', font:{size:10}, boxWidth:12 }, position:'top', align:'end' },
          tooltip: { mode:'index', intersect:false },
          datalabels: {
            color: ctx => ctx.dataset.borderColor,
            font: { size: 9, weight:'600' },
            align: 'top',
            offset: 6,
            formatter: v => v == null ? '' : v
          }
        },
        scales: {
          x: { ticks:{ color:'#7a96b8', font:{size:9}, maxRotation:60, minRotation:45 },
               grid:{ color:'#1e1810' } },
          y: { ticks:{ color:'#7a96b8', font:{size:9} },
               grid:{ color:'#1e1810' }, beginAtZero:true }
        },
        interaction: { mode:'nearest', intersect:false }
      }
    });
  });
}

// ═══ PDF (igual que antes, simplificado) ═══
async function tobGeneratePdf(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const form = doc.getForm();

  const W = 842, H = 595; // landscape
  let page = doc.addPage([W,H]);
  let y = H - 30;
  const MX = 24;

  function text(t, opts){
    page.drawText(t, { x: opts?.x||MX, y, size: opts?.size||9, font: opts?.bold?fontB:font, color: opts?.color||rgb(0.1,0.1,0.1) });
  }
  function gap(n){ y -= n; if(y < 60){ page = doc.addPage([W,H]); y = H - 30; } }

  const L = tobLangOf(cli);
  text(tobPdfSafe(`${cli?.nombre||''} — ${tobRutinaShortName(pl)}  ·  ${tobT('cover.iteracion', L, { numero: it?.numero||1 })}`), { bold:true, size:13 });
  gap(20);

  const microHeaders = Array.from({length: tobNumMicroOf(a?.rutina)}, (_,i)=>i+1);

  (a.rutina?.entrenos||[]).forEach(en => {
    if(y < 200){ page = doc.addPage([W,H]); y = H - 30; }
    text(tobT('it.entreno', L, { letra: en.letra }), { bold:true, size:11, color: rgb(0.96,0.65,0.13) });
    gap(15);

    // Fila fechas
    text(tobT('it.label.fecha', L), { size: 8 });
    microHeaders.forEach((mn, i) => {
      const x = MX + 80 + i*120;
      const tf = form.createTextField(`fecha_${mn}_${en.id}`);
      const ses = it?.sesiones[mn]?.[en.id];
      if(ses?.fecha) tf.setText(ses.fecha);
      tf.addToPage(page, { x, y: y-3, width: 100, height: 12, borderColor: rgb(0.6,0.6,0.6), borderWidth: 0.5 });
    });
    gap(20);

    (en.ejercicios||[]).sort((a,b)=>(a.orden||0)-(b.orden||0)).forEach(ej => {
      if(y < 100){ page = doc.addPage([W,H]); y = H - 30; }
      text(tobPdfSafe(ej.nombre + (ej.subtitle ? ' — ' + ej.subtitle : '')), { bold:true, size:9 });
      gap(13);
      // Plan
      text(tobT('it.label.plan', L), { size: 7, color: rgb(0.4,0.4,0.4) });
      microHeaders.forEach((mn, i) => {
        const x = MX + 80 + i*120;
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawText(`${plan.series}×${reps}`, { x, y, size: 8, font, color: rgb(0.4,0.4,0.4) });
      });
      gap(12);

      const isCirc = ej.tipo === 'circuito';
      const linesN = isCirc ? (ej.circuitoLineas?.length || 3) : Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series));
      const arrName = isCirc ? 'lineas' : 'series';

      for(let s=0; s<linesN; s++){
        if(y < 30){ page = doc.addPage([W,H]); y = H - 30; }
        const lbl = isCirc
          ? (ej.circuitoLineas?.[s] || tobT('it.ej.circuito_linea', L, { n: s+1 }))
          : tobT('it.ej.serie', L, { n: s+1 });
        page.drawText(lbl, { x: MX, y, size: 8, font, color: rgb(0.3,0.3,0.3) });
        microHeaders.forEach((mn, i) => {
          // Solo dibujamos el cuadro si este microciclo TIENE esta serie en
          // su plan. Para circuitos los microciclos comparten líneas → siempre.
          if(!isCirc){
            const planMn = tobPlanFor(ej, mn);
            if(s >= (planMn?.series || 0)) return;
          }
          const x = MX + 80 + i*120;
          const ses = it?.sesiones[mn]?.[en.id];
          const sr = ses?.ejs?.[ej.id]?.[arrName]?.[s];
          const kgF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_kg`);
          const rpF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_reps`);
          if(sr?.kg != null) kgF.setText(String(sr.kg));
          if(sr?.reps != null) rpF.setText(String(sr.reps));
          kgF.addToPage(page, { x, y: y-3, width: 48, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
          rpF.addToPage(page, { x: x+50, y: y-3, width: 48, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
        });
        gap(14);
      }
      gap(6);
    });

    // Aeróbica
    ['tipo','tiempo','intensidad'].forEach(field => {
      if(y < 30){ page = doc.addPage([W,H]); y = H - 30; }
      const lblMap = {
        tipo:       tobT('it.aer.tipo', L),
        tiempo:     tobT('it.aer.tiempo', L),
        intensidad: tobT('it.aer.intensidad', L)
      };
      text(lblMap[field], { size:7, color: rgb(0.4,0.4,0.4) });
      microHeaders.forEach((mn, i) => {
        const x = MX + 80 + i*120;
        const tf = form.createTextField(`aer_${mn}_${en.id}_${field}`);
        const ses = it?.sesiones[mn]?.[en.id];
        if(ses?.aerobica?.[field]) tf.setText(ses.aerobica[field]);
        tf.addToPage(page, { x, y: y-3, width: 100, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
      });
      gap(13);
    });
    gap(20);
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a2 = document.createElement('a');
  a2.href = url;
  a2.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${tobRutinaShortName(pl).replace(/[^a-zA-Z0-9]/g,'_')}_it${it?.numero}.pdf`;
  a2.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF descargado', 'green');
}

function tobHandlePdfDrop(ev){ const f=ev.dataTransfer.files[0]; if(f) tobReadPdfFile(f); }
function tobHandlePdfFile(ev){ const f=ev.target.files[0]; if(f) tobReadPdfFile(f); }

async function tobReadPdfFile(file){
  const a = tobAsig(); if(!a){ tobToast('Abre una rutina antes', 'red'); return; }
  const it = tobIt(); if(!it){ tobToast('Sin iteración activa', 'red'); return; }
  const status = document.getElementById('tobPdfStatus');
  status.textContent = '⏳ Leyendo ' + file.name + '...';
  try {
    const buf = await file.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(buf);
    const form = doc.getForm();
    const fields = form.getFields();
    let n = 0, m = 0;
    fields.forEach(f => {
      const name = f.getName();
      let val = '';
      try { val = f.getText ? f.getText() : ''; } catch(e){}
      if(!val) return;

      // fecha_<microNum>_<entId>
      let parts = name.match(/^fecha_(\d+)_(\w+)$/);
      if(parts){
        const [, microNum, entId] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        s.fecha = val; m++; return;
      }
      // aer_<microNum>_<entId>_<field>
      parts = name.match(/^aer_(\d+)_(\w+)_(\w+)$/);
      if(parts){
        const [, microNum, entId, field] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        s.aerobica[field] = val; m++; return;
      }
      // ej_<ejId>_<microNum>_<entId>_<series|lineas>_<idx>_<kg|reps>
      parts = name.match(/^ej_(.+?)_(\d+)_(\w+?)_(series|lineas)_(\d+)_(kg|reps)$/);
      if(parts){
        const [, ejId, microNum, entId, arrName, idx, field] = parts;
        const s = tobGetSesionIt(it, parseInt(microNum), entId);
        if(!s.ejs[ejId]) s.ejs[ejId] = {};
        if(!s.ejs[ejId][arrName]) s.ejs[ejId][arrName] = [];
        const i = parseInt(idx);
        while(s.ejs[ejId][arrName].length <= i) s.ejs[ejId][arrName].push({kg:null,reps:null});
        const v = parseFloat(val);
        if(!isNaN(v)) s.ejs[ejId][arrName][i][field] = v;
        n++;
      }
    });
    tobSave();
    status.innerHTML = `<span style="color:var(--green);">✓ ${n} valores + ${m} metadatos importados de "${tobEsc(file.name)}"</span>`;
    tobRenderEntreno();
    tobRenderCharts();
    tobToast(`✓ ${n} valores importados`, 'green');
  } catch(e){
    console.error(e);
    status.innerHTML = `<span style="color:var(--red);">✕ Error: ${tobEsc(e.message)}</span>`;
    tobToast('Error', 'red');
  }
}

function tobGetSesionIt(it, microNum, entId){
  if(!it.sesiones[microNum]) it.sesiones[microNum] = {};
  if(!it.sesiones[microNum][entId]){
    it.sesiones[microNum][entId] = { fecha:'', aerobica:{tipo:'',tiempo:'',intensidad:''}, ejs:{} };
  }
  return it.sesiones[microNum][entId];
}

// ═══ EDITAR rutina (la copia editable del cliente) ═══
function tobOpenEditPlantilla(){
  const a = tobAsig(); if(!a) return;
  // Hacemos modal de edición usando el mismo modal de plantilla pero con identificador especial
  // que indica que es rutina del cliente, no plantilla maestra
  const fakeP = { nombre: 'Rutina (editable solo para este cliente)', categoria: '—', sexo: '—', entrenos: a.rutina.entrenos };
  document.getElementById('tobPlantillaModalTitle').textContent = 'Editar ejercicios de esta rutina';
  document.getElementById('tobPlNombre').value = fakeP.nombre;
  document.getElementById('tobPlNombre').disabled = true;
  document.getElementById('tobPlCategoria').disabled = true;
  document.getElementById('tobPlSexo').disabled = true;
  document.getElementById('tobPlDef').value = tobPlantillaToText(fakeP);
  document.getElementById('tobPlantillaModalBg').dataset.editId = '__asig__';
  document.getElementById('tobPlantillaModalBg').classList.add('on');
}

// Hook tobSavePlantilla para detectar el caso __asig__
const _origSavePl = tobSavePlantilla;
tobSavePlantilla = function(){
  const editId = document.getElementById('tobPlantillaModalBg').dataset.editId;
  if(editId === '__asig__'){
    const a = tobAsig(); if(!a){ tobClosePlantillaModal(); return; }
    const parsed = tobParsePlantillaDef(document.getElementById('tobPlDef').value);
    if(!parsed.length){ tobToast('Sin ejercicios', 'red'); return; }
    // CRÍTICO: preservar IDs existentes de ejercicios (match por entreno+nombre)
    // para no romper las sesiones registradas que usan ej.id.
    const oldMap = {};   // 'A:NOMBRE' → id
    (a.rutina?.entrenos||[]).forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        oldMap[en.letra + ':' + ej.nombre] = ej.id;
      });
    });
    parsed.forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        const key = en.letra + ':' + ej.nombre;
        if(oldMap[key]) ej.id = oldMap[key];   // reusar ID antiguo
      });
    });
    a.rutina.entrenos = parsed;
    if(!parsed.find(e => e.id === tobCurrentEntrenoId)) tobCurrentEntrenoId = parsed[0].id;
    document.getElementById('tobPlNombre').disabled = false;
    document.getElementById('tobPlCategoria').disabled = false;
    document.getElementById('tobPlSexo').disabled = false;
    tobSave();
    tobClosePlantillaModal();
    tobRenderEntTabs(); tobRenderEntreno(); tobRenderCharts();
    tobToast('✓ Rutina actualizada (datos previos conservados)', 'green');
    return;
  }
  _origSavePl();
};

const _origClosePl = tobClosePlantillaModal;
tobClosePlantillaModal = function(){
  document.getElementById('tobPlNombre').disabled = false;
  document.getElementById('tobPlCategoria').disabled = false;
  document.getElementById('tobPlSexo').disabled = false;
  _origClosePl();
};

// ═══ EXPORT/IMPORT ═══
function tobExport(){
  const blob = new Blob([JSON.stringify(tobDB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `consulta_${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  tobToast('✓ Exportado', 'green');
}

function tobImport(ev){
  const f = ev.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = function(){
    try {
      const d = JSON.parse(r.result);
      if(!d.clientes || !d.plantillas){ tobToast('JSON inválido', 'red'); return; }
      tobConfirm('Reemplazar datos?', 'Sobrescribe todo. No se puede deshacer.', () => {
        tobDB = d; tobSave();
        tobRenderClientes(); tobRenderPlantillas();
        tobToast('✓ Importado', 'green');
      });
    } catch(e){ tobToast('Error parseando', 'red'); }
  };
  r.readAsText(f);
}

// ── Paste-import: pega JSON con datos de UN cliente (mediciones + asignaciones) ──
// Formato esperado:
// {
//   "cliente": "Carlos Ferri",                 // nombre (busca por includes) o id
//   "mediciones": [{fecha,pes,estatura,plecs,perimetres,notas?}, ...],
//   "asignaciones": [{
//     "plantilla": "Reacondicionamiento — Hombre",  // nombre de plantilla
//     "fechaInicio": "2026-04-27",
//     "notas": "...",
//     "sesiones": {
//       "1": { "A": { fecha, ejs:{ "BOX SQUAT":{series:[{kg,reps}]},
//                                  "CURL + HIPEREXT + CALF":{lineas:[{kg,reps}]} } },
//              "B": {...} }, ...
//     }
//   }]
// }
function tobOpenPasteImport(){
  document.getElementById('tobPasteImportTxt').value = '';
  document.getElementById('tobPasteImportInfo').textContent = '';
  document.getElementById('tobPasteImportBg').classList.add('on');
}
function tobClosePasteImport(){
  document.getElementById('tobPasteImportBg').classList.remove('on');
}
function tobRunPasteImport(){
  const txt = document.getElementById('tobPasteImportTxt').value.trim();
  const info = document.getElementById('tobPasteImportInfo');
  if(!txt){ info.textContent = 'Pega un JSON primero.'; info.style.color = 'var(--red)'; return; }
  let data;
  try { data = JSON.parse(txt); }
  catch(e){ info.textContent = 'JSON inválido: ' + e.message; info.style.color = 'var(--red)'; return; }
  if(!data.cliente){ info.textContent = 'Falta campo "cliente".'; info.style.color = 'var(--red)'; return; }

  // Buscar cliente (por id exacto o nombre includes case-insensitive)
  const needle = String(data.cliente).toLowerCase();
  const cli = tobDB.clientes.find(c => c.id === data.cliente)
           || tobDB.clientes.find(c => (c.nombre||'').toLowerCase() === needle)
           || tobDB.clientes.find(c => (c.nombre||'').toLowerCase().includes(needle));
  if(!cli){
    info.innerHTML = 'No encontré cliente "<b>'+data.cliente+'</b>". Créalo primero.<br>Clientes existentes: '
      + tobDB.clientes.map(c=>c.nombre).join(', ');
    info.style.color = 'var(--red)';
    return;
  }

  // ── Meta del cliente (nacimiento / edad / sexo) ──
  // sexo acepta 'H'/'M'/'U' o strings comunes (Hombre/Home, Mujer/Dona, etc.)
  const metaUpdates = [];
  if(data.nacimiento && /^\d{4}-\d{2}-\d{2}$/.test(data.nacimiento)){
    cli.nacimiento = data.nacimiento;
    delete cli.edad; delete cli.edadFecha;
    metaUpdates.push('nacimiento ' + data.nacimiento);
  } else if(data.edad != null && data.edadFecha){
    cli.edad = +data.edad;
    cli.edadFecha = data.edadFecha;
    delete cli.nacimiento;
    metaUpdates.push('edad ' + data.edad);
  }
  if(data.sexo){
    const s = String(data.sexo).toLowerCase().trim();
    let sx = null;
    if(/^h$|hombre|home|man|male|masc/.test(s)) sx = 'H';
    else if(/^m$|mujer|dona|woman|female|fem/.test(s)) sx = 'M';
    else if(/^u$|unisex|unknown/.test(s)) sx = 'U';
    if(sx){ cli.sexo = sx; metaUpdates.push('sexo ' + sx); }
  }
  if(data.estatura){ cli.estatura = +data.estatura; metaUpdates.push('estatura ' + data.estatura); }

  // ── Mediciones (skip duplicados por fecha) ──
  const medsIn = Array.isArray(data.mediciones) ? data.mediciones : [];
  if(!cli.mediciones) cli.mediciones = [];
  const existing = new Set(cli.mediciones.map(m => m.fecha));
  const medsToAdd = medsIn.filter(m => m && m.fecha && !existing.has(m.fecha));

  // ── Asignaciones ──
  const asigsIn = Array.isArray(data.asignaciones) ? data.asignaciones : [];
  const asigsResolved = []; // [{pl, sesiones, ...}, ...] preparadas para insertar
  const asigsErrors = [];
  for(const ai of asigsIn){
    const pl = tobDB.plantillas.find(p => p.id === ai.plantilla)
            || tobDB.plantillas.find(p => p.nombre === ai.plantilla)
            || tobDB.plantillas.find(p => (p.nombre||'').toLowerCase().includes(String(ai.plantilla||'').toLowerCase()));
    if(!pl){ asigsErrors.push('Plantilla no encontrada: '+ai.plantilla); continue; }
    // Mapa nombre ejercicio → id (por entreno+letra)
    const ids = {};
    pl.entrenos.forEach(en => en.ejercicios.forEach(ej => {
      ids[en.letra + ':' + ej.nombre] = ej.id;
      // También mapeo solo por nombre (por si el JSON no indica letra)
      ids[ej.nombre] = ids[ej.nombre] || ej.id;
    }));
    asigsResolved.push({ai, pl, ids});
  }

  if(!medsToAdd.length && !asigsResolved.length && !metaUpdates.length){
    info.innerHTML = 'Nada que importar.'
      + (asigsErrors.length ? '<br>'+asigsErrors.join('<br>') : '');
    info.style.color = 'var(--amber)';
    return;
  }

  // Resumen + confirmación
  const summaryLines = ['Cliente: ' + cli.nombre];
  if(metaUpdates.length) summaryLines.push('Meta: ' + metaUpdates.join(', '));
  if(medsIn.length) summaryLines.push(medsToAdd.length + ' mediciones a añadir' + (medsIn.length - medsToAdd.length > 0 ? ' (' + (medsIn.length - medsToAdd.length) + ' duplicadas, ignoradas)' : ''));
  if(asigsIn.length) summaryLines.push(asigsResolved.length + ' asignaciones a crear' + (asigsErrors.length ? ' (' + asigsErrors.length + ' con plantilla no encontrada)' : ''));
  if(!confirm('¿Importar lo siguiente?\n\n' + summaryLines.join('\n'))) return;

  // Aplicar mediciones
  for(const m of medsToAdd){
    cli.mediciones.push(Object.assign({}, m, { id: tobUid('med') }));
  }
  cli.mediciones.sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));

  // Aplicar asignaciones
  // Soporta dos formatos:
  //   · Simple:  { plantilla, fechaInicio, notas, sesiones: {1:{A,B},...} }       → 1 iteración
  //   · Extenso: { plantilla, fechaInicio, notas, iteraciones: [ {numero, fechaInicio?, sesiones}, ... ] }
  if(!cli.asignaciones) cli.asignaciones = [];
  const _fillIt = (it, sesionesIn, ids) => {
    for(const mn of Object.keys(sesionesIn || {})){
      const microNum = parseInt(mn, 10);
      if(!microNum) continue;
      const entrenosIn = sesionesIn[mn] || {};
      it.sesiones[microNum] = it.sesiones[microNum] || {};
      for(const letra of Object.keys(entrenosIn)){
        const ses = entrenosIn[letra] || {};
        const ejs = {};
        const ejsIn = ses.ejs || {};
        for(const ejNombre of Object.keys(ejsIn)){
          const ejId = ids[letra + ':' + ejNombre] || ids[ejNombre];
          if(!ejId){ console.warn('[paste-import] ejercicio no mapeado:', letra, ejNombre); continue; }
          ejs[ejId] = ejsIn[ejNombre];
        }
        it.sesiones[microNum][letra] = {
          fecha: ses.fecha || '',
          aerobica: ses.aerobica || { tipo:'', tiempo:'', intensidad:'' },
          ejs
        };
      }
    }
  };
  for(const {ai, pl, ids} of asigsResolved){
    const asig = tobCreateAsignacion(pl.id);
    if(ai.fechaInicio) asig.fechaInicio = ai.fechaInicio;
    if(ai.notas) asig.notas = ai.notas;
    const itsIn = Array.isArray(ai.iteraciones)
      ? ai.iteraciones
      : [{ numero: 1, sesiones: ai.sesiones || {} }];
    asig.iteraciones = [];
    itsIn.forEach((itIn, i) => {
      const it = { id: tobUid('it'), numero: itIn.numero || (i+1), sesiones: {} };
      _fillIt(it, itIn.sesiones, ids);
      asig.iteraciones.push(it);
    });
    cli.asignaciones.push(asig);
  }

  tobSave();
  tobClosePasteImport();
  if(typeof tobRenderClientes === 'function') tobRenderClientes();
  if(typeof tobRenderFicha === 'function' && tobCurrentFichaId === cli.id) tobRenderFicha();
  const toastParts = [];
  if(metaUpdates.length) toastParts.push(metaUpdates.length + ' meta');
  if(medsToAdd.length) toastParts.push(medsToAdd.length + ' med');
  if(asigsResolved.length) toastParts.push(asigsResolved.length + ' rutinas');
  tobToast('✓ ' + cli.nombre + ': ' + toastParts.join(' · '), 'green');
}

// ═══ CONFIRM ═══
function tobConfirm(title, msg, cb){
  document.getElementById('tobConfirmTitle').textContent = title;
  document.getElementById('tobConfirmMsg').textContent = msg;
  const ok = document.getElementById('tobConfirmOk');
  ok.textContent = 'Aceptar'; ok.classList.add('danger');
  ok.onclick = function(){ tobCloseConfirm(); cb(); };
  document.getElementById('tobConfirmBg').classList.add('on');
}
function tobCloseConfirm(){ document.getElementById('tobConfirmBg').classList.remove('on'); }

// ═══ SEED PLANTILLAS — 16 mesociclos con estructura BIIO real ═══
// ═════════════════════════════════════════════════════════════════
// BIIO MODIFICADO — DATA TRANSCRITA DE LOS PDFs ORIGINALES
// 1º Macrociclo / Roberto Amorosi Hernandez
// ═════════════════════════════════════════════════════════════════
// Cada categoría define su numMicro (3-7), su lista de entrenos (A+B o
// A+B+C, +MX para Fuerza 2) y por cada ejercicio sus planByMicro reales.
// Para reducir repetición, definimos plans compartidos por categoría.
const TOB_BIIO_DATA = (() => {
  // Helpers para hacer plans con menos repetición
  const mk = (s, r, p, n) => ({ series: s, repsTarget: Array.isArray(r)?r:[r], pausa: p, ...(n ? { note: n } : {}) });
  const repeat = (obj, count) => {
    const out = {};
    for(let i = 1; i <= count; i++) out[i] = obj;
    return out;
  };
  // ─── 1º Reacondicionamiento (6 micros × A+B) ──
  const rea_main = {
    1: mk(3,[15,12,10],"1'30''"), 2: mk(3,[15,12,10],"1'30''"),
    3: mk(3,[12,10,8], "1'45''"), 4: mk(3,[12,10,8], "1'45''"),
    5: mk(3,[10,8,6],  "2'00''"), 6: mk(3,[10,8,6],  "2'00''")
  };
  const rea_jump = {
    1: mk(2,12,'30"'),
    2: mk(3,12,'30"'), 3: mk(3,12,'30"'), 4: mk(3,12,'30"'), 5: mk(3,12,'30"'), 6: mk(3,12,'30"')
  };

  // ─── 2º Preparación Fuerza (3 micros × A+B+C) ──
  // Bloque 1 = micro 1, Bloque 2 = micro 2, Descarga técnica = micro 3
  const pf_main = {
    1: mk(3,[8,6,4],"2'00''","RPE 10 al fallo"),
    2: mk(3,[8,6,4],"2'30''","RPE 10 al fallo"),
    3: mk(8,3,"1'00''","@8RM · descarga técnica")
  };
  const pf_support = {
    1: mk(3,10,"2'00''"), 2: mk(3,8,"2'00''"), 3: mk(2,6,"3'00''")
  };
  const pf_box_squat = {
    1: mk(6,2,"1'00''","@8RM · Pausa 2\" intraserie"),
    2: mk(6,2,"1'00''","@8RM · Pausa 2\" intraserie"),
    3: mk(1,'MAX','-',"@8RM · Sin Pausa")
  };
  const pf_dead = {
    1: mk(4,[8,6,4,2],"2'00''","RPE 10 al fallo"),
    2: mk(4,[8,6,4,2],"2'30''","RPE 10 al fallo"),
    3: mk(8,3,"1'00''","@8RM · descarga técnica")
  };
  const pf_jump_calf = { 1: mk(3,20,"1'00\""), 2: mk(4,20,'45"'), 3: mk(2,20,'30"') };
  const pf_jump_hip  = { 1: mk(3,12,"1'00\""), 2: mk(4,12,'45"'), 3: mk(2,12,'30"') };
  const pf_jump_c    = { 1: mk(3,12,'45"'),    2: mk(4,12,'30"'), 3: mk(2,12,'15"') };

  // ─── 3º Especialización Técnica (7 micros × A+B) ──
  // ONDAS 345 BUFFER: 8×3@75% → 7×4@75% → 6×5@75% → 8×3@80% → 7×4@80% → 6×5@80% → 8×2@85% descarga
  const esp_main = {
    1: mk(8,3,"1'00''","@75% ondas 345"),
    2: mk(7,4,"1'15''","@75% ondas 345"),
    3: mk(6,5,"1'30''","@75% ondas 345"),
    4: mk(8,3,"1'00''","@80% ondas 345"),
    5: mk(7,4,"1'15''","@80% ondas 345"),
    6: mk(6,5,"1'30''","@80% ondas 345"),
    7: mk(8,2,"1'30''","@85% descarga técnica")
  };
  const esp_jump_a = {  // REMO BARRA "T" + FONDOS TRICEPS — ondas 4x8 / 3x10 alternadas
    1: mk(4,8,'45"'), 2: mk(3,10,'45"'),
    3: mk(4,8,'45"'), 4: mk(3,10,'45"'),
    5: mk(4,8,'45"'), 6: mk(3,10,'45"'),
    7: mk(2,12,'60"')
  };
  const esp_triserie = {  // CALF + PRENSA 45 + CURL — triserie 3×20/10/8 descendente
    1: mk(3,[20,10,8],'30"'), 2: mk(3,[20,10,8],'30"'),
    3: mk(3,[20,10,8],'30"'), 4: mk(3,[20,10,8],'30"'),
    5: mk(3,[20,10,8],'30"'), 6: mk(3,[20,10,8],'30"'),
    7: mk(1,[20,10,10],'30"')
  };
  const esp_jump_b = {  // PRESS FRANCES + DOMINADAS / CRUNCH + GLUTE HAM
    1: mk(3,20,'45"'), 2: mk(3,20,'45"'),
    3: mk(3,20,'45"'), 4: mk(3,20,'45"'),
    5: mk(3,20,'45"'), 6: mk(3,20,'45"'),
    7: mk(1,20,'60"')
  };

  // ─── 4º Fuerza 1 (5 micros × A+B) ──
  const f1_main = {
    1: mk(4,4,"3'00''","@80% RPE 7/8"),
    2: mk(4,4,"3'00''","@82.5% RPE 8/9"),
    3: mk(4,4,"3'00''","@85% RPE 9/10"),
    4: mk(4,4,"3'00''","@87.5% RPE 10"),
    5: mk(8,3,"1'00''","@75% descarga técnica")
  };
  const f1_triserie = {
    1: mk(3,12,'30"'), 2: mk(3,12,'30"'), 3: mk(3,12,'30"'),
    4: mk(2,12,'30"'), 5: mk(1,12,'30"')
  };

  // ─── 5º Fuerza 2 (4 micros × A+B+C + entreno MX) ──
  // Cluster: 8 reps simples con rest-pause 15"/20"/25", descarga 10×1 @95%
  const f2_main = {
    1: mk(3,8,"4'00''","@87.5% cluster RP 15\""),
    2: mk(3,8,"4'00''","@90% cluster RP 20\""),
    3: mk(2,8,"4'00''","@92.5% cluster RP 25\""),
    4: mk(10,1,"2'00''","@95% Normal · descarga técnica")
  };
  const f2_estrecho = {
    1: mk(3,8,"4'00''","@85% cluster RP 15\""),
    2: mk(3,8,"4'00''","@87.5% cluster RP 20\""),
    3: mk(2,8,"4'00''","@90% cluster RP 25\""),
    4: mk(10,1,"2'00''","@92.5% Normal · descarga")
  };
  const f2_accesorio = {
    1: mk(5,8,'30"',"RPE 8"),
    2: mk(5,8,'30"',"RPE 9"),
    3: mk(4,8,'30"',"RPE 10"),
    4: mk(2,'MAX','60"',"al fallo")
  };
  const f2_calf_box = {
    1: mk(5,12,'30"',"12RM · 4 @70%"),
    2: mk(5,12,'30"',"12RM · 4 @70%"),
    3: mk(4,12,'30"',"12RM · 4 @70%"),
    4: mk(2,12,'60"',"12RM · 5 @70%")
  };
  const f2_max = repeat(mk(1,1,"5'00''","Intento máximo (1RM)"), 4);

  // ─── 6º Híbrido (3 micros × A+B+C) ──
  const hib_main = {
    1: mk(3,[4,6,8],"2'00''","85/75/65% 1RM + DROP al fallo"),
    2: mk(3,[4,6,8],"2'00''","+1% si reps target alcanzadas + DROP"),
    3: mk(2,[4,6,8],"2'30''","descarga parcial")
  };
  const hib_sec = {
    1: mk(3,8,"2'00''","última serie DROP"),
    2: mk(2,8,"2'00''","última serie DROP"),
    3: mk(1,8,"2'30''")
  };
  const hib_dead = {
    1: mk(3,[4,6,20],"2'00''","85/75/55% 1RM + Rest-Pause final"),
    2: mk(2,20,"3'00''","@70% Rest-Pause 20 reps"),
    3: mk(8,3,"1'00''","@75% descarga")
  };
  const hib_apert = {
    1: mk(3,10,"1'30''"), 2: mk(2,10,"1'30''"), 3: mk(1,12,"1'30''")
  };
  const hib_jump_a = { 1: mk(3,25,'30"'), 2: mk(3,25,'30"'), 3: mk(2,25,'30"') };
  const hib_jump_b = { 1: mk(3,[20,12],'30"'), 2: mk(3,[20,12],'30"'), 3: mk(2,[20,15],'30"') };
  const hib_jump_c = { 1: mk(3,['MAX',15],'30"'), 2: mk(3,['MAX',15],'30"'), 3: mk(2,['MAX',15],'30"') };

  // ─── 7º Hipertrofia (3 micros × A+B+C) ──
  const hip_squat = {
    1: mk(2,20,"3'00''","@70% Rest-Pause 20 reps"),
    2: mk(3,[8,6,4],"2'00''","@75% 1RM al fallo + RP 20\""),
    3: mk(1,20,"2'00''","@70% Rest-Pause descarga")
  };
  const hip_main = {
    1: mk(3,[8,6,4],"2'00''","@75% 1RM al fallo + RP 20\""),
    2: mk(3,[8,6,4],"2'00''","+1% si reps target alcanzadas"),
    3: mk(2,8,"2'00''","descarga parcial")
  };
  const hip_dead = {
    1: mk(3,[8,6,4],"2'00''","@75% 1RM al fallo + RP 20\""),
    2: mk(3,[8,6,20],"2'00''","+ Rest-Pause final"),
    3: mk(8,3,"1'00''","@75% descarga parcial")
  };
  const hip_burns = {
    1: mk(2,10,"2'00''","última serie BURNS"),
    2: mk(3,10,"2'00''","última serie BURNS"),
    3: mk(1,12,"2'00''")
  };
  const hip_apert = {
    1: mk(3,10,"1'30''"), 2: mk(2,10,"1'30''"), 3: mk(1,10,"1'30''")
  };
  const hip_lat_burns = {
    1: mk(4,10,'30"',"unilateral · BURNS"),
    2: mk(3,10,'30"',"unilateral · BURNS"),
    3: mk(2,12,'30"',"unilateral")
  };
  const hip_jump_a = { 1: mk(3,15,'30"'), 2: mk(3,15,'30"'), 3: mk(2,15,'30"') };
  const hip_jump_b = { 1: mk(3,[20,12],'30"'), 2: mk(3,[20,12],'30"'), 3: mk(2,[20,15],'30"') };
  const hip_chop   = { 1: mk(3,[20,30],'30"'), 2: mk(3,[20,30],'30"'), 3: mk(1,[20,30],'30"') };

  // ─── 8º Calidad Muscular (6 micros × A+B+C) ──
  const cm_main = {
    1: mk(8,2,"1'00''","@75% tempo 3232"),
    2: mk(8,3,"1'00''","@75% tempo 3232"),
    3: mk(8,3,"1'00''","@75% tempo 3232"),
    4: mk(8,2,"1'00''","@77.5% tempo 3232"),
    5: mk(8,3,"1'00''","@77.5% tempo 3232"),
    6: mk(8,3,"1'00''","@77.5% tempo 3232")
  };
  const cm_pump = repeat(mk(3,'MAX',"1'30''","MAX PUMP 10-12"), 6);
  const cm_calf_strip = {
    1: mk(3,'Stripping','2\'00"',"2-3 stripping"),
    2: mk(3,'Stripping','2\'00"',"2-3 stripping"),
    3: mk(2,'Stripping','2\'00"',"1-2 stripping"),
    4: mk(3,'Stripping','2\'00"',"2-3 stripping"),
    5: mk(3,'Stripping','2\'00"',"2-3 stripping"),
    6: mk(2,'Stripping','2\'00"',"1-2 stripping")
  };
  const cm_crunch = repeat(mk(3,15,"1'30''"), 6);

  // ─────────── DATOS DE LAS 8 CATEGORÍAS ───────────
  return {
    'Reacondicionamiento': {
      numMicro: 6,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Simil Full Body 1', ejercicios:[
          { nombre:'BOX SQUAT', subtitle:'1" Pausa en Box', tipo:'normal', planByMicro: rea_main },
          { nombre:'PRESS BANCA', subtitle:'1" Pausa al Pecho', tipo:'normal', planByMicro: rea_main },
          { nombre:'REMO', subtitle:'Espalda Recta · o Seal Row', tipo:'normal', planByMicro: rea_main },
          { nombre:'CURL + HIPEREXT + CALF', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CURL con BARRA','HIPEREXTENSION','CALF MACHINE'], planByMicro: rea_jump }
        ]},
        { letra:'B', nombre:'Entreno B · Simil Full Body 2', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Espalda Neutra', tipo:'normal', planByMicro: rea_main },
          { nombre:'PRESS MILITAR', subtitle:'Hasta las Clavículas', tipo:'normal', planByMicro: rea_main },
          { nombre:'DOMINADAS', subtitle:'Tocando el Pecho · o Lat Machine', tipo:'normal', planByMicro: rea_main },
          { nombre:'PRENSA + CRUNCH + FONDOS', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['PRENSA 45º','CRUNCH INVERSO','FONDOS TRICEPS'], planByMicro: rea_jump }
        ]}
      ]
    },
    'Preparación fuerza': {
      numMicro: 3,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Piernas-Hombros', ejercicios:[
          { nombre:'SQUAT', subtitle:'Control Espalda Baja', tipo:'normal', planByMicro: pf_main },
          { nombre:'LEG CURL', subtitle:'Lento y Controlado', tipo:'normal', planByMicro: pf_support },
          { nombre:'PRESS MILITAR', subtitle:'Hasta las Clavículas', tipo:'normal', planByMicro: pf_main },
          { nombre:'PRESS con MANCUERNAS', subtitle:'Recorrido Completo', tipo:'normal', planByMicro: pf_support },
          { nombre:'CALF + CRUNCH INVERSO', subtitle:'[JUMP SET]', tipo:'circuito',
            circuitoLineas:['CALF MACHINE','CRUNCH INVERSO'], planByMicro: pf_jump_calf }
        ]},
        { letra:'B', nombre:'Entreno B · Pecho-Tríceps', ejercicios:[
          { nombre:'PRESS BANCA', subtitle:'1" Pausa al Pecho', tipo:'normal', planByMicro: pf_main },
          { nombre:'PRESS INCLINADO 45º', subtitle:'Brazos en Plano Sagital', tipo:'normal', planByMicro: pf_support },
          { nombre:'PRESS TRICEPS o FONDOS', subtitle:'Codos cerrados', tipo:'normal', planByMicro: pf_main },
          { nombre:'BOX SQUAT', subtitle:'Controlar Butt Wink', tipo:'normal', planByMicro: pf_box_squat },
          { nombre:'HIPEREXT + CALF EN PRENSA', subtitle:'[JUMP SET]', tipo:'circuito',
            circuitoLineas:['HIPEREXTENSION 45º','CALF en PRENSA'], planByMicro: pf_jump_hip }
        ]},
        { letra:'C', nombre:'Entreno C · Espalda-Bíceps', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Espalda Neutra · No rebotar abajo · Concéntricas', tipo:'normal', planByMicro: pf_dead },
          { nombre:'DOMINADAS', subtitle:'Tocar el Pecho · o Lat Machine', tipo:'normal', planByMicro: pf_main },
          { nombre:'CURL con BARRA', subtitle:'Control Escápulas', tipo:'normal', planByMicro: pf_main },
          { nombre:'CRUNCH + LEG EXT + REMO', subtitle:'[JUMP SET]', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERTIDO','LEG EXTENSION','REMO o SEAL ROW'], planByMicro: pf_jump_c }
        ]}
      ]
    },
    'Especialización técnica': {
      numMicro: 7,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Posterior', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Concéntricas - Pausa 1" arriba/abajo', tipo:'normal', planByMicro: esp_main },
          { nombre:'PRESS MILITAR', subtitle:'Concéntricas - Pausa 1" arriba/abajo', tipo:'normal', planByMicro: esp_main },
          { nombre:'REMO + FONDOS', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['REMO BARRA "T" o MANCUERNA','FONDOS TRICEPS'], planByMicro: esp_jump_a },
          { nombre:'CALF + PRENSA + CURL', subtitle:'Triserie [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CALF MACHINE o PRENSA','PRENSA 45º o LUNGE','CURL con BARRA'], planByMicro: esp_triserie }
        ]},
        { letra:'B', nombre:'Entreno B · Anterior', ejercicios:[
          { nombre:'SQUAT', subtitle:'Concéntricas - Pausa 1" arriba/abajo', tipo:'normal', planByMicro: esp_main },
          { nombre:'PRESS BANCA', subtitle:'Concéntricas - Pausa 1" arriba/abajo', tipo:'normal', planByMicro: esp_main },
          { nombre:'PRESS FRANCES + DOMINADAS', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['PRESS FRANCES','DOMINADAS'], planByMicro: esp_jump_b },
          { nombre:'CRUNCH + GLUTE HAM', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERSO','GLUTE HAM RAISE o LEG CURL'], planByMicro: esp_jump_b }
        ]}
      ]
    },
    'Fuerza 1': {
      numMicro: 5,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Anterior', ejercicios:[
          { nombre:'SQUAT', subtitle:'Control Exc - Subir Explosivo', tipo:'normal', planByMicro: f1_main },
          { nombre:'PRESS BANCA', subtitle:'1" Pausa - Subida Explosiva', tipo:'normal', planByMicro: f1_main },
          { nombre:'REMO', subtitle:'Espalda neutra - Explosivo · o Seal Row', tipo:'normal', planByMicro: f1_main },
          { nombre:'CRUNCH + HIPEREXT + CURL', subtitle:'Triserie [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERSO','HIPEREXTENSION o LEG CURL','CURL CON BARRA'], planByMicro: f1_triserie }
        ]},
        { letra:'B', nombre:'Entreno B · Posterior', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Arrancadas - No rebote', tipo:'normal', planByMicro: f1_main },
          { nombre:'PRESS MILITAR SENTADO', subtitle:'Arrancadas - No rebote', tipo:'normal', planByMicro: f1_main },
          { nombre:'DOMINADAS SUPINAS', subtitle:'Explosivo Hasta Pecho', tipo:'normal', planByMicro: f1_main },
          { nombre:'PRENSA + CALF + FONDOS', subtitle:'Triserie [JUMP SET]', tipo:'circuito',
            circuitoLineas:['PRENSA 45º o LEG EXTENSION','CALF MACHINE o DONKEY','FONDOS TRICEPS'], planByMicro: f1_triserie }
        ]}
      ]
    },
    'Fuerza 2': {
      numMicro: 4,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Piernas-Pecho', ejercicios:[
          { nombre:'SQUAT', subtitle:'Control Exc - Subir Explosivo', tipo:'normal', planByMicro: f2_main },
          { nombre:'PRESS BANCA', subtitle:'1" Pausa - Subida Explosiva', tipo:'normal', planByMicro: f2_main },
          { nombre:'CURL + LEG EXT', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CURL con BARRA','LEG EXTENSION o PRENSA 45º'], planByMicro: f2_accesorio }
        ]},
        { letra:'B', nombre:'Entreno B · Espalda-Dorsal', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Arrancadas - No rebote', tipo:'normal', planByMicro: f2_main },
          { nombre:'DOMINADAS SUPINAS', subtitle:'Explosivo Hasta Pecho', tipo:'normal', planByMicro: f2_main },
          { nombre:'LEG CURL + CRUNCH', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['LEG CURL o GLUTE HAM RAISE','CRUNCH INVERTIDO'], planByMicro: f2_accesorio }
        ]},
        { letra:'C', nombre:'Entreno C · Hombros-Tríceps + Squat técnica', ejercicios:[
          { nombre:'PRESS MILITAR SENTADO', subtitle:'Arrancadas - No rebote', tipo:'normal', planByMicro: f2_main },
          { nombre:'PRESS AGARRE ESTRECHO', subtitle:'1" Pausa al pecho · o FONDOS TRICEPS', tipo:'normal', planByMicro: f2_estrecho },
          { nombre:'CALF + BOX SQUAT', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CALF en PRENSA','BOX SQUAT (2" pausa)'], planByMicro: f2_calf_box }
        ]},
        { letra:'MX', nombre:'Maximales · 2 sesiones aparte de la rutina', ejercicios:[
          { nombre:'SQUAT', subtitle:'Maximal (1ª sesión)', tipo:'normal', planByMicro: f2_max },
          { nombre:'PRESS MILITAR SENTADO', subtitle:'Maximal (1ª sesión)', tipo:'normal', planByMicro: f2_max },
          { nombre:'PRESS AGARRE ESTRECHO', subtitle:'Maximal (1ª sesión)', tipo:'normal', planByMicro: f2_max },
          { nombre:'PESO MUERTO', subtitle:'Maximal (2ª sesión)', tipo:'normal', planByMicro: f2_max },
          { nombre:'REMO BARRA INVERTIDO', subtitle:'Maximal (2ª sesión) · o JALONES INVERTIDOS', tipo:'normal', planByMicro: f2_max },
          { nombre:'CURL CON BARRA', subtitle:'Maximal (2ª sesión)', tipo:'normal', planByMicro: f2_max }
        ]}
      ]
    },
    'Hibrido': {
      numMicro: 3,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Piernas-Hombros-Abdomen', ejercicios:[
          { nombre:'SQUAT', subtitle:'Al fallo técnico - 85/75/65% 1RM', tipo:'normal', planByMicro: hib_main },
          { nombre:'PRENSA 45º o LEG EXTENSION', subtitle:'última serie DROP', tipo:'normal', planByMicro: hib_sec },
          { nombre:'PRESS MILITAR SENTADO', subtitle:'Al fallo técnico', tipo:'normal', planByMicro: hib_main },
          { nombre:'PRESS CON MANCUERNAS', subtitle:'última serie DROP', tipo:'normal', planByMicro: hib_sec },
          { nombre:'CRUNCH + CALF', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERTIDO','CALF MACHINE'], planByMicro: hib_jump_a }
        ]},
        { letra:'B', nombre:'Entreno B · Pecho-Tríceps', ejercicios:[
          { nombre:'PRESS BANCA', subtitle:'Al fallo técnico - 85/75/65% 1RM', tipo:'normal', planByMicro: hib_main },
          { nombre:'APERTURAS o CRUCES POLEA', subtitle:'', tipo:'normal', planByMicro: hib_apert },
          { nombre:'PRESS INCLINADO', subtitle:'última serie DROP', tipo:'normal', planByMicro: hib_sec },
          { nombre:'FONDOS o PRESS ESTRECHO', subtitle:'Al fallo técnico', tipo:'normal', planByMicro: hib_main },
          { nombre:'HIPEREXT + REMO', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['HIPEREXTENSION 45º','REMO o SEAL ROW'], planByMicro: hib_jump_b }
        ]},
        { letra:'C', nombre:'Entreno C · Espalda-Bíceps-Gemelos', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'85/75/55% 1RM + Rest-Pause', tipo:'normal', planByMicro: hib_dead },
          { nombre:'LEG CURL o GLUTE HAM RAISE', subtitle:'última serie DROP', tipo:'normal', planByMicro: hib_sec },
          { nombre:'DOMINADAS SUPINAS', subtitle:'Al fallo técnico', tipo:'normal', planByMicro: hib_main },
          { nombre:'CURL con BARRA', subtitle:'Al fallo técnico', tipo:'normal', planByMicro: hib_main },
          { nombre:'PLANCHA + CALF', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['PLANCHA ABDOMEN','CALF en PRENSA'], planByMicro: hib_jump_c }
        ]}
      ]
    },
    'Hipertrofia': {
      numMicro: 3,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Piernas-Hombros-Abdomen', ejercicios:[
          { nombre:'SQUAT', subtitle:'Rest-Pause 20 reps inicial', tipo:'normal', planByMicro: hip_squat },
          { nombre:'LEG CURL o GLUTE HAM RAISE', subtitle:'última serie BURNS', tipo:'normal', planByMicro: hip_burns },
          { nombre:'PRESS MILITAR SENTADO', subtitle:'Al fallo + Rest-Pause', tipo:'normal', planByMicro: hip_main },
          { nombre:'ELEVACIONES LATERALES', subtitle:'unilateral en polea baja · BURNS', tipo:'normal', planByMicro: hip_lat_burns },
          { nombre:'CRUNCH + CALF', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERTIDO','CALF MACHINE'], planByMicro: hip_jump_a }
        ]},
        { letra:'B', nombre:'Entreno B · Pecho-Bíceps-Abdomen', ejercicios:[
          { nombre:'PRESS BANCA', subtitle:'Al fallo + Rest-Pause', tipo:'normal', planByMicro: hip_main },
          { nombre:'APERTURAS o CRUCES POLEA', subtitle:'', tipo:'normal', planByMicro: hip_apert },
          { nombre:'PRESS INCLINADO', subtitle:'última serie BURNS', tipo:'normal', planByMicro: hip_burns },
          { nombre:'CURL con BARRA', subtitle:'Al fallo + Rest-Pause', tipo:'normal', planByMicro: hip_main },
          { nombre:'HIPEREXT + REMO', subtitle:'Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['HIPEREXTENSION 45º','REMO o SEAL ROW'], planByMicro: hip_jump_b }
        ]},
        { letra:'C', nombre:'Entreno C · Espalda-Tríceps-Gemelos', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'75/75/55% + RP final', tipo:'normal', planByMicro: hip_dead },
          { nombre:'LEG EXTENSIÓN o PRENSA 45º', subtitle:'última serie BURNS', tipo:'normal', planByMicro: hip_burns },
          { nombre:'DOMINADAS SUPINAS', subtitle:'Al fallo + Rest-Pause', tipo:'normal', planByMicro: hip_main },
          { nombre:'FONDOS o PRESS ESTRECHO', subtitle:'Al fallo + Rest-Pause', tipo:'normal', planByMicro: hip_main },
          { nombre:'CHOP + CALF', subtitle:'Arrodillado · Alternados [JUMP SET]', tipo:'circuito',
            circuitoLineas:['CHOP CON BARRA','CALF en PRENSA'], planByMicro: hip_chop }
        ]}
      ]
    },
    'Calidad muscular': {
      numMicro: 6,
      entrenos: [
        { letra:'A', nombre:'Entreno A · Lunes · Piernas-Hombros-Gemelos', ejercicios:[
          { nombre:'SQUAT', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'LEG-EXT + LEG-CURL + PRENSA', subtitle:'Triserie [MAX PUMP 12]', tipo:'circuito',
            circuitoLineas:['LEG-EXTENSION','LEG-CURL','PRENSA 45º'], planByMicro: cm_pump },
          { nombre:'PRESS MILITAR con BARRA', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'ELEVACIONES + PRESS MANCUERNAS', subtitle:'Superserie [MAX PUMP 10]', tipo:'circuito',
            circuitoLineas:['ELEVACIONES Laterales','PRESS con Mancuernas'], planByMicro: cm_pump },
          { nombre:'CALF en Prensa', subtitle:'Stripping', tipo:'normal', planByMicro: cm_calf_strip }
        ]},
        { letra:'B', nombre:'Entreno B · Miércoles · Pecho-Bíceps-Tríceps', ejercicios:[
          { nombre:'PRESS HORIZONTAL', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'APERTURAS + PRESS INCLINADO', subtitle:'Superserie [MAX PUMP 10]', tipo:'circuito',
            circuitoLineas:['APERTURAS Banco Horizontal','PRESS Banco Inclinado'], planByMicro: cm_pump },
          { nombre:'CURL con BARRA', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'CURL 45º + SPIDER CURL', subtitle:'Superserie [MAX PUMP 10]', tipo:'circuito',
            circuitoLineas:['CURL 45º','SPIDER CURL'], planByMicro: cm_pump },
          { nombre:'PRESS FRANCÉS + FONDOS', subtitle:'Superserie [MAX PUMP 10]', tipo:'circuito',
            circuitoLineas:['PRESS FRANCÉS','FONDOS ESTRECHOS o Press Estrecho'], planByMicro: cm_pump }
        ]},
        { letra:'C', nombre:'Entreno C · Viernes · Espalda-Femoral-Abdomen', ejercicios:[
          { nombre:'PESO MUERTO', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'LEG-CURL + HIPEREXT + LUNGES', subtitle:'Triserie [MAX PUMP 12]', tipo:'circuito',
            circuitoLineas:['LEG-CURL','HIPEREXTENSION','LUNGES o SPLIT SQUAT'], planByMicro: cm_pump },
          { nombre:'TRACCIONES Agarre Estrecho', subtitle:'Tempo 3232 · cluster', tipo:'normal', planByMicro: cm_main },
          { nombre:'PULL DOWN + TRACCIONES + REMO', subtitle:'Triserie [MAX PUMP 10]', tipo:'circuito',
            circuitoLineas:['PULL DOWN','TRACCIONES agarre ANCHO','REMO o SEAL ROW'], planByMicro: cm_pump },
          { nombre:'CRUNCH INVERTIDO + CRUNCH', subtitle:'Superserie', tipo:'circuito',
            circuitoLineas:['CRUNCH INVERTIDO','CRUNCH'], planByMicro: cm_crunch }
        ]}
      ]
    }
  };
})();


function tobBuildSeedPlantillas(){
  // Construye las plantillas H + M para cada categoría de TOB_BIIO_DATA.
  // numMicro, entrenos (con su letra/nombre/ejercicios), planByMicro real BIIO.
  const out = [];
  const MACRO = '1º Powerbuilding';
  const DESC = TOB_DESC_CATEGORIAS;
  Object.entries(TOB_BIIO_DATA).forEach(([categoria, data]) => {
    ['H','M'].forEach(sexo => {
      const entrenos = data.entrenos.map(en => ({
        id: en.letra,
        letra: en.letra,
        nombre: en.nombre || ('Entreno ' + en.letra),
        ejercicios: en.ejercicios.map((ej, i) => ({
          id: tobUid('ej'),
          orden: i,
          nombre: ej.nombre,
          subtitle: ej.subtitle || '',
          tipo: ej.tipo || 'normal',
          ...(ej.tipo === 'circuito' ? { circuitoLineas: ej.circuitoLineas || [] } : {}),
          planByMicro: JSON.parse(JSON.stringify(ej.planByMicro))
        }))
      }));
      out.push({
        id: tobUid('pl'),
        macrociclo: MACRO,
        nombre: `${categoria} — ${sexo === 'H' ? 'Hombre' : 'Mujer'}`,
        categoria,
        sexo,
        numMicro: data.numMicro,
        descripcion: tobDescOf(categoria, 'es') || '',
        _descV: TOB_DESC_VERSION,
        _planV: TOB_PLAN_VERSION,
        entrenos
      });
    });
  });
  return out;
}

// ═══ DEMO: cliente Jean con datos exactos del PDF de ejemplo ═══
function tobSeedJean(){
  // Si Jean ya existe, solo completamos rutinas faltantes (resto de plantillas H sin asignar)
  const existing = tobDB.clientes.find(c => c.nombre.toLowerCase() === 'jean');
  if(existing){
    const before = existing.asignaciones.length;
    tobFakeSeedRemaining(existing);
    const added = existing.asignaciones.length - before;
    tobSave();
    tobRenderClientes();
    if(added > 0){
      tobToast(`✓ ${added} rutina${added===1?'':'s'} adicional${added===1?'':'es'} cargada${added===1?'':'s'}`, 'green');
    } else {
      tobToast('Jean ya tiene todas las rutinas H', 'red');
    }
    // Abrir la primera
    if(existing.asignaciones.length) tobOpenAsignacion(existing.id, existing.asignaciones[0].id);
    return;
  }
  const pl = tobDB.plantillas.find(p => p.nombre === 'Reacondicionamiento — Hombre');
  if(!pl){ tobToast('Falta plantilla "Reacondicionamiento — Hombre"', 'red'); return; }

  // Mapa nombre → id (estable porque tobCreateAsignacion hace deep copy preservando IDs)
  const ids = {};
  pl.entrenos.forEach(en => en.ejercicios.forEach(ej => { ids[en.letra + ':' + ej.nombre] = ej.id; }));

  const S = (kg, reps) => ({ kg, reps });

  // ── ITERACIÓN 1 (mayo-junio 2023) ──────────────────────────
  const fechaA1 = ['2023-05-19','2023-05-21','2023-05-24','2023-05-27','2023-05-31','2023-06-02'];
  const fechaB1 = ['2023-05-20','2023-05-23','2023-05-25','2023-05-28','2023-06-01','2023-06-04'];

  const boxSquat1 = [
    [S(60,15),S(80,12),S(100,10)],
    [S(80,15),S(100,12),S(110,10)],
    [S(105,12),S(110,10),S(115,8)],
    [S(110,12),S(115,10),S(120,8)],
    [S(115,10),S(120,8),S(125,6)],
    [S(120,10),S(125,8),S(130,6)]
  ];
  const pressBanca1 = [
    [S(55,15),S(60,12),S(65,10)],
    [S(60,15),S(62.5,12),S(65,10)],
    [S(62.5,12),S(65,10),S(70,8)],
    [S(65,12),S(70,10),S(72.5,8)],
    [S(70,10),S(72.5,8),S(75,6)],
    [S(70,10),S(70,10),S(70,10)]
  ];
  const remo1 = [
    [S(55,15),S(60,12),S(70,10)],
    [S(60,15),S(65,12),S(70,10)],
    [S(65,12),S(70,10),S(75,8)],
    [S(70,12),S(75,10),S(80,8)],
    [S(75,10),S(80,8),S(85,6)],
    [S(80,10),S(82.5,8),S(85,6)]
  ];
  const circA1 = [  // [Curl, Hipext, Calf]
    [S(26,12),S(15,12),S(35,12)],
    [S(31,12),S(15,12),S(40,12)],
    [S(31,12),S(20,12),S(40,12)],
    [S(32,12),S(25,12),S(45,12)],
    [S(33.5,12),S(25,12),S(50,12)],
    [S(33.5,12),S(25,12),S(50,12)]
  ];

  const pesoMuerto1 = [
    [S(100,15),S(105,12),S(107.5,8)],
    [S(95,15),S(100,12),S(105,10)],
    [S(100,12),S(102.5,10),S(105,8)],
    [S(102.5,12),S(105,10),S(110,8)],
    [S(105,10),S(110,8),S(115,6)],
    [S(108,10),S(115,8),S(120,6)]
  ];
  const pressMilitar1 = [
    [S(15,15),S(17.5,12),S(20,10)],
    [S(20,15),S(22.5,12),S(25,10)],
    [S(22.5,12),S(25,7),S(25,5)],
    [S(22.5,12),S(25,7),S(25,5)],
    [S(25,10),S(22.5,8),S(22.5,6)],
    [S(22.5,10),S(25,8),S(27.5,6)]
  ];
  const dominadas1 = [
    [S(65,15),S(70,12),S(70,10)],
    [S(70,15),S(75,10),S(75,10)],
    [S(70,12),S(75,10),S(80,8)],
    [S(75,12),S(80,10),S(80,8)],
    [S(80,10),S(80,8),S(80,6)],
    [S(80,10),S(82.5,8),S(85,6)]
  ];
  const circB1 = [  // [Prensa, Crunch, Fondos]
    [S(110,12),S(1,12),S(15,12)],
    [S(120,12),S(70,12),S(1,12)],
    [S(130,12),S(1,12),S(1,12)],
    [S(140,12),S(1,12),S(25,12)],
    [S(150,12),S(1,12),S(20,12)],
    [S(160,12),S(1,12),S(15,12)]
  ];

  // ── ITERACIÓN 2 (julio-agosto 2025) ──────────────────────
  const fechaA2 = ['2025-07-24','2025-07-28','2025-08-01','2025-08-03','2025-08-09','2025-08-11'];
  const fechaB2 = ['2025-07-25','2025-07-29','2025-08-02','2025-08-05','2025-08-09','2025-08-12'];
  const aerA2 = [10,15,15,20,30,15];   // minutos correr
  const aerB2 = [25,20,15,30,15,20];

  const boxSquat2 = [
    [S(125,15),S(130,12),S(135,10)],
    [S(130,15),S(135,12),S(140,10)],
    [S(135,12),S(140,10),S(145,8)],
    [S(140,10),S(150,8),S(160,6)],
    [S(150,10),S(160,8),S(170,6)],
    [S(160,10),S(170,8),S(180,6)]
  ];
  const pressBanca2 = [
    [S(62.5,15),S(65,10),S(70,8)],
    [S(62.5,15),S(67.5,12),S(72.5,5)],
    [S(67.5,12),S(70,10),S(75,7)],
    [S(70,12),S(72.5,10),S(77.5,7)],
    [S(70,12),S(72.5,10),S(77.5,7)],
    [S(70,12),S(72.5,10),S(77.5,7)]
  ];
  const remo2 = [
    [S(62.5,15),S(72.5,12),S(82.5,10)],
    [S(65,15),S(77.5,12),S(87.5,10)],
    [S(77.5,12),S(87.5,10),S(90,8)],
    [S(80,12),S(87.5,10),S(95,6)],
    [S(85,10),S(90,8),S(95,6)],
    [S(92.5,10),S(95,8),S(100,6)]
  ];
  const circA2 = [
    [S(30,12),S(30,12),S(75,12)],
    [S(32.5,12),S(32.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(140,12)],
    [S(32.5,12),S(37.5,12),S(160,12)],
    [S(32.5,12),S(37.5,12),S(140,12)]
  ];

  const pesoMuerto2 = [
    [S(120,15),S(125,12),S(130,10)],
    [S(125,15),S(130,12),S(135,6)],
    [S(130,12),S(135,10),S(145,8)],
    [S(135,12),S(140,10),S(145,6)],
    [S(140,10),S(150,8),S(160,6)],
    [S(145,10),S(155,8),S(165,4)]
  ];
  const pressMilitar2 = [
    [S(40,15),S(45,12),S(50,7)],
    [S(42.5,15),S(47.5,12),S(52.5,7)],
    [S(45,12),S(50,10),S(55,8)],
    [S(50,10),S(55,8),S(60,4)],
    [S(52.5,10),S(57.5,10),S(60,4)],
    [S(55,10),S(60,6),S(65,4)]
  ];
  const dominadas2 = [
    [S(5,15),S(7.5,10),S(10,6)],
    [S(5,11),S(7.5,8),S(10,4)],
    [S(7.5,10),S(10,10),S(12.5,6)],
    [S(7.5,6),S(10,10),S(15,6)],
    [S(10,10),S(12.5,8),S(15,6)],
    [S(12.5,9),S(15,8),S(20,6)]
  ];
  const circB2 = [
    [S(160,12),S(50,12),S(5,12)],
    [S(160,12),S(50,12),S(5,12)],
    [S(165,12),S(50,12),S(7.5,10)],
    [S(145,12),S(50,12),S(7.5,12)],
    [S(150,12),S(55,12),S(55,12)],
    [S(150,12),S(55,12),S(60,12)]
  ];

  // ── Construir cliente + asignación ──
  const cli = { id: tobUid('cli'), nombre: 'Jean', sexo: 'H', contacto: '', alta: '2023-05-19', asignaciones: [] };
  const asig = tobCreateAsignacion(pl.id);
  asig.fechaInicio = '2023-05-19';
  asig.notas = 'Demo cargada del PDF de ejemplo. Iteración 1 = mayo-jun 2023. Iteración 2 = jul-ago 2025.';

  function buildSesionA(it, mn, fechas, data, aerT){
    it.sesiones[mn] = it.sesiones[mn] || {};
    it.sesiones[mn]['A'] = {
      fecha: fechas[mn-1],
      aerobica: aerT ? { tipo:'Correr', tiempo:String(aerT[mn-1]), intensidad:'' } : { tipo:'', tiempo:'', intensidad:'' },
      ejs: {
        [ids['A:BOX SQUAT']]:                  { series: data.boxSquat[mn-1] },
        [ids['A:PRESS BANCA']]:                { series: data.pressBanca[mn-1] },
        [ids['A:REMO']]:                       { series: data.remo[mn-1] },
        [ids['A:CURL + HIPEREXT + CALF']]:     { lineas: data.circ[mn-1] }
      }
    };
  }
  function buildSesionB(it, mn, fechas, data, aerT){
    it.sesiones[mn] = it.sesiones[mn] || {};
    it.sesiones[mn]['B'] = {
      fecha: fechas[mn-1],
      aerobica: aerT ? { tipo:'Correr', tiempo:String(aerT[mn-1]), intensidad:'' } : { tipo:'', tiempo:'', intensidad:'' },
      ejs: {
        [ids['B:PESO MUERTO']]:                  { series: data.pesoMuerto[mn-1] },
        [ids['B:PRESS MILITAR']]:                { series: data.pressMilitar[mn-1] },
        [ids['B:DOMINADAS']]:                    { series: data.dominadas[mn-1] },
        [ids['B:PRENSA + CRUNCH + FONDOS']]: { lineas: data.circ[mn-1] }
      }
    };
  }

  // Iteración 1
  const it1 = asig.iteraciones[0];
  it1.numero = 1;
  const dA1 = { boxSquat: boxSquat1, pressBanca: pressBanca1, remo: remo1, circ: circA1 };
  const dB1 = { pesoMuerto: pesoMuerto1, pressMilitar: pressMilitar1, dominadas: dominadas1, circ: circB1 };
  const _N = tobNumMicroOf(asig.rutina);
  for(let mn=1; mn<=_N; mn++){
    buildSesionA(it1, mn, fechaA1, dA1);
    buildSesionB(it1, mn, fechaB1, dB1);
  }

  // Iteración 2
  const it2 = { id: tobUid('it'), numero: 2, sesiones: {} };
  asig.iteraciones.push(it2);
  const dA2 = { boxSquat: boxSquat2, pressBanca: pressBanca2, remo: remo2, circ: circA2 };
  const dB2 = { pesoMuerto: pesoMuerto2, pressMilitar: pressMilitar2, dominadas: dominadas2, circ: circB2 };
  for(let mn=1; mn<=_N; mn++){
    buildSesionA(it2, mn, fechaA2, dA2, aerA2);
    buildSesionB(it2, mn, fechaB2, dB2, aerB2);
  }

  cli.asignaciones.push(asig);
  tobDB.clientes.push(cli);

  // ── Rellenar las otras 7 plantillas H con datos inventados progresivos ──
  tobFakeSeedRemaining(cli);

  tobSave();
  tobRenderClientes();
  tobToast(`✓ Jean cargado: ${cli.asignaciones.length} rutinas`, 'green');
  // Abrir directamente la Reacondicionamiento
  tobOpenAsignacion(cli.id, asig.id);
}

// Genera asignaciones con datos inventados progresivos para todas las plantillas
// del sexo del cliente que NO tenga aún. Útil para demo visual.
function tobFakeSeedRemaining(cli){
  // Base de kg por nombre de ejercicio (aproximaciones realistas Hombre intermedio-avanzado)
  const BASE = {
    'BOX SQUAT': 105, 'PRESS BANCA': 75, 'REMO': 75, 'REMO o SEAL ROW': 75,
    'PESO MUERTO': 135, 'PRESS MILITAR': 50, 'DOMINADAS': 12, 'DOMINADAS o LAT MACHINE': 12,
    'CURL + HIPEREXT + CALF': 32, 'PRENSA + CRUNCH + FONDOS': 145, 'PRENSA 45º + CRUNCH + FONDOS': 145
  };
  // Incremento por microciclo (kg)
  const DELTA = {
    'BOX SQUAT': 5, 'PRESS BANCA': 2.5, 'REMO': 2.5, 'REMO o SEAL ROW': 2.5,
    'PESO MUERTO': 5, 'PRESS MILITAR': 2.5, 'DOMINADAS': 1, 'DOMINADAS o LAT MACHINE': 1,
    'CURL + HIPEREXT + CALF': 1, 'PRENSA + CRUNCH + FONDOS': 5, 'PRENSA 45º + CRUNCH + FONDOS': 5
  };
  // Bias adicional por categoría (más kg en mesociclos de fuerza, menos en hipertrofia)
  const CAT_BOOST = {
    'Reacondicionamiento': 0,
    'Preparación fuerza': 10,
    'Especialización técnica': 15,
    'Fuerza 1': 20,
    'Fuerza 2': 25,
    'Hibrido': 15,
    'Hipertrofia': 5,
    'Calidad muscular': -5
  };

  const plantillasParaJean = tobDB.plantillas.filter(p =>
    p.sexo === cli.sexo &&
    !cli.asignaciones.find(a => a.plantillaId === p.id)
  );

  // Avanzar fechas: cada mesociclo aprox 1 mes después del último
  let cursor = new Date('2025-09-01');

  plantillasParaJean.forEach(pl => {
    const asig = tobCreateAsignacion(pl.id);
    const startStr = cursor.toISOString().slice(0,10);
    asig.fechaInicio = startStr;
    asig.notas = 'Demo con valores inventados (progresivos).';
    asig.estado = 'completada';

    const it = asig.iteraciones[0];
    it.numero = 1;

    const boost = CAT_BOOST[pl.categoria] || 0;

    // Recorre los microciclos de ESTA plantilla (3-7 según categoría).
    // Fechas: primer entreno en lunes, segundo en jueves (aprox).
    const _Npl = tobNumMicroOf(pl);
    for(let mn=1; mn<=_Npl; mn++){
      pl.entrenos.forEach(en => {
        const dayOffset = (mn-1) * 7 + (en.letra === 'A' ? 0 : 2);
        const f = new Date(cursor); f.setDate(f.getDate() + dayOffset);
        const fechaStr = f.toISOString().slice(0,10);

        const ses = {
          fecha: fechaStr,
          aerobica: { tipo:'', tiempo:'', intensidad:'' },
          ejs: {}
        };

        en.ejercicios.forEach(ej => {
          const plan = tobPlanFor(ej, mn);
          // Resolver base + delta para este ejercicio (buscar nombre en map)
          let base = BASE[ej.nombre];
          let delta = DELTA[ej.nombre];
          if(base == null){
            // Heurística: si contiene PRESS, PRENSA etc, mid-range
            const u = ej.nombre.toUpperCase();
            if(u.includes('PRENSA') || u.includes('PRESS BANCA') || u.includes('SQUAT')) { base = 90; delta = 3; }
            else if(u.includes('PRESS')) { base = 50; delta = 2.5; }
            else if(u.includes('PESO MUERTO') || u.includes('DEADLIFT')) { base = 130; delta = 5; }
            else if(u.includes('CURL')) { base = 30; delta = 1; }
            else { base = 50; delta = 2; }
          }
          const baseKg = base + boost + (mn-1) * delta;

          if(ej.tipo === 'circuito'){
            const lineas = (ej.circuitoLineas||[]).map((nombreLin, li) => {
              // Variación por línea del circuito
              const offsets = [0, -5, 10];
              const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget[0] : plan.repsTarget;
              return { kg: Math.round((baseKg + (offsets[li] || 0)) * 2) / 2, reps: parseInt(reps) || 12 };
            });
            ses.ejs[ej.id] = { lineas };
          } else {
            const seriesArr = [];
            const repsTarget = Array.isArray(plan.repsTarget) ? plan.repsTarget : [plan.repsTarget];
            for(let s=0; s<plan.series; s++){
              const targetReps = repsTarget[s] != null ? repsTarget[s] : repsTarget[repsTarget.length-1];
              // Cada serie sube un poco de kg pero baja reps reales (a veces no llega al target)
              const kg = Math.round((baseKg + s * 2.5) * 2) / 2;
              const reps = Math.max(1, (parseInt(targetReps) || 8) - Math.floor(s/2));
              seriesArr.push({ kg, reps });
            }
            ses.ejs[ej.id] = { series: seriesArr };
          }
        });

        it.sesiones[mn] = it.sesiones[mn] || {};
        it.sesiones[mn][en.id] = ses;
      });
    }

    cli.asignaciones.push(asig);
    // Avanzar el cursor (numMicro + 1) semanas para que cada mesociclo no se solape
    cursor = new Date(cursor); cursor.setDate(cursor.getDate() + (_Npl + 1) * 7);
  });
}

// ═════════════════════════════════════════════════════════════════
// FICHA HISTÓRICA DEL CLIENTE
// ═════════════════════════════════════════════════════════════════
let tobCurrentFichaId = null;
let tobFichaCharts = {};

function tobOpenFicha(cliId){
  const c = tobDB.clientes.find(c => c.id === cliId);
  if(!c){ tobToast('Cliente no encontrado', 'red'); return; }
  tobCurrentFichaId = cliId;
  document.getElementById('tobTabFicha').style.display = '';
  tobShowTab('ficha');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tobTabFicha').classList.add('active');
  tobRenderFicha();
}

function tobCloseFicha(){
  // Destruir charts
  Object.values(tobFichaCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobFichaCharts = {};
  tobCurrentFichaId = null;
  document.getElementById('tobTabFicha').style.display = 'none';
  tobShowTab('clientes');
  document.querySelectorAll('.tob-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(".tob-tab[onclick*='clientes']")?.classList.add('active');
}

function tobRenderFicha(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;

  // Destruir todos los charts de la ficha de una vez (rutinas + mediciones)
  Object.values(tobFichaCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  tobFichaCharts = {};

  const hasRutinas = (cli.asignaciones||[]).length > 0;
  const hasMediciones = (cli.mediciones||[]).length > 0;

  document.getElementById('tobFichaNombre').textContent = cli.nombre + (cli.sexo==='M'?' ♀':cli.sexo==='H'?' ♂':'');
  const totalSes = tobCountSesiones(cli);
  const metaParts = [`Cliente desde ${cli.alta || '—'}`];
  if(hasRutinas) metaParts.push(`${(cli.asignaciones||[]).length} rutinas`, `${totalSes} sesiones`);
  if(hasMediciones) metaParts.push(`${cli.mediciones.length} mediciones`);
  if(cli.contacto) metaParts.push(cli.contacto);
  document.getElementById('tobFichaMeta').textContent = metaParts.join('  ·  ');

  // ── Botón "✓ Completar y abrir nueva": visible si la última rutina aún
  // no está marcada como completada (para que cerrar y empezar otra sea evidente).
  const sortedAsigsForCompletar = [...(cli.asignaciones||[])]
    .sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||''));
  const lastAsig = sortedAsigsForCompletar[0];
  const completarBtn = document.getElementById('tobCompletarBtn');
  if(completarBtn){
    completarBtn.style.display = (lastAsig && lastAsig.estado !== 'completada') ? '' : 'none';
  }

  // ── KPIs adaptativos: rutinas, mediciones, o ambas ──
  const kpiCards = [];
  if(hasRutinas){
    const kpis = tobCalcGlobalKPIs(cli);
    kpiCards.push(`<div class="tob-kpi ses"><div class="lbl">Sesiones totales</div><div class="val">${totalSes}</div></div>`);
    kpiCards.push(`<div class="tob-kpi"><div class="lbl">Rutinas completadas</div><div class="val">${kpis.completadas}<span class="unit"> / ${(cli.asignaciones||[]).length}</span></div></div>`);
    Object.entries(kpis.prByEj).slice(0, hasMediciones ? 3 : 6).forEach(([n, kg]) =>
      kpiCards.push(`<div class="tob-kpi pr"><div class="lbl">PR ${tobEsc(n)}</div><div class="val">${kg}<span class="unit"> kg</span></div></div>`));
  }
  if(hasMediciones){
    const mk = tobCalcMedKPIs(cli);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Mediciones</div><div class="val">${mk.count}</div></div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Peso actual</div><div class="val">${mk.pes}<span class="unit"> kg</span></div>${mk.pesDelta}</div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Σ Pliegues</div><div class="val">${mk.sum}<span class="unit"> mm</span></div>${mk.sumDelta}</div>`);
    kpiCards.push(`<div class="tob-kpi med"><div class="lbl">Cintura</div><div class="val">${mk.cintura}<span class="unit"> cm</span></div>${mk.cinturaDelta}</div>`);
  }
  document.getElementById('tobFichaKpis').innerHTML = kpiCards.join('') ||
    '<div style="color:var(--mute2);padding:8px;font-size:.85rem;">Sin datos todavía.</div>';

  // ── Bloques: el empty global només es mostra si NO hi ha res de res ──
  // Ara els bloques de pestaña no s'amagen per "no hi ha dades" — el switch
  // de pestañas s'encarrega de la visibilitat. Cada pestaña amaga els
  // headers de cards de manera passiva si no hi ha contingut.
  document.getElementById('tobFichaEmptyBoth').style.display = (!hasRutinas && !hasMediciones) ? '' : 'none';

  if(hasRutinas){
    tobRenderTimeline(cli);
    tobRenderFichaCharts(cli);
  } else {
    const tl = document.getElementById('tobFichaTimeline');
    if(tl) tl.innerHTML = '<div class="tob-empty-tab">Encara no hi ha rutines assignades. Usa el botó "🏋 + Rutina" del cap de la fitxa per assignar-ne una.</div>';
    const cmp = document.getElementById('tobFichaCmpTable'); if(cmp) cmp.innerHTML = '';
    const ch = document.getElementById('tobFichaCharts'); if(ch) ch.innerHTML = '';
  }
  if(hasMediciones){
    tobRenderFichaMediciones(cli);
  } else {
    const mt = document.getElementById('tobFichaMedTable');
    if(mt) mt.innerHTML = '<div class="tob-empty-tab">Encara no hi ha medicions. Usa el botó "📏 + Medición" del cap de la fitxa.</div>';
    const mc = document.getElementById('tobFichaMedCharts'); if(mc) mc.innerHTML = '';
  }

  // Cuestionario: siempre visible (al final). Se carga con los datos del cliente.
  if(typeof tobQuestLoad === 'function') tobQuestLoad();
  // Menús del cliente
  if(typeof tobFichaRenderMenus === 'function') tobFichaRenderMenus();

  // Activar la pestanya per defecte (o l'última que tenia el usuari).
  tobFichaShowTab(_tobFichaTabActiva || 'cuestionario');
}

// ── Pestanyes de la fitxa: cuestionari / mediciones / entrenos / menús ──
let _tobFichaTabActiva = 'cuestionario';
function tobFichaShowTab(name){
  _tobFichaTabActiva = name;
  document.querySelectorAll('#tobFichaTabs .tob-ficha-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.fichatab === name);
  });
  document.querySelectorAll('.tob-ficha-tab-content').forEach(el => {
    el.style.display = el.dataset.fichatab === name ? '' : 'none';
  });
}

// Renderiza la lista de menús del cliente en su ficha.
function tobFichaRenderMenus(){
  const cont = document.getElementById('tobFichaMenusList');
  if(!cont) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ cont.innerHTML = ''; return; }
  const menus = (cli.menus || []).slice()
    .sort((a,b) => (b.savedAt||b.fecha||'').localeCompare(a.savedAt||a.fecha||''));
  if(!menus.length){
    cont.innerHTML = '<div style="color:var(--mute2);font-family:DM Mono,monospace;font-size:.76rem;padding:8px 2px;">Aquest client encara no té cap menú assignat. Crea\'n un amb <strong>+ Nou menú</strong>.</div>';
    return;
  }
  cont.innerHTML = menus.map(m => tobMenuRowHTML(cli, m)).join('');
}

// Exporta a PDF el último menú guardado del cliente de la ficha.
function tobFichaMenuPdf(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Sin cliente', 'red'); return; }
  const menus = (cli.menus || []).slice()
    .sort((a,b) => (b.savedAt||b.fecha||'').localeCompare(a.savedAt||a.fecha||''));
  if(!menus.length){
    tobToast('Aquest client encara no té cap menú guardat. Crea\'n un amb "+ Nou menú".', 'red');
    return;
  }
  tobMenuPdf(cli.id, menus[0].id);
}

// Va al creador de menús con este cliente preseleccionado.
function tobFichaNuevoMenu(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  tobShowTab('menus', document.querySelector('.tob-tab[onclick*="\'menus\'"]'));
  const btn = document.querySelector('.tob-sub-tab[data-mtab="creador"]');
  tobMenuShowTab('creador', btn);
  const sel = document.getElementById('tobMcCliente');
  if(sel){
    sel.value = cli.id;
    if(typeof tobMcOnClienteChange === 'function') tobMcOnClienteChange();
  }
}

function tobCountSesiones(cli){
  let n = 0;
  (cli.asignaciones||[]).forEach(a => {
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.values(microSes).forEach(s => {
          // Contar como sesión si tiene fecha o al menos un kg/reps
          if(s.fecha) n++;
          else {
            const hasData = Object.values(s.ejs||{}).some(ej =>
              (ej.series||[]).some(sr => sr.kg!=null || sr.reps!=null) ||
              (ej.lineas||[]).some(sr => sr.kg!=null || sr.reps!=null)
            );
            if(hasData) n++;
          }
        });
      });
    });
  });
  return n;
}

// Calcula KPIs: tonelaje total, PR por ejercicio principal, asignaciones completadas
function tobCalcGlobalKPIs(cli){
  let tonelaje = 0;
  let completadas = 0;
  const prByEj = {};   // {nombreEj: max kg single set}
  (cli.asignaciones||[]).forEach(a => {
    if(a.estado === 'completada') completadas++;
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          if(!en) return;
          en.ejercicios.forEach(ej => {
            if(ej.tipo === 'circuito') return; // solo principales
            const ses = s.ejs?.[ej.id];
            if(!ses?.series) return;
            ses.series.forEach(sr => {
              if(sr.kg != null && sr.reps != null){
                tonelaje += sr.kg * sr.reps;
                if(!prByEj[ej.nombre] || sr.kg > prByEj[ej.nombre]) prByEj[ej.nombre] = sr.kg;
              }
            });
          });
        });
      });
    });
  });
  // Ordenar PR por kg desc
  const sortedPr = {};
  Object.entries(prByEj).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => sortedPr[k] = v);
  return { tonelajeTotal: Math.round(tonelaje), completadas, prByEj: sortedPr };
}

function tobRenderTimeline(cli){
  const cont = document.getElementById('tobFichaTimeline');
  if(!cli.asignaciones || !cli.asignaciones.length){
    cont.innerHTML = '<div style="color:var(--mute2);padding:20px;text-align:center;">Sin rutinas asignadas. Usa el botón + Nuevo cliente y elige plantilla.</div>';
    return;
  }
  // Ordenar por fecha de inicio ascendente
  const sorted = [...cli.asignaciones].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  cont.innerHTML = sorted.map(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const stats = tobCalcAsigStats(a);
    const fechaFin = stats.ultimaFecha || a.fechaInicio || '';
    const nombreShort = tobRutinaShortName(pl);
    const topPrs = Object.entries(stats.maxByEj).slice(0, 3);
    const prBoxes = topPrs.length
      ? topPrs.map(([n, kg]) => {
          const ejShort = n.length > 10 ? n.slice(0,9)+'…' : n;
          return `<div class="tl-prbox" title="${tobEsc(n)}: ${kg} kg">
            <div class="ej">${tobEsc(ejShort)}</div>
            <div class="v">${kg}<span class="u"> kg</span></div>
          </div>`;
        }).join('')
      : `<div style="color:var(--mute2);font-size:.72rem;font-style:italic;align-self:center;">Sin datos registrados</div>`;
    return `<div class="tob-tl-item ${a.estado||''}" onclick="tobOpenAsignacion('${cli.id}','${a.id}')">
      <div class="tl-left">
        <div class="tl-hdr">
          <span class="tl-fechas">${tobEsc(a.fechaInicio||'?')} → ${tobEsc(fechaFin)}</span>
          <span class="tl-name">${tobEsc(nombreShort)}</span>
          <span class="tob-badge ${a.estado||'en_curso'}">${a.estado||'en curso'}</span>
        </div>
        <div class="tl-meta">${pl ? tobEsc(pl.macrociclo||'') + ' · ' + tobEsc(pl.categoria||'') : ''}  ·  ${(a.iteraciones||[]).length} iteración${(a.iteraciones||[]).length===1?'':'es'}</div>
        <div class="tl-kpi">
          <span><strong>${stats.sesiones}</strong>sesiones</span>
        </div>
      </div>
      <div class="tl-right">${prBoxes}</div>
    </div>`;
  }).join('');
}

function tobCalcAsigStats(a){
  let tonelaje = 0, sesiones = 0;
  let ultimaFecha = '';
  const maxByEj = {};
  (a.iteraciones||[]).forEach(it => {
    Object.values(it.sesiones||{}).forEach(microSes => {
      Object.entries(microSes).forEach(([entId, s]) => {
        let hasData = false;
        const en = a.rutina?.entrenos.find(e => e.id === entId);
        if(!en) return;
        en.ejercicios.forEach(ej => {
          if(ej.tipo === 'circuito') return;
          const ses = s.ejs?.[ej.id];
          if(!ses?.series) return;
          ses.series.forEach(sr => {
            if(sr.kg != null && sr.reps != null){
              tonelaje += sr.kg * sr.reps;
              hasData = true;
              if(!maxByEj[ej.nombre] || sr.kg > maxByEj[ej.nombre]) maxByEj[ej.nombre] = sr.kg;
            }
          });
        });
        if(s.fecha || hasData) sesiones++;
        if(s.fecha && s.fecha > ultimaFecha) ultimaFecha = s.fecha;
      });
    });
  });
  // Ordenar maxByEj por kg desc
  const sorted = {};
  Object.entries(maxByEj).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>sorted[k]=v);
  return { tonelaje: Math.round(tonelaje), sesiones, ultimaFecha, maxByEj: sorted };
}

// Construye datos consolidados para ficha: PR por ejercicio y tabla rutina×ejercicio
function tobBuildFichaData(cli){
  // Recolectar todos los ejercicios principales únicos
  const ejNames = new Set();
  (cli.asignaciones||[]).forEach(a => {
    (a.rutina?.entrenos||[]).forEach(en => {
      (en.ejercicios||[]).forEach(ej => {
        if(ej.tipo !== 'circuito') ejNames.add(ej.nombre);
      });
    });
  });
  // Para cada ejercicio: lista de {kg, fecha, asigLabel} de cada rutina-iteración
  const ejHistory = {};
  // También: por rutina-iteración → ejercicio → kg max
  const matrix = {};   // { rutinaKey: { ejName: maxKg } }
  const rutinaLabels = []; // ordenadas crono

  // Ordenar asignaciones por fechaInicio
  const sortedAsigs = [...(cli.asignaciones||[])].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  sortedAsigs.forEach(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const baseLabel = tobRutinaShortName(pl);
    a.iteraciones.forEach(it => {
      const ejMaxIt = {};
      let lastFecha = '';
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          if(!en) return;
          en.ejercicios.forEach(ej => {
            if(ej.tipo === 'circuito') return;
            const series = s.ejs?.[ej.id]?.series;
            if(!series) return;
            series.forEach(sr => {
              if((sr.kg||0) > (ejMaxIt[ej.nombre]||0)) ejMaxIt[ej.nombre] = sr.kg;
            });
          });
          if(s.fecha && s.fecha > lastFecha) lastFecha = s.fecha;
        });
      });
      const itLabel = (a.iteraciones.length > 1) ? `${baseLabel} it.${it.numero}` : baseLabel;
      const fechaR = lastFecha || a.fechaInicio || '';
      const rutinaKey = `${itLabel}__${fechaR}`;
      rutinaLabels.push({ key: rutinaKey, label: itLabel, fecha: fechaR });
      matrix[rutinaKey] = ejMaxIt;
      Object.entries(ejMaxIt).forEach(([n, kg]) => {
        if(!ejHistory[n]) ejHistory[n] = [];
        ejHistory[n].push({ kg, fecha: fechaR, asigLabel: itLabel });
      });
    });
  });
  return { ejNames: [...ejNames], ejHistory, matrix, rutinaLabels };
}

// Mini line charts (uno por ejercicio principal) + tabla comparativa
function tobRenderFichaCharts(cli){
  const chartsGrid = document.getElementById('tobFichaCharts');
  const tableCont = document.getElementById('tobFichaCmpTable');
  if(!chartsGrid || !tableCont) return;
  // Nota: los charts ya se destruyen en tobRenderFicha (rutinas + mediciones a la vez)

  const data = tobBuildFichaData(cli);

  if(!data.ejNames.length){
    chartsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--mute2);padding:30px;">Sin datos de ejercicios principales aún.</div>';
    tableCont.innerHTML = '';
    return;
  }

  // ─── Mini line charts ─────
  chartsGrid.innerHTML = data.ejNames.map(name => `
    <div class="tob-chart-card">
      <div class="hdr">${tobEsc(name)}</div>
      <div class="body"><canvas id="tobFichaChart_${tobSlug(name)}"></canvas></div>
    </div>
  `).join('');

  if(window.ChartDataLabels && Chart.register){ try { Chart.register(ChartDataLabels); } catch(e){} }

  data.ejNames.forEach(name => {
    const canvas = document.getElementById('tobFichaChart_' + tobSlug(name));
    if(!canvas) return;
    const points = (data.ejHistory[name]||[]).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
    if(!points.length){
      canvas.getContext('2d').fillStyle = '#5a5240';
      canvas.getContext('2d').font = '12px DM Mono';
      canvas.getContext('2d').textAlign = 'center';
      canvas.getContext('2d').fillText('Sin datos', canvas.width/2, canvas.height/2);
      return;
    }
    // Calcular delta y resaltar PR
    const maxKg = Math.max(...points.map(p => p.kg));
    const labels = points.map(p => p.asigLabel);
    const values = points.map(p => p.kg);
    // Colores: punto naranja si es PR (max), gris si no
    const pointColors = values.map(v => v === maxKg ? '#f5a623' : '#94a3b8');
    const pointSizes = values.map(v => v === maxKg ? 7 : 5);
    tobFichaCharts[name] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'kg PR',
          data: values,
          borderColor: '#f5a623',
          backgroundColor: 'rgba(245,166,35,.12)',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointSizes,
          pointHoverRadius: 8,
          borderWidth: 2.5,
          tension: 0.2,
          fill: true,
          spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => `${ctx.parsed.y} kg`,
            afterLabel: ctx => points[ctx.dataIndex].fecha ? '📅 ' + points[ctx.dataIndex].fecha : ''
          } },
          datalabels: {
            color: ctx => values[ctx.dataIndex] === maxKg ? '#f5a623' : '#cbd5e1',
            font: ctx => ({ size: values[ctx.dataIndex] === maxKg ? 12 : 10, weight: values[ctx.dataIndex] === maxKg ? '800' : '600' }),
            align: 'top', offset: 6,
            formatter: v => v + ' kg'
          }
        },
        scales: {
          x: { ticks: { color:'#7a96b8', font:{size:9}, maxRotation:30, minRotation:0,
                callback: function(val){ const l = this.getLabelForValue(val); return l.length > 14 ? l.slice(0,12)+'…' : l; } },
               grid: { color:'#1e1810', drawBorder:false } },
          y: { ticks: { color:'#7a96b8', font:{size:9} }, grid:{ color:'#1e1810' }, beginAtZero:false,
               title: { display:true, text:'kg', color:'#5a7a9a', font:{size:9} } }
        }
      }
    });
  });

  // ─── Tabla comparativa (igual que antes) ─────
  const colHeaders = data.rutinaLabels.map(r => `<th title="${tobEsc(r.fecha)}">${tobEsc(r.label)}</th>`).join('');
  const rows = data.ejNames.map(name => {
    const cells = data.rutinaLabels.map(r => {
      const kg = data.matrix[r.key]?.[name];
      return kg != null ? `<td data-kg="${kg}">${kg}</td>` : `<td class="empty">—</td>`;
    }).join('');
    return `<tr><td class="ej-name">${tobEsc(name)}</td>${cells}</tr>`;
  }).join('');
  tableCont.innerHTML = `<table class="tob-cmp">
    <thead><tr><th class="ej-col">Ejercicio</th>${colHeaders}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  tableCont.querySelectorAll('tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td[data-kg]')];
    if(!cells.length) return;
    let maxKg = -Infinity;
    cells.forEach(td => { const v = +td.dataset.kg; if(v > maxKg) maxKg = v; });
    cells.forEach(td => { if(+td.dataset.kg === maxKg) td.classList.add('best'); });
  });
}

function tobSlug(s){ return String(s).replace(/[^a-zA-Z0-9]/g,'_'); }

// ═════════════════════════════════════════════════════════════════
// MEDICIONES — composición corporal (pliegues, perímetros, peso)
// ═════════════════════════════════════════════════════════════════
function tobMedsSorted(cli){
  return [...(cli?.mediciones||[])].sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
}
function tobMedSum(med){
  return TOB_MED_PLECS.reduce((s,[k]) => s + (parseFloat(med?.plecs?.[k])||0), 0);
}
function tobMedRatios(med){
  const cintura = parseFloat(med?.perimetres?.cintura);
  const malucs  = parseFloat(med?.perimetres?.malucs);
  const pes     = parseFloat(med?.pes);
  const sum     = tobMedSum(med);
  return {
    cinturaCadera: (malucs > 0 && !isNaN(cintura)) ? cintura/malucs : null,
    plecsPes:      (pes > 0) ? sum/pes : null
  };
}
function tobMedAge(cli, fecha){
  if(!cli) return null;
  // 1) Fecha de nacimiento → edad exacta a la fecha dada
  if(cli.nacimiento && fecha){
    const n = new Date(cli.nacimiento), f = new Date(fecha);
    if(!isNaN(n) && !isNaN(f)){
      let age = f.getFullYear() - n.getFullYear();
      const m = f.getMonth() - n.getMonth();
      if(m < 0 || (m === 0 && f.getDate() < n.getDate())) age--;
      if(age >= 0 && age < 130) return age;
    }
  }
  // 2) Edad directa (introducida en una medición) + años transcurridos
  if(cli.edad != null && cli.edad !== ''){
    let age = +cli.edad;
    if(cli.edadFecha && fecha){
      const a = new Date(cli.edadFecha), f = new Date(fecha);
      if(!isNaN(a) && !isNaN(f)) age += Math.max(0, f.getFullYear() - a.getFullYear());
    }
    if(age >= 0 && age < 130) return age;
  }
  return null;
}
function tobMedShortLabel(fecha){
  const [y,mo] = String(fecha||'').split('-');
  return (mo && y) ? `${mo}/${y.slice(2)}` : (fecha || '?');
}

function tobCalcMedKPIs(cli){
  const meds = tobMedsSorted(cli);
  const first = meds[0], last = meds[meds.length-1];
  const r1 = v => (v == null ? '—' : Math.round(v*10)/10);
  const deltaHtml = (cur, prev, unit) => {
    if(cur == null || prev == null) return '';
    const d = cur - prev;
    if(Math.abs(d) < 0.05) return `<div class="delta">= sin cambio vs inicio</div>`;
    return `<div class="delta">${d>0?'+':''}${Math.round(d*10)/10} ${unit} vs inicio</div>`;
  };
  const pesA = last?.pes != null ? +last.pes : null;
  const pesF = first?.pes != null ? +first.pes : null;
  const sumA = last ? tobMedSum(last) : null;
  const sumF = first ? tobMedSum(first) : null;
  const cinA = last?.perimetres?.cintura != null ? +last.perimetres.cintura : null;
  const cinF = first?.perimetres?.cintura != null ? +first.perimetres.cintura : null;
  return {
    count: meds.length,
    pes: r1(pesA),     pesDelta: deltaHtml(pesA, pesF, 'kg'),
    sum: r1(sumA),     sumDelta: deltaHtml(sumA, sumF, 'mm'),
    cintura: r1(cinA), cinturaDelta: deltaHtml(cinA, cinF, 'cm')
  };
}

// ── Modal medición ──
function tobOpenMedicionModal(medId){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha de un cliente primero', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const meds = tobMedsSorted(cli);
  const med = medId ? (cli.mediciones||[]).find(m => m.id === medId) : null;
  const lastMed = meds[meds.length-1];
  document.getElementById('tobMedicionModalTitle').textContent = med ? 'Editar medición' : 'Nueva medición';
  document.getElementById('tobMedFecha').value = med?.fecha || new Date().toISOString().slice(0,10);
  document.getElementById('tobMedPes').value = med?.pes ?? '';
  document.getElementById('tobMedEstatura').value = med?.estatura ?? lastMed?.estatura ?? '';
  document.getElementById('tobMedNotas').value = med?.notas || '';
  // Edad / fecha de nacimiento del cliente (para Harris-Benedict)
  const modoSel = document.getElementById('tobMedEdadModo');
  if(modoSel){
    const nacInp = document.getElementById('tobMedNacimiento');
    const edadInp = document.getElementById('tobMedEdad');
    if(cli.nacimiento){
      modoSel.value = 'nac'; nacInp.value = cli.nacimiento; edadInp.value = '';
    } else if(cli.edad != null && cli.edad !== ''){
      modoSel.value = 'edad'; edadInp.value = cli.edad; nacInp.value = '';
    } else {
      modoSel.value = 'nac'; nacInp.value = ''; edadInp.value = '';
    }
    tobMedEdadModoChange();
  }
  // Para una NUEVA medición, mostrar bajo cada input el valor de la anterior
  // (clicable para copiarlo). Si estamos editando, se ocultan los hints porque
  // los valores ya están en los inputs.
  const showPrev = !med;
  const refMed = showPrev ? lastMed : null;
  const _L_modal = tobLangOf(cli);
  document.getElementById('tobMedPlecsRow').innerHTML = TOB_MED_PLECS.map(def => {
    const [k] = def;
    const label = tobMedLabel(def, _L_modal);
    const prev = refMed?.plecs?.[k];
    const hint = (prev != null)
      ? `<div class="tob-med-prev" onclick="tobMedFillPrev('tobMedPlec_${k}',${prev})" title="Clic para usar el valor de la medición anterior (${refMed.fecha})">ant: <b>${prev}</b> mm</div>`
      : '';
    return `<div><label class="tob-lbl">${label}</label><input class="tob-input" type="number" step="0.1" id="tobMedPlec_${k}" value="${med?.plecs?.[k] ?? ''}" placeholder="mm">${hint}</div>`;
  }).join('');
  document.getElementById('tobMedPerimRow').innerHTML = TOB_MED_PERIM.map(def => {
    const [k] = def;
    const label = tobMedLabel(def, _L_modal);
    const prev = refMed?.perimetres?.[k];
    const hint = (prev != null)
      ? `<div class="tob-med-prev" onclick="tobMedFillPrev('tobMedPerim_${k}',${prev})" title="Clic para usar el valor de la medición anterior (${refMed.fecha})">ant: <b>${prev}</b> cm</div>`
      : '';
    return `<div><label class="tob-lbl">${label}</label><input class="tob-input" type="number" step="0.1" id="tobMedPerim_${k}" value="${med?.perimetres?.[k] ?? ''}" placeholder="cm">${hint}</div>`;
  }).join('');
  document.getElementById('tobMedDelBtn').style.display = med ? '' : 'none';
  document.getElementById('tobMedicionModalBg').dataset.editId = med?.id || '';
  document.getElementById('tobMedicionModalBg').classList.add('on');
}
function tobCloseMedicionModal(){ document.getElementById('tobMedicionModalBg').classList.remove('on'); }

// Alterna entre introducir fecha de nacimiento o edad directa.
function tobMedEdadModoChange(){
  const modo = document.getElementById('tobMedEdadModo').value;
  const nacInp = document.getElementById('tobMedNacimiento');
  const edadInp = document.getElementById('tobMedEdad');
  if(nacInp)  nacInp.style.display  = modo === 'nac'  ? '' : 'none';
  if(edadInp) edadInp.style.display = modo === 'edad' ? '' : 'none';
}

function tobSaveMedicion(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Sin cliente', 'red'); return; }
  const fecha = document.getElementById('tobMedFecha').value;
  const pes = parseFloat(document.getElementById('tobMedPes').value);
  if(!fecha){ tobToast('Falta la fecha', 'red'); return; }
  if(isNaN(pes)){ tobToast('Falta el peso', 'red'); return; }
  const num = id => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; };
  const plecs = {}; TOB_MED_PLECS.forEach(([k]) => plecs[k] = num('tobMedPlec_'+k));
  const perimetres = {}; TOB_MED_PERIM.forEach(([k]) => perimetres[k] = num('tobMedPerim_'+k));
  const data = {
    fecha, pes,
    estatura: num('tobMedEstatura'),
    plecs, perimetres,
    notas: document.getElementById('tobMedNotas').value.trim()
  };
  // Edad / fecha de nacimiento del cliente — el modo elegido manda.
  const edadModo = document.getElementById('tobMedEdadModo')?.value;
  if(edadModo === 'nac'){
    const nac = document.getElementById('tobMedNacimiento').value;
    if(nac){ cli.nacimiento = nac; delete cli.edad; delete cli.edadFecha; }
  } else if(edadModo === 'edad'){
    const ed = parseInt(document.getElementById('tobMedEdad').value);
    if(Number.isFinite(ed)){ cli.edad = ed; cli.edadFecha = fecha; delete cli.nacimiento; }
  }
  if(!cli.mediciones) cli.mediciones = [];
  const editId = document.getElementById('tobMedicionModalBg').dataset.editId;
  if(editId){
    const m = cli.mediciones.find(m => m.id === editId);
    if(m) Object.assign(m, data);
  } else {
    data.id = tobUid('med');
    cli.mediciones.push(data);
  }
  tobSave();
  tobCloseMedicionModal();
  tobRenderFicha();
  tobToast('✓ Medición guardada', 'green');
}
function tobDelMedicionFromModal(){
  const editId = document.getElementById('tobMedicionModalBg').dataset.editId;
  if(editId) tobDelMedicion(editId);
}
function tobDelMedicion(medId){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  tobConfirm('¿Eliminar medición?', 'Se borra esta medición. No se puede deshacer.', () => {
    cli.mediciones = (cli.mediciones||[]).filter(m => m.id !== medId);
    tobSave();
    tobCloseMedicionModal();
    tobRenderFicha();
    tobToast('Eliminada', 'green');
  });
}

// Rellena un input del modal con el valor de la medición anterior (clic en hint).
function tobMedFillPrev(id, v){
  const el = document.getElementById(id);
  if(el){ el.value = v; el.focus(); }
}

// ── Comparar 2 mediciones lado a lado ──
function tobOpenMedCompare(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const meds = tobMedsSorted(cli);
  if(meds.length < 2){ tobToast('Necesitas al menos 2 mediciones para comparar', 'red'); return; }
  const opts = meds.map(m => `<option value="${m.id}">${m.fecha}  ·  ${m.pes != null ? m.pes + ' kg' : '—'}</option>`).join('');
  document.getElementById('tobMedCmpA').innerHTML = opts;
  document.getElementById('tobMedCmpB').innerHTML = opts;
  document.getElementById('tobMedCmpA').value = meds[0].id;
  document.getElementById('tobMedCmpB').value = meds[meds.length-1].id;
  tobRenderMedCmp();
  document.getElementById('tobMedCompareBg').classList.add('on');
}
function tobCloseMedCompare(){ document.getElementById('tobMedCompareBg').classList.remove('on'); }
function tobRenderMedCmp(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const idA = document.getElementById('tobMedCmpA').value;
  const idB = document.getElementById('tobMedCmpB').value;
  const A = (cli.mediciones||[]).find(m => m.id === idA);
  const B = (cli.mediciones||[]).find(m => m.id === idB);
  const body = document.getElementById('tobMedCmpBody');
  if(!A || !B){ body.innerHTML = '<div style="color:var(--mute);">Selecciona dos mediciones</div>'; return; }
  const fmtV = (v, dec=1) => v == null ? '—' : (Math.round(+v * Math.pow(10,dec)) / Math.pow(10,dec));
  const row = (label, a, b, unit, dec=1, sub=false) => {
    const av = a != null ? +a : null;
    const bv = b != null ? +b : null;
    const d = (av != null && bv != null) ? (bv - av) : null;
    const dStr = d == null ? '—' : `${d>0?'+':''}${Math.round(d*Math.pow(10,dec))/Math.pow(10,dec)}`;
    const dCol = d == null || Math.abs(d) < Math.pow(10,-dec)/2 ? 'var(--mute)' : 'var(--acc2)';
    return `<tr${sub?' class="subrow"':''}>
      <td>${label}</td>
      <td class="num">${fmtV(av,dec)}${unit?' '+unit:''}</td>
      <td class="num">${fmtV(bv,dec)}${unit?' '+unit:''}</td>
      <td class="num" style="color:${dCol};font-weight:700">${dStr}${unit?' '+unit:''}</td>
    </tr>`;
  };
  const sectionRow = (label) => `<tr class="section"><td colspan="4">${label}</td></tr>`;
  const sumA = tobMedSum(A), sumB = tobMedSum(B);
  const rA = tobMedRatios(A), rB = tobMedRatios(B);
  body.innerHTML = `<table class="tob-med-cmp">
    <thead><tr>
      <th>Métrica</th>
      <th class="num">${A.fecha || '?'}</th>
      <th class="num">${B.fecha || '?'}</th>
      <th class="num">Δ (B − A)</th>
    </tr></thead>
    <tbody>
      ${sectionRow('Datos')}
      ${row('Peso', A.pes, B.pes, 'kg')}
      ${row('Estatura', A.estatura, B.estatura, 'cm')}
      ${sectionRow('Pliegues (mm)')}
      ${TOB_MED_PLECS.map(def => row(tobMedLabel(def, tobLangOf(cli)), A.plecs?.[def[0]], B.plecs?.[def[0]], 'mm', 1, true)).join('')}
      <tr class="total">${row('Σ 6 Pliegues', sumA, sumB, 'mm').replace(/<tr[^>]*>/,'').replace(/<\/tr>/,'')}</tr>
      ${sectionRow('Perímetros (cm)')}
      ${TOB_MED_PERIM.map(def => row(tobMedLabel(def, tobLangOf(cli)), A.perimetres?.[def[0]], B.perimetres?.[def[0]], 'cm', 1, true)).join('')}
      ${sectionRow('Ratios')}
      ${row('Cintura / Cadera', rA.cinturaCadera, rB.cinturaCadera, '', 2)}
      ${row('Pliegues / Peso', rA.plecsPes, rB.plecsPes, '', 2)}
    </tbody>
  </table>`;
}

// ── Tabla + gráficas de mediciones en la ficha ──
function tobRenderFichaMediciones(cli){
  const tableCont = document.getElementById('tobFichaMedTable');
  if(!tableCont) return;
  const meds = tobMedsSorted(cli);
  if(!meds.length){
    tableCont.innerHTML = '<div style="color:var(--mute2);padding:14px;">Sin mediciones. Añade la primera con <strong>+ Añadir medición</strong>.</div>';
  } else {
    const deltaSpan = (cur, prev, dec) => {
      if(prev == null || cur == null) return '';
      const d = cur - prev;
      if(Math.abs(d) < 0.05) return '';
      const f = Math.round(d * Math.pow(10,dec)) / Math.pow(10,dec);
      return ` <span class="tob-med-d">${d>0?'+':''}${f}</span>`;
    };
    const rows = meds.map((m, i) => {
      const prev = i > 0 ? meds[i-1] : null;
      return { m, prev, sum: tobMedSum(m), prevSum: prev ? tobMedSum(prev) : null, ratios: tobMedRatios(m) };
    }).reverse().map(({m, prev, sum, prevSum, ratios}) => {
      const cintura = m.perimetres?.cintura;
      return `<tr>
        <td><strong>${tobEsc(m.fecha || '—')}</strong></td>
        <td>${m.pes ?? '—'}${deltaSpan(m.pes!=null?+m.pes:null, prev?.pes!=null?+prev.pes:null, 1)}</td>
        <td>${sum.toFixed(1)}${deltaSpan(sum, prevSum, 1)}</td>
        <td>${cintura ?? '—'}${deltaSpan(cintura!=null?+cintura:null, prev?.perimetres?.cintura!=null?+prev.perimetres.cintura:null, 1)}</td>
        <td>${ratios.cinturaCadera != null ? ratios.cinturaCadera.toFixed(2) : '—'}</td>
        <td>${ratios.plecsPes != null ? ratios.plecsPes.toFixed(2) : '—'}</td>
        <td class="actions">
          <button class="tob-action ghost" style="padding:4px 9px;" onclick="tobOpenMedicionModal('${m.id}')">✏️</button>
          <button class="tob-action danger" style="padding:4px 9px;" onclick="tobDelMedicion('${m.id}')">🗑</button>
        </td>
      </tr>`;
    }).join('');
    tableCont.innerHTML = `<table class="tob-table">
      <thead><tr>
        <th>Fecha</th><th>Peso (kg)</th><th>Σ Pliegues (mm)</th>
        <th>Cintura (cm)</th><th>Cintura/Cadera</th><th>Pliegues/Peso</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  tobRenderMedCharts(cli);
}

// Configs Chart.js de mediciones (reutilizadas por la ficha y el PDF).
// forPdf=true → colores oscuros sobre fondo blanco.
function tobBuildMedChartConfigs(cli, forPdf){
  const meds = tobMedsSorted(cli);
  if(!meds.length) return {};
  const labels = meds.map(m => tobMedShortLabel(m.fecha));
  const fechas = meds.map(m => m.fecha || '');
  const ACC = '#f5a623';
  const txtCol  = forPdf ? '#555555' : '#9aa7bd';
  const txtCol2 = forPdf ? '#222222' : '#e6e2d4';
  const gridCol = forPdf ? '#e6e6e6' : '#221d14';

  // Línea bonita: relleno en degradado, último punto resaltado (valor actual),
  // datalabels limpios. Reutilizable en pantalla y en PDF.
  const lineChart = (label, data, color) => {
    let lastIdx = -1;
    for(let i = data.length - 1; i >= 0; i--){ if(data[i] != null){ lastIdx = i; break; } }
    return {
      type: 'line',
      data: { labels, datasets: [{
        label, data, borderColor: color, borderWidth: 3,
        backgroundColor: (c) => {
          const ch = c.chart, area = ch.chartArea;
          if(!area) return color + '22';
          const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, color + '66');
          g.addColorStop(1, color + '08');
          return g;
        },
        pointBackgroundColor: data.map((v,i) => i === lastIdx ? color : (forPdf ? '#ffffff' : '#13130f')),
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: data.map((v,i) => v == null ? 0 : (i === lastIdx ? 7 : 4)),
        pointHoverRadius: 9,
        tension: 0.3, fill: true, spanGaps: true
      }]},
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 20, right: 14, left: 4, bottom: 2 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: ctx => `${label}: ${ctx.parsed.y}`,
            afterLabel: ctx => fechas[ctx.dataIndex] ? '📅 ' + fechas[ctx.dataIndex] : ''
          } },
          datalabels: {
            color: (c) => c.dataIndex === lastIdx ? color : txtCol2,
            font: (c) => ({ size: c.dataIndex === lastIdx ? 11 : 9, weight: c.dataIndex === lastIdx ? '800' : '600' }),
            align: 'top', offset: 6,
            formatter: v => (v == null ? '' : v)
          }
        },
        scales: {
          x: { ticks: { color: txtCol, font: { size: 9 }, maxRotation: 40 },
               grid: { color: gridCol, drawTicks: false }, border: { display: false } },
          y: { ticks: { color: txtCol, font: { size: 9 }, padding: 6 },
               grid: { color: gridCol, drawTicks: false }, border: { display: false }, beginAtZero: false }
        }
      }
    };
  };

  const first = meds[0], last = meds[meds.length-1];
  const cfgs = {};
  cfgs.peso    = lineChart('Peso (kg)',       meds.map(m => m.pes != null ? +m.pes : null), ACC);
  cfgs.plecs   = lineChart('Σ Pliegues (mm)', meds.map(m => +tobMedSum(m).toFixed(1)), '#60a5fa');
  cfgs.cintura = lineChart('Cintura (cm)',    meds.map(m => m.perimetres?.cintura != null ? +m.perimetres.cintura : null), '#f472b6');
  cfgs.cc      = lineChart('Cintura/Cadera',  meds.map(m => { const r = tobMedRatios(m).cinturaCadera; return r != null ? +r.toFixed(3) : null; }), '#3fb68b');
  cfgs.pp      = lineChart('Pliegues/Peso',   meds.map(m => { const r = tobMedRatios(m).plecsPes; return r != null ? +r.toFixed(3) : null; }), '#a78bfa');

  const _L_chart = tobLangOf(cli);
  cfgs.perim = {
    type: 'bar',
    data: {
      labels: TOB_MED_PERIM.map(def => tobMedLabel(def, _L_chart)),
      datasets: [
        { label: 'Inicio · ' + (first.fecha||''), data: TOB_MED_PERIM.map(([k]) => first.perimetres?.[k] ?? null),
          backgroundColor: (forPdf ? '#d8d2c0' : '#4a443666'), borderColor: '#8a7f6a', borderWidth: 1, borderRadius: 4, borderSkipped: false },
        { label: 'Actual · ' + (last.fecha||''), data: TOB_MED_PERIM.map(([k]) => last.perimetres?.[k] ?? null),
          backgroundColor: ACC + (forPdf ? 'ee' : 'dd'), borderColor: ACC, borderWidth: 1, borderRadius: 4, borderSkipped: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      layout: { padding: { right: 38, left: 2 } },
      plugins: {
        legend: { position: 'top', labels: { color: txtCol2, font: { size: 9 }, boxWidth: 12, padding: 10 } },
        datalabels: {
          display: true, anchor: 'end', align: 'end', offset: 4,
          color: (c) => c.datasetIndex === 1 ? ACC : (forPdf ? '#666666' : '#8a7f6a'),
          font: (c) => ({ size: 9, weight: c.datasetIndex === 1 ? '800' : '600' }),
          formatter: v => v == null ? '' : v
        },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x} cm` } }
      },
      scales: {
        x: { ticks: { color: txtCol, font: { size: 9 } }, grid: { color: gridCol, drawTicks: false }, border: { display: false }, beginAtZero: true },
        y: { ticks: { color: txtCol2, font: { size: 9, weight: '600' } }, grid: { display: false }, border: { display: false } }
      }
    }
  };

  cfgs.radar = {
    type: 'radar',
    data: {
      labels: TOB_MED_PLECS.map(def => tobMedLabel(def, _L_chart)),
      datasets: [
        { label: 'Inicio · ' + (first.fecha||''), data: TOB_MED_PLECS.map(([k]) => first.plecs?.[k] ?? null),
          borderColor: '#8a7f6a', backgroundColor: (forPdf ? 'rgba(138,127,106,.15)' : 'rgba(138,127,106,.22)'),
          pointBackgroundColor: '#8a7f6a', pointRadius: 3, borderWidth: 2 },
        { label: 'Actual · ' + (last.fecha||''), data: TOB_MED_PLECS.map(([k]) => last.plecs?.[k] ?? null),
          borderColor: ACC, backgroundColor: ACC + '3a', pointBackgroundColor: ACC, pointRadius: 3.5, borderWidth: 2.5 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: txtCol2, font: { size: 9 }, boxWidth: 12, padding: 10 } },
        datalabels: {
          // Solo etiquetamos el "Actual" para no saturar el radar.
          display: (c) => c.datasetIndex === 1,
          color: ACC, font: { size: 9, weight: '800' }, align: 'end', offset: 4,
          formatter: v => v == null ? '' : v,
          textStrokeColor: forPdf ? '#ffffff' : '#0a0a0c', textStrokeWidth: 3
        }
      },
      scales: { r: {
        angleLines: { color: forPdf ? '#dddddd' : '#2f2a20' },
        grid: { color: forPdf ? '#e6e6e6' : '#2f2a20' },
        pointLabels: { color: txtCol2, font: { size: 9, weight: '600' } },
        ticks: { color: txtCol, backdropColor: 'transparent', font: { size: 8 } },
        beginAtZero: true
      } }
    }
  };
  return cfgs;
}

function tobRenderMedCharts(cli){
  const grid = document.getElementById('tobFichaMedCharts');
  if(!grid) return;
  const cfgs = tobBuildMedChartConfigs(cli, false);
  if(!Object.keys(cfgs).length){
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--mute2);padding:20px;text-align:center;">Sin mediciones aún.</div>';
    return;
  }
  const order = [
    ['peso',    'Peso corporal'],
    ['plecs',   'Σ Pliegues cutáneos'],
    ['cintura', 'Cintura'],
    ['perim',   'Perímetros · inicio vs actual'],
    ['radar',   'Pliegues · inicio vs actual'],
    ['cc',      'Ratio Cintura / Cadera'],
    ['pp',      'Ratio Pliegues / Peso']
  ];
  grid.innerHTML = order.map(([k,title]) => `
    <div class="tob-chart-card">
      <div class="hdr">${title}</div>
      <div class="body"><canvas id="tobMedChart_${k}"></canvas></div>
    </div>`).join('');
  if(window.ChartDataLabels && Chart.register){ try { Chart.register(ChartDataLabels); } catch(e){} }
  order.forEach(([k]) => {
    const canvas = document.getElementById('tobMedChart_' + k);
    if(!canvas || !cfgs[k]) return;
    tobFichaCharts['med_' + k] = new Chart(canvas, cfgs[k]);
  });
}

// ═══ PDF EVOLUCIÓN — informe de composición corporal ═══════════
async function tobGeneratePdfMediciones(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  if(!(cli.mediciones||[]).length){ tobToast('Este cliente no tiene mediciones', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF de evolución...', '');
  await tobBuildPdfMediciones(cli).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

// Bundle de fuentes + colores reutilizable por los PDFs (mediciones, resumen,
// histórico). Mantener los mismos colores en todos los PDFs.
async function tobPdfCtx(doc){
  const { StandardFonts, rgb } = PDFLib;
  return {
    rgb,
    font:  await doc.embedFont(StandardFonts.Helvetica),
    fontB: await doc.embedFont(StandardFonts.HelveticaBold),
    fontO: await doc.embedFont(StandardFonts.HelveticaOblique),
    ORANGE: rgb(0.96,0.65,0.13), BLACK: rgb(0.06,0.06,0.06),
    GRAY: rgb(0.55,0.55,0.55), GRAY_DK: rgb(0.25,0.25,0.25),
    GREEN: rgb(0.18,0.6,0.4), RED: rgb(0.85,0.25,0.25),
    W: 842, H: 595
  };
}

async function tobBuildPdfMediciones(cli){
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  const ctx = await tobPdfCtx(doc);
  const { font, fontB, fontO, ORANGE, BLACK, GRAY, GRAY_DK, W, H, rgb } = ctx;
  const meds = tobMedsSorted(cli);
  const first = meds[0], last = meds[meds.length-1];
  const L = tobLangOf(cli);
  const vsInicio = tobT('med.kpi.vs_inicio', L);

  // ─── COVER ───
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H, color: ORANGE });
  page.drawText('FULL', { x: 100, y: H-100, size: 56, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H-156, size: 56, font: fontB, color: BLACK });
  page.drawText(tobT('med.cover.titulo', L), { x: 100, y: H-180, size: 12, font, color: GRAY });
  page.drawText(tobPdfSafe(cli.nombre || '-'), { x: 100, y: H-240, size: 32, font: fontB, color: BLACK });
  page.drawText(tobT('cover.periodo', L, { desde: first.fecha || '?', hasta: last.fecha || '?' }), { x: 100, y: H-268, size: 13, font, color: GRAY_DK });
  const pesDelta = (last.pes != null && first.pes != null) ? (+last.pes - +first.pes) : null;
  const sumDelta = tobMedSum(last) - tobMedSum(first);
  const kpisCover = [
    [tobT('med.kpi.mediciones', L), String(meds.length), ''],
    [tobT('med.kpi.peso_actual', L), (last.pes != null ? last.pes : '-') + tobT('unit.kg', L), pesDelta != null ? `${pesDelta>=0?'+':''}${(+pesDelta.toFixed(1))}${tobT('unit.kg', L)}` : ''],
    [tobT('med.kpi.suma_6_plecs', L), tobMedSum(last).toFixed(1) + tobT('unit.mm', L), `${sumDelta>=0?'+':''}${sumDelta.toFixed(1)}${tobT('unit.mm', L)}`]
  ];
  const kpiW = 200, kpiH = 88, kpiGap = 16, kpiY = 165;
  kpisCover.forEach((kp, i) => {
    const x = 100 + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+14, y: kpiY+32, size: 24, font: fontB, color: BLACK });
    if(kp[2]) page.drawText(kp[2] + vsInicio, { x: x+14, y: kpiY+14, size: 8, font, color: GRAY });
  });
  page.drawText('FULL TRAINING - BIIO System', { x: W-230, y: 40, size: 9, font: fontO, color: GRAY });

  // Páginas: evolución + composición + detalle por medición
  await _tobPdfMedicionPages(doc, ctx, cli);

  // Paginación
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_evolucion_${new Date().toISOString().slice(0,10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF de evolución descargado', 'green');
}

// Añade las páginas de mediciones (evolución + composición inicio-vs-actual +
// detalle por medición) a un PDF existente. Reutilizado por "PDF Evolución"
// y por "PDF Histórico" (cuando el cliente tiene mediciones).
async function _tobPdfMedicionPages(doc, ctx, cli){
  const { font, fontB, fontO, ORANGE, BLACK, GRAY, GRAY_DK, GREEN, RED, W, H, rgb } = ctx;
  const meds = tobMedsSorted(cli);
  if(!meds.length) return;
  const cfgs = tobBuildMedChartConfigs(cli, true);
  const L = tobLangOf(cli);

  // ─── PÁGINA EVOLUCIÓN: 4 line charts 2×2 ───
  let page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('med.evol.titulo', L), cli.nombre || '', W, H);
  {
    const chW = 380, chH = 215, gapX = 30, gapY = 24;
    const ox = (W - (chW*2 + gapX)) / 2;
    const oy = H - 80;
    const slots = [
      ['peso',  tobT('med.evol.peso_corporal', L)],
      ['plecs', tobT('med.evol.sum_plecs', L)],
      ['pp',    tobT('med.evol.ratio_plecs_pes', L)],
      ['cc',    tobT('med.evol.ratio_cintura_maluc', L)]
    ];
    for(let i = 0; i < slots.length; i++){
      const [k, title] = slots[i];
      if(!cfgs[k]) continue;
      const col = i % 2, row = Math.floor(i / 2);
      const x = ox + col*(chW+gapX);
      const yTop = oy - row*(chH+gapY);
      page.drawText(title, { x, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
      try {
        const png = await tobChartToPng(cfgs[k], 760, 430);
        page.drawImage(await doc.embedPng(png), { x, y: yTop - chH, width: chW, height: chH });
      } catch(e){ console.warn('chart', k, e); page.drawText(tobT('error.no_grafica', L), { x, y: yTop - chH/2, size: 9, font: fontO, color: GRAY }); }
    }
  }

  // ─── PÁGINA COMPOSICIÓN: perim bar + radar plecs ───
  page = doc.addPage([W, H]);
  drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('med.comp.titulo', L), cli.nombre || '', W, H);
  {
    const chW = 380, chH = 380, gapX = 30;
    const ox = (W - (chW*2 + gapX)) / 2;
    const yTop = H - 90;
    page.drawText(tobT('med.comp.perimetros', L), { x: ox, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
    page.drawText(tobT('med.comp.plecs_cutanis', L), { x: ox + chW + gapX, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
    try {
      const png1 = await tobChartToPng(cfgs.perim, 700, 700);
      page.drawImage(await doc.embedPng(png1), { x: ox, y: yTop - chH, width: chW, height: chH });
    } catch(e){ console.warn(e); }
    try {
      const png2 = await tobChartToPng(cfgs.radar, 700, 700);
      page.drawImage(await doc.embedPng(png2), { x: ox + chW + gapX, y: yTop - chH, width: chW, height: chH });
    } catch(e){ console.warn(e); }
  }

  // ─── PÁGINAS DETALLE: una por medición (más reciente primero) ───
  // Convención de datos: H=Hombre/Home/Male, M=Mujer/Dona/Female.
  const sexoTxt = cli.sexo === 'M' ? tobT('med.sexo.dona', L) : cli.sexo === 'H' ? tobT('med.sexo.home', L) : '-';
  for(let idx = meds.length - 1; idx >= 0; idx--){
    const m = meds[idx];
    const prev = idx > 0 ? meds[idx-1] : null;
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('med.detalle.titulo', L), `${cli.nombre || ''}  -  ${m.fecha || ''}`, W, H);

    let yy = H - 78;
    page.drawRectangle({ x: 30, y: yy-66, width: W-60, height: 66, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x: 30, y: yy-4, width: W-60, height: 4, color: ORANGE });
    const edat = tobMedAge(cli, m.fecha);
    const dadesA = [
      [tobT('med.detalle.nombre', L), cli.nombre || '-'],
      [tobT('med.detalle.edad', L),   edat != null ? String(edat) : '-'],
      [tobT('med.detalle.sexo', L),   sexoTxt]
    ];
    const pesTxt = (m.pes != null ? m.pes : '-') + (prev && m.pes!=null && prev.pes!=null ? `   (${(+m.pes - +prev.pes)>=0?'+':''}${(+(m.pes - prev.pes)).toFixed(1)})` : '');
    const dadesB = [
      [tobT('med.detalle.peso', L),         pesTxt],
      [tobT('med.detalle.estatura', L),     m.estatura != null ? m.estatura : '-'],
      [tobT('med.detalle.data_medicion', L), m.fecha || '-']
    ];
    dadesA.forEach((d, i) => {
      page.drawText(d[0], { x: 48, y: yy-22-i*16, size: 8, font: fontB, color: GRAY });
      page.drawText(String(d[1]), { x: 135, y: yy-22-i*16, size: 9, font, color: BLACK });
    });
    dadesB.forEach((d, i) => {
      page.drawText(d[0], { x: 440, y: yy-22-i*16, size: 8, font: fontB, color: GRAY });
      page.drawText(String(d[1]), { x: 560, y: yy-22-i*16, size: 9, font, color: BLACK });
    });

    yy -= 92;
    const tableTop = yy;
    const colW = (W - 90) / 2;
    const drawMetricTable = (x, w, title, defs, valObj, prevObj, sumRow) => {
      page.drawRectangle({ x, y: tableTop-2, width: w, height: 18, color: ORANGE });
      page.drawText(title, { x: x+10, y: tableTop+3, size: 9, font: fontB, color: BLACK });
      let ry = tableTop - 18;
      defs.forEach((def, i) => {
        const k = def[0];
        const label = tobMedLabel(def, L);  // L = idioma del cliente (en scope)
        if(i % 2 === 1) page.drawRectangle({ x, y: ry-4, width: w, height: 15, color: rgb(0.96,0.96,0.96) });
        const cur = valObj?.[k];
        const pv  = prevObj?.[k];
        page.drawText(label, { x: x+10, y: ry, size: 8.5, font, color: GRAY_DK });
        page.drawText(cur != null ? String(cur) : '-', { x: x+w-95, y: ry, size: 9, font: fontB, color: BLACK });
        if(cur != null && pv != null){
          const d = +(cur - pv).toFixed(1);
          if(Math.abs(d) >= 0.05) page.drawText(`${d>0?'+':''}${d}`, { x: x+w-48, y: ry, size: 8, font: fontB, color: d>0?RED:GREEN });
        }
        ry -= 15;
      });
      if(sumRow){
        page.drawLine({ start:{x, y:ry+8}, end:{x:x+w, y:ry+8}, thickness: 1, color: ORANGE });
        page.drawText(sumRow[0], { x: x+10, y: ry-5, size: 9, font: fontB, color: BLACK });
        page.drawText(sumRow[1], { x: x+w-95, y: ry-5, size: 10, font: fontB, color: BLACK });
        if(sumRow[2] != null && Math.abs(sumRow[2]) >= 0.05)
          page.drawText(`${sumRow[2]>0?'+':''}${sumRow[2]}`, { x: x+w-48, y: ry-5, size: 8, font: fontB, color: sumRow[2]>0?RED:GREEN });
        ry -= 18;
      }
      return ry;
    };
    const sum = tobMedSum(m), prevSum = prev ? tobMedSum(prev) : null;
    drawMetricTable(30, colW, tobT('med.tabla.plecs_titulo', L), TOB_MED_PLECS, m.plecs, prev?.plecs,
      [tobT('med.tabla.suma6plecs', L), sum.toFixed(1), prevSum != null ? +(sum - prevSum).toFixed(1) : null]);
    drawMetricTable(30 + colW + 30, colW, tobT('med.comp.perimetros', L), TOB_MED_PERIM, m.perimetres, prev?.perimetres, null);

    const r = tobMedRatios(m);
    const cm = r.cinturaCadera != null ? r.cinturaCadera.toFixed(2) : '-';
    const pp = r.plecsPes != null ? r.plecsPes.toFixed(2) : '-';
    const rTxt = `${tobT('med.ratio.cintura_maluc', L, { val: cm })}        ${tobT('med.ratio.plecs_pes', L, { val: pp })}`;
    page.drawText(rTxt, { x: 30, y: 58, size: 9, font: fontB, color: GRAY_DK });
    if(m.notas) page.drawText(tobPdfSafe(tobT('med.detalle.notas', L, { texto: tobTrunc(m.notas, 120) })), { x: 30, y: 42, size: 8, font: fontO, color: GRAY });
  }
}

// ═══ PDF RESUMEN — solo la última rutina (para entregar resultados) ═══
async function tobGeneratePdfUltimaRutina(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  const asigs = [...(cli.asignaciones||[])].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));
  const a = asigs[asigs.length-1];
  if(!a){ tobToast('Este cliente no tiene rutinas', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  tobToast('⏳ Generando resumen de la última rutina...', '');
  await tobBuildPdfResumenRutina(cli, a, pl).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobGeneratePdfResumenActual(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando resumen de la rutina...', '');
  await tobBuildPdfResumenRutina(cli, a, pl).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobBuildPdfResumenRutina(cli, a, pl){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font  = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const W = 842, H = 595;
  const rutinaShort = tobRutinaShortName(pl);
  const stats = tobCalcAsigStats(a);
  const L = tobLangOf(cli);

  // ─── COVER ───
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 50, height: H, color: ORANGE });
  const LX = 80;
  page.drawText('FULL', { x: LX, y: H-95, size: 48, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: LX, y: H-143, size: 48, font: fontB, color: BLACK });
  page.drawText(tobT('resum.cover.titulo', L), { x: LX, y: H-165, size: 12, font, color: GRAY });
  page.drawText(tobPdfSafe(cli?.nombre || '-'), { x: LX, y: H-220, size: 30, font: fontB, color: BLACK });
  page.drawText(tobPdfSafe(rutinaShort), { x: LX, y: H-246, size: 14, font, color: GRAY_DK });
  if(pl) page.drawText(tobPdfSafe(`${pl.macrociclo || ''}${pl.macrociclo ? ' - ' : ''}${pl.categoria || ''}`), { x: LX, y: H-264, size: 10, font: fontO, color: GRAY });
  page.drawText(tobT('cover.periodo', L, { desde: a.fechaInicio || '?', hasta: stats.ultimaFecha || '?' }), { x: LX, y: H-282, size: 10, font, color: GRAY_DK });

  const kpis = [
    [tobT('resum.kpi.sesiones', L),    String(stats.sesiones)],
    [tobT('resum.kpi.iteraciones', L), String((a.iteraciones||[]).length)],
    [tobT('resum.kpi.estado', L),      (a.estado || tobT('resum.estado.en_curso', L)).replace('_',' ').toUpperCase()]
  ];
  const kpiW = 180, kpiH = 84, kpiGap = 16, kpiY = 170;
  kpis.forEach((kp, i) => {
    const x = LX + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-26, size: 9, font: fontB, color: GRAY });
    page.drawText(kp[1], { x: x+14, y: kpiY+28, size: kp[1].length > 9 ? 15 : 28, font: fontB, color: BLACK });
  });

  const prs = Object.entries(stats.maxByEj).slice(0, 6);
  if(prs.length){
    page.drawText(tobT('resum.records.titulo', L), { x: W-330, y: H-95, size: 10, font: fontB, color: ORANGE });
    prs.forEach((pr, i) => {
      const py = H-118 - i*20;
      page.drawText(tobPdfSafe(tobTrunc(pr[0], 26)), { x: W-330, y: py, size: 9, font, color: GRAY_DK });
      page.drawText(`${pr[1]}${tobT('unit.kg', L)}`, { x: W-115, y: py, size: 10, font: fontB, color: BLACK });
    });
  }
  page.drawText('FULL TRAINING - BIIO System', { x: LX, y: 40, size: 9, font: fontO, color: GRAY });

  // ─── GRÁFICAS — volumen por ejercicio (una línea por iteración) ───
  const mainEjs = [];
  (a.rutina?.entrenos||[]).forEach(en => {
    (en.ejercicios||[]).forEach(ej => { if(ej.tipo !== 'circuito') mainEjs.push({ ej, entId: en.id }); });
  });
  const chartItems = [];
  mainEjs.forEach(({ ej, entId }) => {
    const cfg = tobBuildEjChartConfig(a, ej, entId, { cli });
    if(cfg){
      cfg.options.responsive = false;
      cfg.options.plugins.legend = { display: true, labels: { color: '#444444', font: { size: 9 }, boxWidth: 14 } };
      chartItems.push({ name: ej.nombre, cfg });
    }
  });

  if(!chartItems.length){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('resum.progres.titulo_vacio', L), rutinaShort, W, H);
    page.drawText(tobT('resum.progres.vacio_msg', L), { x: 30, y: H-90, size: 11, font: fontO, color: GRAY });
  } else {
    const perPage = 4, chW = 380, chH = 215, gapX = 30, gapY = 26;
    for(let p = 0; p < chartItems.length; p += perPage){
      page = doc.addPage([W, H]);
      drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY,
        p === 0 ? tobT('resum.progres.titulo', L) : tobT('resum.progres.titulo_cont', L), rutinaShort, W, H);
      const slice = chartItems.slice(p, p+perPage);
      const ox = (W - (chW*2 + gapX)) / 2;
      const oy = H - 78;
      for(let i = 0; i < slice.length; i++){
        const col = i % 2, row = Math.floor(i / 2);
        const x = ox + col*(chW+gapX);
        const yTop = oy - row*(chH+gapY);
        page.drawText(tobPdfSafe(slice[i].name.toUpperCase()), { x, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
        try {
          const png = await tobChartToPng(slice[i].cfg, 760, 430);
          page.drawImage(await doc.embedPng(png), { x, y: yTop - chH, width: chW, height: chH });
        } catch(e){ console.warn('chart', slice[i].name, e); page.drawText(tobT('error.no_grafica', L), { x, y: yTop - chH/2, size: 9, font: fontO, color: GRAY }); }
      }
    }
  }

  if(a.notas){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('resum.notas.titulo', L), rutinaShort, W, H);
    let ny = H - 90;
    tobWrapText(tobPdfSafe(a.notas), font, 11, W-80).forEach(l => { page.drawText(l, { x: 40, y: ny, size: 11, font, color: GRAY_DK }); ny -= 16; });
  }

  const pages = doc.getPages();
  pages.forEach((pg, i) => pg.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_resumen_${rutinaShort.replace(/[^a-zA-Z0-9]/g,'_')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ Resumen de la rutina descargado', 'green');
}

// ═════════════════════════════════════════════════════════════════
// PDF BONITO — rutina completada actual + histórico
// ═════════════════════════════════════════════════════════════════

// Render Chart.js a PNG Uint8Array. Usa doble requestAnimationFrame para
// garantizar que Chart.js complete layout antes de toBase64Image.
// Importante: usar spread (no JSON.stringify) para preservar funciones
// (formatter de datalabels, callbacks, etc).
function tobChartToPng(config, w, h){
  return new Promise((resolve, reject) => {
    if(!window.Chart){ reject(new Error('Chart.js no cargado')); return; }
    const canvas = document.createElement('canvas');
    canvas.width = w || 800; canvas.height = h || 380;
    canvas.style.position = 'fixed'; canvas.style.left = '-9999px'; canvas.style.top = '0';
    document.body.appendChild(canvas);
    let chart = null, settled = false;
    const cleanup = () => {
      if(chart) try { chart.destroy(); } catch(_){}
      canvas.remove();
    };
    const capture = () => {
      if(settled) return;
      settled = true;
      try {
        const dataUrl = chart.toBase64Image('image/png', 1.0);
        if(!dataUrl || !dataUrl.startsWith('data:image/png')){
          throw new Error('Chart no produjo PNG válido');
        }
        const base64 = dataUrl.split(',')[1] || '';
        if(!base64) throw new Error('Base64 vacío');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
        cleanup();
        resolve(bytes);
      } catch(e){ cleanup(); reject(e); }
    };
    try {
      // Shallow override de options sin perder funciones (formatter, callbacks)
      const cfg = {
        ...config,
        options: {
          ...(config.options || {}),
          animation: false,
          responsive: false,
          maintainAspectRatio: false
        }
      };
      chart = new Chart(canvas, cfg);
      // Esperar a que Chart.js complete el layout. rAF doble es lo ideal, pero
      // si está limitado (pestaña en segundo plano) caemos a setTimeout para
      // que el PDF nunca se quede colgado. El primero que dispare, captura.
      requestAnimationFrame(() => requestAnimationFrame(capture));
      setTimeout(capture, 150);
    } catch(e){ cleanup(); reject(e); }
  });
}

// Genera PDF "rutina completada" con cover + KPIs + charts + tabla
async function tobGeneratePdfActual(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF...', '');
  await tobBuildPdfRutina(cli, a, pl, it, false).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}

// Igual que tobGeneratePdfActual pero abre el PDF en pestaña nueva para
// previsualizar sin descargar (útil para ver el layout antes de enviarlo).
async function tobPreviewPdfActual(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando vista previa...', '');
  await tobBuildPdfRutina(cli, a, pl, it, true).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}

// ─── PDF de una PLANTILLA en blanco (sin cliente) ───────────────────────
// Construye una asignación temporal a partir de la plantilla, con la
// iteración vacía (sin kg/reps rellenados). Sirve para imprimir la plantilla
// con los campos editables en blanco. preview=true abre en pestaña nueva.
function _tobPlantillaAsigTemp(plantId){
  const pl = tobDB.plantillas.find(p => p.id === plantId);
  if(!pl) return null;
  const a = {
    id: 'tmp', plantillaId: plantId, fechaInicio: '', estado: 'plantilla', notas: '',
    rutina: JSON.parse(JSON.stringify({ entrenos: pl.entrenos, numMicro: tobNumMicroOf(pl) })),
    iteraciones: [{ id: 'tmp_it', numero: 1, sesiones: {} }]
  };
  return { pl, a, it: a.iteraciones[0] };
}
async function tobPreviewPlantillaPdf(plantId){
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const t = _tobPlantillaAsigTemp(plantId);
  if(!t){ tobToast('Plantilla no encontrada', 'red'); return; }
  tobToast('⏳ Generando vista previa...', '');
  const cliFake = { nombre: '(plantilla)' };
  await tobBuildPdfRutina(cliFake, t.a, t.pl, t.it, true).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}
async function tobDownloadPlantillaPdf(plantId){
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  const t = _tobPlantillaAsigTemp(plantId);
  if(!t){ tobToast('Plantilla no encontrada', 'red'); return; }
  tobToast('⏳ Generando PDF...', '');
  const cliFake = { nombre: tobRutinaShortName(t.pl) };
  await tobBuildPdfRutina(cliFake, t.a, t.pl, t.it, false).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}

async function tobBuildPdfRutina(cli, a, pl, it, preview){
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontO = await doc.embedFont(StandardFonts.HelveticaOblique);
  const form = doc.getForm();   // ← PDF EDITABLE
  const ORANGE = rgb(0.96, 0.65, 0.13);
  const BLACK = rgb(0.06, 0.06, 0.06);
  const GRAY = rgb(0.55, 0.55, 0.55);
  const GRAY_DK = rgb(0.25, 0.25, 0.25);
  const GRAY_MD = rgb(0.4, 0.4, 0.4);

  const W_L = 842, H_L = 595;  // landscape

  // Nombre rutina sin sufijo "— Hombre"/"— Mujer"
  const rutinaShort = tobRutinaShortName(pl);
  const L = tobLangOf(cli);

  // ─── PÁGINA 1: COVER en 2 columnas ─────
  // Izquierda: logo + cliente + rutina + KPI. Derecha: descripción completa.
  let page = doc.addPage([W_L, H_L]);
  page.drawRectangle({ x: 0, y: 0, width: 50, height: H_L, color: ORANGE });

  // ── Columna izquierda ──
  const LX = 80;
  page.drawText('FULL', { x: LX, y: H_L - 95, size: 48, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: LX, y: H_L - 143, size: 48, font: fontB, color: BLACK });
  page.drawText(tobPdfSafe((pl?.categoria || '').toUpperCase()), { x: LX, y: H_L - 165, size: 12, font, color: GRAY });

  page.drawText(tobPdfSafe(cli?.nombre || '—'), { x: LX, y: H_L - 230, size: 30, font: fontB, color: BLACK });
  page.drawText(tobPdfSafe(rutinaShort), { x: LX, y: H_L - 256, size: 14, font, color: GRAY_DK });
  page.drawText(`${tobT('cover.iteracion', L, { numero: it?.numero || 1 })}  ·  ${tobT('cover.inicio', L, { fecha: a.fechaInicio || '' })}`, { x: LX, y: H_L - 274, size: 10, font: fontO, color: GRAY });

  // KPI sesiones
  const statsIt = tobCalcItStats(a, it);
  const kpiX = LX, kpiY = 180, kpiW = 230, kpiH = 100;
  page.drawRectangle({ x: kpiX, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
  page.drawRectangle({ x: kpiX, y: kpiY + kpiH - 4, width: kpiW, height: 4, color: ORANGE });
  page.drawText(tobT('rut.kpi.sesiones_reg', L), { x: kpiX+16, y: kpiY+kpiH-28, size: 10, font: fontB, color: GRAY });
  page.drawText(String(statsIt.sesiones), { x: kpiX+16, y: kpiY+30, size: 40, font: fontB, color: BLACK });
  // Total dinámico: numMicro × número de entrenos (varía por plantilla)
  const _Npdf = tobNumMicroOf(a.rutina);
  const _Epdf = (a.rutina?.entrenos || []).length || 2;
  page.drawText(tobT('rut.kpi.de_x', L, { total: _Npdf * _Epdf, micros: _Npdf, entrenos: _Epdf }), { x: kpiX+16, y: kpiY+16, size: 8, font, color: GRAY });

  page.drawText('FULL TRAINING · BIIO System', { x: LX, y: 40, size: 9, font: fontO, color: GRAY });

  // ── Columna derecha: descripción ──
  // tobDescOf(p.categoria, L) escoge la versión traducida del diccionario.
  // Si la plantilla es custom (categoría sin entrada) o el idioma no existe,
  // hacemos fallback a la versión guardada en p.descripcion (en castellano).
  const descTxt = (pl ? tobDescOf(pl.categoria, L) : null) || pl?.descripcion;
  if(descTxt){
    const RX = 360;
    const rightW = W_L - RX - 50;
    page.drawRectangle({ x: RX - 20, y: 50, width: 1.5, height: H_L - 130, color: rgb(0.88,0.88,0.88) });
    page.drawText(tobT('rut.desc.titulo', L), { x: RX, y: H_L - 70, size: 16, font: fontB, color: ORANGE });
    let dy = H_L - 100;
    dy = tobRenderDescription(page, descTxt, RX, dy, rightW, font, fontB, ORANGE, GRAY_DK, rgb);
  }

  // ─── PÁGINAS DETALLE POR ENTRENO (con FORM FIELDS editables) ───
  // ── Layout COMPACTADO 2026-05 ──
  // Objetivo: TODO un entreno (3-5 ejercicios + circuito) cabe en 1 sola página
  // landscape sin saltar de hoja. Alturas reducidas y márgenes ajustados:
  //   · header pág arriba: 70 (antes 90)
  //   · fila ejercicio (rect negro): 20 (antes 24)
  //   · fila plan ámbar: 13 (antes 16)
  //   · cabecera Kg/Reps: 9 (antes 10)
  //   · fila de serie: 14 (antes 16)
  //   · descanso: 14 (antes 18)
  //   · separador entre ejercicios: 2 (antes 4)
  // Si aún no cabe (entrenos con 6+ ejercicios) se mantiene la lógica de
  // página adicional al final.
  const ROW_H        = 13;  // altura fila de serie
  const EJ_HEADER_H  = 19;  // altura banda negra con nombre ejercicio
  const PLAN_ROW_H   = 12;  // altura banda ámbar con plan
  const KG_REP_HDR_H = 12;  // altura cabecera Kg/Reps (aire para que el input no tape "Kg/Reps")
  const DESC_H       = 16;  // altura fila descanso (aire para que no toque la banda del siguiente)
  const SEP_H        = 4;   // espacio entre ejercicios

  (a.rutina?.entrenos||[]).forEach(en => {
    page = doc.addPage([W_L, H_L]);
    const sufijo = (en.nombre && en.nombre !== ('Entreno '+en.letra)) ? ' — ' + en.nombre : '';
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('rut.page.entrenamiento', L, { letra: en.letra, sufijo }), rutinaShort, W_L, H_L);
    let y = H_L - 62;

    const _N = tobNumMicroOf(a?.rutina);
    const microHeaders = Array.from({length: _N}, (_,i)=>i+1);
    const startX = 110;
    // Columnas se ajustan al numMicro de la plantilla: con 3 micros son anchas,
    // con 7 más estrechas. Margen derecho de 30pt para que respiren.
    const colW = Math.floor((W_L - startX - 30) / _N);
    const tableRight = startX + colW * _N;

    // Fila Fecha (form field editable)
    page.drawText(tobT('rut.col.fecha', L), { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      const ses = it?.sesiones[mn]?.[en.id];
      const tf = form.createTextField(`fecha_${en.id}_${mn}`);
      if(ses?.fecha) tf.setText(ses.fecha);
      tf.addToPage(page, { x: cellX, y: y-4, width: colW-4, height: 14, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
    });
    y -= 20;

    // Fila Microciclo — ordinal sensible al idioma:
    //   CA masc. → 1r, 2n, 3r, 4t, 5è, 6è, 7è
    //   ES masc. → 1º, 2º, 3º…
    //   EN       → 1st, 2nd, 3rd, 4th…
    const microOrdinal = (n) => {
      if(L === 'ca'){
        const map = { 1:'1r', 2:'2n', 3:'3r', 4:'4t', 5:'5è', 6:'6è', 7:'7è' };
        return map[n] || (n + 'è');
      }
      if(L === 'en'){
        const j = n % 10, k = n % 100;
        if(k >= 11 && k <= 13) return n + 'th';
        if(j === 1) return n + 'st';
        if(j === 2) return n + 'nd';
        if(j === 3) return n + 'rd';
        return n + 'th';
      }
      return n + 'º';  // es
    };
    page.drawText(tobT('rut.col.microciclo', L), { x: 30, y, size: 9, font: fontB, color: GRAY_DK });
    microHeaders.forEach((mn, i) => {
      const cellX = startX + i*colW;
      page.drawText(microOrdinal(mn), { x: cellX+5, y, size: 11, font: fontB, color: ORANGE });
    });
    y -= 14;

    // Líneas separadoras verticales entre microciclos
    const drawVertSeparators = (yTop, yBottom) => {
      for(let i=0; i<=_N; i++){
        const lx = startX + i*colW - 2;
        page.drawLine({ start:{x:lx, y:yTop}, end:{x:lx, y:yBottom}, thickness:0.5, color: rgb(0.85,0.85,0.85) });
      }
    };
    const separatorTop = y + 6;

    page.drawLine({ start:{x:30, y:y+4}, end:{x:tableRight, y:y+4}, thickness:1.2, color: ORANGE });
    y -= 8;

    const blockTop = y + 6;

    // Ejercicios
    (en.ejercicios||[]).sort((x,y)=>(x.orden||0)-(y.orden||0)).forEach(ej => {
      // Calcular alto aproximado del bloque (header + plan + kg/reps + N filas + descanso + separador)
      // para saber si cabe entero en la página actual; si no, salto a una nueva.
      // Usa las nuevas constantes compactas definidas arriba.
      const _maxS = Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series || 1));
      const _linesN = ej.tipo === 'circuito'
        ? (ej.circuitoLineas?.length || 3)
        : Math.max(1, _maxS);
      const _blockH = EJ_HEADER_H + PLAN_ROW_H + KG_REP_HDR_H + _linesN*ROW_H + DESC_H + SEP_H;
      // 30pt de margen inferior: paginación + descanso del último ejercicio
      if(y - _blockH < 30){
        page = doc.addPage([W_L, H_L]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('rut.page.entrenamiento_cont', L, { letra: en.letra }), rutinaShort, W_L, H_L);
        y = H_L - 62;
      }
      // Header ejercicio — sanitizamos el nombre por si tiene chars Unicode
      // raros (flechas, emojis, símbolos) que romperían pdf-lib WinAnsi.
      const ejNombreSafe = tobPdfSafe((ej.nombre || '').toUpperCase());
      page.drawRectangle({ x: 24, y: y-3, width: W_L-48, height: 18, color: rgb(0.08,0.08,0.08) });
      page.drawText(ejNombreSafe, { x: 30, y: y+2, size: 10, font: fontB, color: ORANGE });
      if(ej.subtitle){
        const nameWidth = tobTextWidth(ejNombreSafe, 10, fontB);
        page.drawText(tobPdfSafe('· ' + ej.subtitle), { x: 30 + nameWidth + 10, y: y+3, size: 8, font: fontO, color: rgb(0.85,0.85,0.85) });
      }
      y -= EJ_HEADER_H;

      // Fila plan (compacta, sin texto "Plan" — la celda misma es la info)
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawRectangle({ x: startX + i*colW - 1, y: y-2, width: colW-3, height: 11, color: rgb(0.97,0.94,0.85) });
        page.drawText(`${plan.series} × ${reps}`, { x: startX + i*colW + 5, y, size: 8, font: fontB, color: rgb(0.6,0.4,0.05) });
      });
      y -= PLAN_ROW_H;

      // Cabecera Kg/Reps por columna
      page.drawText(tobT('rut.col.series', L), { x: 30, y, size: 7, font: fontB, color: GRAY_MD });
      microHeaders.forEach((mn, i) => {
        const cellX = startX + i*colW;
        page.drawText(tobT('rut.col.kg', L), { x: cellX+8, y, size: 7, font: fontB, color: GRAY_MD });
        page.drawText(tobT('rut.col.reps', L), { x: cellX+55, y, size: 7, font: fontB, color: GRAY_MD });
      });
      y -= KG_REP_HDR_H;

      // Series con form fields editables
      const isCirc = ej.tipo === 'circuito';
      const linesN = isCirc ? (ej.circuitoLineas?.length || 3) : Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series));
      const arrName = isCirc ? 'lineas' : 'series';

      for(let s = 0; s < linesN; s++){
        const lbl = isCirc
          ? (ej.circuitoLineas?.[s] || tobT('it.ej.circuito_linea', L, { n: s+1 }))
          : tobT('it.ej.serie', L, { n: s+1 });
        page.drawText(lbl.length > 18 ? lbl.slice(0,16)+'…' : lbl, { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
        microHeaders.forEach((mn, i) => {
          // Solo dibujamos el cuadro si este microciclo TIENE esta serie en
          // su plan. Para circuitos (líneas), todos los microciclos comparten
          // las mismas líneas → siempre se dibuja.
          if(!isCirc){
            const planMn = tobPlanFor(ej, mn);
            if(s >= (planMn?.series || 0)) return;
          }
          const cellX = startX + i*colW;
          const ses = it?.sesiones[mn]?.[en.id];
          const sr = ses?.ejs?.[ej.id]?.[arrName]?.[s];
          // Cuadrito kg
          const kgF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_kg`);
          if(sr?.kg != null) kgF.setText(String(sr.kg));
          kgF.addToPage(page, { x: cellX+3, y: y-2, width: 44, height: 11, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
          // Cuadrito reps
          const rpF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_reps`);
          if(sr?.reps != null) rpF.setText(String(sr.reps));
          rpF.addToPage(page, { x: cellX+50, y: y-2, width: 44, height: 11, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
        });
        y -= ROW_H;
      }

      // Pausa (color visible, NO gris claro)
      page.drawText(tobT('rut.col.descanso', L), { x: 30, y, size: 8, font: fontB, color: rgb(0.6,0.4,0.05) });
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        page.drawText(plan.pausa || '—', { x: startX + i*colW + 5, y, size: 8, font: fontB, color: BLACK });
      });
      y -= DESC_H;

      // Línea separadora entre ejercicios
      page.drawLine({ start:{x:24, y:y+3}, end:{x:W_L-24, y:y+3}, thickness:0.3, color: rgb(0.8,0.8,0.8) });
      y -= SEP_H;
    });

    // Separadores verticales entre microciclos (cubren toda la tabla del entreno)
    drawVertSeparators(blockTop, y + 12);

    // Aeróbica con form fields
    if(y > 40){
      const aerLabels = [tobT('rut.aer.tipo', L), tobT('rut.aer.tiempo', L), tobT('rut.aer.intensidad', L)];
      aerLabels.forEach((label, fi) => {
        if(y < 30) return;
        const lineTxt = fi === 0
          ? tobT('rut.aer.linea', L, { label })
          : tobT('rut.aer.linea_cont', L, { label });
        page.drawText(lineTxt, { x: 30, y, size: 8, font: fontB, color: GRAY_DK });
        const field = ['tipo','tiempo','intensidad'][fi];
        microHeaders.forEach((mn, i) => {
          const cellX = startX + i*colW;
          const ses = it?.sesiones[mn]?.[en.id];
          const tf = form.createTextField(`aer_${en.id}_${mn}_${field}`);
          if(ses?.aerobica?.[field]) tf.setText(String(ses.aerobica[field]));
          tf.addToPage(page, { x: cellX+3, y: y-3, width: colW-7, height: 11, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
        });
        y -= 13;
      });
    }
  });

  // ─── Numerado de páginas ─────────────────────
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${i+1} / ${pages.length}`, { x: W_L - 50, y: 22, size: 8, font, color: GRAY });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  if(preview){
    // Vista previa: abrir en pestaña nueva sin descargar.
    const win = window.open(url, '_blank');
    if(!win){ tobToast('Permite las ventanas emergentes para previsualizar', 'red'); }
    else { tobToast('✓ Vista previa abierta', 'green'); }
    // No revocamos inmediatamente — la pestaña necesita el blob. Se limpia al cerrar.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli?.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_${tobRutinaShortName(pl).replace(/[^a-zA-Z0-9]/g,'_')}_it${it?.numero}_completada.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ PDF descargado', 'green');
}

function tobCalcItStats(a, it){
  let tonelaje = 0, sesiones = 0;
  const ejSet = new Set();
  Object.values(it?.sesiones||{}).forEach(microSes => {
    Object.entries(microSes).forEach(([entId, s]) => {
      let hasData = false;
      const en = a.rutina?.entrenos.find(e => e.id === entId);
      if(!en) return;
      en.ejercicios.forEach(ej => {
        const ses = s.ejs?.[ej.id];
        if(!ses) return;
        ejSet.add(ej.nombre);
        const arr = ses.series || ses.lineas || [];
        arr.forEach(sr => {
          if(sr.kg != null && sr.reps != null){ tonelaje += sr.kg*sr.reps; hasData = true; }
        });
      });
      if(s.fecha || hasData) sesiones++;
    });
  });
  return { tonelaje: Math.round(tonelaje), sesiones, ejCount: ejSet.size };
}

// Config Chart.js para un ejercicio principal en una asignación: una línea por iteración
// Config Chart.js de "volumen por ejercicio" para un asignación.
// opts.cli: si se pasa, incluye TODAS las asignaciones del cliente con la
// misma plantilla — para que el PDF resumen muestre el historial completo
// del cliente con esa rutina (si la ha hecho antes, salen también esos pesos).
// Estilo: relleno en degradado (como las gráficas de mediciones) para que las
// líneas se diferencien bien del grid.
function tobBuildEjChartConfig(a, ej, entId, opts){
  // Lista de asignaciones a graficar (con su índice cronológico global).
  let sameAsigs = [a];
  if(opts && opts.cli){
    const list = (opts.cli.asignaciones || [])
      .filter(x => x.plantillaId === a.plantillaId)
      .sort((x,y) => (x.fechaInicio||'').localeCompare(y.fechaInicio||''));
    if(list.length > 1) sameAsigs = list;
  }
  const multi = sameAsigs.length > 1;

  const datasets = [];
  const allLabels = new Set();
  let globalIdx = 0;
  sameAsigs.forEach((aa, aIdx) => {
    (aa.iteraciones || []).forEach((it) => {
      const color = TOB_IT_COLORS[globalIdx % TOB_IT_COLORS.length];
      globalIdx++;
      const points = [];
      for(let mn=1; mn<=tobNumMicroOf(aa.rutina); mn++){
        const ses = it.sesiones[mn]?.[entId];
        const series = ses?.ejs?.[ej.id]?.series;
        if(!series || !series.length) continue;
        const vol = series.reduce((s,sr) => s + (sr.kg||0)*(sr.reps||0), 0);
        if(vol <= 0) continue;
        const label = ses.fecha ? ses.fecha.split('-').reverse().join('/') : `µ${mn}·R${aIdx+1}.${it.numero}`;
        points.push({ label, val: vol });
        allLabels.add(label);
      }
      if(!points.length) return;
      const isCurrent = aa.id === a.id;
      const dsLabel = multi
        ? `R${aIdx+1} · It.${it.numero}` + (isCurrent ? ' (actual)' : '')
        : `It. ${it.numero}`;
      datasets.push({
        label: dsLabel, _points: points, _color: color,
        borderColor: color,
        borderWidth: isCurrent ? 3 : 2.2,
        // Relleno en degradado igual que mediciones — más legible que barras
        // con pocos puntos sueltos.
        backgroundColor: (c) => {
          const ch = c.chart, area = ch.chartArea;
          if(!area) return color + '22';
          const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, color + (isCurrent ? '55' : '33'));
          g.addColorStop(1, color + '08');
          return g;
        },
        pointBackgroundColor: '#ffffff',
        pointBorderColor: color,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3, fill: true, spanGaps: true
      });
    });
  });
  if(!datasets.length) return null;
  const labels = [...allLabels].sort((a,b) => {
    const pa = a.split('/'), pb = b.split('/');
    return new Date(`20${pa[2]}-${pa[1]}-${pa[0]}`).getTime() - new Date(`20${pb[2]}-${pb[1]}-${pb[0]}`).getTime();
  });
  datasets.forEach(ds => {
    const map = {}; ds._points.forEach(p => { map[p.label] = p.val; });
    ds.data = labels.map(l => map[l] != null ? map[l] : null);
    delete ds._points;
  });
  return {
    type: 'line', data: { labels, datasets },
    options: {
      layout: { padding: { top: 22, right: 16, left: 4, bottom: 2 } },
      plugins: {
        legend: { display: datasets.length > 1,
          labels: { color: '#444', font: { size: 9 }, boxWidth: 12, padding: 8 },
          position: 'top'
        },
        datalabels: window.ChartDataLabels ? {
          color: ctx => ctx.dataset.borderColor, font:{ size: 9, weight:'700' },
          align: 'top', offset: 5,
          formatter: v => (v == null ? '' : v),
          textStrokeColor: '#ffffff', textStrokeWidth: 3
        } : undefined
      },
      scales:{
        x:{ ticks:{ color:'#555', font:{ size: 9 }, maxRotation: 50, minRotation: 35 },
            grid:{ color:'#ececec', drawTicks: false }, border:{ display: false } },
        y:{ ticks:{ color:'#555', font:{ size: 9 }, padding: 6 },
            grid:{ color:'#ececec', drawTicks: false }, beginAtZero: true, border:{ display: false } }
      }
    }
  };
}

// Config Chart.js de volumen por ejercicio cruzando TODAS las asignaciones del
// cliente (independientemente de la plantilla). Usa el nombre del ejercicio como
// identificador unificador. Útil para el PDF Histórico: una línea por ejercicio
// con toda la trayectoria histórica del cliente.
function tobBuildEjChartConfigByName(cli, ejNombre){
  const points = [];
  (cli.asignaciones||[]).forEach(a => {
    (a.iteraciones||[]).forEach(it => {
      Object.values(it.sesiones||{}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, s]) => {
          const en = a.rutina?.entrenos.find(e => e.id === entId);
          if(!en) return;
          en.ejercicios.forEach(ej => {
            if(ej.nombre !== ejNombre || ej.tipo === 'circuito') return;
            const series = s.ejs?.[ej.id]?.series;
            if(!series || !series.length) return;
            const vol = series.reduce((sum,sr) => sum + (sr.kg||0)*(sr.reps||0), 0);
            if(vol <= 0 || !s.fecha) return;
            points.push({ fecha: s.fecha, vol });
          });
        });
      });
    });
  });
  if(!points.length) return null;
  points.sort((a,b) => a.fecha.localeCompare(b.fecha));
  const labels = points.map(p => p.fecha.split('-').reverse().join('/'));
  const data = points.map(p => p.vol);
  const maxVal = Math.max(...data);
  const color = '#f5a623';
  return {
    type: 'line',
    data: { labels, datasets: [{
      label: ejNombre, data,
      borderColor: color, borderWidth: 2.8,
      backgroundColor: (c) => {
        const ch = c.chart, area = ch.chartArea;
        if(!area) return color + '33';
        const g = ch.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0, color + '55');
        g.addColorStop(1, color + '08');
        return g;
      },
      pointBackgroundColor: data.map(v => v === maxVal ? color : '#ffffff'),
      pointBorderColor: color, pointBorderWidth: 2,
      pointRadius: data.map(v => v === maxVal ? 6 : 4),
      tension: 0.2, fill: true, spanGaps: true
    }]},
    options: {
      layout: { padding: { top: 22, right: 14, left: 4, bottom: 2 } },
      plugins: {
        legend: { display: false },
        datalabels: window.ChartDataLabels ? {
          color: (c) => data[c.dataIndex] === maxVal ? color : '#555',
          font: (c) => ({ size: data[c.dataIndex] === maxVal ? 10 : 8, weight: '700' }),
          align: 'top', offset: 4, formatter: v => v
        } : undefined
      },
      scales:{
        x:{ ticks:{ color:'#555', font:{ size: 9 }, maxRotation: 50, minRotation: 35 },
            grid:{ color:'#ececec', drawTicks: false }, border:{ display: false } },
        y:{ ticks:{ color:'#555', font:{ size: 9 } }, grid:{ color:'#ececec', drawTicks: false },
            beginAtZero: true, border:{ display: false } }
      }
    }
  };
}

// Aprox ancho de texto en puntos (Helvetica)
function tobTextWidth(text, size, fontObj){
  try { return fontObj.widthOfTextAtSize(text, size); } catch(e){ return String(text).length * size * 0.55; }
}

// Trunca texto con elipsis para que quepa
function tobTrunc(s, max){
  const str = String(s||'');
  return str.length > max ? str.slice(0, max-1) + '…' : str;
}

// Renderiza una descripción multi-párrafo en el PDF. Respeta los \n del texto.
// Detecta encabezados tipo "OBJETIVO:" y los pinta en naranja negrita.
// Devuelve la coordenada Y final (por si quieres seguir dibujando debajo).
// Sanitiza con tobPdfSafe() para evitar el error WinAnsi con caracteres
// Unicode (flechas, símbolos matemáticos, emojis, etc).
function tobRenderDescription(page, text, x, yStart, maxW, font, fontB, ORANGE, GRAY_DK, rgb){
  let dy = yStart;
  const size = 8.5;
  const lineH = 11;
  String(text||'').split('\n').forEach(para => {
    const t = tobPdfSafe(para.trim());
    if(t === ''){ dy -= 5; return; }
    // ¿Empieza con "ENCABEZADO:" en mayúsculas?
    // Acepta acentos ES (ÁÉÍÓÚÑ) y CA (ÀÈÒÏÜÇ) por si futuros headers traducidos
    // los usan (p.ej. CA "OBJECTIU", "PESOS", todos sin acento; pero por si acaso).
    const hm = t.match(/^([A-ZÁÉÍÓÚÑÀÈÒÏÜÇ][A-ZÁÉÍÓÚÑÀÈÒÏÜÇ ]{2,}):\s*(.*)$/);
    if(hm){
      const headerTxt = hm[1] + ': ';
      const headerW = tobTextWidth(headerTxt, size, fontB);
      page.drawText(hm[1] + ':', { x, y: dy, size, font: fontB, color: ORANGE });
      const rest = hm[2] || '';
      if(rest){
        // Wrap del resto: primera línea empieza tras el header
        const words = rest.split(/\s+/);
        let line = '', isFirst = true;
        const flush = () => {
          page.drawText(line, { x: isFirst ? x + headerW : x, y: dy, size, font, color: GRAY_DK });
          dy -= lineH; isFirst = false; line = '';
        };
        words.forEach(w => {
          const test = line ? line + ' ' + w : w;
          const avail = isFirst ? (maxW - headerW) : maxW;
          if(tobTextWidth(test, size, font) <= avail){ line = test; }
          else { flush(); line = w; }
        });
        if(line) flush();
      } else {
        dy -= lineH;
      }
    } else {
      // Párrafo normal o sub-item (·)
      const indent = t.startsWith('·') ? 8 : 0;
      const wrapped = tobWrapText(t, font, size, maxW - indent);
      wrapped.forEach(l => {
        page.drawText(l, { x: x + indent, y: dy, size, font, color: GRAY_DK });
        dy -= lineH;
      });
    }
    dy -= 3;
  });
  return dy;
}

// Wrap text en líneas que quepan en un ancho dado
function tobWrapText(text, fontObj, size, maxWidth){
  const words = String(text||'').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach(w => {
    const test = current ? current + ' ' + w : w;
    if(tobTextWidth(test, size, fontObj) <= maxWidth){
      current = test;
    } else {
      if(current) lines.push(current);
      current = w;
    }
  });
  if(current) lines.push(current);
  return lines;
}

// Helper: dibuja banda superior naranja + título + cliente
function drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, title, subtitle, W, H){
  const { rgb } = PDFLib;   // PDFLib es global desde el CDN
  page.drawRectangle({ x: 0, y: H-50, width: W, height: 50, color: ORANGE });
  // Sanitizamos title/subtitle por si contienen chars Unicode (subtitle suele
  // ser el nombre del cliente — podría tener emoji).
  page.drawText(tobPdfSafe(title), { x: 24, y: H-32, size: 14, font: fontB, color: BLACK });
  if(subtitle) page.drawText(tobPdfSafe(subtitle), { x: 24, y: H-46, size: 9, font: fontB, color: rgb(0.18,0.18,0.18) });
  page.drawText('FULL TRAINING', { x: W - 130, y: H-32, size: 12, font: fontB, color: BLACK });
}

// ═══ PDF HISTÓRICO ═══════════════════════════════════════════
async function tobGeneratePdfHistorico(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  if(!window.PDFLib){ tobToast('pdf-lib no cargado', 'red'); return; }
  tobToast('⏳ Generando PDF histórico...', '');
  await tobBuildPdfHistorico(cli).catch(e => { console.error(e); tobToast('Error: ' + e.message, 'red'); });
}

async function tobBuildPdfHistorico(cli){
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  const ctx = await tobPdfCtx(doc);
  const { font, fontB, fontO, ORANGE, BLACK, GRAY, GRAY_DK, W, H, rgb } = ctx;
  const hasRutinas    = (cli.asignaciones||[]).length > 0;
  const hasMediciones = (cli.mediciones  ||[]).length > 0;
  const meds = tobMedsSorted(cli);
  const lastMed = meds[meds.length-1];
  const L = tobLangOf(cli);

  // ─── COVER adaptativa según lo que tenga el cliente ────
  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: H, color: ORANGE });
  page.drawText('FULL', { x: 100, y: H-100, size: 56, font: fontB, color: ORANGE });
  page.drawText('TRAINING', { x: 100, y: H-156, size: 56, font: fontB, color: BLACK });
  page.drawText(tobT('hist.cover.titulo', L), { x: 100, y: H-180, size: 13, font, color: GRAY });
  page.drawText(tobPdfSafe(cli.nombre || '—'), { x: 100, y: H-240, size: 32, font: fontB, color: BLACK });
  const periodo = tobCalcPeriodo(cli);
  page.drawText(tobT('cover.periodo', L, { desde: periodo.desde, hasta: periodo.hasta }), { x: 100, y: H-268, size: 13, font, color: GRAY_DK });

  // KPIs adaptativos
  const kpisCover = [];
  if(hasRutinas){
    kpisCover.push([tobT('hist.kpi.rutinas', L), String((cli.asignaciones||[]).length)]);
    kpisCover.push([tobT('hist.kpi.sesiones', L), String(tobCountSesiones(cli))]);
  }
  if(hasMediciones){
    kpisCover.push([tobT('hist.kpi.mediciones', L), String(meds.length)]);
    if(lastMed?.pes != null) kpisCover.push([tobT('hist.kpi.peso_actual', L), lastMed.pes + tobT('unit.kg', L)]);
  }
  const n = kpisCover.length;
  const kpiW = n <= 2 ? 220 : (n === 3 ? 200 : 160);
  const kpiH = 90, kpiGap = 16, kpiY = 180;
  const totalKpiW = n*kpiW + (n-1)*kpiGap;
  const kpiStartX = Math.max(100, (W - totalKpiW) / 2);
  kpisCover.forEach((kp, i) => {
    const x = kpiStartX + i*(kpiW+kpiGap);
    page.drawRectangle({ x, y: kpiY, width: kpiW, height: kpiH, color: rgb(0.97,0.97,0.97) });
    page.drawRectangle({ x, y: kpiY+kpiH-4, width: kpiW, height: 4, color: ORANGE });
    page.drawText(kp[0], { x: x+14, y: kpiY+kpiH-28, size: 10, font: fontB, color: GRAY });
    const valSize = kp[1].length > 8 ? 24 : 32;
    page.drawText(kp[1], { x: x+14, y: kpiY+30, size: valSize, font: fontB, color: BLACK });
  });
  page.drawText('FULL TRAINING · BIIO System', { x: W-240, y: 40, size: 9, font: fontO, color: GRAY });

  // ═══ SECCIÓN RUTINAS ═════════════════════════════════════════
  if(hasRutinas){
    // ─── PR CARDS con contexto (rutina donde se hizo el PR y delta vs inicio) ─
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('hist.pr.titulo', L), cli.nombre || '', W, H);
    page.drawText(tobT('hist.pr.subtitulo', L),
      { x: 30, y: H - 70, size: 9, font: fontO, color: GRAY });
    const fichaData = tobBuildFichaData(cli);
    const cardW = 240, prCardH = 150, gap = 20;
    const totalW = 3*cardW + 2*gap;
    const startX = (W - totalW) / 2;
    const startY = H - 100;
    let cardIdx = 0;
    fichaData.ejNames.slice(0, 6).forEach(name => {
      const points = (fichaData.ejHistory[name]||[]).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
      if(!points.length) return;
      const col = cardIdx % 3;
      const row = Math.floor(cardIdx / 3);
      const x = startX + col * (cardW + gap);
      const yy = startY - row * (prCardH + gap);
      const firstPoint = points[0];
      const lastPoint = points[points.length-1];
      const maxIdx = points.reduce((iMax, p, i) => p.kg > points[iMax].kg ? i : iMax, 0);
      const maxPoint = points[maxIdx];
      const deltaKg = lastPoint.kg - firstPoint.kg;
      const deltaPct = firstPoint.kg > 0 ? (deltaKg / firstPoint.kg * 100) : 0;
      page.drawRectangle({ x, y: yy - prCardH, width: cardW, height: prCardH, color: rgb(0.98,0.98,0.98) });
      page.drawRectangle({ x, y: yy - 5, width: cardW, height: 5, color: ORANGE });
      page.drawText(tobPdfSafe(name.toUpperCase()), { x: x + 14, y: yy - 26, size: 9, font: fontB, color: rgb(0.4,0.3,0.1) });
      page.drawText(`${maxPoint.kg}`, { x: x + 14, y: yy - 72, size: 36, font: fontB, color: BLACK });
      page.drawText(tobT('hist.pr.kg_pr', L), { x: x + 14 + tobTextWidth(`${maxPoint.kg}`, 36, fontB) + 6, y: yy - 62, size: 11, font, color: GRAY });
      page.drawText(tobT('hist.pr.en_asig', L, { rutina: tobTrunc(maxPoint.asigLabel, 28) }),
        { x: x + 14, y: yy - 90, size: 8, font: fontO, color: GRAY_DK });
      const deltaColor = deltaKg > 0 ? rgb(0.18, 0.6, 0.4) : deltaKg < 0 ? rgb(0.85, 0.25, 0.25) : GRAY;
      const arrow = deltaKg > 0 ? '+' : deltaKg < 0 ? '-' : '=';
      page.drawText(`${arrow} ${deltaKg>=0?'+':''}${(+deltaKg.toFixed(1))}${tobT('unit.kg', L)}  (${deltaPct>=0?'+':''}${deltaPct.toFixed(0)}%)`,
        { x: x + 14, y: yy - 110, size: 9, font: fontB, color: deltaColor });
      page.drawText(tobT('hist.pr.vs_asig', L, { rutina: tobTrunc(firstPoint.asigLabel, 22), kg: firstPoint.kg }),
        { x: x + 14, y: yy - 124, size: 7, font, color: GRAY });
      page.drawText(tobT('hist.pr.ultima', L, { fecha: lastPoint.fecha || '—' }),
        { x: x + 14, y: yy - 138, size: 7, font, color: GRAY });
      cardIdx++;
    });

    // ─── HISTORIAL DE RUTINAS — cronológico ──
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('hist.rutinas.titulo', L), cli.nombre || '', W, H);
    page.drawText(tobT('hist.rutinas.subtitulo', L),
      { x: 30, y: H - 70, size: 9, font: fontO, color: GRAY });
    let y = H - 90;
    const sorted = [...cli.asignaciones].sort((a,b) => (a.fechaInicio||'').localeCompare(b.fechaInicio||''));

    sorted.forEach((a, i) => {
      if(y < 95){
        page = doc.addPage([W, H]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('hist.rutinas.titulo_cont', L), cli.nombre||'', W, H);
        y = H - 90;
      }
      const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
      const stats = tobCalcAsigStats(a);
      const itN = (a.iteraciones||[]).length;
      const rutinaShort = tobRutinaShortName(pl);
      const cardH = 80;

      page.drawRectangle({ x: 24, y: y-cardH, width: W-48, height: cardH, color: rgb(0.98,0.98,0.98) });
      const sideColor = a.estado === 'completada' ? rgb(0.18,0.6,0.4)
                     : a.estado === 'repetir' ? rgb(0.9,0.5,0.2)
                     : ORANGE;
      page.drawRectangle({ x: 24, y: y-cardH, width: 5, height: cardH, color: sideColor });
      page.drawText(String(i+1).padStart(2,'0'), { x: 40, y: y-30, size: 22, font: fontB, color: rgb(0.85,0.85,0.85) });
      page.drawText(tobPdfSafe(rutinaShort), { x: 80, y: y-22, size: 12, font: fontB, color: BLACK });
      if(pl){
        page.drawText(tobPdfSafe(`${pl.macrociclo || ''}${pl.macrociclo ? ' · ' : ''}${pl.categoria || ''}`),
          { x: 80, y: y-36, size: 8, font: fontO, color: GRAY });
      }
      const dates = `${a.fechaInicio || '?'}  —  ${stats.ultimaFecha || '?'}`;
      page.drawText(dates, { x: 80, y: y-52, size: 9, font, color: GRAY_DK });
      const estLbl = (a.estado || tobT('hist.estado.en_curso', L)).toUpperCase();
      page.drawText(estLbl, { x: 80, y: y-66, size: 8, font: fontB, color: sideColor });
      const midX = 360;
      page.drawText(tobT('hist.rutinas.col.sesiones', L), { x: midX, y: y-20, size: 7, font, color: GRAY });
      page.drawText(String(stats.sesiones), { x: midX, y: y-38, size: 18, font: fontB, color: BLACK });
      page.drawText(tobT('hist.rutinas.col.iteraciones', L), { x: midX + 80, y: y-20, size: 7, font, color: GRAY });
      page.drawText(String(itN), { x: midX + 80, y: y-38, size: 18, font: fontB, color: BLACK });
      const prsArr = Object.entries(stats.maxByEj).slice(0, 3);
      if(prsArr.length){
        page.drawText(tobT('hist.rutinas.col.prs', L), { x: W - 280, y: y-20, size: 7, font: fontB, color: ORANGE });
        prsArr.forEach((pr, j) => {
          const px = W - 280, py = y - 36 - j*14;
          const ejAbbr = (pr[0].length > 18 ? pr[0].slice(0,17)+'…' : pr[0]);
          page.drawText(tobPdfSafe(ejAbbr), { x: px, y: py, size: 9, font, color: GRAY_DK });
          page.drawText(`${pr[1]}${tobT('unit.kg', L)}`, { x: px + 165, y: py, size: 9, font: fontB, color: BLACK });
        });
      }
      y -= (cardH + 10);
    });

    // ─── PROGRESIÓN POR EJERCICIO · VOLUMEN (toda la trayectoria del cliente) ──
    const ejNamesSet = new Set();
    (cli.asignaciones||[]).forEach(a => (a.rutina?.entrenos||[]).forEach(en =>
      (en.ejercicios||[]).forEach(ej => { if(ej.tipo !== 'circuito') ejNamesSet.add(ej.nombre); })));
    const volChartItems = [];
    [...ejNamesSet].forEach(name => {
      const cfg = tobBuildEjChartConfigByName(cli, name);
      if(cfg) volChartItems.push({ name, cfg });
    });
    if(volChartItems.length){
      const perPage = 4, vchW = 380, vchH = 215, vgapX = 30, vgapY = 26;
      for(let p = 0; p < volChartItems.length; p += perPage){
        page = doc.addPage([W, H]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY,
          p === 0 ? tobT('hist.progres.titulo', L) : tobT('hist.progres.titulo_cont', L),
          cli.nombre || '', W, H);
        page.drawText(tobT('hist.progres.subtitulo', L),
          { x: 30, y: H - 70, size: 9, font: fontO, color: GRAY });
        const slice = volChartItems.slice(p, p+perPage);
        const ox = (W - (vchW*2 + vgapX)) / 2;
        const oy = H - 92;
        for(let i = 0; i < slice.length; i++){
          const col = i % 2, row = Math.floor(i / 2);
          const x = ox + col*(vchW+vgapX);
          const yTop = oy - row*(vchH+vgapY);
          page.drawText(tobPdfSafe(slice[i].name.toUpperCase()), { x, y: yTop + 4, size: 9, font: fontB, color: GRAY_DK });
          try {
            const png = await tobChartToPng(slice[i].cfg, 760, 430);
            page.drawImage(await doc.embedPng(png), { x, y: yTop - vchH, width: vchW, height: vchH });
          } catch(e){
            console.warn('vol chart', slice[i].name, e);
            page.drawText(tobT('error.no_grafica', L), { x, y: yTop - vchH/2, size: 9, font: fontO, color: GRAY });
          }
        }
      }
    }
  }

  // ═══ SECCIÓN MEDICIONES ══════════════════════════════════════
  if(hasMediciones){
    await _tobPdfMedicionPages(doc, ctx, cli);
  }

  // ═══ ESTADO VACÍO ════════════════════════════════════════════
  if(!hasRutinas && !hasMediciones){
    page = doc.addPage([W, H]);
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('hist.cover.titulo', L), cli.nombre || '', W, H);
    page.drawText(tobT('hist.vacio_msg', L),
      { x: 30, y: H - 100, size: 12, font: fontO, color: GRAY });
  }

  // Paginación
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`${i+1} / ${pages.length}`, { x: W-50, y: 22, size: 8, font, color: GRAY }));

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type:'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(cli.nombre||'cliente').replace(/[^a-zA-Z0-9]/g,'_')}_historico_${new Date().toISOString().slice(0,10)}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  tobToast('✓ Histórico descargado', 'green');
}

function tobCalcPeriodo(cli){
  let desde = '?', hasta = '?';
  const fechas = [];
  (cli.asignaciones||[]).forEach(a => {
    if(a.fechaInicio) fechas.push(a.fechaInicio);
    const st = tobCalcAsigStats(a);
    if(st.ultimaFecha) fechas.push(st.ultimaFecha);
  });
  (cli.mediciones||[]).forEach(m => { if(m.fecha) fechas.push(m.fecha); });
  if(fechas.length){
    fechas.sort();
    desde = fechas[0];
    hasta = fechas[fechas.length-1];
  }
  return { desde, hasta };
}

// ═══════════════════════════════════════════════════════════════
// EDITOR INLINE DE EJERCICIO — preserva ID (no rompe sesiones)
// Funciona en dos contextos: asignación (rutina del cliente) o plantilla.
// ═══════════════════════════════════════════════════════════════
let _tobEditingEj = null;   // { context, plantillaId?, entrenoId, ejId, isNew }

function tobOpenEjEditor(entrenoId, ejId){
  // Contexto: asignación
  const a = tobAsig(); if(!a) return;
  const en = a.rutina.entrenos.find(e => e.id === entrenoId); if(!en) return;
  let ej = ejId ? en.ejercicios.find(x => x.id === ejId) : null;
  _tobEditingEj = { context: 'asig', entrenoId, ejId: ej?.id || null, isNew: !ej };
  _tobFillEjEditorForm(ej, en);
}

function tobOpenEjEditorPlantilla(plantillaId, entrenoId, ejId){
  // Contexto: plantilla
  const pl = tobDB.plantillas.find(p => p.id === plantillaId); if(!pl) return;
  const en = pl.entrenos.find(e => e.id === entrenoId); if(!en) return;
  let ej = ejId ? en.ejercicios.find(x => x.id === ejId) : null;
  _tobEditingEj = { context: 'plantilla', plantillaId, entrenoId, ejId: ej?.id || null, isNew: !ej };
  _tobFillEjEditorForm(ej, en);
}

function _tobFillEjEditorForm(ej, en){
  document.getElementById('tobEjEditorTitle').textContent = ej ? `Editar: ${ej.nombre}` : `Añadir ejercicio a Entreno ${en.letra}`;
  document.getElementById('tobEjEditName').value = ej?.nombre || '';
  document.getElementById('tobEjEditTipo').value = ej?.tipo || 'normal';
  document.getElementById('tobEjEditSub').value = ej?.subtitle || '';
  const plan = ej ? tobPlanFor(ej, 1) : { series: 3, repsTarget: [10], pausa: '' };
  document.getElementById('tobEjEditSeries').value = plan.series || 3;
  document.getElementById('tobEjEditReps').value = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : (plan.repsTarget || '');
  document.getElementById('tobEjEditPausa').value = plan.pausa || '';
  document.getElementById('tobEjEditCircLineas').value = (ej?.circuitoLineas || []).join('\n');
  tobEjEditorTipoChange();
  document.getElementById('tobEjEditorBg').classList.add('on');
}

function tobCloseEjEditor(){
  _tobEditingEj = null;
  document.getElementById('tobEjEditorBg').classList.remove('on');
}

function tobEjEditorTipoChange(){
  const tipo = document.getElementById('tobEjEditTipo').value;
  document.getElementById('tobEjEditCircWrap').style.display = (tipo === 'circuito') ? '' : 'none';
}

// Obtiene el entreno actual según contexto (asig | plantilla)
function _tobGetEditingEntreno(){
  if(!_tobEditingEj) return null;
  if(_tobEditingEj.context === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === _tobEditingEj.plantillaId);
    return pl?.entrenos.find(e => e.id === _tobEditingEj.entrenoId);
  }
  const a = tobAsig();
  return a?.rutina.entrenos.find(e => e.id === _tobEditingEj.entrenoId);
}

function tobSaveEj(){
  if(!_tobEditingEj) return;
  const en = _tobGetEditingEntreno();
  if(!en){ tobToast('Entreno no encontrado', 'red'); return; }
  const nombre = document.getElementById('tobEjEditName').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const tipo = document.getElementById('tobEjEditTipo').value;
  const subtitle = document.getElementById('tobEjEditSub').value.trim();
  const series = parseInt(document.getElementById('tobEjEditSeries').value) || 3;
  const repsRaw = document.getElementById('tobEjEditReps').value.trim();
  const repsTarget = repsRaw.split('/').map(s => s.trim()).filter(Boolean);
  const pausa = document.getElementById('tobEjEditPausa').value.trim();
  const circLineas = tipo === 'circuito'
    ? document.getElementById('tobEjEditCircLineas').value.split('\n').map(s => s.trim()).filter(Boolean)
    : null;

  // Construir planByMicro para el numMicro de la plantilla/rutina que contiene este ejercicio
  const _ctx = _tobEditingEj.context === 'plantilla'
    ? tobDB.plantillas.find(p => p.id === _tobEditingEj.plantillaId)
    : tobAsig()?.rutina;
  const planByMicro = {};
  for(let mn=1; mn<=tobNumMicroOf(_ctx); mn++){
    planByMicro[mn] = { series, repsTarget, pausa };
  }

  if(_tobEditingEj.isNew){
    en.ejercicios.push({
      id: tobUid('ej'),
      orden: en.ejercicios.length,
      nombre, subtitle, tipo,
      circuitoLineas: circLineas || undefined,
      planByMicro
    });
    tobToast('✓ Ejercicio añadido', 'green');
  } else {
    const ej = en.ejercicios.find(x => x.id === _tobEditingEj.ejId); if(!ej) return;
    ej.nombre = nombre;
    ej.subtitle = subtitle;
    ej.tipo = tipo;
    if(tipo === 'circuito') ej.circuitoLineas = circLineas; else delete ej.circuitoLineas;
    ej.planByMicro = planByMicro;
    delete ej.planBase;
    tobToast('✓ Ejercicio actualizado', 'green');
  }
  tobSave();
  const ctx = _tobEditingEj.context;
  const plId = _tobEditingEj.plantillaId;
  tobCloseEjEditor();
  // Re-render según contexto
  if(ctx === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === plId);
    if(pl){ tobRenderPlEjList(pl); }
    tobRenderPlantillas();
  } else {
    tobRenderEntreno(); tobRenderCharts();
  }
}

function tobDeleteCurrentEj(){
  if(!_tobEditingEj || _tobEditingEj.isNew){ tobCloseEjEditor(); return; }
  const en = _tobGetEditingEntreno();
  if(!en){ tobCloseEjEditor(); return; }
  const ej = en.ejercicios.find(x => x.id === _tobEditingEj.ejId); if(!ej) return;
  const ctxNote = _tobEditingEj.context === 'plantilla'
    ? '\n\nEsto solo afecta a la plantilla. Las asignaciones ya creadas con esta plantilla NO se ven afectadas (tienen su propia copia).'
    : '\n\nNota: los datos registrados en sesiones se mantienen en el archivo pero ya no se mostrarán.';
  if(!confirm(`¿Eliminar "${ej.nombre}"?${ctxNote}`)){ return; }
  en.ejercicios = en.ejercicios.filter(x => x.id !== ej.id);
  en.ejercicios.forEach((x, i) => x.orden = i);
  tobSave();
  const ctx = _tobEditingEj.context;
  const plId = _tobEditingEj.plantillaId;
  tobCloseEjEditor();
  if(ctx === 'plantilla'){
    const pl = tobDB.plantillas.find(p => p.id === plId);
    if(pl){ tobRenderPlEjList(pl); }
    tobRenderPlantillas();
  } else {
    tobRenderEntreno(); tobRenderCharts();
  }
  tobToast('Ejercicio eliminado', 'green');
}

function tobAddEjToEntreno(entrenoId){
  tobOpenEjEditor(entrenoId, null);
}

function tobAddEjToPlantilla(plantillaId, entrenoId){
  tobOpenEjEditorPlantilla(plantillaId, entrenoId, null);
}

// Render lista de ejercicios dentro del modal de plantilla
function tobRenderPlEjList(pl){
  const cont = document.getElementById('tobPlEjList');
  if(!cont) return;
  if(!pl || !pl.entrenos || !pl.entrenos.length){
    cont.innerHTML = '<div style="color:var(--mute2);font-style:italic;padding:10px;">Aún no hay entrenos. Guarda primero con la definición textarea de arriba para crearlos.</div>';
    return;
  }
  cont.innerHTML = pl.entrenos.map(en => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;border-bottom:1px solid var(--border);padding-bottom:4px;">
        <span style="font-family:DM Mono,monospace;color:var(--acc);font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;">ENTRENO ${en.letra}</span>
        <span style="color:var(--mute);font-size:.72rem;">${tobEsc(en.nombre||'')}</span>
        <button class="tob-action ghost" style="margin-left:auto;font-size:.7rem;padding:3px 9px;" onclick="tobAddEjToPlantilla('${pl.id}','${en.id}')">+ Añadir ejercicio</button>
      </div>
      ${(en.ejercicios||[]).sort((a,b)=>(a.orden||0)-(b.orden||0)).map(ej => {
        const plan = tobPlanFor(ej, 1);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        const tipoBadge = ej.tipo === 'circuito' ? '<span style="font-size:.65rem;color:var(--acc2);margin-left:6px;">CIRCUITO</span>' : '';
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;background:#0e0d0a;border:1px solid var(--border);border-radius:3px;margin-bottom:4px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:.85rem;color:var(--text);">${tobEsc(ej.nombre)}${tipoBadge}</div>
            <div style="font-size:.7rem;color:var(--mute);font-family:DM Mono,monospace;margin-top:2px;">${plan.series} × ${tobEsc(reps)}${plan.pausa?` · pausa ${tobEsc(plan.pausa)}`:''}${ej.subtitle?` · ${tobEsc(ej.subtitle)}`:''}</div>
          </div>
          <button class="tob-action ghost" style="padding:4px 10px;font-size:.72rem;" onclick="tobOpenEjEditorPlantilla('${pl.id}','${en.id}','${ej.id}')" title="Editar este ejercicio (preserva ID)">✏️ Editar</button>
        </div>`;
      }).join('') || '<div style="color:var(--mute2);font-style:italic;padding:6px;font-size:.78rem;">Sin ejercicios en este entreno</div>'}
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════
// RESETEAR JEAN — borra y recrea desde cero
// ═══════════════════════════════════════════════════════════════
function tobResetJean(){
  const jean = tobDB.clientes.find(c => c.nombre.toLowerCase() === 'jean');
  if(!jean){
    if(confirm('Jean no existe. ¿Crearlo ahora con los datos demo?')){
      tobSeedJean();
    }
    return;
  }
  if(!confirm('⚠ Esto BORRA todos los datos de Jean (8 rutinas, sesiones, iteraciones) y los recrea desde cero con los valores del PDF + datos inventados.\n\n¿Continuar?')){ return; }
  tobDB.clientes = tobDB.clientes.filter(c => c.id !== jean.id);
  tobSave();
  tobSeedJean();
  tobToast('✓ Jean reseteado', 'green');
}

// Compartir histórico: genera y descarga el PDF, y a continuación abre WhatsApp
// con el mensaje. wa.me no permite adjuntar archivos por URL, así que la única
// forma de "enviar" el PDF es teniéndolo descargado para arrastrarlo manualmente
// al chat. Esto deja el archivo listo para adjuntar.
async function tobShareWhatsAppFicha(){
  if(!tobCurrentFichaId){ tobToast('Abre la ficha del cliente', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  tobToast('⏳ Generando PDF Histórico para enviar...', '');
  try {
    await tobBuildPdfHistorico(cli);
  } catch(e){
    console.warn('PDF Histórico falló:', e);
    tobToast('No pude generar el PDF, abro WhatsApp solo con el mensaje', 'red');
  }
  // Pequeño delay para que el navegador procese la descarga antes de abrir el chat
  await new Promise(r => setTimeout(r, 400));
  const stats = tobCalcGlobalKPIs(cli);
  const extra = `${(cli.asignaciones||[]).length} rutinas registradas, ${stats.completadas} completadas. El PDF se acaba de descargar — adjúntalo al chat.`;
  tobShareWhatsApp(cli, 'historico', extra);
}

async function tobShareWhatsAppRutina(){
  const a = tobAsig(); if(!a){ tobToast('Sin rutina abierta', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobCurrentAsig.clienteId);
  const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
  const it = tobIt();
  if(!cli) return;
  tobToast('⏳ Generando PDF resumen para enviar...', '');
  try {
    await tobBuildPdfResumenRutina(cli, a, pl);
  } catch(e){
    console.warn('PDF Resumen falló:', e);
    tobToast('No pude generar el PDF, abro WhatsApp solo con el mensaje', 'red');
  }
  await new Promise(r => setTimeout(r, 400));
  const stats = tobCalcItStats(a, it);
  const extra = `Rutina: ${tobRutinaShortName(pl)}${a.iteraciones.length > 1 ? ` (it.${it?.numero})` : ''}. ${stats.sesiones} sesiones registradas. El PDF se acaba de descargar — adjúntalo al chat.`;
  tobShareWhatsApp(cli, 'rutina', extra);
}

// ═══ WhatsApp share core ════════════════════════════════════
// Solo abre el chat. NO pre-rellena texto — el trainer escribe lo que quiera
// y adjunta el PDF que se ha descargado automáticamente justo antes.
function tobShareWhatsApp(cli, kind, extraText){
  if(!cli){ tobToast('Sin cliente', 'red'); return; }
  const phone = (cli.contacto || '').replace(/[^\d+]/g, '').replace(/^\+/,'');
  const url = phone ? `https://wa.me/${phone}` : `https://wa.me/`;
  window.open(url, '_blank');
  if(!phone){
    tobToast('Sin contacto guardado — abre WhatsApp y elige destinatario', '');
  } else {
    tobToast('✓ WhatsApp abierto · adjunta el PDF que se acaba de descargar', 'green');
  }
}

// ═════════════════════════════════════════════════════════════════
// CUESTIONARIO / PREFERENCIAS DEL CLIENTE
// ─────────────────────────────────────────────────────────────────
// Sección colapsable en la ficha del cliente. Guarda en cli.cuestionario.
// Schema cli.cuestionario:
//   { pesObjetivo, sumObjetivo, kcalObjetivo, protObjetivo, pal,
//     apat1..apat5, horaris, esport, motivacio, comentari,
//     tags: {
//       objectiu, apats, dieta, cuina, tempsCuina, treball  (radio, string|null)
//       proteina:[], pref:[], patologies:[]                 (multi)
//       alergies:[], alimX:[], alimOk:[], sentenMal:[], custom:[]  (listas libres)
//     }
//   }
// La mayoría de datos son chips/etiquetas — así la IA los detecta sin
// interpretar texto libre. Solo "comentari" (y recordatori/horaris) es texto.
// ═════════════════════════════════════════════════════════════════

// Grupos de chips predefinidos. mode: 'radio' (uno solo) | 'multi' (varios).
// 'neg' pinta el chip en rojo (restricción). 'excludes' quita el opuesto.
const TOB_QUEST_CHIPS = {
  objectiu: { mode:'radio', items:[
    { id:'perdre_greix',   label:'Perdre greix' },
    { id:'recomposicio',   label:'Recomposició corporal' },
    { id:'guanyar_muscul', label:'Guanyar múscul' },
    { id:'mantenir',       label:'Mantenir pes' },
    { id:'rendiment',      label:'Rendiment esportiu' },
    { id:'salut',          label:'Salut general' }
  ]},
  apats: { mode:'multi', items:[
    { id:'esmorzar', label:'Esmorzar' },
    { id:'mig_mati', label:'Mig matí' },
    { id:'dinar',    label:'Dinar' },
    { id:'berenar',  label:'Berenar' },
    { id:'berenar2', label:'2n berenar' },
    { id:'sopar',    label:'Sopar' },
    { id:'ressopo',  label:'Ressopó' }
  ]},
  dieta: { mode:'radio', items:[
    { id:'omnivor',    label:'Omnívor' },
    { id:'vegetaria',  label:'Vegetarià' },
    { id:'vega',       label:'Vegà' },
    { id:'pescetaria', label:'Pescetarià' },
    { id:'flexitaria', label:'Flexitarià' }
  ]},
  proteina: { mode:'multi', items:[
    { id:'carn_si',     label:'✓ Carn vermella',    excludes:'carn_no' },
    { id:'carn_no',     label:'✗ Sense carn vermella', neg:true, excludes:'carn_si' },
    { id:'pollastre_si',label:'✓ Pollastre i aviram', excludes:'pollastre_no' },
    { id:'pollastre_no',label:'✗ Sense pollastre',  neg:true, excludes:'pollastre_si' },
    { id:'peix_si',     label:'✓ Peix',             excludes:'peix_no' },
    { id:'peix_no',     label:'✗ Sense peix',       neg:true, excludes:'peix_si' },
    { id:'marisc_si',   label:'✓ Marisc',           excludes:'marisc_no' },
    { id:'marisc_no',   label:'✗ Sense marisc',     neg:true, excludes:'marisc_si' },
    { id:'ous_si',      label:'✓ Ous',              excludes:'ous_no' },
    { id:'ous_no',      label:'✗ Sense ous',        neg:true, excludes:'ous_si' },
    { id:'lactis_si',   label:'✓ Lactis',           excludes:'lactis_no' },
    { id:'lactis_no',   label:'✗ Sense lactis',     neg:true, excludes:'lactis_si' }
  ]},
  // PREFERÈNCIES → eleccions del client (no exclusions). "Sense gluten/lactosa"
  // s'ha mogut a "intolerancia". Aquí queden coses com paleo, keto, batch.
  pref: { mode:'multi', items:[
    { id:'fodmap',         label:'Baix FODMAP' },
    { id:'paleo',          label:'Paleo' },
    { id:'keto',           label:'Keto' },
    { id:'rapida',         label:'Cuina ràpida (<30 min)' },
    { id:'fora',           label:'Menja fora de casa sovint' },
    { id:'sense_cuina',    label:'Sense accés a cuina', neg:true }
  ]},
  // INTOLERÀNCIES → adaptar amb versions aptes, no eliminar el grup d'aliments.
  // El client celíac (intolerància severa) marca "Gluten" aquí + a "Patologies"
  // si vol (celiaquia segueix essent una patologia clínica). El menú s'adapta
  // usant versions sense gluten — no es treuen les receptes amb pa.
  intolerancia: { mode:'multi', items:[
    { id:'gluten',     label:'Gluten',           neg:true },
    { id:'lactosa',    label:'Lactosa',          neg:true },
    { id:'fructosa',   label:'Fructosa',         neg:true },
    { id:'histamina',  label:'Histamina',        neg:true },
    { id:'fruita_seca',label:'Fruita seca',      neg:true },
    { id:'crustacis',  label:'Crustacis/marisc', neg:true },
    { id:'soja',       label:'Soja',             neg:true }
  ]},
  patologies: { mode:'multi', items:[
    { id:'hipertensio',     label:'Hipertensió',             neg:true },
    { id:'colesterol',      label:'Colesterol alt',          neg:true },
    { id:'trigliceridos',   label:'Triglicèrids alts',       neg:true },
    { id:'diabetis1',       label:'Diabetis tipus 1',        neg:true },
    { id:'diabetis2',       label:'Diabetis tipus 2',        neg:true },
    { id:'resist_insulina', label:'Resistència insulina',    neg:true },
    { id:'hipotiroides',    label:'Hipotiroïdisme',          neg:true },
    { id:'hipertiroides',   label:'Hipertiroïdisme',         neg:true },
    { id:'sop',             label:'SOP / SOPQ',              neg:true },
    { id:'acid_uric',       label:'Àcid úric / gota',        neg:true },
    { id:'anemia',          label:'Anèmia',                  neg:true },
    { id:'sii',             label:'Còlon irritable (SII)',   neg:true },
    { id:'mii',             label:'Crohn / colitis',         neg:true },
    { id:'reflux',          label:'Reflux / acidesa',        neg:true },
    { id:'digestius',       label:'Digestió pesada / gasos', neg:true },
    { id:'fetge_gras',      label:'Fetge gras',              neg:true },
    { id:'renal',           label:'Problemes renals',        neg:true },
    { id:'osteoporosi',     label:'Osteoporosi',             neg:true },
    { id:'embaras',         label:'Embaràs' },
    { id:'lactancia',       label:'Lactància' },
    { id:'menopausa',       label:'Menopausa' }
  ]},
  cuina: { mode:'radio', items:[
    { id:'jo',       label:'Cuina ell/ella' },
    { id:'parella',  label:'Cuina la parella / família' },
    { id:'preparat', label:'Menjar preparat / càtering' },
    { id:'combinat', label:'Combinació' }
  ]},
  tempsCuina: { mode:'radio', items:[
    { id:'molt_poc', label:'<15 min' },
    { id:'poc',      label:'15-30 min' },
    { id:'normal',   label:'30-60 min' },
    { id:'batch',    label:'Batch cooking cap de setmana' }
  ]},
  treball: { mode:'radio', items:[
    { id:'sedentari', label:'Sedentari (oficina)' },
    { id:'actiu',     label:'Actiu (de peu / movent-se)' },
    { id:'fisic',     label:'Físic intens' },
    { id:'torns',     label:'Torns / nocturn' },
    { id:'casa',      label:'A casa / cura de família' }
  ]},
  // ── Nous grups: pistes per a la IA quan munta el menú ──
  // No són trets físics, són preferències que ajuden a personalitzar el repartiment
  // de kcal/proteïna durant el dia (entrevista a Sergio: "pregunto quin àpat és el
  // més important per al client i a quina hora té més gana").
  apatPrincipal: { mode:'radio', items:[
    { id:'esmorzar', label:'Esmorzar' },
    { id:'dinar',    label:'Dinar' },
    { id:'sopar',    label:'Sopar' },
    { id:'cap',      label:'Cap en concret' }
  ]},
  gana: { mode:'radio', items:[
    { id:'mati',    label:'Més gana al matí' },
    { id:'migdia',  label:'Més gana al migdia' },
    { id:'tarda',   label:'Més gana a la tarda' },
    { id:'nit',     label:'Més gana a la nit' },
    { id:'uniforme',label:'Uniforme tot el dia' }
  ]},
  entrenoDies: { mode:'multi', items:[
    { id:'dl', label:'Dl' }, { id:'dt', label:'Dt' }, { id:'dc', label:'Dc' },
    { id:'dj', label:'Dj' }, { id:'dv', label:'Dv' }, { id:'ds', label:'Ds' },
    { id:'dg', label:'Dg' }
  ]},
  entrenoMoment: { mode:'radio', items:[
    { id:'mati',  label:'Al matí' },
    { id:'tarda', label:'A la tarda' },
    { id:'nit',   label:'A la nit' }
  ]},
  variacio: { mode:'radio', items:[
    { id:'molta',  label:'Molta variació (cada dia diferent)' },
    { id:'mitjana',label:'Variació mitjana (pot repetir alguns)' },
    { id:'poca',   label:'Poca variació (li agrada repetir)' }
  ]}
};
// Container DOM (id del div .tob-quest-chips) por grupo.
const TOB_QUEST_CHIP_EL = {
  objectiu:'qChipsObjectiu', apats:'qChipsApats', dieta:'qChipsDieta',
  proteina:'qChipsProteina', pref:'qChipsPref',
  intolerancia:'qChipsIntolerancia',
  patologies:'qChipsPatologies',
  cuina:'qChipsCuina', tempsCuina:'qChipsTempsCuina', treball:'qChipsTreball',
  apatPrincipal:'qChipsApatPrincipal', gana:'qChipsGana',
  entrenoDies:'qChipsEntrenoDies', entrenoMoment:'qChipsEntrenoMoment',
  variacio:'qChipsVariacio'
};
// Alimentos comunes (divisivos) — mismos chips para Aliments ✗ y ✓.
const TOB_QUEST_ALIM_PRESETS = [
  'Bròquil','Coliflor','Espinacs','Bolets','Ceba','All','Pebrot','Albergínia',
  'Tomàquet','Carbassó','Llegums','Peix blau','Marisc','Ou','Formatge','Iogurt',
  'Llet','Fruita seca','Alvocat','Olives','Picant','Fregits','Vísceres','Coco'
];
// Listas de chips: 'presets' = chips predefinidos (clic = on/off); además
// se pueden añadir libres escribiendo + Enter. 'migrate' = clave de texto
// vieja que se trocea en chips la primera vez. 'neg' = chips en rojo.
const TOB_QUEST_LISTS = {
  alergies: { el:'qChipsAlergies', migrate:'alergias', neg:true, presets:[
    'Gluten','Lactosa','Ou','Fruits secs','Cacauet','Soja','Peix',
    'Crustacis / marisc','Mol·luscs','Sèsam','Mostassa','Api','Sulfits','Tramús'
  ]},
  alimX:     { el:'qChipsAlimX',     migrate:'alimX',  neg:true, presets:TOB_QUEST_ALIM_PRESETS },
  alimOk:    { el:'qChipsAlimOk',    migrate:'alimOk',           presets:TOB_QUEST_ALIM_PRESETS },
  sentenMal: { el:'qChipsSentenMal', migrate:'sientenMal', neg:true, presets:[
    'Lactosa','Gluten','Llegums','Ceba i all','Crucíferes','Picant',
    'Cafeïna','Fregits','Edulcorants','Alcohol','Cítrics','Embotits'
  ]},
  custom:    { el:'qChipsCustom' }
};
// Recordatori: àpats disponibles y cuáles se muestran según el nº de àpats
// elegido en el chip "Nombre d'àpats".
// Definición única de àpats. El cuestionario (chip "apats") deja elegir
// cuáles hace el cliente; recordatori 24h y creador de menús se adaptan.
//   recSet  = qué chips de recordatori usa (esmorzar/snack/apat)
//   momento = momento de receta con el que se filtran candidatos
const TOB_MEALS = [
  { id:'esmorzar', label:'Esmorzar',   recSet:'esmorzar', momento:'esmorzar' },
  { id:'mig_mati', label:'Mig matí',   recSet:'snack',    momento:'mig_mati' },
  { id:'dinar',    label:'Dinar',      recSet:'apat',     momento:'dinar' },
  { id:'berenar',  label:'Berenar',    recSet:'snack',    momento:'berenar' },
  { id:'berenar2', label:'2n berenar', recSet:'snack',    momento:'berenar' },
  { id:'sopar',    label:'Sopar',      recSet:'apat',     momento:'sopar' },
  { id:'ressopo',  label:'Ressopó',    recSet:'snack',    momento:'berenar' }
];
const TOB_MEALS_DEFAULT = ['esmorzar','dinar','sopar'];   // si no s'ha triat res
// Chips de cada tipo de àpat para el recordatori 24h.
// Café separado en variantes — així Sergio sap si posar cafè sol amb torrades
// o cafè amb llet (que pot afectar la composició final de l'esmorzar).
const TOB_QUEST_REC_SETS = {
  esmorzar: ['Cafè sol','Cafè amb llet','Te / infusió','Torrades / pa','Batut','Iogurt','Fruita','Cereals / civada','Ous / salat','Dolç'],
  snack:    ['Fruita','Iogurt','Fruits secs','Barreta','Cafè sol','Cafè amb llet','Te / infusió','Entrepà petit','No menja res'],
  apat:     ['Plat únic','Principal + acompanyament','Porta postre','Porta pa']
};

// Lista de IDs de los campos de texto simples (input/textarea/select).
const TOB_QUEST_FIELDS = [
  ['qPesObj',    'pesObjetivo',  'num'],
  ['qSumObj',    'sumObjetivo',  'num'],
  ['qKcalObj',   'kcalObjetivo', 'num'],
  ['qProtObj',   'protObjetivo', 'num'],
  ['qPAL',       'pal',          'str'],
  ['qHoraris',   'horaris',      'str'],
  ['qEsport',    'esport',       'str'],
  ['qMotivacio', 'motivacio',    'str'],
  ['qComentari', 'comentari',    'str']
];

let _tobQuestSaveTimer = null;

// Carga el cuestionario del cliente actual a la UI.
function tobQuestLoad(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const q = cli.cuestionario || {};
  TOB_QUEST_FIELDS.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.value = q[key] != null ? q[key] : '';
    // Listener auto-save (debounced) — solo se engancha una vez
    if(!el._qBound){
      el.addEventListener('input', () => {
        tobQuestScheduleSave();
        tobUpdateCuestionarioBadge();
        tobQuestUpdateGuides();
      });
      el._qBound = true;
    }
  });
  // Asegura/migra la estructura de tags antes de renderizar
  const tags = cli.cuestionario ? tobQuestEnsureTags(cli) : (q.tags || {});
  tobQuestRenderChips(tags);
  tobQuestRenderRecordatori();
  tobQuestUpdateGuides();
  tobUpdateCuestionarioBadge();
}

// Renderiza el recordatori 24h: una fila de chips por cada àpat que el
// cliente hace (los seleccionados en el chip "Àpats" de arriba).
function tobQuestRenderRecordatori(){
  const cont = document.getElementById('qRecordatoriFields');
  if(!cont) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  const q = (cli && cli.cuestionario) || {};
  const sel = (q.tags && Array.isArray(q.tags.apats)) ? q.tags.apats : [];
  const meals = sel.length
    ? TOB_MEALS.filter(mDef => sel.includes(mDef.id))
    : TOB_MEALS.filter(mDef => TOB_MEALS_DEFAULT.includes(mDef.id));
  if(!sel.length){
    cont.innerHTML = '<div style="font-size:.74rem;color:var(--mute2);font-family:DM Mono,monospace;padding:6px 2px;">Marca a dalt els àpats que fa el client.</div>';
    return;
  }
  const recChips = q.recChips || {};
  cont.innerHTML = meals.map(mDef => {
    const on = new Set(recChips[mDef.id] || []);
    const set = TOB_QUEST_REC_SETS[mDef.recSet] || [];
    const chips = set.map((label, ix) =>
      `<button type="button" class="tob-quest-chip${on.has(label)?' active':''}" onclick="tobQuestRecChip('${mDef.id}',${ix})">${tobEsc(label)}</button>`
    ).join('');
    return `<div class="tob-quest-rec-row">
      <label class="tob-lbl">${tobEsc(mDef.label)}</label>
      <div class="tob-quest-chips">${chips}</div>
    </div>`;
  }).join('');
}

// Toggle de un chip del recordatori. Se guarda en q.recChips[mealId].
function tobQuestRecChip(mealId, idx){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const mDef = TOB_MEALS.find(a => a.id === mealId);
  const label = mDef && (TOB_QUEST_REC_SETS[mDef.recSet] || [])[idx];
  if(!label) return;
  if(!cli.cuestionario) cli.cuestionario = {};
  if(!cli.cuestionario.recChips) cli.cuestionario.recChips = {};
  const arr = cli.cuestionario.recChips[mealId] || (cli.cuestionario.recChips[mealId] = []);
  const ix = arr.indexOf(label);
  if(ix >= 0) arr.splice(ix, 1);
  else arr.push(label);
  tobQuestRenderRecordatori();
  tobQuestScheduleSave();
}

// ── Harris-Benedict: kcal base + guía de proteína ────────────────
// Usa la última medición del cliente (peso + estatura), su fecha de
// nacimiento (edad) y su sexo. Devuelve {bmr, pes, est, edad} o null.
function tobQuestComputeBMR(cli){
  if(!cli) return null;
  const meds = (typeof tobMedsSorted === 'function') ? tobMedsSorted(cli) : [];
  const last = meds[meds.length - 1];
  const pes = last ? parseFloat(last.pes) : NaN;
  const est = last ? parseFloat(last.estatura) : NaN;
  const edad = (typeof tobMedAge === 'function')
    ? tobMedAge(cli, new Date().toISOString().slice(0,10)) : null;
  if(!(pes > 0) || !(est > 0) || edad == null) return null;
  // Harris-Benedict revisado (Roza & Shizgal, 1984)
  const bmr = (cli.sexo === 'M')
    ? 447.593 + 9.247*pes + 3.098*est - 4.330*edad
    : 88.362 + 13.397*pes + 4.799*est - 5.677*edad;
  return { bmr: Math.round(bmr), pes, est, edad };
}

// Refresca los textos guía: proteína (1.2-2 g/kg) y kcal base (HB × PAL).
function tobQuestUpdateGuides(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  const meds = (cli && typeof tobMedsSorted === 'function') ? tobMedsSorted(cli) : [];
  const last = meds[meds.length - 1];
  const pes  = last ? parseFloat(last.pes) : NaN;

  const protEl = document.getElementById('qProtGuide');
  if(protEl){
    protEl.textContent = (pes > 0)
      ? `· guia ${Math.round(pes*1.2)}–${Math.round(pes*2)} g (1.2–2 g/kg de ${pes} kg)`
      : '';
  }
  const kcalEl = document.getElementById('qKcalBase');
  if(kcalEl){
    const hb = tobQuestComputeBMR(cli);
    if(!hb){
      kcalEl.textContent = '⚠ Afegeix una medició amb pes i estatura + la data de naixement per calcular les kcal base.';
      kcalEl.classList.remove('ok');
    } else {
      const pal = parseFloat((document.getElementById('qPAL') || {}).value);
      if(pal > 0){
        kcalEl.textContent = `≈ ${Math.round(hb.bmr*pal)} kcal/dia de manteniment · Harris-Benedict (MB ${hb.bmr} × PAL ${pal})`;
      } else {
        kcalEl.textContent = `Metabolisme basal ${hb.bmr} kcal/dia · escull l'activitat per veure el manteniment`;
      }
      kcalEl.classList.add('ok');
    }
  }
}

// ── Botón "📋 Cuestionario" en la toolbar: scroll + abre el details ──
// Si está vacío o casi vacío, el botón muestra un badge "!" rojo. La
// función `tobUpdateCuestionarioBadge` recalcula ese estado al cargar
// la ficha y al editar cualquier campo del cuestionario.
function tobOpenCuestionario(){
  // Canviar a la pestanya cuestionari si la fitxa ja està en mode tabs
  if(typeof tobFichaShowTab === 'function') tobFichaShowTab('cuestionario');
  const det = document.getElementById('tobFichaCuestionarioDetails');
  if(det) det.open = true;
  const block = document.getElementById('tobFichaCuestionarioBlock');
  if(block) block.scrollIntoView({ behavior:'smooth', block:'start' });
  // Auto-omplir la calculadora HB amb dades del client (última medició).
  try { tobHbAutoFill(); tobHbRenderHist(); } catch(e){ console.warn('[HB autofill]', e); }
}

// ═════════════════════════════════════════════════════════════════
// CALCULADORA Mifflin-St Jeor — bloque del cuestionario
// ─────────────────────────────────────────────────────────────────
// Fórmula:
//   Home:  BMR = 10·P + 6.25·A - 5·E + 5
//   Dona:  BMR = 10·P + 6.25·A - 5·E - 161
//   GET   = BMR × PAL
//   Kcal  = GET × (1 + obj%)
//   Prot  = Pes × g/kg
//
// L'històric es desa a cli.cuestionario.hbHistorial = [{ts, peso, altura, edat,
// sexe, pal, objPct, protGkg, kcal, prot}].
// ═════════════════════════════════════════════════════════════════
function _tobHbCli(){
  return tobDB.clientes.find(c => c.id === tobCurrentFichaId);
}
function _tobHbCalcEdat(dataNaix){
  if(!dataNaix) return null;
  const d = new Date(dataNaix);
  if(isNaN(d.getTime())) return null;
  const now = new Date();
  let edat = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if(m < 0 || (m === 0 && now.getDate() < d.getDate())) edat--;
  return edat;
}
function tobHbAutoFill(){
  const cli = _tobHbCli();
  if(!cli) return;
  const meds = (cli.mediciones || []).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
  const last = meds.length ? meds[meds.length - 1] : null;
  const peso    = last && last.pes != null ? +last.pes : (cli.pes || null);
  const altura  = last && last.estatura != null ? +last.estatura : (cli.estatura || null);
  const edat    = _tobHbCalcEdat(cli.dataNaixement) || cli.edat || null;
  const sexe    = cli.sexo === 'M' ? 'M' : 'H';
  const setVal  = (id, v) => { const el = document.getElementById(id); if(el && v != null) el.value = v; };
  setVal('qHbPeso',   peso);
  setVal('qHbAltura', altura);
  setVal('qHbEdat',   edat);
  const sx = document.getElementById('qHbSexe'); if(sx) sx.value = sexe;
  // PAL i objectiu: si el cuestionario ja en té de guardats, els reaprofitem
  const q = cli.cuestionario || {};
  const pal = document.getElementById('qHbPAL');
  if(pal && q.tags && q.tags.PAL) pal.value = q.tags.PAL;
  else if(pal && q.hbLast && q.hbLast.pal) pal.value = q.hbLast.pal;
  const obj = document.getElementById('qHbObj');
  if(obj && q.hbLast && q.hbLast.objPct != null) obj.value = q.hbLast.objPct;
  const protG = document.getElementById('qHbProtGkg');
  if(protG && q.hbLast && q.hbLast.protGkg != null) protG.value = q.hbLast.protGkg;
  tobHbCalcular();
}
function tobHbCalcular(){
  const num = id => {
    const v = parseFloat((document.getElementById(id) || {}).value);
    return isFinite(v) ? v : null;
  };
  const peso = num('qHbPeso'), altura = num('qHbAltura'), edat = num('qHbEdat');
  const sexe = (document.getElementById('qHbSexe') || {}).value || 'H';
  const pal  = num('qHbPAL'), objPct = num('qHbObj'), protGkg = num('qHbProtGkg');
  const result = document.getElementById('qHbResult');
  if(!result) return;
  if(peso == null || altura == null || edat == null || pal == null || objPct == null || protGkg == null){
    result.innerHTML = '<span class="tob-hb-incomplete">— Completa les dades per calcular</span>';
    return;
  }
  const bmr = sexe === 'M'
    ? 10*peso + 6.25*altura - 5*edat - 161
    : 10*peso + 6.25*altura - 5*edat + 5;
  const get = bmr * pal;
  const kcal = Math.round(get * (1 + objPct/100));
  const prot = Math.round(peso * protGkg);
  const objLbl = objPct > 0 ? '+' + objPct + '%' : objPct + '%';
  result.innerHTML =
    '<div class="tob-hb-result-grid">' +
      '<div><span class="lbl">BMR</span><span class="val">' + Math.round(bmr) + '</span><span class="unit">kcal/dia</span></div>' +
      '<div><span class="lbl">GET (×' + pal + ')</span><span class="val">' + Math.round(get) + '</span><span class="unit">kcal/dia</span></div>' +
      '<div class="primary"><span class="lbl">Kcal objectiu (' + objLbl + ')</span><span class="val">' + kcal + '</span><span class="unit">kcal/dia</span></div>' +
      '<div class="primary"><span class="lbl">Proteïna (' + protGkg + ' g/kg)</span><span class="val">' + prot + '</span><span class="unit">g/dia</span></div>' +
    '</div>';
}
function tobHbAplicar(){
  const cli = _tobHbCli();
  if(!cli){ tobToast('Cliente no trobat', 'red'); return; }
  const num = id => {
    const v = parseFloat((document.getElementById(id) || {}).value);
    return isFinite(v) ? v : null;
  };
  const peso = num('qHbPeso'), altura = num('qHbAltura'), edat = num('qHbEdat');
  const sexe = (document.getElementById('qHbSexe') || {}).value || 'H';
  const pal  = num('qHbPAL'), objPct = num('qHbObj'), protGkg = num('qHbProtGkg');
  if(peso == null || altura == null || edat == null || pal == null || objPct == null || protGkg == null){
    tobToast('Falten dades per calcular', 'red'); return;
  }
  const bmr = sexe === 'M'
    ? 10*peso + 6.25*altura - 5*edat - 161
    : 10*peso + 6.25*altura - 5*edat + 5;
  const kcal = Math.round(bmr * pal * (1 + objPct/100));
  const prot = Math.round(peso * protGkg);
  // Bolcar als inputs visibles del cuestionario perquè el guardat ja existent
  // (tobQuestSave) els reculli automàticament.
  const kEl = document.getElementById('qKcalObj'); if(kEl) kEl.value = kcal;
  const pEl = document.getElementById('qProtObj'); if(pEl) pEl.value = prot;
  const palEl = document.getElementById('qPAL'); if(palEl) palEl.value = String(pal);
  // Registrar al històric.
  if(!cli.cuestionario) cli.cuestionario = { tags:{}, recChips:{} };
  if(!Array.isArray(cli.cuestionario.hbHistorial)) cli.cuestionario.hbHistorial = [];
  const entry = { ts: Date.now(), peso, altura, edat, sexe, pal, objPct, protGkg, kcal, prot };
  // Si l'últim entry és idèntic, no duplicar
  const prev = cli.cuestionario.hbHistorial[0];
  const isDuplicate = prev && prev.kcal === kcal && prev.prot === prot &&
    prev.peso === peso && prev.pal === pal && prev.objPct === objPct;
  if(!isDuplicate){
    cli.cuestionario.hbHistorial.unshift(entry);
    if(cli.cuestionario.hbHistorial.length > 50) cli.cuestionario.hbHistorial = cli.cuestionario.hbHistorial.slice(0, 50);
  }
  cli.cuestionario.hbLast = entry;
  tobQuestSave(true);   // dispara save + toast
  tobHbRenderHist();
}
function tobHbRenderHist(){
  const cli = _tobHbCli();
  const list = document.getElementById('qHbHistList');
  const count = document.getElementById('qHbHistCount');
  if(!list || !cli) return;
  const hist = (cli.cuestionario && cli.cuestionario.hbHistorial) || [];
  if(count) count.textContent = '(' + hist.length + ')';
  if(!hist.length){
    list.innerHTML = '<div class="tob-hb-hist-empty">Encara no hi ha cap aplicació registrada.</div>';
    return;
  }
  list.innerHTML = hist.map((h, ix) => {
    const d = new Date(h.ts);
    const fecha = d.toLocaleDateString('ca-ES') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    const objLbl = h.objPct > 0 ? '+' + h.objPct + '%' : h.objPct + '%';
    return '<div class="tob-hb-hist-row' + (ix === 0 ? ' current' : '') + '">' +
      '<div class="tob-hb-hist-main"><b>' + h.kcal + '</b> kcal · <b>' + h.prot + '</b> g prot</div>' +
      '<div class="tob-hb-hist-meta">' + fecha + ' · ' + h.peso + 'kg · PAL ' + h.pal + ' · obj ' + objLbl + ' · ' + h.protGkg + ' g/kg</div>' +
    '</div>';
  }).join('');
}

// Considera "vacío" si el cliente no tiene objectiu, ni dieta, ni kcal.
function tobUpdateCuestionarioBadge(){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  const badgeBtn  = document.getElementById('tobBtnCuestionarioBadge');
  const tagEmpty  = document.getElementById('tobCuestEmptyTag');
  if(!cli){
    if(badgeBtn) badgeBtn.style.display = 'none';
    if(tagEmpty) tagEmpty.style.display = 'none';
    return;
  }
  const q = cli.cuestionario || {};
  const tags = q.tags || {};
  const tieneDieta = !!tags.dieta || (Array.isArray(tags.proteina) && tags.proteina.length > 0);
  const tieneObjetivo = !!tags.objectiu;
  const tieneKcal = q.kcalObjetivo != null && String(q.kcalObjetivo).trim() !== '';
  const vacio = !tieneObjetivo && !tieneDieta && !tieneKcal;
  if(badgeBtn) badgeBtn.style.display = vacio ? '' : 'none';
  if(tagEmpty) tagEmpty.style.display = vacio ? '' : 'none';
}

// Render genérico de TODOS los grupos de chips + listas libres.
function tobQuestRenderChips(tags){
  tags = tags || {};
  // Grupos predefinidos (radio / multi)
  Object.keys(TOB_QUEST_CHIPS).forEach(group => {
    const def = TOB_QUEST_CHIPS[group];
    const el  = document.getElementById(TOB_QUEST_CHIP_EL[group]);
    if(!el) return;
    const sel = def.mode === 'radio'
      ? tags[group]
      : (Array.isArray(tags[group]) ? new Set(tags[group]) : new Set());
    el.innerHTML = def.items.map(c => {
      const on = def.mode === 'radio' ? (c.id === sel) : sel.has(c.id);
      return `<button type="button" class="tob-quest-chip${on?' active':''}${c.neg?' neg':''}" onclick="tobQuestToggle('${group}','${c.id}')">${tobEsc(c.label)}</button>`;
    }).join('');
  });
  // Listas: chips predefinidos (toggle) + entradas libres (con × para borrar)
  Object.keys(TOB_QUEST_LISTS).forEach(key => {
    const cfg = TOB_QUEST_LISTS[key];
    const el  = document.getElementById(cfg.el);
    if(!el) return;
    const arr = Array.isArray(tags[key]) ? tags[key] : [];
    const presets = cfg.presets || [];
    const presetSet = new Set(presets);
    let html = '';
    // Chips predefinidos — activos si su valor está en la lista
    presets.forEach((p, pi) => {
      const on = arr.includes(p);
      html += `<button type="button" class="tob-quest-chip${on?' active':''}${(cfg.neg&&on)?' neg':''}" onclick="tobQuestToggleListPreset('${key}',${pi})">${tobEsc(p)}</button>`;
    });
    // Entradas libres (las que no son chips predefinidos) — con × para borrar
    arr.forEach((v, i) => {
      if(presetSet.has(v)) return;
      html += `<button type="button" class="tob-quest-chip custom active${cfg.neg?' neg':''}" onclick="tobQuestRemoveListChip('${key}',${i})" title="Clic per esborrar">${tobEsc(v)}<span class="x">×</span></button>`;
    });
    if(!html){
      html = '<span style="font-size:.7rem;color:var(--mute2);font-family:DM Mono,monospace;">cap encara</span>';
    }
    el.innerHTML = html;
  });
}

// Asegura la estructura de tags y migra campos de texto viejos a listas.
function tobQuestEnsureTags(cli){
  if(!cli.cuestionario) cli.cuestionario = {};
  const q = cli.cuestionario;
  if(!q.tags) q.tags = {};
  const t = q.tags;
  // Migración: apats pasó de nº de comidas (string '3'/'4'/'5') a lista
  // de àpats concretos.
  if(typeof t.apats === 'string'){
    const m = {
      '3': ['esmorzar','dinar','sopar'],
      '4': ['esmorzar','dinar','berenar','sopar'],
      '5': ['esmorzar','mig_mati','dinar','berenar','sopar']
    };
    t.apats = m[t.apats] || m['5'];
  }
  // Migración: recChips pasó de claves apatN a ids de àpat.
  if(q.recChips && (q.recChips.apat1 || q.recChips.apat2 || q.recChips.apat3 ||
                    q.recChips.apat4 || q.recChips.apat5)){
    const km = { apat1:'esmorzar', apat2:'mig_mati', apat3:'dinar', apat4:'berenar', apat5:'sopar' };
    const nw = {};
    Object.keys(q.recChips).forEach(k => { nw[km[k] || k] = q.recChips[k]; });
    q.recChips = nw;
  }
  // Migració: 'sense_gluten'/'sense_lactosa'/'sense_fruita_seca' s'han mogut
  // de `pref` a `intolerancia` per a evitar redundància amb patologies/alergies.
  if(Array.isArray(t.pref)){
    const movMap = { sense_gluten:'gluten', sense_lactosa:'lactosa', sense_fruita_seca:'fruita_seca' };
    if(!Array.isArray(t.intolerancia)) t.intolerancia = [];
    Object.keys(movMap).forEach(oldId => {
      const ix = t.pref.indexOf(oldId);
      if(ix >= 0){
        t.pref.splice(ix, 1);
        const newId = movMap[oldId];
        if(t.intolerancia.indexOf(newId) === -1) t.intolerancia.push(newId);
      }
    });
  }
  // Grupos multi → array; radio → se deja como string|null
  Object.keys(TOB_QUEST_CHIPS).forEach(g => {
    if(TOB_QUEST_CHIPS[g].mode === 'multi' && !Array.isArray(t[g])) t[g] = [];
  });
  // Listas libres → array, con migración de la clave de texto vieja
  Object.keys(TOB_QUEST_LISTS).forEach(key => {
    if(!Array.isArray(t[key])) t[key] = [];
    const old = TOB_QUEST_LISTS[key].migrate;
    if(old && q[old] && t[key].length === 0){
      String(q[old]).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
        .forEach(s => { if(t[key].indexOf(s) === -1) t[key].push(s); });
      delete q[old];
    }
  });
  return t;
}

// Toggle genérico para grupos radio / multi.
function tobQuestToggle(group, id){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const def = TOB_QUEST_CHIPS[group];
  if(!def) return;
  const tags = tobQuestEnsureTags(cli);
  if(def.mode === 'radio'){
    tags[group] = (tags[group] === id) ? null : id;
  } else {
    if(!Array.isArray(tags[group])) tags[group] = [];
    const arr = tags[group];
    const ix = arr.indexOf(id);
    if(ix >= 0){
      arr.splice(ix, 1);
    } else {
      arr.push(id);
      // Si tiene "excludes", quita el contrario automáticamente
      const chipDef = def.items.find(c => c.id === id);
      if(chipDef && chipDef.excludes){
        const exIx = arr.indexOf(chipDef.excludes);
        if(exIx >= 0) arr.splice(exIx, 1);
      }
    }
  }
  tobQuestRenderChips(tags);
  tobQuestScheduleSave();
  // El recordatori depende del nº de àpats
  if(group === 'apats') tobQuestRenderRecordatori();
}

// Chip predefinido de una lista: añade/quita su valor de la lista.
function tobQuestToggleListPreset(key, pi){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const cfg = TOB_QUEST_LISTS[key];
  const val = cfg && cfg.presets ? cfg.presets[pi] : null;
  if(!val) return;
  const tags = tobQuestEnsureTags(cli);
  if(!Array.isArray(tags[key])) tags[key] = [];
  const ix = tags[key].indexOf(val);
  if(ix >= 0) tags[key].splice(ix, 1);
  else        tags[key].push(val);
  tobQuestRenderChips(tags);
  tobQuestScheduleSave();
}

// Listas libres: añadir (Enter) / quitar chip.
function tobQuestAddListChip(key, ev){
  if(ev.key !== 'Enter') return;
  ev.preventDefault();
  const inp = ev.target;
  const val = (inp.value || '').trim();
  if(!val) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const tags = tobQuestEnsureTags(cli);
  if(!Array.isArray(tags[key])) tags[key] = [];
  if(tags[key].indexOf(val) === -1) tags[key].push(val);
  inp.value = '';
  tobQuestRenderChips(tags);
  tobQuestScheduleSave();
}

function tobQuestRemoveListChip(key, ix){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  const tags = tobQuestEnsureTags(cli);
  if(!Array.isArray(tags[key])) return;
  tags[key].splice(ix, 1);
  tobQuestRenderChips(tags);
  tobQuestScheduleSave();
}

// Auto-guarda con debounce de 600ms (evita escribir en cada keystroke).
function tobQuestScheduleSave(){
  clearTimeout(_tobQuestSaveTimer);
  const hint = document.getElementById('qSavedStatus');
  if(hint) hint.textContent = '· editant…';
  _tobQuestSaveTimer = setTimeout(() => tobQuestSave(false), 600);
}

function tobQuestSave(showToast){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  if(!cli.cuestionario) cli.cuestionario = {};
  TOB_QUEST_FIELDS.forEach(([id, key, type]) => {
    const el = document.getElementById(id);
    if(!el) return;
    const v = el.value.trim();
    if(v === ''){ delete cli.cuestionario[key]; return; }
    if(type === 'num'){
      const n = parseFloat(v);
      cli.cuestionario[key] = Number.isFinite(n) ? n : v;
    } else {
      cli.cuestionario[key] = v;
    }
  });
  // tags ya se actualiza vía toggle, no hace falta tocarlo aquí
  tobSave();
  const hint = document.getElementById('qSavedStatus');
  if(hint){
    hint.textContent = '✓ guardat ' + new Date().toLocaleTimeString('ca-ES');
    setTimeout(() => { if(hint.textContent.startsWith('✓')) hint.textContent = ''; }, 3000);
  }
  if(showToast) tobToast('✓ Cuestionari guardat', 'green');
  // Refrescar el badge del botón en toolbar (visible cuando vacío)
  if(typeof tobUpdateCuestionarioBadge === 'function') tobUpdateCuestionarioBadge();
}

function tobQuestReset(){
  if(!confirm('Esborrar tot el cuestionari d\'aquest client?')) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  delete cli.cuestionario;
  tobSave();
  tobQuestLoad();
  tobToast('Cuestionari esborrat', '');
}

// ═════════════════════════════════════════════════════════════════
// EXPORTACIÓN EXCEL DEL CLIENTE
// ─────────────────────────────────────────────────────────────────
// Genera un .xlsx con varias hojas:
//   1. Resumen: datos personales + cuestionario en formato key/value
//   2. Mediciones: una fila por medición, columnas con todos los campos
//   3. Rutinas: una fila por (rutina × iteración × micro × entreno × ejercicio × serie)
//      con kg/reps registrados
//   4. PRs: máximo por ejercicio + en qué rutina lo hizo
// Requiere SheetJS (cargado vía CDN xlsx.full.min.js en el <head>).
// ═════════════════════════════════════════════════════════════════
function tobExportClienteExcel(cliId){
  if(typeof XLSX === 'undefined'){
    tobToast('SheetJS no carregat — recarrega la pàgina', 'red');
    return;
  }
  const cli = tobDB.clientes.find(c => c.id === cliId);
  if(!cli){ tobToast('Client no trobat', 'red'); return; }

  const wb = XLSX.utils.book_new();

  // ── HOJA 1: Resumen ──────────────────────────────────────────
  const resumenRows = [
    ['BLOC', 'Camp', 'Valor'],
    ['PERSONAL', 'Nom', cli.nombre || ''],
    ['PERSONAL', 'Sexe', cli.sexo === 'H' ? 'Home' : cli.sexo === 'M' ? 'Dona' : ''],
    ['PERSONAL', 'Contacte', cli.contacto || ''],
    ['PERSONAL', 'Data alta', cli.alta || ''],
    ['PERSONAL', 'Data naixement', cli.nacimiento || ''],
    ['PERSONAL', 'Idioma PDFs', cli.idioma || 'ca']
  ];
  const q = cli.cuestionario || {};
  const qLabels = {
    pesObjetivo:'Pes objectiu (kg)', sumObjetivo:'Sumatori 6 plecs objectiu (mm)',
    kcalObjetivo:'Objectiu calòric (kcal/dia)',
    protObjetivo:'Proteïna objectiu (g)', hcObjetivo:'Hidrats objectiu (g)', grasObjetivo:'Greixos objectiu (g)',
    pal:"Nivell d'activitat (PAL)", protocolo:'Protocol per perdre pes',
    alergias:'Al·lèrgies / intoleràncies', sientenMal:'Aliments que senten malament',
    alimX:'Aliments ✗ (no menjar)', alimOk:'Aliments ✓ (preferits)',
    patologias:'Patologies / condicions',
    apat1:'Àpat 1 (esmorzar)', apat2:'Àpat 2 (mig matí)',
    apat3:'Àpat 3 (dinar)', apat4:'Àpat 4 (berenar)', apat5:'Àpat 5 (sopar)',
    cuina:'Cuina', esport:'Exercici / esport', treball:'Treball',
    horaris:'Horaris de menjar', motivacio:'Motivació i adherència',
    comentari:'Comentari general'
  };
  Object.keys(qLabels).forEach(k => {
    if(q[k] != null && q[k] !== '') resumenRows.push(['QUESTIONARI', qLabels[k], q[k]]);
  });
  // Tags (perfil alimentario) — string concatenado
  const tags = q.tags || {};
  if(tags.dieta) resumenRows.push(['PERFIL', 'Tipus dieta', tags.dieta]);
  if(tags.proteina?.length) resumenRows.push(['PERFIL', 'Proteïna animal', tags.proteina.join(', ')]);
  if(tags.pref?.length) resumenRows.push(['PERFIL', 'Preferències', tags.pref.join(', ')]);
  if(tags.custom?.length) resumenRows.push(['PERFIL', 'Etiquetes personalitzades', tags.custom.join(', ')]);

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  wsResumen['!cols'] = [{wch:14}, {wch:38}, {wch:60}];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resum');

  // ── HOJA 2: Mediciones ───────────────────────────────────────
  const meds = (cli.mediciones || []).slice().sort((a,b) => (a.fecha||'').localeCompare(b.fecha||''));
  if(meds.length){
    const medHeader = [
      'Data','Pes (kg)','Estatura (cm)',
      'Plec Tríceps','Plec Subescapular','Plec Supraespinal',
      'Plec Abdominal','Plec Cuixa','Plec Panxell','Suma 6 Plecs',
      'Perímetre Mesoesternal','Perímetre Braç Tensió','Perímetre Cintura',
      'Perímetre Malucs','Perímetre Cuixa','Perímetre Panxell',
      'Ràtio Cintura/Maluc','Ràtio Plecs/Pes','Notes'
    ];
    const medRows = [medHeader];
    meds.forEach(m => {
      const p = m.plecs || {}, pe = m.perimetres || {};
      const sum = (typeof tobMedSum === 'function') ? tobMedSum(m) : null;
      const ratios = (typeof tobMedRatios === 'function') ? tobMedRatios(m) : {};
      medRows.push([
        m.fecha || '', m.pes ?? '', m.estatura ?? '',
        p.triceps ?? '', p.subescapular ?? '', p.supraespinal ?? '',
        p.abdominal ?? '', p.cuixa ?? '', p.panxell ?? '',
        sum != null ? +sum.toFixed(1) : '',
        pe.mesoesternal ?? '', pe.brac ?? '', pe.cintura ?? '',
        pe.malucs ?? '', pe.cuixa ?? '', pe.panxell ?? '',
        ratios.cinturaCadera != null ? +ratios.cinturaCadera.toFixed(2) : '',
        ratios.plecsPes      != null ? +ratios.plecsPes.toFixed(2)      : '',
        m.notas || ''
      ]);
    });
    const wsMed = XLSX.utils.aoa_to_sheet(medRows);
    wsMed['!cols'] = medHeader.map(h => ({ wch: h.length > 18 ? 18 : Math.max(h.length+2, 12) }));
    XLSX.utils.book_append_sheet(wb, wsMed, 'Mesures');
  }

  // ── HOJA 3: Rutinas (sesiones, una fila por serie) ───────────
  const rutHeader = [
    'Rutina','Inici','Estat','Iteració','Microcicle','Entreno','Data sessió',
    'Exercici','Sèrie / línia','Kg','Reps','Volum (kg×reps)'
  ];
  const rutRows = [rutHeader];
  (cli.asignaciones || []).forEach(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const rutName = (typeof tobRutinaShortName === 'function') ? tobRutinaShortName(pl) : (pl?.nombre || '—');
    (a.iteraciones || []).forEach(it => {
      Object.entries(it.sesiones || {}).forEach(([mn, microSes]) => {
        Object.entries(microSes).forEach(([entId, ses]) => {
          const en = (a.rutina?.entrenos || []).find(e => e.id === entId);
          const entLbl = en ? (en.letra + (en.nombre && en.nombre !== ('Entreno '+en.letra) ? ' — '+en.nombre : '')) : entId;
          (en?.ejercicios || []).forEach(ej => {
            const datos = ses.ejs?.[ej.id];
            if(!datos) return;
            const arr = datos.series || datos.lineas || [];
            arr.forEach((sr, ix) => {
              const kg = sr.kg ?? '';
              const reps = sr.reps ?? '';
              const vol = (sr.kg != null && sr.reps != null) ? +(sr.kg * sr.reps).toFixed(1) : '';
              const lblSerie = ej.tipo === 'circuito'
                ? (ej.circuitoLineas?.[ix] || ('Línia '+(ix+1)))
                : ('Sèrie '+(ix+1));
              rutRows.push([
                rutName, a.fechaInicio || '', a.estado || 'en curs',
                'It. '+(it.numero || 1), Number(mn), entLbl,
                ses.fecha || '', ej.nombre || '', lblSerie, kg, reps, vol
              ]);
            });
          });
        });
      });
    });
  });
  if(rutRows.length > 1){
    const wsRut = XLSX.utils.aoa_to_sheet(rutRows);
    wsRut['!cols'] = [
      {wch:30},{wch:11},{wch:12},{wch:8},{wch:10},{wch:18},{wch:11},
      {wch:28},{wch:18},{wch:8},{wch:8},{wch:14}
    ];
    XLSX.utils.book_append_sheet(wb, wsRut, 'Rutines');
  }

  // ── HOJA 4: PRs (máximo por ejercicio + dónde) ───────────────
  const prMap = {};  // ejNombre → {kg, fecha, rutina}
  (cli.asignaciones || []).forEach(a => {
    const pl = tobDB.plantillas.find(p => p.id === a.plantillaId);
    const rutName = (typeof tobRutinaShortName === 'function') ? tobRutinaShortName(pl) : (pl?.nombre || '—');
    (a.iteraciones || []).forEach(it => {
      Object.values(it.sesiones || {}).forEach(microSes => {
        Object.entries(microSes).forEach(([entId, ses]) => {
          const en = (a.rutina?.entrenos || []).find(e => e.id === entId);
          (en?.ejercicios || []).forEach(ej => {
            if(ej.tipo === 'circuito') return;
            const series = ses.ejs?.[ej.id]?.series || [];
            series.forEach(sr => {
              if(sr.kg == null) return;
              const cur = prMap[ej.nombre];
              if(!cur || sr.kg > cur.kg){
                prMap[ej.nombre] = { kg: sr.kg, fecha: ses.fecha || '', rutina: rutName, it: it.numero || 1 };
              }
            });
          });
        });
      });
    });
  });
  const prKeys = Object.keys(prMap).sort();
  if(prKeys.length){
    const prRows = [['Exercici','Kg PR','Data','Rutina','Iteració']];
    prKeys.forEach(name => {
      const r = prMap[name];
      prRows.push([name, r.kg, r.fecha, r.rutina, 'It. '+r.it]);
    });
    const wsPr = XLSX.utils.aoa_to_sheet(prRows);
    wsPr['!cols'] = [{wch:28},{wch:8},{wch:11},{wch:30},{wch:8}];
    XLSX.utils.book_append_sheet(wb, wsPr, 'PRs');
  }

  const safeName = (cli.nombre || 'client').replace(/[^a-zA-Z0-9_-]/g,'_');
  const dateStr = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `${safeName}_${dateStr}.xlsx`);
  tobToast('✓ Excel descarregat', 'green');
}

// ═════════════════════════════════════════════════════════════════
// MÓDULO MENÚS — Ingredientes (FASE 1: BD + CRUD + importación JSON ICNS)
// ─────────────────────────────────────────────────────────────────
// Storage separado del DB principal: usamos 'tob_menus' en localStorage
// porque la BD de ingredientes puede crecer a varios miles de entradas y
// no queremos saturar el flujo de sync con GitHub.
// Schema:
//   tobMenusDB = { ingredientes: [...], recetas: [...], menus: [], _v: 1 }
// Cada ingrediente:
//   { id:'ing_xxx', nombre, kcal, hc, proteina, grasa, fibra,
//     tags:[...], alergenos:[...], origen:'icns'|'manual', icnsId? }
// ═════════════════════════════════════════════════════════════════

const TOB_MENUS_KEY = 'tob_menus';
let tobMenusDB = { ingredientes: [], recetas: [], menus: [], _v: 1, _syncTs: 0 };
let tobIngEditId = null;       // null=nuevo, string=edit
let tobIngPage = 0;
const TOB_ING_PER_PAGE = 50;

const TOB_MENUS_KV = 'menusDB';   // clave en el store kv de IndexedDB

// Carga tobMenusDB. Primero IndexedDB; si no hay, migra del localStorage
// viejo (donde se guardaba antes y petaba por quota con 500+ recetas).
async function tobMenusLoad(){
  let loaded = null, fromLS = false;
  // 1) IndexedDB — almacenamiento principal
  try { loaded = await tobKvGet(TOB_MENUS_KV); }
  catch(e){ console.warn('[menus] load IndexedDB falló:', e); }
  // 2) Migración: si IndexedDB está vacío, leer el localStorage antiguo
  if(!loaded){
    try {
      const raw = localStorage.getItem(TOB_MENUS_KEY);
      if(raw){ loaded = JSON.parse(raw); fromLS = true; }
    } catch(e){ console.warn('[menus] load localStorage falló:', e); }
  }
  if(loaded && typeof loaded === 'object'){
    tobMenusDB.ingredientes = Array.isArray(loaded.ingredientes) ? loaded.ingredientes : [];
    tobMenusDB.recetas      = Array.isArray(loaded.recetas)      ? loaded.recetas      : [];
    tobMenusDB.menus        = Array.isArray(loaded.menus)        ? loaded.menus        : [];
    tobMenusDB._v           = loaded._v || 1;
    tobMenusDB._syncTs      = loaded._syncTs || 0;
  }
  // Si venía del localStorage viejo: persistir en IndexedDB y liberar el viejo
  if(fromLS && loaded){
    try {
      await tobKvPut(TOB_MENUS_KV, tobMenusDB);
      localStorage.removeItem(TOB_MENUS_KEY);
      console.log('[menus] migrado de localStorage a IndexedDB');
    } catch(e){ console.warn('[menus] migración a IndexedDB falló:', e); }
  }
}

// Guarda tobMenusDB en IndexedDB (localStorage se queda corto con cientos
// de recetas). IndexedDB clona el objeto al llamar a put, así que aunque
// tobMenusDB mute después, se persiste el estado actual.
// Además: marca el catálogo como "sucio" y programa una subida a GitHub
// para que el catálogo se sincronice entre ordenadores.
function tobMenusSave(){
  tobMenusDB._syncTs = Date.now();
  tobKvPut(TOB_MENUS_KV, tobMenusDB).catch(e => {
    console.warn('[menus] save IndexedDB falló:', e);
    // Último recurso: localStorage (puede petar por quota)
    try { localStorage.setItem(TOB_MENUS_KEY, JSON.stringify(tobMenusDB)); }
    catch(e2){ tobToast('Error guardant la base de receptes', 'red'); }
  });
  if(typeof tobMenusSyncSchedule === 'function') tobMenusSyncSchedule();
}

// ═════════════════════════════════════════════════════════════════
// SINCRONIZACIÓN CROSS-DEVICE del catálogo de recetas/ingredientes
// ─────────────────────────────────────────────────────────────────
// El catálogo (ingredientes + recetas + menús) vive en IndexedDB en
// local (rápido, sin límite de quota) y ADEMÁS se sube a GitHub como
// una sección del data.json llamada 'tob_menus_catalog'. Así, al abrir
// la app en otro ordenador logueado con el mismo token, el catálogo se
// descarga solo.
//
// Las FOTOS subidas manualmente NO se sincronizan (viven en IndexedDB,
// son demasiado pesadas para el data.json). Las fotos de recetas ICNS
// son URLs y funcionan en cualquier dispositivo sin sincronizar nada.
//
// Merge: unión por id. Nunca se borran recetas (si una existe en un
// dispositivo y no en otro, se conserva). Si se editó el mismo id en
// los dos sitios, gana la versión del catálogo con _syncTs más reciente.
// ═════════════════════════════════════════════════════════════════
const TOB_MENUS_SYNC_SECTION = 'tob_menus_catalog';
const TOB_MENUS_SYNC_DIRTY   = 'tob_menus_sync_dirty';
let _tobMenusSyncTimer = null;
let _tobMenusSyncBusy  = false;

function tobMenusSyncStatus(msg, kind){
  const el = document.getElementById('tobMenusSyncStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.style.color = kind === 'error' ? '#f87171'
                 : kind === 'ok'    ? '#4ade80'
                 : kind === 'work'  ? '#fbbf24' : 'var(--mute)';
}

function tobMenusSyncLoggedIn(){
  return !!(window.GitHubSync && GitHubSync.isLoggedIn && GitHubSync.isLoggedIn());
}

// Fusión unión-por-id entre catálogo local y remoto.
function tobMenusSyncMerge(local, remote){
  if(!remote || typeof remote !== 'object') return local;
  const remoteNewer = (remote._syncTs || 0) > (local._syncTs || 0);
  function mergeArr(la, ra){
    la = Array.isArray(la) ? la : [];
    ra = Array.isArray(ra) ? ra : [];
    const map = new Map();
    const older = remoteNewer ? la : ra;   // se vuelca primero
    const newer = remoteNewer ? ra : la;   // sobreescribe en conflicto
    older.forEach(x => { if(x && x.id) map.set(x.id, x); });
    newer.forEach(x => { if(x && x.id) map.set(x.id, x); });
    return [...map.values()];
  }
  return {
    ingredientes: mergeArr(local.ingredientes, remote.ingredientes),
    recetas:      mergeArr(local.recetas,      remote.recetas),
    menus:        mergeArr(local.menus,        remote.menus),
    _v:      Math.max(local._v || 1, remote._v || 1),
    _syncTs: Math.max(local._syncTs || 0, remote._syncTs || 0),
  };
}

// Descarga el catálogo remoto y lo fusiona con el local.
async function tobMenusSyncPull(opts){
  opts = opts || {};
  if(!tobMenusSyncLoggedIn()){
    if(opts.manual) tobToast('No has iniciado sesión con GitHub', 'red');
    return false;
  }
  if(_tobMenusSyncBusy) return false;
  _tobMenusSyncBusy = true;
  tobMenusSyncStatus('descargando…', 'work');
  try {
    const remote = await GitHubSync.fetchSection(TOB_MENUS_SYNC_SECTION);
    if(!remote){
      tobMenusSyncStatus('sin catálogo en la nube todavía', '');
      // Subir el local para inicializar la nube
      if((tobMenusDB.recetas || []).length || (tobMenusDB.ingredientes || []).length){
        _tobMenusSyncBusy = false;
        return tobMenusSyncPush(opts);
      }
      return false;
    }
    const beforeR = (tobMenusDB.recetas || []).length;
    const beforeI = (tobMenusDB.ingredientes || []).length;
    const merged = tobMenusSyncMerge(tobMenusDB, remote);
    tobMenusDB.ingredientes = merged.ingredientes;
    tobMenusDB.recetas      = merged.recetas;
    tobMenusDB.menus        = merged.menus;
    tobMenusDB._v           = merged._v;
    tobMenusDB._syncTs      = merged._syncTs;
    await tobKvPut(TOB_MENUS_KV, tobMenusDB);
    const afterR = (tobMenusDB.recetas || []).length;
    const afterI = (tobMenusDB.ingredientes || []).length;
    tobMenusSyncStatus('✓ sincronizado ' + new Date().toLocaleTimeString('es-ES'), 'ok');
    try {
      if(typeof tobIngRender === 'function') tobIngRender();
      if(typeof tobRecRender === 'function') tobRecRender();
    } catch(e){}
    // Si el local tenía recetas/ingredientes que no estaban en la nube,
    // o quedaban cambios sin subir, programamos una subida.
    const localTeniaExtras = (merged.recetas.length > (remote.recetas || []).length) ||
                             (merged.ingredientes.length > (remote.ingredientes || []).length);
    if(localTeniaExtras || localStorage.getItem(TOB_MENUS_SYNC_DIRTY) === '1'){
      _tobMenusSyncBusy = false;
      tobMenusSyncSchedule(8000);
    }
    if(opts.manual){
      const nuevasR = afterR - beforeR, nuevasI = afterI - beforeI;
      const extra = (nuevasR > 0 ? ' (+' + nuevasR + ' recetas' + (nuevasI > 0 ? ', +' + nuevasI + ' ingr.' : '') + ')'
                   : nuevasI > 0 ? ' (+' + nuevasI + ' ingredientes)' : '');
      tobToast('✓ Catálogo descargado' + extra, 'green');
    }
    return true;
  } catch(e){
    console.warn('[menus sync] pull:', e);
    tobMenusSyncStatus('⚠ error al sincronizar', 'error');
    if(opts.manual) tobToast('Error al sincronizar: ' + (e.message || e), 'red');
    return false;
  } finally {
    _tobMenusSyncBusy = false;
  }
}

// Sube el catálogo local a GitHub (fusionado con el remoto).
async function tobMenusSyncPush(opts){
  opts = opts || {};
  if(!tobMenusSyncLoggedIn()){
    if(opts.manual) tobToast('No has iniciado sesión con GitHub', 'red');
    return false;
  }
  if(_tobMenusSyncBusy){ tobMenusSyncSchedule(8000); return false; }
  _tobMenusSyncBusy = true;
  tobMenusSyncStatus('subiendo a GitHub…', 'work');
  try {
    await GitHubSync.updateSection(TOB_MENUS_SYNC_SECTION, (remote) => {
      // Fusionamos con lo que haya en la nube para no pisar otro dispositivo.
      const merged = tobMenusSyncMerge(tobMenusDB, remote);
      tobMenusDB.ingredientes = merged.ingredientes;
      tobMenusDB.recetas      = merged.recetas;
      tobMenusDB.menus        = merged.menus;
      tobMenusDB._v           = merged._v;
      merged._syncTs = Date.now();
      tobMenusDB._syncTs = merged._syncTs;
      return merged;
    });
    await tobKvPut(TOB_MENUS_KV, tobMenusDB).catch(() => {});
    localStorage.removeItem(TOB_MENUS_SYNC_DIRTY);
    tobMenusSyncStatus('✓ guardado ' + new Date().toLocaleTimeString('es-ES'), 'ok');
    if(opts.manual) tobToast('✓ Catálogo subido a la nube', 'green');
    return true;
  } catch(e){
    console.warn('[menus sync] push:', e);
    tobMenusSyncStatus('⚠ error al subir — reintentaré', 'error');
    if(opts.manual) tobToast('Error al subir: ' + (e.message || e), 'red');
    _tobMenusSyncBusy = false;
    tobMenusSyncSchedule(20000);
    return false;
  } finally {
    _tobMenusSyncBusy = false;
  }
}

// Push diferido (debounced) — se llama tras cada cambio local.
function tobMenusSyncSchedule(delay){
  if(!tobMenusSyncLoggedIn()) return;
  try { localStorage.setItem(TOB_MENUS_SYNC_DIRTY, '1'); } catch(e){}
  clearTimeout(_tobMenusSyncTimer);
  _tobMenusSyncTimer = setTimeout(() => { tobMenusSyncPush(); }, delay || 6000);
  tobMenusSyncStatus('● cambios pendientes…', 'work');
}

// Botón manual: baja lo de la nube, fusiona y vuelve a subir el resultado.
function tobMenusSyncNow(){
  if(!tobMenusSyncLoggedIn()){
    tobToast('Inicia sesión con GitHub desde el inicio para sincronizar', 'red');
    return;
  }
  tobMenusSyncPull({ manual: true }).finally(() => {
    tobMenusSyncPush({ manual: true });
  });
}

// ═════════════════════════════════════════════════════════════════
// IndexedDB para FOTOS de recetas
// ─────────────────────────────────────────────────────────────────
// localStorage tiene ~5 MB de límite — 550 fotos thumbnail (~20 KB c/u)
// son ~11 MB y NO caben. IndexedDB sí soporta cientos de MB.
// Las fotos se guardan aquí con clave = recetaId. El objeto receta en
// localStorage solo lleva `_fotoLocal: true` como flag; la imagen real
// vive en IndexedDB. Display: si _fotoLocal → carga de IndexedDB; si no,
// usa rec.foto (URL de ICNS o data URL de subida manual).
// ═════════════════════════════════════════════════════════════════
const TOB_IMGDB_NAME = 'tob_recetas_imgdb';
const TOB_IMGDB_STORE = 'fotos';
const TOB_KV_STORE = 'kv';   // clave/valor: aquí vive tobMenusDB completo
let _tobImgDBPromise = null;

function tobImgDB(){
  if(_tobImgDBPromise) return _tobImgDBPromise;
  _tobImgDBPromise = new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error('IndexedDB no disponible')); return; }
    let settled = false;
    const ok   = (v) => { if(!settled){ settled = true; resolve(v); } };
    const fail = (e) => { if(!settled){ settled = true; reject(e); } };
    // Salvaguarda: si IndexedDB se cuelga (bloqueada por otra pestaña, etc.)
    // no dejamos la app esperando para siempre.
    const to = setTimeout(() => fail(new Error('IndexedDB timeout')), 4000);
    const req = indexedDB.open(TOB_IMGDB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(TOB_IMGDB_STORE)) db.createObjectStore(TOB_IMGDB_STORE);
      if(!db.objectStoreNames.contains(TOB_KV_STORE))    db.createObjectStore(TOB_KV_STORE);
    };
    req.onsuccess = () => { clearTimeout(to); ok(req.result); };
    req.onerror   = () => { clearTimeout(to); fail(req.error); };
    req.onblocked = () => { clearTimeout(to); fail(new Error('IndexedDB bloqueada')); };
  });
  // Si la apertura falla, permitir reintento en la siguiente llamada.
  _tobImgDBPromise.catch(() => { _tobImgDBPromise = null; });
  return _tobImgDBPromise;
}

// Key/value en IndexedDB — para datos grandes que no caben en localStorage.
async function tobKvPut(key, value){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_KV_STORE, 'readwrite');
    tx.objectStore(TOB_KV_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
async function tobKvGet(key){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_KV_STORE, 'readonly');
    const req = tx.objectStore(TOB_KV_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function tobImgPut(key, dataUrl){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_IMGDB_STORE, 'readwrite');
    tx.objectStore(TOB_IMGDB_STORE).put(dataUrl, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function tobImgGet(key){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_IMGDB_STORE, 'readonly');
    const req = tx.objectStore(TOB_IMGDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

async function tobImgDelete(key){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_IMGDB_STORE, 'readwrite');
    tx.objectStore(TOB_IMGDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function tobImgKeys(){
  const db = await tobImgDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TOB_IMGDB_STORE, 'readonly');
    const req = tx.objectStore(TOB_IMGDB_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

// Resuelve la foto de una receta: prioriza IndexedDB (_fotoLocal),
// fallback a rec.foto (URL ICNS o data URL manual). Devuelve Promise<string>.
async function tobRecFotoResolve(rec){
  if(!rec) return '';
  if(rec._fotoLocal){
    try {
      const d = await tobImgGet(rec.id);
      if(d) return d;
    } catch(e){ /* fallthrough */ }
  }
  return rec.foto || '';
}

// Hidrata las fotos de un contenedor: busca elementos con [data-foto-rec]
// y les pone la imagen (background-image) de forma asíncrona desde
// IndexedDB o la URL. Llamar después de renderizar tarjetas/paneles.
async function tobHydrateFotos(rootSelector){
  const root = document.querySelector(rootSelector);
  if(!root) return;
  const els = root.querySelectorAll('[data-foto-rec]');
  for(const el of els){
    const recId = el.dataset.fotoRec;
    const rec = (tobMenusDB.recetas||[]).find(r => r.id === recId);
    if(!rec) continue;
    const src = await tobRecFotoResolve(rec);
    if(src){
      el.style.backgroundImage = `url('${src.replace(/'/g,"\\'")}')`;
      el.classList.remove('placeholder');
      el.textContent = '';
    }
  }
}

// Sub-tabs del módulo Menús
function tobMenuShowTab(name, btn){
  document.querySelectorAll('.tob-mtab-page').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tob-sub-tab').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('tob-mtab-' + name);
  if(page) page.style.display = '';
  if(btn) btn.classList.add('active');
  if(name === 'ingredientes') tobIngRender();
  if(name === 'menus' && typeof tobMenusGuardadosRender === 'function') tobMenusGuardadosRender();
}

// ── Recolección de etiquetas únicas (para el filtro) ─────────────
function tobIngAllTags(){
  const s = new Set();
  tobMenusDB.ingredientes.forEach(i => (i.tags||[]).forEach(t => s.add(t)));
  return [...s].sort();
}

function tobIngFillTagFilter(){
  const sel = document.getElementById('tobIngFilterTag');
  if(!sel) return;
  const cur = sel.value;
  const tags = tobIngAllTags();
  sel.innerHTML = '<option value="">— Todas las etiquetas —</option>' +
    tags.map(t => `<option value="${tobEsc(t)}">${tobEsc(t)}</option>`).join('');
  if(tags.includes(cur)) sel.value = cur;
}

// ── Render ingredientes (con búsqueda + filtro + paginación) ─────
function tobIngRender(){
  tobIngFillTagFilter();
  const search = (document.getElementById('tobIngSearch')?.value || '').trim().toLowerCase();
  const tag = document.getElementById('tobIngFilterTag')?.value || '';
  let list = tobMenusDB.ingredientes.slice();
  if(search) list = list.filter(i => (i.nombre||'').toLowerCase().includes(search));
  if(tag)    list = list.filter(i => (i.tags||[]).includes(tag));
  list.sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));

  const total = list.length;
  const cntEl = document.getElementById('tobIngCount');
  if(cntEl){
    const all = tobMenusDB.ingredientes.length;
    cntEl.textContent = total === all ? `${all} ingredientes` : `${total} de ${all}`;
  }

  const emptyEl = document.getElementById('tobIngEmpty');
  const tableEl = document.getElementById('tobIngTable');
  const pagerEl = document.getElementById('tobIngPager');

  if(!total){
    if(emptyEl) emptyEl.style.display = '';
    if(tableEl) tableEl.style.display = 'none';
    if(pagerEl) pagerEl.innerHTML = '';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';
  if(tableEl) tableEl.style.display = '';

  // Paginación
  const pages = Math.max(1, Math.ceil(total / TOB_ING_PER_PAGE));
  if(tobIngPage >= pages) tobIngPage = pages - 1;
  if(tobIngPage < 0) tobIngPage = 0;
  const start = tobIngPage * TOB_ING_PER_PAGE;
  const slice = list.slice(start, start + TOB_ING_PER_PAGE);

  const body = document.getElementById('tobIngBody');
  if(body){
    body.innerHTML = slice.map(i => {
      const tagsTxt = (i.tags||[]).slice(0,3).map(t => `<span style="background:var(--card2);padding:1px 6px;border-radius:3px;font-size:.65rem;margin-right:3px;">${tobEsc(t)}</span>`).join('');
      const moreTags = (i.tags||[]).length > 3 ? `<span style="font-size:.65rem;color:var(--mute2);">+${i.tags.length-3}</span>` : '';
      return `<tr>
        <td><strong>${tobEsc(i.nombre || '—')}</strong></td>
        <td class="num">${i.kcal != null ? (+i.kcal).toFixed(1) : '—'}</td>
        <td class="num">${i.hc != null ? (+i.hc).toFixed(1) : '—'}</td>
        <td class="num">${i.proteina != null ? (+i.proteina).toFixed(1) : '—'}</td>
        <td class="num">${i.grasa != null ? (+i.grasa).toFixed(1) : '—'}</td>
        <td class="num">${i.fibra != null ? (+i.fibra).toFixed(1) : '—'}</td>
        <td>${tagsTxt}${moreTags}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="tob-action ghost btn-xs" onclick="tobIngEdit('${i.id}')" title="Editar">✏️</button>
        </td>
      </tr>`;
    }).join('');
  }

  if(pagerEl){
    if(pages <= 1){
      pagerEl.innerHTML = '';
    } else {
      pagerEl.innerHTML = `
        <button class="tob-action ghost btn-xs" ${tobIngPage===0?'disabled':''} onclick="tobIngSetPage(${tobIngPage-1})">← Anterior</button>
        <span>página ${tobIngPage+1} / ${pages}</span>
        <button class="tob-action ghost btn-xs" ${tobIngPage>=pages-1?'disabled':''} onclick="tobIngSetPage(${tobIngPage+1})">Siguiente →</button>
      `;
    }
  }
}

function tobIngSetPage(p){ tobIngPage = p; tobIngRender(); }

// ── CRUD: modal de ingrediente ──────────────────────────────────
// Estat local del modal d'ingrediente: moments seleccionats per a la IA.
let _tobIngModalMomentos = new Set();

// Render chips d'àpats al modal d'ingrediente. Igual UI que recetas — clic per togglear.
function _tobIngRenderMomentosChips(){
  const wrap = document.getElementById('tobIngMomentosChips');
  if(!wrap) return;
  wrap.innerHTML = TOB_REC_MOMENTOS.map(m => {
    const on = _tobIngModalMomentos.has(m.id);
    return `<button type="button" class="tob-quest-chip${on?' active':''}" data-mom="${m.id}" onclick="tobIngToggleMomento('${m.id}',this)">${tobEsc(m.label)}</button>`;
  }).join('');
}
function tobIngToggleMomento(id, btn){
  if(_tobIngModalMomentos.has(id)){ _tobIngModalMomentos.delete(id); btn.classList.remove('active'); }
  else { _tobIngModalMomentos.add(id); btn.classList.add('active'); }
}

function tobIngOpenModal(){
  tobIngEditId = null;
  document.getElementById('tobIngModalTitle').textContent = 'Nuevo ingrediente';
  document.getElementById('tobIngNombre').value = '';
  document.getElementById('tobIngKcal').value   = '';
  document.getElementById('tobIngHc').value     = '';
  document.getElementById('tobIngProt').value   = '';
  document.getElementById('tobIngGras').value   = '';
  document.getElementById('tobIngFibra').value  = '';
  document.getElementById('tobIngTags').value   = '';
  document.getElementById('tobIngAlergenos').value = '';
  document.getElementById('tobIngComoPlato').checked = false;
  document.getElementById('tobIngPlatoGramos').value = '';
  _tobIngModalMomentos = new Set();
  _tobIngRenderMomentosChips();
  tobIngComoPlatoChange();
  document.getElementById('tobIngDelBtn').style.display = 'none';
  document.getElementById('tobIngModalBg').classList.add('on');
}

function tobIngCloseModal(){ document.getElementById('tobIngModalBg').classList.remove('on'); }

// Muestra/oculta el campo de gramos de la ración según el checkbox.
function tobIngComoPlatoChange(){
  const on = document.getElementById('tobIngComoPlato').checked;
  document.getElementById('tobIngPlatoGramosWrap').style.display = on ? '' : 'none';
}

function tobIngEdit(id){
  const ing = tobMenusDB.ingredientes.find(i => i.id === id);
  if(!ing){ tobToast('Ingrediente no encontrado', 'red'); return; }
  tobIngEditId = id;
  document.getElementById('tobIngModalTitle').textContent = 'Editar ingrediente';
  document.getElementById('tobIngNombre').value = ing.nombre || '';
  document.getElementById('tobIngKcal').value   = ing.kcal != null ? ing.kcal : '';
  document.getElementById('tobIngHc').value     = ing.hc != null ? ing.hc : '';
  document.getElementById('tobIngProt').value   = ing.proteina != null ? ing.proteina : '';
  document.getElementById('tobIngGras').value   = ing.grasa != null ? ing.grasa : '';
  document.getElementById('tobIngFibra').value  = ing.fibra != null ? ing.fibra : '';
  document.getElementById('tobIngTags').value   = (ing.tags || []).join(', ');
  document.getElementById('tobIngAlergenos').value = (ing.alergenos || []).join(', ');
  document.getElementById('tobIngComoPlato').checked = !!ing.comoPlato;
  document.getElementById('tobIngPlatoGramos').value = ing.platoGramos != null ? ing.platoGramos : '';
  // Carregar momentos. Compat: si tenia el legacy "iaSnack=true" sense iaMomentos,
  // assumir [mig_mati, berenar] que era el comportament antic.
  if(Array.isArray(ing.iaMomentos) && ing.iaMomentos.length){
    _tobIngModalMomentos = new Set(ing.iaMomentos);
  } else if(ing.iaSnack){
    _tobIngModalMomentos = new Set(['mig_mati','berenar']);
  } else {
    _tobIngModalMomentos = new Set();
  }
  _tobIngRenderMomentosChips();
  tobIngComoPlatoChange();
  document.getElementById('tobIngDelBtn').style.display = '';
  document.getElementById('tobIngModalBg').classList.add('on');
}

// Sincroniza la "receta-ingrediente" (plato suelto) ligada a un ingrediente.
// Si comoPlato → crea/actualiza una receta de 1 ingrediente; si no → la borra.
function tobIngSyncPlato(ing){
  if(!tobMenusDB.recetas) tobMenusDB.recetas = [];
  const recId = 'recing_' + ing.id;
  const ix = tobMenusDB.recetas.findIndex(r => r.id === recId);
  if(ing.comoPlato){
    const g = Math.max(1, +ing.platoGramos || 150);
    // Sincronitzar moments del plat-ingredient amb els del propi ingredient:
    // així el catàleg de la IA per cada àpat ja porta aquests "platos sueltos"
    // amb la classificació de moments correcta (com qualsevol altra recepta).
    const moms = Array.isArray(ing.iaMomentos) ? ing.iaMomentos.slice() : [];
    const data = {
      id: recId, origen: 'ingrediente', _ingPlato: ing.id,
      _iaSnack: moms.length > 0,           // legacy flag, ara derivat
      _iaMomentos: moms,                    // nova forma — array de moments base
      nombre: ing.nombre,
      raciones: 1,
      ingredientes: [{ ingId: ing.id, gramos: g }],
      momentos: moms,                       // tracta'l com una recepta amb moments classificats
      tags: [], instrucciones: '', comentarios: '',
      tiempoTotal: '', tiempoElaboracion: '', autor: '',
      alergenos: Array.isArray(ing.alergenos) ? ing.alergenos.slice() : [],
      favorito: false
    };
    if(ix >= 0) Object.assign(tobMenusDB.recetas[ix], data);
    else tobMenusDB.recetas.push(data);
  } else if(ix >= 0){
    tobMenusDB.recetas.splice(ix, 1);
  }
}

function tobIngSave(){
  const nombre = document.getElementById('tobIngNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const parseN = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const parseList = v => (v||'').split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  const comoPlato = document.getElementById('tobIngComoPlato').checked;
  // Moments on la IA pot usar aquest ingredient com a plat suelto.
  // Si l'usuari no en marca cap, l'ingredient existeix però la IA no l'usa.
  const iaMomentos = comoPlato ? Array.from(_tobIngModalMomentos) : [];
  const data = {
    nombre,
    kcal:     parseN(document.getElementById('tobIngKcal').value),
    hc:       parseN(document.getElementById('tobIngHc').value),
    proteina: parseN(document.getElementById('tobIngProt').value),
    grasa:    parseN(document.getElementById('tobIngGras').value),
    fibra:    parseN(document.getElementById('tobIngFibra').value),
    tags:     parseList(document.getElementById('tobIngTags').value),
    alergenos:parseList(document.getElementById('tobIngAlergenos').value),
    comoPlato,
    platoGramos: comoPlato ? Math.max(1, parseN(document.getElementById('tobIngPlatoGramos').value) || 150) : null,
    iaMomentos,                            // nova forma: array de moments base
    iaSnack:  comoPlato && iaMomentos.length > 0   // legacy: true si té algun moment
  };

  let ingObj;
  if(tobIngEditId){
    ingObj = tobMenusDB.ingredientes.find(i => i.id === tobIngEditId);
    if(ingObj) Object.assign(ingObj, data);
  } else {
    data.id = tobUid('ing');
    data.origen = 'manual';
    tobMenusDB.ingredientes.push(data);
    ingObj = data;
  }
  if(ingObj) tobIngSyncPlato(ingObj);   // crea/actualiza/borra el plato suelto
  tobMenusSave();
  tobIngCloseModal();
  tobIngRender();
  tobToast('✓ Ingrediente guardado', 'green');
}

function tobIngDeleteFromModal(){
  if(!tobIngEditId) return;
  const ing = tobMenusDB.ingredientes.find(i => i.id === tobIngEditId);
  if(!ing) return;
  if(!confirm(`Eliminar "${ing.nombre}"?`)) return;
  tobMenusDB.ingredientes = tobMenusDB.ingredientes.filter(i => i.id !== tobIngEditId);
  // Borrar también el plato suelto ligado, si existía
  if(tobMenusDB.recetas){
    tobMenusDB.recetas = tobMenusDB.recetas.filter(r => r.id !== 'recing_' + tobIngEditId);
  }
  tobMenusSave();
  tobIngCloseModal();
  tobIngRender();
  tobToast('Ingrediente eliminado', '');
}

// ── Importación JSON ICNS (multi-archivo) ───────────────────────
// Formato ICNS por entrada: { id, nombre, kcal, hc, proteina, grasa }
// (todos como strings). Convertimos a número y marcamos origen:'icns' +
// icnsId para detectar duplicados al re-importar.
async function tobIngImportFiles(ev){
  const files = Array.from(ev.target.files || []);
  if(!files.length) return;
  tobToast(`Importando ${files.length} archivo(s)...`, '');
  let added = 0, updated = 0, skipped = 0;

  for(const file of files){
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed
                  : Array.isArray(parsed.ingredientes) ? parsed.ingredientes
                  : Array.isArray(parsed.data) ? parsed.data
                  : null;
      if(!items){ console.warn('[ing-import]', file.name, 'no es array'); skipped++; continue; }

      items.forEach(raw => {
        if(!raw || !raw.nombre){ skipped++; return; }
        const icnsId = raw.id != null ? String(raw.id) : null;
        const parseN = v => {
          if(v == null || v === '') return null;
          const n = parseFloat(v); return Number.isFinite(n) ? n : null;
        };
        const data = {
          nombre:   String(raw.nombre).trim(),
          kcal:     parseN(raw.kcal),
          hc:       parseN(raw.hc),
          proteina: parseN(raw.proteina),
          grasa:    parseN(raw.grasa),
          fibra:    parseN(raw.fibra),
          tags:     Array.isArray(raw.tags) ? raw.tags : [],
          alergenos:Array.isArray(raw.alergenos) ? raw.alergenos : []
        };

        // Detección de duplicado: por icnsId si existe, sino por nombre exacto
        let exist = null;
        if(icnsId) exist = tobMenusDB.ingredientes.find(i => i.icnsId === icnsId);
        if(!exist) exist = tobMenusDB.ingredientes.find(i =>
          (i.nombre||'').toLowerCase() === data.nombre.toLowerCase()
        );
        if(exist){
          Object.assign(exist, data, { icnsId: icnsId || exist.icnsId });
          updated++;
        } else {
          tobMenusDB.ingredientes.push({
            id: tobUid('ing'), origen: 'icns', icnsId, ...data
          });
          added++;
        }
      });
    } catch(e){
      console.warn('[ing-import]', file.name, e);
      skipped++;
    }
  }

  tobMenusSave();
  tobIngRender();
  // Limpiar el input para permitir re-seleccionar los mismos archivos
  ev.target.value = '';
  tobToast(`✓ Importación: ${added} nuevos · ${updated} actualizados${skipped?' · '+skipped+' saltados':''}`, 'green');
}

// ── Exportación JSON ────────────────────────────────────────────
function tobIngExportJson(){
  if(!tobMenusDB.ingredientes.length){ tobToast('No hay ingredientes que exportar', 'red'); return; }
  const blob = new Blob([JSON.stringify(tobMenusDB.ingredientes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ingredientes_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  tobToast(`✓ ${tobMenusDB.ingredientes.length} ingredientes exportados`, 'green');
}

// Cerrar modal de ingrediente clicando fuera
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('tobIngModalBg');
  if(bg){
    bg.addEventListener('click', e => { if(e.target === bg) tobIngCloseModal(); });
  }
});

// ═════════════════════════════════════════════════════════════════
// MÓDULO MENÚS — Recetas (CRUD + import/export + macros tiempo real)
// ─────────────────────────────────────────────────────────────────
// Cada receta:
//   { id:'rec_xxx', nombre, foto:dataURL|url|'', momentos:['esmorzar',...],
//     tiempoTotal, tiempoElaboracion, raciones,
//     ingredientes:[{ ingId, gramos, _nombreFallback }],   // ingId enlaza con tobMenusDB.ingredientes
//     instrucciones, comentarios, autor, tags:[...],
//     origen:'manual'|'icns'|'scraper', icnsId?, _icnsMacros? }
//
// Macros TOTALES se calculan al vuelo desde ingredientes + BD. Si una
// receta importada (formato simple ICNS) NO tiene ingredientes pero sí
// _icnsMacros = {kcal, hc, proteina, grasa}, se muestran esos directamente.
// ═════════════════════════════════════════════════════════════════

let tobRecEditId = null;
// Flag: ¿se tocó la foto en el modal? (subir nueva o quitar). Solo si es
// true, tobRecSave reescribe la foto en IndexedDB. Evita borrar la foto
// de una receta _fotoLocal que se edita sin tocar la imagen.
let _tobRecFotoChanged = false;
let _tobRecModalFav = false; // estado del botón ★ del modal de receta
let tobRecPage = 0;
let tobRecOnlyFav = false;     // filtro "solo favoritas"
let tobRecAptCeliac = false;   // filtro "apte celíac" (sense gluten)
let tobRecAptLactosa = false;  // filtro "apte sense lactosa"
const TOB_REC_PER_PAGE = 24;
const TOB_REC_MOMENTOS = [
  { id:'esmorzar', label:'Esmorzar' },
  { id:'mig_mati', label:'Mig matí' },
  { id:'dinar',    label:'Dinar' },
  { id:'berenar',  label:'Berenar' },
  { id:'sopar',    label:'Sopar' }
];
const TOB_REC_MOMENTO_LBL = { esmorzar:'Esmorzar', mig_mati:'Mig matí', dinar:'Dinar', berenar:'Berenar', sopar:'Sopar' };

// Rol del plato: ayuda a la IA a montar comidas con sentido (un principal
// + acompañamiento + postre; nunca un acompañamiento solo).
const TOB_REC_ROLES = [
  { id:'principal',     label:'Principal' },
  { id:'acompanyament', label:'Acompanyament' },
  { id:'postre',        label:'Postre' },
  { id:'basic',         label:'Bàsic / esmorzar' }
];
const TOB_REC_ROL_LBL = { principal:'Principal', acompanyament:'Acompanyament', postre:'Postre', basic:'Bàsic' };

// ── Render lista de recetas ─────────────────────────────────────
function tobRecAllTags(){
  const s = new Set();
  (tobMenusDB.recetas||[]).forEach(r => (r.tags||[]).forEach(t => s.add(t)));
  return [...s].sort();
}

function tobRecFillTagFilter(){
  const sel = document.getElementById('tobRecFilterTag');
  if(!sel) return;
  const cur = sel.value;
  const tags = tobRecAllTags();
  sel.innerHTML = '<option value="">— Todas las etiquetas —</option>' +
    tags.map(t => `<option value="${tobEsc(t)}">${tobEsc(t)}</option>`).join('');
  if(tags.includes(cur)) sel.value = cur;
}

// Calcula macros totales de una receta. Devuelve {kcal,hc,proteina,grasa,
// fibra} en valores absolutos (toda la receta, NO por ración).
//   1) Si la receta tiene _icnsMacros (importada de ICNS) se usan esos —
//      son el cálculo oficial y autoritativo de la plataforma.
//   2) Si no, se suman los ingredientes × gramos/100 (recetas manuales),
//      lo que permite el recálculo en vivo al editar gramos en el modal.
function tobRecMacros(rec){
  if(rec._icnsMacros){
    const m = rec._icnsMacros;
    let kcal = +m.kcal || 0;
    const hc = +m.hc || 0, prot = +m.proteina || 0, gras = +m.grasa || 0;
    // Reparación: el scraper viejo parseaba mal números de más de 3 cifras
    // por el separador de miles europeo ("1.234,5" → 1.234). Si las kcal
    // son absurdamente bajas frente a los macros, se recalculan con la
    // fórmula de Atwater (HC 4 · proteína 4 · grasa 9).
    const atwater = hc*4 + prot*4 + gras*9;
    if(atwater > 120 && kcal < atwater * 0.55) kcal = Math.round(atwater);
    return { kcal, hc, proteina: prot, grasa: gras, fibra: +m.fibra || 0 };
  }
  let kcal=0, hc=0, prot=0, gras=0, fib=0;
  (rec.ingredientes||[]).forEach(it => {
    const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
    if(!ing) return;
    const f = (+it.gramos || 0) / 100;
    kcal += (+ing.kcal     || 0) * f;
    hc   += (+ing.hc       || 0) * f;
    prot += (+ing.proteina || 0) * f;
    gras += (+ing.grasa    || 0) * f;
    fib  += (+ing.fibra    || 0) * f;
  });
  return { kcal, hc, proteina: prot, grasa: gras, fibra: fib };
}

// Aptitud de una receta derivada de sus alérgenos ICNS. Devuelve qué
// alérgenos CONTIENE — true = la receta NO es apta para quien lo evita.
function tobRecAptitud(rec){
  const al = (rec && Array.isArray(rec.alergenos) ? rec.alergenos : []).join(' · ').toLowerCase();
  return {
    gluten:     /gluten/.test(al),
    lactosa:    /llet|leche|l[aà]ct/.test(al),
    ou:         /\bou\b|\bous\b|huevo|egg/.test(al),
    fruitsSecs: /fruit[a-z]*\s*sec|fruto[a-z]*\s*seco|cacauet|cacahuet|\bnut/.test(al),
    marisc:     /marisc|crustaci|crust[aá]ce|mol·?lusc|molusc/.test(al),
    soja:       /soja|soia/.test(al)
  };
}

function tobRecRender(){
  tobRecFillTagFilter();
  const search    = (document.getElementById('tobRecSearch')?.value || '').trim().toLowerCase();
  const momento   = document.getElementById('tobRecFilterMomento')?.value || '';
  const tag       = document.getElementById('tobRecFilterTag')?.value || '';

  // Las "recetas-ingrediente" (platos sueltos) no se muestran aquí: se
  // gestionan desde la pestaña Ingredientes.
  let list = (tobMenusDB.recetas||[]).filter(r => r.origen !== 'ingrediente');
  // Las descartadas van al final, atenuadas.
  if(search){
    list = list.filter(r => {
      const haystack = [r.nombre, ...(r.tags||[]),
        ...(r.ingredientes||[]).map(it => {
          const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
          return ing ? ing.nombre : '';
        })].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }
  if(momento) list = list.filter(r => (r.momentos||[]).includes(momento));
  if(tag)     list = list.filter(r => (r.tags||[]).includes(tag));
  if(tobRecOnlyFav) list = list.filter(r => r.favorito);
  if(tobRecAptCeliac)  list = list.filter(r => !tobRecAptitud(r).gluten);
  if(tobRecAptLactosa) list = list.filter(r => !tobRecAptitud(r).lactosa);
  // Favoritas primero, descartadas al final, resto alfabético.
  list.sort((a,b) => {
    if(!!a.descartada !== !!b.descartada) return a.descartada ? 1 : -1;
    if(!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1;
    return (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'});
  });

  const total = list.length;
  const cntEl = document.getElementById('tobRecCount');
  if(cntEl){
    const all = (tobMenusDB.recetas||[]).filter(r => r.origen !== 'ingrediente').length;
    cntEl.textContent = total === all ? `${all} recetas` : `${total} de ${all}`;
  }

  const emptyEl = document.getElementById('tobRecEmpty');
  const gridEl  = document.getElementById('tobRecGrid');
  const pagerEl = document.getElementById('tobRecPager');

  if(!total){
    if(emptyEl) emptyEl.style.display = '';
    if(gridEl)  gridEl.innerHTML = '';
    if(pagerEl) pagerEl.innerHTML = '';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  const pages = Math.max(1, Math.ceil(total / TOB_REC_PER_PAGE));
  if(tobRecPage >= pages) tobRecPage = pages - 1;
  if(tobRecPage < 0) tobRecPage = 0;
  const start = tobRecPage * TOB_REC_PER_PAGE;
  const slice = list.slice(start, start + TOB_REC_PER_PAGE);

  gridEl.innerHTML = slice.map(r => {
    const m = tobRecMacros(r);
    const rac = r.raciones || 1;
    const kcalPer = m.kcal / rac;
    const tagsHtml = (r.tags||[]).slice(0,3).map(t => `<span class="tag">${tobEsc(t)}</span>`).join('');
    const momHtml = (r.momentos||[]).map(mm => TOB_REC_MOMENTO_LBL[mm] || mm).join(' · ');
    const apt = tobRecAptitud(r);
    const warnHtml = [
      apt.gluten  ? '<span class="tob-rec-warn">amb gluten</span>' : '',
      apt.lactosa ? '<span class="tob-rec-warn">amb lactosa</span>' : ''
    ].join('');
    // La foto se hidrata async tras el render (data-foto-rec). Render
    // inicial = placeholder con el nombre; tobHydrateFotos pone la imagen.
    const fotoTxt = tobEsc((r.nombre||'').slice(0,40));
    return `<div class="tob-rec-card${r.descartada?' descartada':''}" onclick="tobRecEdit('${r.id}')">
      <div class="foto placeholder" data-foto-rec="${r.id}">${fotoTxt}</div>
      <button class="tob-rec-dislike${r.descartada?' on':''}" title="${r.descartada?'Recuperar — la IA podrá usarla':'Descartar — la IA no la usará'}" onclick="event.stopPropagation();tobRecToggleDislike('${r.id}')">🚫</button>
      <button class="tob-rec-fav${r.favorito?' on':''}" title="${r.favorito?'Quitar de favoritos':'Guardar en favoritos'}" onclick="event.stopPropagation();tobRecToggleFav('${r.id}')">${r.favorito?'★':'☆'}</button>
      <div class="body">
        <div class="nombre">${tobEsc(r.nombre || '—')}</div>
        <div class="macros">
          <span><b>${Math.round(m.kcal)}</b> kcal</span>
          <span><b>${Math.round(m.proteina)}</b>p</span>
          <span><b>${Math.round(m.hc)}</b>h</span>
          <span><b>${Math.round(m.grasa)}</b>g</span>
          ${rac > 1 ? `<span style="color:var(--mute2);">· ${rac} rac</span>` : ''}
        </div>
        ${momHtml ? `<div class="momentos">${tobEsc(momHtml)}</div>` : ''}
        ${(warnHtml || tagsHtml) ? `<div class="tags">${warnHtml}${tagsHtml}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  // Hidratar fotos async desde IndexedDB / URL
  tobHydrateFotos('#tobRecGrid');

  if(pages <= 1){
    pagerEl.innerHTML = '';
  } else {
    pagerEl.innerHTML = `
      <button class="tob-action ghost btn-xs" ${tobRecPage===0?'disabled':''} onclick="tobRecSetPage(${tobRecPage-1})">← Anterior</button>
      <span>página ${tobRecPage+1} / ${pages}</span>
      <button class="tob-action ghost btn-xs" ${tobRecPage>=pages-1?'disabled':''} onclick="tobRecSetPage(${tobRecPage+1})">Siguiente →</button>
    `;
  }
}
function tobRecSetPage(p){ tobRecPage = p; tobRecRender(); }

// ── Favoritos ────────────────────────────────────────────────────
function tobRecToggleFav(id){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === id);
  if(!r) return;
  r.favorito = !r.favorito;
  if(r.favorito) r.descartada = false;   // favorita y descartada son excluyentes
  tobMenusSave();
  tobRecRender();
  tobToast(r.favorito ? '★ Añadida a favoritos' : 'Quitada de favoritos', r.favorito ? 'green' : '');
}
// Descartar receta: la IA y el creador no la usarán.
function tobRecToggleDislike(id){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === id);
  if(!r) return;
  r.descartada = !r.descartada;
  if(r.descartada) r.favorito = false;
  tobMenusSave();
  tobRecRender();
  tobToast(r.descartada ? '🚫 Receta descartada — la IA no la usará' : 'Receta recuperada', r.descartada ? 'red' : 'green');
}
function tobRecToggleFavFilter(){
  tobRecOnlyFav = !tobRecOnlyFav;
  tobRecPage = 0;
  const btn = document.getElementById('tobRecFavBtn');
  if(btn) btn.classList.toggle('on', tobRecOnlyFav);
  tobRecRender();
}
function tobRecToggleAptFilter(which){
  tobRecPage = 0;
  if(which === 'celiac'){
    tobRecAptCeliac = !tobRecAptCeliac;
    const b = document.getElementById('tobRecAptCeliacBtn');
    if(b) b.classList.toggle('on', tobRecAptCeliac);
  } else if(which === 'lactosa'){
    tobRecAptLactosa = !tobRecAptLactosa;
    const b = document.getElementById('tobRecAptLactosaBtn');
    if(b) b.classList.toggle('on', tobRecAptLactosa);
  }
  tobRecRender();
}
// Estrella del modal de receta (aplica al guardar).
function _tobRecSyncFavModalBtn(){
  const btn = document.getElementById('tobRecFavModalBtn');
  if(!btn) return;
  btn.textContent = _tobRecModalFav ? '★' : '☆';
  btn.classList.toggle('on', _tobRecModalFav);
  btn.title = _tobRecModalFav ? 'Quitar de favoritos' : 'Guardar en favoritos';
}
function tobRecToggleFavModal(){
  _tobRecModalFav = !_tobRecModalFav;
  _tobRecSyncFavModalBtn();
}

// ── Modal de receta: abrir / cerrar ─────────────────────────────
function tobRecOpenModal(){
  tobRecEditId = null;
  document.getElementById('tobRecModalTitle').textContent = 'Nueva receta';
  document.getElementById('tobRecNombre').value = '';
  document.getElementById('tobRecTiempoTotal').value = '';
  document.getElementById('tobRecTiempoElab').value = '';
  document.getElementById('tobRecRaciones').value = '1';
  document.getElementById('tobRecAutor').value = '';
  document.getElementById('tobRecInstrucciones').value = '';
  document.getElementById('tobRecComentarios').value = '';
  document.getElementById('tobRecTags').value = '';
  const _alergEl = document.getElementById('tobRecAlergenos');
  if(_alergEl) _alergEl.style.display = 'none';
  document.getElementById('tobRecFotoData').value = '';
  tobRecClearFoto();
  _tobRecFotoChanged = false;
  _tobRecModalFav = false;
  _tobRecSyncFavModalBtn();
  tobRecRenderMomentos([]);
  tobRecRenderRol('');
  tobRecRenderIngredientesEdit([]);
  tobRecFillIngPicker();
  tobRecRecalc();
  document.getElementById('tobRecDelBtn').style.display = 'none';
  document.getElementById('tobRecModalBg').classList.add('on');
}

function tobRecCloseModal(){ document.getElementById('tobRecModalBg').classList.remove('on'); }

function tobRecEdit(id){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === id);
  if(!r){ tobToast('Receta no encontrada', 'red'); return; }
  tobRecEditId = id;
  document.getElementById('tobRecModalTitle').textContent = 'Editar receta';
  document.getElementById('tobRecNombre').value = r.nombre || '';
  document.getElementById('tobRecTiempoTotal').value = r.tiempoTotal || '';
  document.getElementById('tobRecTiempoElab').value = r.tiempoElaboracion || '';
  document.getElementById('tobRecRaciones').value = r.raciones != null ? r.raciones : 1;
  document.getElementById('tobRecAutor').value = r.autor || '';
  document.getElementById('tobRecInstrucciones').value = Array.isArray(r.instrucciones)
    ? r.instrucciones.join('\n')
    : (r.instrucciones || '');
  document.getElementById('tobRecComentarios').value = r.comentarios || '';
  document.getElementById('tobRecTags').value = (r.tags || []).join(', ');
  const alergEl = document.getElementById('tobRecAlergenos');
  if(alergEl){
    if(r.alergenos && r.alergenos.length){
      alergEl.textContent = '⚠ Alérgenos (ICNS): ' + r.alergenos.join(' · ');
      alergEl.style.display = '';
    } else {
      alergEl.style.display = 'none';
    }
  }
  _tobRecModalFav = !!r.favorito;
  _tobRecSyncFavModalBtn();
  // tobRecFotoData guarda la URL original (no el base64) para que, si no
  // se toca la foto, tobRecSave no reescriba nada en localStorage.
  document.getElementById('tobRecFotoData').value = r.foto || '';
  _tobRecFotoChanged = false;
  // Preview: resuelve la foto (IndexedDB si _fotoLocal, si no la URL).
  tobRecFotoResolve(r).then(src => {
    if(tobRecEditId !== id) return;  // el modal cambió mientras resolvía
    if(src){
      const prev = document.getElementById('tobRecFotoPreview');
      prev.src = src;
      prev.style.display = '';
      document.getElementById('tobRecFotoHint').textContent = 'con foto';
      document.getElementById('tobRecFotoDelBtn').style.display = '';
    } else {
      tobRecClearFoto();
    }
  });
  tobRecRenderMomentos(r.momentos || []);
  tobRecRenderRol(r.rol || '');
  tobRecRenderIngredientesEdit(r.ingredientes || []);
  tobRecFillIngPicker();
  tobRecRecalc();
  document.getElementById('tobRecDelBtn').style.display = '';
  document.getElementById('tobRecModalBg').classList.add('on');
}

// ── Foto: subir / limpiar ────────────────────────────────────────
function tobRecHandleFotoUpload(ev){
  const file = ev.target.files && ev.target.files[0];
  if(!file) return;
  if(file.size > 2 * 1024 * 1024){
    tobToast('Foto demasiado grande (>2MB) — reduce el tamaño', 'red');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    document.getElementById('tobRecFotoData').value = dataUrl;
    _tobRecFotoChanged = true;
    const prev = document.getElementById('tobRecFotoPreview');
    prev.src = dataUrl;
    prev.style.display = '';
    document.getElementById('tobRecFotoHint').textContent = '✓ foto cargada';
    document.getElementById('tobRecFotoDelBtn').style.display = '';
  };
  reader.readAsDataURL(file);
}

function tobRecClearFoto(markChanged){
  document.getElementById('tobRecFotoData').value = '';
  document.getElementById('tobRecFotoPreview').src = '';
  document.getElementById('tobRecFotoPreview').style.display = 'none';
  document.getElementById('tobRecFotoHint').textContent = 'sin foto';
  document.getElementById('tobRecFotoDelBtn').style.display = 'none';
  const file = document.getElementById('tobRecFotoFile');
  if(file) file.value = '';
  if(markChanged === true) _tobRecFotoChanged = true;
}

// ── Momentos: chips múltiples ───────────────────────────────────
function tobRecRenderMomentos(activeIds){
  const set = new Set(activeIds || []);
  const html = TOB_REC_MOMENTOS.map(m => {
    const on = set.has(m.id);
    return `<button type="button" class="tob-quest-chip${on?' active':''}" data-mom="${m.id}" onclick="tobRecToggleMomento('${m.id}',this)">${tobEsc(m.label)}</button>`;
  }).join('');
  const el = document.getElementById('tobRecMomentosChips');
  if(el) el.innerHTML = html;
}

function tobRecToggleMomento(id, btn){
  btn.classList.toggle('active');
}

function tobRecGetMomentosActivos(){
  const out = [];
  document.querySelectorAll('#tobRecMomentosChips .tob-quest-chip.active').forEach(b => {
    out.push(b.dataset.mom);
  });
  return out;
}

// Rol del plato en el modal de receta (selección única).
function tobRecRenderRol(rol){
  const el = document.getElementById('tobRecRolChips');
  if(!el) return;
  el.innerHTML = TOB_REC_ROLES.map(rl =>
    `<button type="button" class="tob-quest-chip${rol===rl.id?' active':''}" data-rol="${rl.id}" onclick="tobRecToggleRol('${rl.id}',this)">${tobEsc(rl.label)}</button>`
  ).join('');
}
function tobRecToggleRol(id, btn){
  const grp = btn.parentElement;
  const yaActiu = btn.classList.contains('active');
  if(grp) grp.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  if(!yaActiu) btn.classList.add('active');   // re-clic = quitar
}
function tobRecGetRol(){
  const b = document.querySelector('#tobRecRolChips .tob-quest-chip.active');
  return b ? b.dataset.rol : '';
}

// ── Ingredientes: picker + lista + recálculo ────────────────────
function tobRecFillIngPicker(){
  const sel = document.getElementById('tobRecIngPicker');
  if(!sel) return;
  const list = (tobMenusDB.ingredientes||[])
    .slice()
    .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));
  sel.innerHTML = '<option value="">— Selecciona un ingrediente —</option>' +
    list.map(i => `<option value="${i.id}">${tobEsc(i.nombre)}</option>`).join('');
}

// Render de la lista editable de ingredientes del modal.
// Cada fila: nombre · gramos input · macros calculados · botón ×.
function tobRecRenderIngredientesEdit(items){
  const cont = document.getElementById('tobRecIngredientes');
  if(!cont) return;
  if(!items.length){
    cont.innerHTML = '<div style="color:var(--mute2);font-family:DM Mono,monospace;font-size:.72rem;padding:6px 0;">Sin ingredientes todavía. Añade con el selector de abajo.</div>';
    return;
  }
  cont.innerHTML = items.map((it, ix) => {
    const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
    const nombre = ing ? ing.nombre : (it._nombreFallback || '(ingrediente eliminado)');
    const f = (+it.gramos || 0) / 100;
    const kcal = ing ? Math.round((+ing.kcal || 0) * f) : 0;
    const macrosTxt = ing
      ? `${kcal} kcal · ${((+ing.proteina||0)*f).toFixed(0)}p / ${((+ing.hc||0)*f).toFixed(0)}h / ${((+ing.grasa||0)*f).toFixed(0)}g`
      : 'sin macros';
    return `<div class="tob-rec-ing-row">
      <div class="name">${tobEsc(nombre)}</div>
      <input class="tob-input gr" type="number" min="0" step="1" value="${it.gramos != null ? it.gramos : ''}" oninput="tobRecUpdateGramos(${ix}, this.value)" style="width:100%;padding:3px 6px;font-size:.7rem;text-align:right;">
      <div class="macros">${macrosTxt}</div>
      <button class="x" type="button" onclick="tobRecRemoveIngrediente(${ix})" title="Eliminar">×</button>
    </div>`;
  }).join('');
}

// Estado en memoria del modal (no se persiste hasta guardar).
let _tobRecModalIngredientes = [];

function tobRecAddIngrediente(){
  const ingId = document.getElementById('tobRecIngPicker').value;
  const gramos = parseFloat(document.getElementById('tobRecIngGramos').value);
  if(!ingId){ tobToast('Elige un ingrediente', 'red'); return; }
  if(!Number.isFinite(gramos) || gramos <= 0){ tobToast('Pon los gramos', 'red'); return; }
  _tobRecModalIngredientes.push({ ingId, gramos });
  tobRecRenderIngredientesEdit(_tobRecModalIngredientes);
  tobRecRecalc();
  document.getElementById('tobRecIngPicker').value = '';
  document.getElementById('tobRecIngGramos').value = '';
}

function tobRecRemoveIngrediente(ix){
  _tobRecModalIngredientes.splice(ix, 1);
  tobRecRenderIngredientesEdit(_tobRecModalIngredientes);
  tobRecRecalc();
}

function tobRecUpdateGramos(ix, val){
  const n = parseFloat(val);
  if(_tobRecModalIngredientes[ix]){
    _tobRecModalIngredientes[ix].gramos = Number.isFinite(n) ? n : 0;
  }
  tobRecRenderIngredientesEdit(_tobRecModalIngredientes);
  tobRecRecalc();
}

// Recalcula macros totales de la receta editándose en tiempo real.
function tobRecRecalc(){
  // Si se edita una receta importada de ICNS cuyos ingredientes no
  // enlazan con la BD, tobRecMacros cae a _icnsMacros — así el modal
  // muestra los valores reales de ICNS en vez de 0.
  const editing = tobRecEditId
    ? (tobMenusDB.recetas||[]).find(x => x.id === tobRecEditId)
    : null;
  const tempRec = {
    ingredientes: _tobRecModalIngredientes,
    _icnsMacros: editing ? editing._icnsMacros : null
  };
  const m = tobRecMacros(tempRec);
  const rac = Math.max(1, parseInt(document.getElementById('tobRecRaciones')?.value) || 1);
  const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  setText('tobRecMacroKcal',    Math.round(m.kcal));
  setText('tobRecMacroProt',    m.proteina.toFixed(1));
  setText('tobRecMacroHc',      m.hc.toFixed(1));
  setText('tobRecMacroGras',    m.grasa.toFixed(1));
  setText('tobRecMacroFibra',   m.fibra.toFixed(1));
  setText('tobRecMacroKcalPer', Math.round(m.kcal / rac));
}

// Sobrescribir tobRecRenderIngredientesEdit para que también actualice
// la copia en memoria al cargar — usado tanto en abrir nuevo como editar.
function _tobRecLoadIngredientesIntoModal(items){
  _tobRecModalIngredientes = (items || []).map(it => ({ ingId: it.ingId, gramos: it.gramos, _nombreFallback: it._nombreFallback }));
  tobRecRenderIngredientesEdit(_tobRecModalIngredientes);
}
// Hook: cuando se abre el modal con datos existentes (Edit), cargar
// los ingredientes al state interno. Hacemos override de la función
// original que el modal llamaba:
const _origTobRecRenderIngEdit = tobRecRenderIngredientesEdit;
tobRecRenderIngredientesEdit = function(items){
  // Si el caller no nos pasó la lista de memoria (sino una nueva), la
  // sincronizamos antes de renderizar
  if(items !== _tobRecModalIngredientes){
    _tobRecModalIngredientes = (items || []).map(it => ({ ingId: it.ingId, gramos: it.gramos, _nombreFallback: it._nombreFallback }));
  }
  return _origTobRecRenderIngEdit.call(this, _tobRecModalIngredientes);
};

// ── Guardar / eliminar receta ───────────────────────────────────
async function tobRecSave(){
  const nombre = document.getElementById('tobRecNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const parseList = v => (v||'').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  const data = {
    nombre,
    foto:             document.getElementById('tobRecFotoData').value || '',
    momentos:         tobRecGetMomentosActivos(),
    rol:              tobRecGetRol(),
    tiempoTotal:      document.getElementById('tobRecTiempoTotal').value.trim(),
    tiempoElaboracion:document.getElementById('tobRecTiempoElab').value.trim(),
    raciones:         Math.max(1, parseInt(document.getElementById('tobRecRaciones').value) || 1),
    ingredientes:     _tobRecModalIngredientes.slice(),
    instrucciones:    document.getElementById('tobRecInstrucciones').value.trim(),
    comentarios:      document.getElementById('tobRecComentarios').value.trim(),
    autor:            document.getElementById('tobRecAutor').value.trim(),
    tags:             parseList(document.getElementById('tobRecTags').value),
    favorito:         _tobRecModalFav,
    // Timestamp d'última edició: el creador de menús el compara amb el savedAt
    // del menú per a marcar amb ⚠ les receptes modificades després de guardar
    // (les macros del menú poden no quadrar amb les del catàleg actual).
    _editTs:          Date.now()
  };
  if(!tobMenusDB.recetas) tobMenusDB.recetas = [];
  let recId;
  if(tobRecEditId){
    recId = tobRecEditId;
    const r = tobMenusDB.recetas.find(x => x.id === tobRecEditId);
    if(r) Object.assign(r, data);
  } else {
    recId = tobUid('rec');
    data.id = recId;
    data.origen = 'manual';
    tobMenusDB.recetas.push(data);
  }

  // Foto: solo se reescribe el almacenamiento si se tocó en el modal.
  // Si es base64 (subida nueva) → IndexedDB, no localStorage. Si se
  // vació → borrar de IndexedDB. Si no se tocó, se deja como estaba.
  if(_tobRecFotoChanged){
    const recObj = tobMenusDB.recetas.find(x => x.id === recId);
    if(recObj){
      const f = recObj.foto || '';
      if(typeof f === 'string' && f.startsWith('data:')){
        try {
          await tobImgPut(recId, f);
          recObj._fotoLocal = true;
          recObj.foto = '';   // no guardar el base64 en localStorage
        } catch(e){ console.warn('[rec-save] foto IndexedDB falló', e); }
      } else if(!f){
        try { await tobImgDelete(recId); } catch(e){}
        recObj._fotoLocal = false;
      }
    }
  }

  tobMenusSave();
  tobRecCloseModal();
  tobRecRender();
  tobToast('✓ Receta guardada', 'green');
}

async function tobRecDeleteFromModal(){
  if(!tobRecEditId) return;
  const r = (tobMenusDB.recetas||[]).find(x => x.id === tobRecEditId);
  if(!r) return;
  if(!confirm(`Eliminar receta "${r.nombre}"?`)) return;
  const delId = tobRecEditId;
  tobMenusDB.recetas = tobMenusDB.recetas.filter(x => x.id !== delId);
  if(r._fotoLocal){ try { await tobImgDelete(delId); } catch(e){} }
  tobMenusSave();
  tobRecCloseModal();
  tobRecRender();
  tobToast('Receta eliminada', '');
}

// ── Import JSON (multi-archivo) ─────────────────────────────────
// Acepta DOS formatos:
//   1. Simple ICNS:    { id, nombre, kcal, hc, proteina, grasa, foto }
//   2. Scraper detallado: { id, nombre, url, foto, fotos, raciones,
//                            tiempoTotal, tiempoElaboracion, momentos,
//                            ingredientes:[{raw,cantidad,unidad,nombre}],
//                            instrucciones, autor, comentarios, tags }
// Detección por presencia de campos: si tiene `ingredientes` o
// `instrucciones`, se trata como detallado; si solo tiene macros, simple.
//
// Match con ingredientes BD: cuando importa receta detallada, intenta
// match por nombre (case-insensitive, normalizado). Si no encuentra,
// guarda _nombreFallback para que el usuario pueda enlazarlo manualmente
// después.
// ── Sanitizadores compartidos con el browser scraper ─────────────────
// Se aplican al importar para limpiar JSONs viejos del scraper que
// pueden venir con ruido (precios en ingredientes, fotos con iconos,
// tiempoTotal con elaboración pegada, tags con #, momentos vacíos).
// Si el JSON ya está limpio (lo nuevo del scraper actualizado), no
// rompen nada.
function _tobCleanIngredienteText(txt){
  return (txt || '')
    .replace(/\s*Detalles\s+[\d.,]+€?\s*[-–]\s*[\d.,]+€?\s*$/i, '')
    .replace(/\s*Detalles\s*$/i, '')
    .trim();
}
function _tobExtractIngNombre(txt){
  let s = _tobCleanIngredienteText(txt);
  s = s.replace(/^[¼½¾⅓⅔⅛⅜⅝⅞\d]+(?:[.,]\d+)?\s*[a-záéíóúñ]+\s*(de\s+)?/i, '');
  s = s.replace(/\s*\([\d.,\s]+gr\.?\)\s*$/i, '');
  return s.trim();
}
const _TOB_ICNS_FOTO_RE = /\/din\/recetas\/(fotos|chefs)\//i;
function _tobFiltrarFotos(arr){
  return (arr || []).filter(u => _TOB_ICNS_FOTO_RE.test(u));
}
function _tobSepararTiempos(tt, te){
  // Si tiempoTotal tiene "Elaboración: ..." pegado, separa.
  if(!tt) return { total: '', elab: te || '' };
  const m = tt.match(/^([\d:hmin\s.]+?)(?:\.|\s)\s*elabor[a-zóáí]*[:\s]*([\d:hmin\s.]+)/i);
  if(m) return { total: m[1].replace(/\.+$/,'').trim(), elab: (te || m[2]).replace(/\.+$/,'').trim() };
  return { total: tt.replace(/\.+$/,'').trim(), elab: (te || '').replace(/\.+$/,'').trim() };
}
function _tobTagsToMomentos(tags){
  const set = new Set();
  (tags || []).forEach(t => {
    const low = String(t).toLowerCase().replace(/^#/, '').trim();
    if(/desayuno|esmorzar|breakfast/i.test(low)) set.add('esmorzar');
    if(/medi[aá]\s*ma[ñn]ana|mig\s*mat[ií]|brunch/i.test(low)) set.add('mig_mati');
    if(/comida|almuerzo|dinar|lunch/i.test(low)) set.add('dinar');
    if(/merienda|berenar|snack/i.test(low)){ set.add('berenar'); set.add('mig_mati'); }
    if(/cena|sopar|dinner/i.test(low)) set.add('sopar');
  });
  return [...set];
}
function _tobCleanTags(tags){
  return (tags || [])
    .map(t => String(t).replace(/^#/, '').trim())
    .filter(t => t.length > 1 && !/^\d+$/.test(t));
}

async function tobRecImportFiles(ev){
  const files = Array.from(ev.target.files || []);
  if(!files.length) return;
  tobToast(`Importando ${files.length} archivo(s)...`, '');
  let added = 0, updated = 0, skipped = 0, fotos = 0;
  const ingByName = new Map();
  (tobMenusDB.ingredientes||[]).forEach(i => {
    ingByName.set((i.nombre||'').toLowerCase().trim(), i.id);
  });
  const matchIngId = (nombreIng) => {
    const key = (nombreIng||'').toLowerCase().trim();
    if(!key) return null;
    if(ingByName.has(key)) return ingByName.get(key);
    // Match parcial: el ingrediente de la BD que más coincida con el nombre
    // (substring de palabras). Útil cuando el scraper devuelve "tomate maduro"
    // y la BD tiene "tomate".
    for(const [n, id] of ingByName){
      if(n.length >= 4 && (key.includes(n) || n.includes(key))) return id;
    }
    return null;
  };
  const parseN = v => { if(v == null || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  for(const file of files){
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed
                  : Array.isArray(parsed.recetas) ? parsed.recetas
                  : Array.isArray(parsed.data) ? parsed.data
                  : null;
      if(!items){ console.warn('[rec-import]', file.name, 'no es array'); skipped++; continue; }

      for(const raw of items){
        if(!raw || !raw.nombre){ skipped++; continue; }
        if(raw._error){ skipped++; continue; }  // entries del scraper que fallaron

        const icnsId = raw.id != null ? String(raw.id) : null;
        const hasDetalle = Array.isArray(raw.ingredientes) || raw.instrucciones;

        // Construir ingredientes — limpiando texto de basura ICNS
        let ingredientes = [];
        if(hasDetalle && Array.isArray(raw.ingredientes)){
          ingredientes = raw.ingredientes.map(ing => {
            // El scraper nuevo da `nombre` ya limpio (1er arg de
            // actualizaModal). Si no, se extrae del texto raw.
            const nombreLimpio = (ing.nombre && ing.nombre.trim())
              ? ing.nombre.trim()
              : _tobExtractIngNombre(ing.raw || '');
            // Gramos: el scraper nuevo da `gramos`; compat con `cantidad`.
            let gramos = ing.gramos != null ? +ing.gramos
                       : (ing.cantidad != null ? +ing.cantidad : null);
            if(!Number.isFinite(gramos)) gramos = null;
            const ingId = matchIngId(nombreLimpio);
            return ingId
              ? { ingId, gramos: gramos || 0 }
              : { ingId: null, gramos: gramos || 0, _nombreFallback: nombreLimpio };
          }).filter(it => it.ingId || (it._nombreFallback && it._nombreFallback.length >= 2));
        }

        // Construir instrucciones
        let instrucciones = '';
        if(Array.isArray(raw.instrucciones)){
          instrucciones = raw.instrucciones.join('\n');
        } else if(typeof raw.instrucciones === 'string'){
          instrucciones = raw.instrucciones;
        }

        // Limpiezas de campos del scraper
        const fotosLimpias = _tobFiltrarFotos(Array.isArray(raw.fotos) ? raw.fotos : []);
        const fotoLimpia = _TOB_ICNS_FOTO_RE.test(raw.foto || '') ? raw.foto : (fotosLimpias[0] || '');
        const tiempos = _tobSepararTiempos(raw.tiempoTotal, raw.tiempoElaboracion);
        const tagsLimpios = _tobCleanTags(raw.tags);
        const momentos = Array.isArray(raw.momentos) && raw.momentos.length
          ? raw.momentos
          : _tobTagsToMomentos(tagsLimpios);

        const data = {
          nombre: String(raw.nombre).trim(),
          foto:   fotoLimpia,
          fotos:  fotosLimpias,
          momentos,
          tiempoTotal: tiempos.total,
          tiempoElaboracion: tiempos.elab,
          raciones: raw.raciones != null ? Math.max(1, +raw.raciones) : 1,
          ingredientes,
          instrucciones,
          comentarios: raw.comentarios || '',
          autor: raw.autor || '',
          tags: tagsLimpios,
          alergenos: Array.isArray(raw.alergenos) ? raw.alergenos.slice() : []
        };

        // Macros: del scraper detallado (macrosPersona, valores POR PERSONA)
        // o del JSON simple ICNS (campos kcal/hc/... sueltos). Se guardan
        // como TOTALES de la receta = por persona × raciones, misma escala
        // que la suma de ingredientes.
        const mp = raw.macrosPersona
          || ((raw.kcal != null || raw.hc != null || raw.proteina != null)
              ? { kcal: raw.kcal, hc: raw.hc, proteina: raw.proteina, grasa: raw.grasa, fibra: raw.fibra }
              : null);
        if(mp){
          const rac = data.raciones || 1;
          const im = {
            kcal:     (parseN(mp.kcal)     || 0) * rac,
            hc:       (parseN(mp.hc)       || 0) * rac,
            proteina: (parseN(mp.proteina) || 0) * rac,
            grasa:    (parseN(mp.grasa)    || 0) * rac,
            fibra:    (parseN(mp.fibra)    || 0) * rac
          };
          // Solo si hay datos reales (kcal > 0). Si el scraper no encontró
          // macros, se deja sin _icnsMacros para que tobRecMacros caiga a
          // la suma de ingredientes.
          if(im.kcal > 0) data._icnsMacros = im;
        }
        // Campos de organización: solo se copian si vienen en el JSON —
        // así re-importar un export del dashboard conserva favoritos, rol
        // y descartadas; un scrape nuevo de ICNS no los trae y no los pisa.
        if(raw.rol != null)        data.rol = raw.rol;
        if(raw.favorito != null)   data.favorito = !!raw.favorito;
        if(raw.descartada != null) data.descartada = !!raw.descartada;
        if(!data._icnsMacros && raw._icnsMacros && typeof raw._icnsMacros === 'object')
          data._icnsMacros = raw._icnsMacros;

        // Detección de duplicado (igual que ingredientes): por icnsId o nombre
        let exist = null;
        if(icnsId && tobMenusDB.recetas) exist = tobMenusDB.recetas.find(r => r.icnsId === icnsId);
        if(!exist && tobMenusDB.recetas) exist = tobMenusDB.recetas.find(r => (r.nombre||'').toLowerCase() === data.nombre.toLowerCase());
        let recId;
        if(exist){
          // Merge: nuevas claves (ingredientes detallados) ganan sobre las
          // viejas (macros simples). Pero si ya tenía ingredientes y los
          // nuevos vienen vacíos, mantenemos los viejos.
          if(!ingredientes.length && exist.ingredientes && exist.ingredientes.length){
            data.ingredientes = exist.ingredientes;
          }
          Object.assign(exist, data, { icnsId: icnsId || exist.icnsId });
          recId = exist.id;
          updated++;
        } else {
          if(!tobMenusDB.recetas) tobMenusDB.recetas = [];
          recId = tobUid('rec');
          tobMenusDB.recetas.push({
            id: recId,
            origen: hasDetalle ? 'scraper' : 'icns',
            icnsId,
            favorito: false,
            ...data
          });
          added++;
        }

        // Foto descargada por el scraper (base64 thumbnail) → IndexedDB.
        // NO se guarda en localStorage (límite ~5MB para cientos de fotos).
        // El objeto receta solo lleva el flag _fotoLocal:true; la imagen
        // real vive en IndexedDB con clave = id de la receta.
        if(raw.fotoData && typeof raw.fotoData === 'string' && raw.fotoData.startsWith('data:')){
          try {
            await tobImgPut(recId, raw.fotoData);
            const recObj = tobMenusDB.recetas.find(r => r.id === recId);
            if(recObj) recObj._fotoLocal = true;
            fotos++;
          } catch(e){
            console.warn('[rec-import] foto IndexedDB falló', recId, e);
          }
        }
      }
    } catch(e){
      console.warn('[rec-import]', file.name, e);
      skipped++;
    }
  }

  tobMenusSave();
  tobRecRender();
  ev.target.value = '';
  tobToast(`✓ Importación recetas: ${added} nuevas · ${updated} actualizadas${fotos?' · '+fotos+' fotos':''}${skipped?' · '+skipped+' saltadas':''}`, 'green');
}

function tobRecExportJson(){
  if(!(tobMenusDB.recetas||[]).length){ tobToast('No hay recetas que exportar', 'red'); return; }
  const blob = new Blob([JSON.stringify(tobMenusDB.recetas, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recetas_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  tobToast(`✓ ${tobMenusDB.recetas.length} recetas exportadas`, 'green');
}

// ═════════════════════════════════════════════════════════════════
// CLASIFICAR RECETAS POR MOMENTO DEL DÍA (en masa)
// ═════════════════════════════════════════════════════════════════
let tobClasifPage = 0;
let tobClasifSoloSin = true;

function tobClasifOpen(){
  tobClasifPage = 0;
  tobClasifSoloSin = true;
  _tobClasifFocusIx = 0;
  const chk = document.getElementById('tobClasifSoloSin');
  if(chk) chk.checked = true;
  tobClasifRender();
  document.getElementById('tobClasifModalBg').classList.add('on');
  // Atallar amb tecles per a no haver de clicar amb el ratolí cada chip.
  if(!_tobClasifKbBound){
    document.addEventListener('keydown', _tobClasifOnKey);
    _tobClasifKbBound = true;
  }
}

// ─── Atajos de teclado del modal Clasificar momentos ─────────────────
// Quan el modal està obert i el focus no és en un input/textarea:
//   1-5  → toggle moment (esmorzar/mig_mati/dinar/berenar/sopar)
//   P A D B → set rol (principal/acompanyament/postre/basic)
//   F    → toggle favorit
//   X    → toggle descartada (no usar a menús)
//   ↓ Enter Espai → següent recepta del visible
//   ↑    → anterior
//   Esc  → tancar modal
let _tobClasifFocusIx = 0;     // índex dins de la slice visible
let _tobClasifKbBound = false;
function _tobClasifVisibleRecs(){
  const all = (tobMenusDB.recetas||[]).filter(r => r.origen !== 'ingrediente');
  const sinClasif = all.filter(_tobClasifSinClasif);
  const list = (tobClasifSoloSin ? sinClasif : all).slice().sort((a,b) => {
    const am = _tobClasifSinClasif(a) ? 0 : 1, bm = _tobClasifSinClasif(b) ? 0 : 1;
    if(am !== bm) return am - bm;
    return (a.nombre||'').localeCompare(b.nombre||'','ca',{sensitivity:'base'});
  });
  const PER = 20;
  return list.slice(tobClasifPage * PER, tobClasifPage * PER + PER);
}
function _tobClasifOnKey(e){
  // Només quan el modal és visible i el focus NO és en un input/textarea editable.
  const modal = document.getElementById('tobClasifModalBg');
  if(!modal || !modal.classList.contains('on')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if(tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const slice = _tobClasifVisibleRecs();
  if(!slice.length){
    if(e.key === 'Escape'){ modal.classList.remove('on'); tobRecRender(); e.preventDefault(); }
    return;
  }
  if(_tobClasifFocusIx >= slice.length) _tobClasifFocusIx = slice.length - 1;
  if(_tobClasifFocusIx < 0) _tobClasifFocusIx = 0;
  const r = slice[_tobClasifFocusIx];

  const MOMS = ['esmorzar','mig_mati','dinar','berenar','sopar'];
  const ROLS = { p:'principal', a:'acompanyament', d:'postre', b:'basic' };
  const k = e.key;

  // 1-5 → toggle moment
  if(/^[1-5]$/.test(k)){
    const momId = MOMS[parseInt(k,10) - 1];
    if(!Array.isArray(r.momentos)) r.momentos = [];
    const ix = r.momentos.indexOf(momId);
    if(ix >= 0) r.momentos.splice(ix, 1);
    else r.momentos.push(momId);
    tobMenusSave();
    tobClasifRender();
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  // P/A/D/B → set rol
  const lower = k.toLowerCase();
  if(ROLS[lower]){
    const newRol = ROLS[lower];
    r.rol = (r.rol === newRol) ? '' : newRol;
    tobMenusSave();
    tobClasifRender();
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  // F → toggle favorit
  if(lower === 'f'){
    r.favorito = !r.favorito;
    tobMenusSave();
    tobClasifRender();
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  // X → toggle descartada
  if(lower === 'x'){
    r.descartada = !r.descartada;
    tobMenusSave();
    tobClasifRender();
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  // Navegació
  if(k === 'ArrowDown' || k === 'Enter' || k === ' '){
    _tobClasifFocusIx++;
    if(_tobClasifFocusIx >= slice.length){
      // Saltar a la següent pàgina si n'hi ha
      const all = (tobMenusDB.recetas||[]).filter(rr => rr.origen !== 'ingrediente');
      const sin = all.filter(_tobClasifSinClasif);
      const total = (tobClasifSoloSin ? sin : all).length;
      const PER = 20;
      const pages = Math.ceil(total / PER);
      if(tobClasifPage < pages - 1){
        tobClasifPage++; _tobClasifFocusIx = 0;
        tobClasifRender();
      } else _tobClasifFocusIx = slice.length - 1;
    }
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  if(k === 'ArrowUp'){
    _tobClasifFocusIx--;
    if(_tobClasifFocusIx < 0){
      if(tobClasifPage > 0){
        tobClasifPage--; _tobClasifFocusIx = 19;
        tobClasifRender();
      } else _tobClasifFocusIx = 0;
    }
    _tobClasifApplyFocus();
    e.preventDefault();
    return;
  }
  if(k === 'Escape'){
    modal.classList.remove('on');
    tobRecRender();
    e.preventDefault();
  }
}
function _tobClasifApplyFocus(){
  const rows = document.querySelectorAll('#tobClasifBody .tob-clasif-row');
  rows.forEach((row, i) => row.classList.toggle('focused', i === _tobClasifFocusIx));
  const el = rows[_tobClasifFocusIx];
  if(el) el.scrollIntoView({ block:'nearest', behavior:'smooth' });
}

// Una receta está "sin clasificar" si le falta el momento O el rol.
function _tobClasifSinClasif(r){ return !((r.momentos||[]).length) || !r.rol; }

function tobClasifRender(){
  const body = document.getElementById('tobClasifBody');
  if(!body) return;
  const all = (tobMenusDB.recetas||[]).filter(r => r.origen !== 'ingrediente');
  const sinClasif = all.filter(_tobClasifSinClasif);
  let list = (tobClasifSoloSin ? sinClasif : all).slice().sort((a,b) => {
    const am = _tobClasifSinClasif(a) ? 0 : 1, bm = _tobClasifSinClasif(b) ? 0 : 1;
    if(am !== bm) return am - bm;
    return (a.nombre||'').localeCompare(b.nombre||'','ca',{sensitivity:'base'});
  });
  const info = document.getElementById('tobClasifInfo');
  if(info) info.textContent = `${all.length} receptes · ${sinClasif.length} sense classificar`;

  const PER = 20;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  if(tobClasifPage >= pages) tobClasifPage = pages - 1;
  if(tobClasifPage < 0) tobClasifPage = 0;
  const slice = list.slice(tobClasifPage * PER, tobClasifPage * PER + PER);

  if(!list.length){
    body.innerHTML = '<div style="text-align:center;color:var(--mute2);padding:30px;font-family:DM Mono,monospace;font-size:.8rem;">🎉 Totes les receptes estan classificades.</div>';
  } else {
    const kbHint = '<div class="tob-clasif-kb-hint">⌨ Atalls: <b>1-5</b> moment · <b>P/A/D/B</b> rol · <b>F</b> favorit · <b>X</b> descartar · <b>↓/Enter</b> següent</div>';
    body.innerHTML = kbHint + slice.map((r, ix) => {
      const set = new Set(r.momentos||[]);
      const moms = TOB_REC_MOMENTOS.map((mm, mi) =>
        `<button type="button" class="tob-quest-chip${set.has(mm.id)?' active':''}" onclick="tobClasifToggleMom('${r.id}','${mm.id}',this)"><b class="kb">${mi+1}</b> ${tobEsc(mm.label)}</button>`
      ).join('');
      const rolKb = { principal:'P', acompanyament:'A', postre:'D', basic:'B' };
      const roles = TOB_REC_ROLES.map(rl =>
        `<button type="button" class="tob-quest-chip${r.rol===rl.id?' active':''}" data-rol="${rl.id}" onclick="tobClasifSetRol('${r.id}','${rl.id}',this)"><b class="kb">${rolKb[rl.id]||''}</b> ${tobEsc(rl.label)}</button>`
      ).join('');
      const flags = (r.favorito ? '<span class="tob-clasif-flag fav">★ favorita</span>' : '') +
                    (r.descartada ? '<span class="tob-clasif-flag dis">✗ descartada</span>' : '');
      return `<div class="tob-clasif-row${ix === _tobClasifFocusIx ? ' focused' : ''}" data-ix="${ix}">
        <div class="tob-clasif-nm">${tobEsc(r.nombre||'—')} ${flags}</div>
        <div class="tob-clasif-line"><span class="lbl">Moments</span><div class="tob-clasif-chips">${moms}</div></div>
        <div class="tob-clasif-line"><span class="lbl">Tipus</span><div class="tob-clasif-chips" data-rolgrp="${r.id}">${roles}</div></div>
      </div>`;
    }).join('');
  }
  const pager = document.getElementById('tobClasifPager');
  if(pager){
    pager.innerHTML = pages > 1
      ? `<button class="tob-action ghost btn-xs" ${tobClasifPage===0?'disabled':''} onclick="tobClasifSetPage(${tobClasifPage-1})">← Anterior</button>
         <span style="font-family:DM Mono,monospace;font-size:.72rem;color:var(--mute);">${tobClasifPage+1} / ${pages}</span>
         <button class="tob-action ghost btn-xs" ${tobClasifPage>=pages-1?'disabled':''} onclick="tobClasifSetPage(${tobClasifPage+1})">Següent →</button>`
      : '';
  }
}
function tobClasifSetPage(p){ tobClasifPage = p; tobClasifRender(); }
function tobClasifToggleSoloSin(chk){ tobClasifSoloSin = !!chk.checked; tobClasifPage = 0; tobClasifRender(); }

function _tobClasifUpdInfo(){
  const all = (tobMenusDB.recetas||[]).filter(x => x.origen !== 'ingrediente');
  const sinN = all.filter(_tobClasifSinClasif).length;
  const info = document.getElementById('tobClasifInfo');
  if(info) info.textContent = `${all.length} receptes · ${sinN} sense classificar`;
}

function tobClasifToggleMom(recId, momId, btn){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
  if(!r) return;
  if(!Array.isArray(r.momentos)) r.momentos = [];
  const ix = r.momentos.indexOf(momId);
  if(ix >= 0) r.momentos.splice(ix, 1);
  else r.momentos.push(momId);
  btn.classList.toggle('active');
  tobMenusSave();
  _tobClasifUpdInfo();
}

// Rol = selección única: marcar uno desmarca los demás del grupo.
function tobClasifSetRol(recId, rolId, btn){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
  if(!r) return;
  r.rol = (r.rol === rolId) ? '' : rolId;   // re-clic = quitar
  const grp = btn.parentElement;
  if(grp) grp.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.rol === r.rol));
  tobMenusSave();
  _tobClasifUpdInfo();
}

// ─── BULK CLASSIFY: aplicar classificació de moltes receptes des d'un text ──
// Sergio prefereix dictar les classificacions i pegar-les en bloc al modal.
// Format flexible per cada línia: "nom receta : moments,rol[,fav,desc]"
// Separadors acceptats: : - = + → o qualsevol whitespace múltiple.
// Matching del nom: lowercase + sense accents + substring en els dos sentits.
// Aplica tot d'una vegada i mostra resultats (matched / no matched).
function tobClasifToggleBulk(){
  const el = document.getElementById('tobClasifBulkBlock');
  if(el) el.open = !el.open;
}
function tobClasifBulkApply(){
  const txt = (document.getElementById('tobClasifBulkText')?.value || '').trim();
  if(!txt){ document.getElementById('tobClasifBulkResult').innerHTML = '<span style="color:#d94040">⚠ Buit — afegeix línies primer</span>'; return; }

  const allRecs = (tobMenusDB.recetas||[]).filter(r => r.origen !== 'ingrediente');
  const norm = s => String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
  // Diccionari de paraules clau (normalitzades) → acció
  const MOMS = {
    'esmorzar':'esmorzar', 'desayuno':'esmorzar', 'breakfast':'esmorzar',
    'mig mati':'mig_mati', 'migmati':'mig_mati', 'media manana':'mig_mati', 'mediamanana':'mig_mati',
    'dinar':'dinar', 'comida':'dinar', 'lunch':'dinar', 'almuerzo':'dinar',
    'berenar':'berenar', 'merienda':'berenar', 'snack':'berenar',
    'sopar':'sopar', 'cena':'sopar', 'dinner':'sopar'
  };
  // Codis numèrics per dictat ràpid: 1=esmorzar, 2=mig_mati, 3=dinar, 4=berenar, 5=sopar
  const MOM_NUM = ['', 'esmorzar','mig_mati','dinar','berenar','sopar'];
  const ROLS = {
    'principal':'principal', 'p':'principal', 'main':'principal',
    'acompanyament':'acompanyament', 'acompanyamiento':'acompanyament', 'acomp':'acompanyament', 'a':'acompanyament', 'side':'acompanyament',
    'postre':'postre', 'd':'postre', 'dessert':'postre',
    'basic':'basic', 'basico':'basic', 'b':'basic'
  };
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const matched = [], notMatched = [], multiMatched = [];
  lines.forEach(line => {
    // Separar nom de tags. Triem el primer separador (: - = → o múltiple whitespace)
    const sep = line.search(/[:\-=→]|\s{2,}/);
    let nomPart = line, tagPart = '';
    if(sep > 0){
      const m = line.slice(sep).match(/^[:\-=→\s]+/);
      const splitIx = sep + (m ? m[0].length : 1);
      nomPart = line.slice(0, sep).trim();
      tagPart = line.slice(splitIx).trim();
    }
    if(!nomPart){ notMatched.push({ line, reason:'sense nom' }); return; }
    const nomN = norm(nomPart);
    // Buscar recepta per matching fuzzy
    const candidats = allRecs.filter(r => {
      const rn = norm(r.nombre);
      return rn.includes(nomN) || nomN.includes(rn);
    });
    if(!candidats.length){ notMatched.push({ line, reason:'cap recepta amb aquest nom' }); return; }
    if(candidats.length > 1){
      // Si hi ha múltiples, agafem la que té matching més exacte (longitud més propera)
      candidats.sort((a, b) => Math.abs(norm(a.nombre).length - nomN.length) - Math.abs(norm(b.nombre).length - nomN.length));
      multiMatched.push({ line, n: candidats.length, chosen: candidats[0].nombre });
    }
    const r = candidats[0];
    const newMoms = [];
    let newRol = null;
    let setFav = null, setDesc = null;

    // 1) PARSEAR DÍGITS — codis numèrics per moments.
    //    Accepta "3 5", "3,5", "35" (dígits enganxats) → moments 3 i 5.
    const digits = (tagPart.match(/\d/g) || []);
    digits.forEach(d => {
      const i = parseInt(d, 10);
      if(i >= 1 && i <= 5){
        const mom = MOM_NUM[i];
        if(!newMoms.includes(mom)) newMoms.push(mom);
      }
    });

    // 2) PARSEAR PARAULES — moments i rols com a text complet
    const words = (tagPart.match(/[a-zàáèéíïòóúüçñ]+/gi) || []).map(t => norm(t));
    words.forEach(t => {
      if(MOMS[t] && !newMoms.includes(MOMS[t])) newMoms.push(MOMS[t]);
      else if(ROLS[t]) newRol = ROLS[t];
      else if(t === 'f' || /^fav/.test(t)) setFav = true;
      else if(t === 'x' || /^desc/.test(t)) setDesc = true;
    });
    // 3) Detecta "mig mati" com a parell consecutiu (per si ve sense underscore)
    if(/mig\s*mati|migmati|media\s*manana/.test(tagPart.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')) && !newMoms.includes('mig_mati')){
      newMoms.push('mig_mati');
    }

    if(newMoms.length) r.momentos = Array.from(new Set(newMoms));
    if(newRol) r.rol = newRol;
    if(setFav != null) r.favorito = setFav;
    if(setDesc != null) r.descartada = setDesc;
    matched.push({ line, rec: r.nombre, momentos: r.momentos, rol: r.rol });
  });
  tobMenusSave();
  tobClasifRender();
  // Render resultat
  const res = document.getElementById('tobClasifBulkResult');
  const okLines = matched.map(m => '  ✓ ' + m.rec + ' → ' + (m.momentos||[]).join(',') + (m.rol ? ' · ' + m.rol : '')).join('\n');
  const multiLines = multiMatched.map(m => '  ⚠ "' + m.line + '" → ' + m.n + ' coincidències, escollida: ' + m.chosen).join('\n');
  const noLines = notMatched.map(m => '  ✗ "' + m.line + '" — ' + m.reason).join('\n');
  res.innerHTML =
    '<div style="color:#3fb68b">✓ ' + matched.length + ' aplicades' + (multiMatched.length ? ' (' + multiMatched.length + ' amb múltiples)' : '') + '</div>' +
    (notMatched.length ? '<div style="color:#d94040">✗ ' + notMatched.length + ' sense match</div>' : '') +
    '<pre style="white-space:pre-wrap;font-size:.7rem;color:var(--mute);max-height:200px;overflow-y:auto;margin-top:6px;">' +
    okLines + (multiLines ? '\n\n' + multiLines : '') + (noLines ? '\n\n' + noLines : '') +
    '</pre>';
  tobToast('✓ ' + matched.length + ' receptes classificades' + (notMatched.length ? ' · ' + notMatched.length + ' sense match' : ''), 'green');
}

// Funció antiga "Clasificar amb IA" eliminada — Sergio prefereix dictar
// les classificacions i aplicar-les en bloc amb tobClasifBulkApply.

// Hook al cambio de sub-tab "recetas" para re-renderizar
const _origTobMenuShowTab = tobMenuShowTab;
tobMenuShowTab = function(name, btn){
  _origTobMenuShowTab(name, btn);
  if(name === 'recetas') tobRecRender();
};

// Cerrar modal de receta clicando fuera
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('tobRecModalBg');
  if(bg){
    bg.addEventListener('click', e => { if(e.target === bg) tobRecCloseModal(); });
  }
});

// ═════════════════════════════════════════════════════════════════
// MÓDULO MENÚS — Creador (tabla días × comidas + drag&drop + macros)
// ─────────────────────────────────────────────────────────────────
// Estado del menú activo en memoria mientras se edita:
//   tobMcState = {
//     cliId, kcalObj, margenPct, protObj, semanas, comidasIds:[...],
//     semanaActiva: 0..semanas-1,
//     data: { [semana]: { [dia]: { [comidaId]: [recetaId, ...] } } },
//     savedAt, _menuId (si se está editando uno guardado)
//   }
// Persistencia: cada cliente tiene cli.menus = [{ ...tobMcState }].
// ═════════════════════════════════════════════════════════════════

let tobMcState = null;
const TOB_MC_DIAS = ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'];
const TOB_MC_DIA_FULL = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte','Diumenge'];
let _tobMcMomentoFiltro = '';  // filtro activo del panel lateral

function tobMcMealLabel(id){
  const d = TOB_MEALS.find(x => x.id === id);
  return d ? d.label : (TOB_REC_MOMENTO_LBL[id] || id);
}
function tobMcMealBase(id){
  const d = TOB_MEALS.find(x => x.id === id);
  return (d && d.momento) || id;
}

// ═════════════════════════════════════════════════════════════════
// AJUSTOS DE QUANTITATS — la IA (o el dietista) pot modificar la
// quantitat d'una recepta dins d'un menú per quadrar kcal/proteïna.
// tobMcState.ajustes = { [recId]: { factor, ing:{ingId:grams}, motiu, fuente } }
//   · factor: multiplica TOTA la recepta (1 = sense canvi).
//   · ing:    fixa els grams (de tota la recepta) d'ingredients concrets.
// L'ajust s'aplica a TOTES les aparicions d'aquesta recepta al menú i es
// propaga a graella, totals, PDF, recetari i llista de la compra.
// ═════════════════════════════════════════════════════════════════
const TOB_MC_FACTOR_MIN = 0.5;
const TOB_MC_FACTOR_MAX = 1.8;   // permet a la IA quadrar dies molt curts sense substituir
const TOB_MC_ING_CAP    = 2.2;   // un ingredient no pot pujar més de +120%

function tobMcClampFactor(f){
  f = parseFloat(f);
  if(!isFinite(f) || f <= 0) return 1;
  return Math.min(TOB_MC_FACTOR_MAX, Math.max(TOB_MC_FACTOR_MIN, f));
}
// Grams efectius d'un ingredient de recepta segons l'ajust.
function tobMcEffGramos(it, aj){
  const base = +it.gramos || 0;
  if(!aj) return base;
  if(aj.ing && aj.ing[it.ingId] != null){
    const v = +aj.ing[it.ingId];
    if(isFinite(v) && v >= 0) return base > 0 ? Math.min(v, base * TOB_MC_ING_CAP) : v;
  }
  return base * (aj.factor || 1);
}
// ¿L'ajust té un canvi real?
function tobMcAjusteActivo(aj){
  if(!aj) return false;
  if(aj.factor && Math.abs(aj.factor - 1) > 0.001) return true;
  if(aj.ing && Object.keys(aj.ing).length) return true;
  return false;
}
// Macros d'una recepta dins del menú, honrant el seu ajust.
// ajustesMap opcional (el PDF no usa tobMcState).
function tobMcMacros(r, ajustesMap){
  const map = ajustesMap || (tobMcState && tobMcState.ajustes) || {};
  const aj = map[r.id];
  if(!tobMcAjusteActivo(aj)) return tobRecMacros(r);
  const hasIng = aj.ing && Object.keys(aj.ing).length;
  if(hasIng && Array.isArray(r.ingredientes) && r.ingredientes.length){
    let kcal=0, hc=0, prot=0, gras=0, fib=0;
    r.ingredientes.forEach(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      if(!ing) return;
      const f = tobMcEffGramos(it, aj) / 100;
      kcal += (+ing.kcal||0)*f; hc += (+ing.hc||0)*f; prot += (+ing.proteina||0)*f;
      gras += (+ing.grasa||0)*f; fib += (+ing.fibra||0)*f;
    });
    return { kcal, hc, proteina:prot, grasa:gras, fibra:fib };
  }
  const b = tobRecMacros(r), f = aj.factor || 1;
  return { kcal:b.kcal*f, hc:b.hc*f, proteina:b.proteina*f, grasa:b.grasa*f, fibra:b.fibra*f };
}
// Treu ajustos de receptes que ja no són al menú.
function tobMcPruneAjustes(){
  if(!tobMcState || !tobMcState.ajustes) return;
  const usados = new Set();
  Object.values(tobMcState.data||{}).forEach(sem =>
    Object.values(sem||{}).forEach(dia =>
      Object.values(dia||{}).forEach(arr =>
        (arr||[]).forEach(id => usados.add(id)))));
  Object.keys(tobMcState.ajustes).forEach(id => {
    if(!usados.has(id) || !tobMcAjusteActivo(tobMcState.ajustes[id])) delete tobMcState.ajustes[id];
  });
}
function tobMcAjusteResumen(aj){
  const parts = [];
  if(aj.factor && Math.abs(aj.factor - 1) > 0.001){
    parts.push('ració ×' + (+aj.factor).toFixed(2).replace(/0+$/,'').replace(/\.$/,''));
  }
  if(aj.ing && Object.keys(aj.ing).length){
    Object.keys(aj.ing).forEach(ingId => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === ingId);
      parts.push((ing ? ing.nombre : 'ingredient') + ' ' + Math.round(aj.ing[ingId]) + ' g');
    });
  }
  return parts.join(' · ');
}

// ── Panell: racions ajustades (sota la graella) ────────────────
function tobMcRenderAjustes(){
  const box = document.getElementById('tobMcAjustesBox');
  if(!box || !tobMcState) return;
  tobMcPruneAjustes();
  const aj = tobMcState.ajustes || {};
  const ids = Object.keys(aj);
  if(!ids.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = '';
  const rows = ids.map(id => {
    const r = (tobMenusDB.recetas||[]).find(x => x.id === id);
    const a = aj[id];
    const nom = r ? r.nombre : '(recepta eliminada)';
    const rac = (r && r.raciones) || 1;
    let macTxt = '';
    if(r){
      const base = tobRecMacros(r), adj = tobMcMacros(r);
      macTxt = Math.round(base.kcal/rac) + '→<b>' + Math.round(adj.kcal/rac) + '</b> kcal · '
             + Math.round(base.proteina/rac) + '→<b>' + Math.round(adj.proteina/rac) + '</b> g prot';
    }
    return `<div class="tob-mc-aj-row">
      <span class="aj-src" title="${a.fuente==='ia'?'Ajust fet per la IA':'Ajust manual'}">${a.fuente==='ia'?'🤖':'✋'}</span>
      <div class="aj-info">
        <div class="aj-nm">${tobEsc(nom)}</div>
        <div class="aj-meta">${tobEsc(tobMcAjusteResumen(a))}${macTxt?'  ·  '+macTxt:''}</div>
        ${a.motiu?`<div class="aj-motiu">“${tobEsc(a.motiu)}”</div>`:''}
      </div>
      <button class="tob-action ghost btn-xs" onclick="tobMcOpenAjuste('${id}')" ${r?'':'disabled'} title="Editar">✏️</button>
      <button class="tob-action ghost btn-xs" onclick="tobMcQuitarAjuste('${id}')" style="color:#dc6a6a;" title="Treure ajust">✗</button>
    </div>`;
  }).join('');
  box.innerHTML = `<div class="tob-mc-aj-title">⚖ Racions ajustades <span>(${ids.length})</span></div>${rows}`;
}
function tobMcQuitarAjuste(id){
  if(!tobMcState || !tobMcState.ajustes) return;
  delete tobMcState.ajustes[id];
  tobMcRenderGrid();
  tobMcUpdateAllTotals();
  tobToast('Ajust tret', '');
}

// ═════════════════════════════════════════════════════════════════
// PANEL DE CUMPLIMENT — sempre visible al creador (no surt al PDF)
// ─────────────────────────────────────────────────────────────────
// Mostra a Sergio si el menú compleix els objectius del client de
// forma ràpida — mitjana setmanal kcal/prot + alertes de:
//   · Dies fora de marge (kcal o prot)
//   · Plats principals repetits a la setmana
//   · Esmorzar sense proteïna (mínim ~10g)
//   · Aliments que el client no menja (alimX o sentenMal) presents al menú
//   · Receptes amb el flag "descartada" que segueixen al menú
// Tot informatiu, no bloqueja res.
// ═════════════════════════════════════════════════════════════════
function tobMcRenderChecks(){
  const box = document.getElementById('tobMcChecksBox');
  if(!box || !tobMcState) return;
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  if(!cli){ box.innerHTML = ''; return; }

  // Objetivos: desde inputs visibles o desde el menú guardado.
  const kcalObj = parseFloat(document.getElementById('tobMcKcal')?.value) || 0;
  const protObj = parseFloat(document.getElementById('tobMcProt')?.value) || 0;
  const margen  = parseFloat(document.getElementById('tobMcMargen')?.value) || 10;
  if(!kcalObj){ box.innerHTML = ''; return; }   // sense objectiu no calcula

  const recsById = {};
  (tobMenusDB.recetas || []).forEach(r => { recsById[r.id] = r; });
  const ajMap = tobMcState.ajustes || {};

  // Vetos del cliente — lista de palabras a evitar (lowercase).
  const q = (cli.cuestionario || {});
  const t = q.tags || {};
  const vetos = [].concat(t.alimX || [], t.sentenMal || [])
    .filter(Boolean).map(s => String(s).toLowerCase());

  const semanas = tobMcState.semanas || 1;
  let kcalTot = 0, protTot = 0, diasContados = 0;
  const diasFuera = [];          // {sem, d, problemas}
  const platosCount = {};        // recId → veces
  const vetosDetectats = new Set();
  const descartadasUsadas = new Set();
  const esmorzarBajaProte = [];  // {sem, d, prot}
  const proteRepetidaDia = [];   // {sem, d, fuente}  Mateix tipus de prote a dinar i sopar
  const recordatoriIncomplet = []; // {sem, d, apat, chips missing}

  // Keywords per detectar fonts de proteïna principals (per check "mateix tipus al dia")
  const PROT_SOURCES = {
    pollastre: ['pollastre','pollo','gall','aviram','pavo','gall dindi'],
    vedella:   ['vedella','ternera','vaca','bou'],
    porc:      ['porc','cerdo','llom','xulla'],
    peix:      ['lluc','bacalla','tonyina','salmo','sardin','llenguad','peix','tonyin','dorada','llobarro'],
    llegum:    ['llentia','cigro','garbanzo','mongeta','llegum'],
    ous:       ['ou','truita','tortilla','huevo','revolt']
  };
  const detectFuente = (nombreRec) => {
    const n = String(nombreRec||'').toLowerCase();
    for(const [k, kws] of Object.entries(PROT_SOURCES)){
      if(kws.some(w => n.includes(w))) return k;
    }
    return null;
  };
  // Chips del recordatori per a cada base d'àpat
  const recChips = (q.recChips || {});

  for(let s = 0; s < semanas; s++){
    for(let d = 0; d < 7; d++){
      let kDia = 0, pDia = 0, tieneAlgo = false;
      const day = (tobMcState.data[s] || {})[d] || {};
      let protEsmorzar = 0;
      const fuentePorApat = {};   // baseMid → set de fuentes
      tobMcState.comidasIds.forEach(mid => {
        const arr = day[mid] || [];
        const baseMid = tobMcMealBase(mid);
        // Recordatori: verificar que els chips del client apareixen al dia
        const chips = recChips[baseMid] || [];
        if(chips.length){
          const arrNoms = arr.map(id => (recsById[id] && recsById[id].nombre) || '').join(' | ').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g,'');
          const missing = chips.filter(chip => {
            const kws = TOB_REC_CHIP_KEYWORDS[_tobMcNormChip(chip)];
            if(!kws || !kws.length) return false;  // chips abstractes (plat únic, etc.)
            return !kws.some(kw => arrNoms.includes(kw));
          });
          if(missing.length){
            recordatoriIncomplet.push({ s, d, apat: tobMcMealLabel(mid), missing });
          }
        }
        arr.forEach(recId => {
          const r = recsById[recId];
          if(!r) return;
          tieneAlgo = true;
          platosCount[recId] = (platosCount[recId] || 0) + 1;
          if(r.descartada) descartadasUsadas.add(recId);
          const m = tobMcMacros(r, ajMap);
          const rac = r.raciones || 1;
          kDia += m.kcal / rac;
          pDia += m.proteina / rac;
          if(baseMid === 'esmorzar') protEsmorzar += m.proteina / rac;
          // Detecta font de prote per a check "mateix tipus a dinar i sopar"
          const f = detectFuente(r.nombre);
          if(f && (baseMid === 'dinar' || baseMid === 'sopar')){
            if(!fuentePorApat[baseMid]) fuentePorApat[baseMid] = new Set();
            fuentePorApat[baseMid].add(f);
          }
          // Vetos: buscar en nombre de la receta y nombre de cada ingrediente
          if(vetos.length){
            const nomRec = String(r.nombre || '').toLowerCase();
            vetos.forEach(v => { if(v && nomRec.includes(v)) vetosDetectats.add(v); });
            (r.ingredientes || []).forEach(it => {
              const ing = (tobMenusDB.ingredientes || []).find(i => i.id === it.ingId);
              const nomIng = String((ing && ing.nombre) || it._nombreFallback || '').toLowerCase();
              vetos.forEach(v => { if(v && nomIng.includes(v)) vetosDetectats.add(v); });
            });
          }
        });
      });
      if(!tieneAlgo) continue;
      kcalTot += kDia; protTot += pDia; diasContados++;

      // Check: mateix tipus de prote a dinar i sopar del mateix dia (regla Sergio)
      const dinarF = fuentePorApat.dinar;
      const soparF = fuentePorApat.sopar;
      if(dinarF && soparF){
        const both = [...dinarF].filter(f => soparF.has(f));
        if(both.length) proteRepetidaDia.push({ s, d, fuente: both[0] });
      }

      const problemas = [];
      const tolKcal = kcalObj * margen / 100;
      if(Math.abs(kDia - kcalObj) > tolKcal){
        const sign = kDia < kcalObj ? '−' : '+';
        problemas.push(sign + Math.round(Math.abs(kDia - kcalObj)) + ' kcal');
      }
      if(protObj){
        const minProt = protObj * 0.9;
        if(pDia < minProt){
          problemas.push('−' + Math.round(protObj - pDia) + 'g prot');
        }
      }
      if(problemas.length) diasFuera.push({ s, d, problemas, kDia, pDia });
      if(protEsmorzar > 0 && protEsmorzar < 10){
        esmorzarBajaProte.push({ s, d, prot: protEsmorzar });
      }
    }
  }

  if(diasContados === 0){
    box.innerHTML = '';
    return;
  }

  const kcalMed = kcalTot / diasContados;
  const protMed = protTot / diasContados;
  const kcalDiff = kcalMed - kcalObj;
  const kcalOk = Math.abs(kcalDiff) <= kcalObj * margen / 100;
  const protOk = protObj ? protMed >= protObj * 0.9 : true;
  const repetidos = Object.entries(platosCount).filter(([_, n]) => n > 1).map(([id, n]) => {
    const r = recsById[id]; return { nombre: (r && r.nombre) || '(?)', n };
  });

  const DIAS = ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'];
  let alertasHtml = '';
  if(diasFuera.length){
    alertasHtml += '<div class="tob-mc-check-alert warn"><b>' + diasFuera.length + ' dia' + (diasFuera.length>1?'es':'') + ' fora de marge:</b> ' +
      diasFuera.map(f => 'Set ' + (f.s+1) + '·' + DIAS[f.d] + ' (' + f.problemas.join(', ') + ')').join(' · ') + '</div>';
  }
  if(esmorzarBajaProte.length){
    alertasHtml += '<div class="tob-mc-check-alert info">Esmorzar baix en proteïna (<10g): ' +
      esmorzarBajaProte.map(e => 'Set ' + (e.s+1) + '·' + DIAS[e.d] + ' (' + Math.round(e.prot) + 'g)').join(' · ') + '</div>';
  }
  if(repetidos.length){
    alertasHtml += '<div class="tob-mc-check-alert info"><b>Plats repetits:</b> ' +
      repetidos.map(r => tobEsc(r.nombre) + ' (×' + r.n + ')').join(' · ') + '</div>';
  }
  if(proteRepetidaDia.length){
    alertasHtml += '<div class="tob-mc-check-alert warn"><b>Mateixa font de prote a dinar i sopar:</b> ' +
      proteRepetidaDia.map(p => 'Set ' + (p.s+1) + '·' + DIAS[p.d] + ' (' + p.fuente + ')').join(' · ') + '</div>';
  }
  if(recordatoriIncomplet.length){
    // Agrupar per àpat per a no fer una llista enorme
    const porApat = {};
    recordatoriIncomplet.forEach(x => {
      const key = x.apat + ' — manca ' + x.missing.join(', ');
      if(!porApat[key]) porApat[key] = [];
      porApat[key].push('Set ' + (x.s+1) + '·' + DIAS[x.d]);
    });
    const lines = Object.entries(porApat).slice(0, 6).map(([k, dies]) =>
      '<div>· <b>' + k + '</b>: ' + dies.join(', ') + (dies.length>=7?' (totes)':'') + '</div>'
    );
    const totalIncomplets = Object.values(porApat).reduce((a,b) => a + b.length, 0);
    alertasHtml += '<div class="tob-mc-check-alert warn"><b>Recordatori del client no respectat (' + totalIncomplets + ' casos):</b>' + lines.join('') + '</div>';
  }
  if(vetosDetectats.size){
    alertasHtml += '<div class="tob-mc-check-alert bad"><b>⚠ Aliments vetats al menú:</b> ' +
      Array.from(vetosDetectats).join(', ') + ' — el client va dir que no els menja</div>';
  }
  if(descartadasUsadas.size){
    alertasHtml += '<div class="tob-mc-check-alert bad"><b>⚠ Receptes descartades utilitzades:</b> ' + descartadasUsadas.size + ' al menú</div>';
  }

  const kcalBadge = kcalOk
    ? `<span class="tob-mc-check-pill ok">✓ ${Math.round(kcalMed)} kcal/dia</span>`
    : `<span class="tob-mc-check-pill warn">⚠ ${Math.round(kcalMed)} kcal/dia (${kcalDiff>=0?'+':''}${Math.round(kcalDiff)})</span>`;
  const protBadge = !protObj ? ''
    : (protOk
        ? `<span class="tob-mc-check-pill ok">✓ ${Math.round(protMed)}g prot/dia</span>`
        : `<span class="tob-mc-check-pill warn">⚠ ${Math.round(protMed)}g prot/dia (objectiu ${protObj}g)</span>`);

  box.innerHTML = `
    <div class="tob-mc-checks-head">
      <span class="tob-mc-checks-title">📊 Cumpliment <span>(mitjana setmanal sobre ${diasContados} dies)</span></span>
      <div class="tob-mc-checks-pills">${kcalBadge}${protBadge}</div>
    </div>
    ${alertasHtml || '<div class="tob-mc-check-empty">✓ Tot quadra dins del marge</div>'}
  `;
}

// ── Modal: ajustar quantitats d'una recepta ────────────────────
let _tobMcAjusteId = null;
function tobMcOpenAjuste(recId){
  if(!tobMcState) return;
  const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
  if(!r){ tobToast('Recepta no trobada', 'red'); return; }
  _tobMcAjusteId = recId;
  if(!tobMcState.ajustes) tobMcState.ajustes = {};
  const aj = tobMcState.ajustes[recId] || { factor:1, ing:{} };
  const rac = r.raciones || 1;
  document.getElementById('tobMcAjusteNom').textContent = r.nombre || '—';
  document.getElementById('tobMcAjusteFactor').value = aj.factor || 1;
  document.getElementById('tobMcAjusteMotiu').value = aj.motiu || '';
  const ingBody = document.getElementById('tobMcAjusteIngs');
  const ings = r.ingredientes || [];
  if(ings.length){
    ingBody.innerHTML = ings.map(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      const nom = ing ? ing.nombre : (it._nombreFallback || '—');
      const baseG = +it.gramos || 0;
      const cur = (aj.ing && aj.ing[it.ingId] != null) ? Math.round(aj.ing[it.ingId]/rac) : '';
      return `<div class="tob-mc-aj-ing">
        <span class="aj-ing-nm">${tobEsc(nom)}</span>
        <span class="aj-ing-base">base ${Math.round(baseG/rac)} g</span>
        <input type="number" class="tob-input" data-ingid="${it.ingId}" data-base="${baseG}"
               placeholder="${Math.round(baseG/rac)}" value="${cur}" min="0" style="width:78px;"
               oninput="tobMcAjustePreview()">
      </div>`;
    }).join('');
  } else {
    ingBody.innerHTML = '<div style="color:var(--mute2);font-size:.72rem;padding:6px 2px;">Aquesta recepta no té desglossament d\'ingredients — només es pot escalar amb el factor.</div>';
  }
  tobMcAjustePreview();
  document.getElementById('tobMcAjusteBg').classList.add('on');
}
function tobMcAjusteLeerModal(){
  const r = (tobMenusDB.recetas||[]).find(x => x.id === _tobMcAjusteId);
  if(!r) return null;
  const rac = r.raciones || 1;
  const factor = tobMcClampFactor(document.getElementById('tobMcAjusteFactor').value);
  const ing = {};
  document.querySelectorAll('#tobMcAjusteIngs input[data-ingid]').forEach(inp => {
    const v = parseFloat(inp.value);
    if(isFinite(v) && v > 0){
      const base = +inp.dataset.base || 0;
      let g = v * rac;
      if(base > 0) g = Math.min(g, base * TOB_MC_ING_CAP);
      ing[inp.dataset.ingid] = Math.round(g);
    }
  });
  return { r, rac, aj: { factor, ing } };
}
function tobMcAjustePreview(){
  const data = tobMcAjusteLeerModal();
  if(!data) return;
  const { r, rac, aj } = data;
  document.getElementById('tobMcAjusteFactorVal').textContent = '×' + aj.factor.toFixed(2);
  const base = tobRecMacros(r);
  const adj = tobMcMacros(r, { [r.id]: aj });
  document.getElementById('tobMcAjustePreview').innerHTML =
    'Base: ' + Math.round(base.kcal/rac) + ' kcal · ' + Math.round(base.proteina/rac) + ' g prot'
    + '  →  <b style="color:var(--acc)">Ajustat: ' + Math.round(adj.kcal/rac) + ' kcal · '
    + Math.round(adj.proteina/rac) + ' g prot</b>';
}
function tobMcResetAjuste(){
  document.getElementById('tobMcAjusteFactor').value = 1;
  document.querySelectorAll('#tobMcAjusteIngs input[data-ingid]').forEach(inp => inp.value = '');
  document.getElementById('tobMcAjusteMotiu').value = '';
  tobMcAjustePreview();
}
function tobMcApplyAjuste(){
  if(!tobMcState || !_tobMcAjusteId) return;
  const data = tobMcAjusteLeerModal();
  if(!data) return;
  const aj = data.aj;
  aj.motiu = (document.getElementById('tobMcAjusteMotiu').value || '').trim();
  aj.fuente = 'manual';
  if(!tobMcState.ajustes) tobMcState.ajustes = {};
  if(tobMcAjusteActivo(aj)) tobMcState.ajustes[_tobMcAjusteId] = aj;
  else delete tobMcState.ajustes[_tobMcAjusteId];
  document.getElementById('tobMcAjusteBg').classList.remove('on');
  _tobMcAjusteId = null;
  tobMcRenderGrid();
  tobMcUpdateAllTotals();
  tobToast('✓ Ajust aplicat', 'green');
}

// Notas/recomanacions que se incluyen por defecto en el PDF del menú.
const TOB_MENU_NOTAS_DEFAULT =
  "- Les receptes es poden adaptar al teu gust: amb els mateixos ingredients del dia, prepara-la com més t'agradi.\n" +
  "- Les cremes i les verdures es poden variar lliurement (amanir-les, combinar-les, textures diferents...) — el valor nutricional gairebé no canvia.\n" +
  "- Esmorzars, mig matins i berenars són intercanviables entre dies: si un dia et ve de gust el d'un altre, cap problema.\n" +
  "- Davant de qualsevol dubte amb una recepta o una substitució, consulta'm.";

// Comidas/día del cliente, según los àpats elegidos en su cuestionario.
// Devuelve array de { id, label } en el orden de TOB_MEALS.
function tobMcComidasDelCliente(cli){
  const q = cli && cli.cuestionario || {};
  const sel = (q.tags && Array.isArray(q.tags.apats)) ? q.tags.apats : [];
  const ids = sel.length ? sel : TOB_MEALS_DEFAULT;
  return TOB_MEALS.filter(mDef => ids.includes(mDef.id))
                  .map(mDef => ({ id: mDef.id, label: mDef.label }));
}

// Setup inicial: poblar selector de cliente + listeners
function tobMcInit(){
  const sel = document.getElementById('tobMcCliente');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Selecciona cliente —</option>' +
    (tobDB.clientes || []).slice()
      .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}))
      .map(c => `<option value="${c.id}">${tobEsc(c.nombre)}</option>`).join('');
  if(cur && tobDB.clientes.find(c => c.id === cur)) sel.value = cur;
}

function tobMcOnClienteChange(){
  const cliId = document.getElementById('tobMcCliente').value;
  if(!cliId){
    tobMcHideWorkspace();
    return;
  }
  const cli = tobDB.clientes.find(c => c.id === cliId);
  if(!cli) return;
  // Pre-llenar kcal/prot desde el cuestionario si no están seteados
  const q = cli.cuestionario || {};
  if(q.kcalObjetivo && !document.getElementById('tobMcKcal').value)
    document.getElementById('tobMcKcal').value = q.kcalObjetivo;
  if(q.protObjetivo && !document.getElementById('tobMcProt').value)
    document.getElementById('tobMcProt').value = q.protObjetivo;

  // Mostrar comidas/día
  const comidas = tobMcComidasDelCliente(cli);
  document.getElementById('tobMcComidas').textContent =
    comidas.length + ' (' + comidas.map(c => c.label).join(' · ') + ')';

  // Hint con nombre cliente
  const hint = document.getElementById('tobMcClienteHint');
  const meta = [];
  if(cli.sexo) meta.push(cli.sexo === 'H' ? 'Home' : 'Dona');
  if(cli.idioma) meta.push('idioma ' + cli.idioma);
  hint.textContent = meta.join(' · ');

  // Resumen del perfil alimentario
  tobMcRenderPerfilResumen(cli);

  // Crear estado fresh
  const semanas = Math.max(1, parseInt(document.getElementById('tobMcSemanas').value) || 1);
  tobMcState = {
    cliId, semanas,
    comidasIds: comidas.map(c => c.id),
    semanaActiva: 0,
    notas: TOB_MENU_NOTAS_DEFAULT,
    ajustes: {},
    data: {}
  };
  // Inicializar estructura
  for(let s = 0; s < semanas; s++){
    tobMcState.data[s] = {};
    for(let d = 0; d < 7; d++){
      tobMcState.data[s][d] = {};
      comidas.forEach(c => { tobMcState.data[s][d][c.id] = []; });
    }
  }

  document.getElementById('tobMcWorkspace').style.display = '';
  _tobMcSideRestoreState();
  tobMcRenderSemanasTabs();
  tobMcRenderGrid();
  tobMcRenderSidePanel();
}

function tobMcHideWorkspace(){
  document.getElementById('tobMcWorkspace').style.display = 'none';
  document.getElementById('tobMcPerfilResumen').style.display = 'none';
  document.getElementById('tobMcClienteHint').textContent = '';
  document.getElementById('tobMcComidas').textContent = '—';
  tobMcState = null;
}

// Renderiza el resumen del perfil alimentario del cliente (lectura).
function tobMcRenderPerfilResumen(cli){
  const q = cli.cuestionario || {};
  const tags = q.tags || {};
  const blocks = [];

  if(tags.dieta){
    const lbl = ({omnivor:'Omnívor', vegetaria:'Vegetarià', vega:'Vegà', pescetaria:'Pescetarià', flexitaria:'Flexitarià'})[tags.dieta] || tags.dieta;
    blocks.push(`<strong style="color:var(--acc)">Dieta:</strong> ${tobEsc(lbl)}`);
  }
  const protRestric = (tags.proteina || []).filter(t => t.endsWith('_no'));
  if(protRestric.length){
    const lbls = protRestric.map(t => {
      const m = { carn_no:'sin carne roja', pollastre_no:'sin pollastre', peix_no:'sin pescado', marisc_no:'sin marisco', ous_no:'sin huevos', lactis_no:'sin lácteos' };
      return m[t] || t;
    });
    blocks.push(`<strong style="color:#dc6a6a">Restricciones:</strong> ${tobEsc(lbls.join(', '))}`);
  }
  const prefNeg = (tags.pref || []).filter(t => ['sense_gluten','sense_lactosa','sense_fruita_seca','sense_cuina'].includes(t));
  if(prefNeg.length){
    const lbls = prefNeg.map(t => ({sense_gluten:'sin gluten', sense_lactosa:'sin lactosa', sense_fruita_seca:'sin frutos secos', sense_cuina:'sin cocina'})[t]);
    blocks.push(`<strong style="color:#dc6a6a">Sin:</strong> ${tobEsc(lbls.join(', '))}`);
  }
  const prefPos = (tags.pref || []).filter(t => !['sense_gluten','sense_lactosa','sense_fruita_seca','sense_cuina'].includes(t));
  if(prefPos.length){
    blocks.push(`<strong style="color:var(--acc2)">Preferencias:</strong> ${tobEsc(prefPos.join(', '))}`);
  }
  if(tags.custom?.length){
    blocks.push(`<strong style="color:var(--acc2)">Etiquetas:</strong> ${tobEsc(tags.custom.join(', '))}`);
  }
  if(tags.patologies && tags.patologies.length){
    const items = (TOB_QUEST_CHIPS.patologies || {}).items || [];
    const lbls = tags.patologies.map(id => { const d = items.find(c => c.id === id); return d ? d.label : id; });
    blocks.push(`<strong style="color:#dc6a6a">Patologies:</strong> ${tobEsc(lbls.join(', '))}`);
  }
  if(tags.alergies && tags.alergies.length)  blocks.push(`<strong style="color:#dc6a6a">Al·lèrgies:</strong> ${tobEsc(tags.alergies.join(', '))}`);
  if(tags.alimX && tags.alimX.length)        blocks.push(`<strong style="color:#dc6a6a">Aliments ✗:</strong> ${tobEsc(tags.alimX.join(', '))}`);
  if(tags.alimOk && tags.alimOk.length)      blocks.push(`<strong style="color:var(--green)">Aliments ✓:</strong> ${tobEsc(tags.alimOk.join(', '))}`);
  if(tags.sentenMal && tags.sentenMal.length) blocks.push(`<strong style="color:#dc6a6a">Senten malament:</strong> ${tobEsc(tags.sentenMal.join(', '))}`);

  const el = document.getElementById('tobMcPerfilResumen');
  if(blocks.length){
    el.style.display = '';
    el.innerHTML = blocks.join(' &nbsp; · &nbsp; ');
  } else {
    el.style.display = '';
    el.innerHTML = '<span style="color:var(--mute2)">⚠ Este cliente no tiene cuestionario rellenado. Sin perfil no se puede filtrar bien las recetas — ve a la ficha y rellena al menos los aliments ✗/✓ y el perfil alimentari.</span>';
  }
}

// ── Compatibilidad receta ↔ perfil del cliente ──────────────────
// Devuelve { compat:bool, razones:[...] }. compat=false si la receta
// contiene aliments X, alérgenos prohibidos, o no encaja con la dieta
// del cliente (vegano/celiaco/etc).
function tobMcCheckCompat(rec, cli){
  if(!cli || !cli.cuestionario){ return { compat:true, razones:[] }; }
  const q = cli.cuestionario;
  const tags = q.tags || {};
  const razones = [];

  // 1. Aliments X / alergias / aliments que sienten mal — ahora son listas
  //    de chips. Match por nombre en ingredientes y nombre de receta.
  //    (q.alimX/alergias/sientenMal = compat con datos viejos sin migrar)
  const textosNegativos = [
    ...(tags.alimX || []), ...(tags.alergies || []), ...(tags.sentenMal || []),
    q.alimX, q.alergias, q.sientenMal
  ].filter(Boolean).join(',').toLowerCase()
    .split(/[,;\n]/).map(s => s.trim()).filter(s => s.length >= 3);
  if(textosNegativos.length){
    const haystack = (rec.nombre || '').toLowerCase() + ' ' +
      (rec.ingredientes||[]).map(it => {
        const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
        return ing ? ing.nombre.toLowerCase() : (it._nombreFallback || '').toLowerCase();
      }).join(' ');
    textosNegativos.forEach(neg => {
      if(haystack.includes(neg)) razones.push('contiene ' + neg);
    });
  }

  // 2. Tipo de dieta — vegano/vegetariano/pescetariano
  if(tags.dieta){
    const ingNames = (rec.ingredientes||[]).map(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      return ing ? ing.nombre.toLowerCase() : '';
    }).join(' ') + ' ' + (rec.nombre || '').toLowerCase();
    const isCarne   = /carne|pollo|cerdo|ternera|cordero|jamón|salchich|bacon|chorizo|embutid/i.test(ingNames);
    const isPescado = /pescado|atún|salmón|merluz|bacalao|sardin|gamba|marisc|calamar|pulpo/i.test(ingNames);
    const isLacteo  = /leche|queso|yogur|nata|mantequilla|mantega|kéfir|requesón|crème/i.test(ingNames);
    const isHuevo   = /huevo|ou\b|clara|yema/i.test(ingNames);
    if(tags.dieta === 'vega'){
      if(isCarne || isPescado || isLacteo || isHuevo) razones.push('no es vegana');
    } else if(tags.dieta === 'vegetaria'){
      if(isCarne || isPescado) razones.push('no es vegetariana');
    } else if(tags.dieta === 'pescetaria'){
      if(isCarne) razones.push('no es pescetariana');
    }
  }

  // 3. Restricciones de proteína (carn_no, peix_no, ous_no...)
  const protRestric = (tags.proteina || []).filter(t => t.endsWith('_no'));
  if(protRestric.length){
    const ingText = (rec.ingredientes||[]).map(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      return ing ? ing.nombre.toLowerCase() : '';
    }).join(' ') + ' ' + (rec.nombre || '').toLowerCase();
    const checks = {
      carn_no:      { regex:/carne|ternera|cerdo|cordero|jamón/i, lbl:'carne roja' },
      pollastre_no: { regex:/pollo|pollastre|pavo|aviar|aves/i,    lbl:'pollo' },
      peix_no:      { regex:/pescado|atún|salmón|merluz|bacalao|sardin/i, lbl:'pescado' },
      marisc_no:    { regex:/gamba|marisc|calamar|pulpo|mejillón|almeja/i, lbl:'marisco' },
      ous_no:       { regex:/huevo|ou\b|clara|yema/i, lbl:'huevos' },
      lactis_no:    { regex:/leche|queso|yogur|nata|mantequilla|mantega|kéfir/i, lbl:'lácteos' }
    };
    protRestric.forEach(p => {
      const c = checks[p];
      if(c && c.regex.test(ingText)) razones.push('contiene ' + c.lbl);
    });
  }

  // 4. Restricciones de alérgenos.
  //    REGLA DE SERGIO (de l'entrevista):
  //    · ALÈRGIES (lista libre `tags.alergies`) → EXCLOURE, innegociable.
  //    · INTOLERÀNCIES (`tags.pref` amb sense_gluten/sense_lactosa) → NO exclou
  //      la recepta. El client farà servir versió apta (pa sense gluten, llet
  //      sense lactosa). El menú expressa la idea, el client tria l'ingredient
  //      apte al supermercat.
  //    · `sense_fruita_seca` és típicament alèrgia severa — el deixem
  //      exclusiu (no és el cas de gluten/lactosa).
  const apt = tobRecAptitud(rec);
  const cliAlergies = (tags.alergies || []).join(' · ').toLowerCase();
  const intol = tags.intolerancia || [];
  // Només alèrgies (lista libre `tags.alergies`) exclouen rotundament.
  // Les intoleràncies (`tags.intolerancia`) NO exclouen — el menú s'adapta amb
  // versions aptes (pa sense gluten, llet sense lactosa, etc.). Excepció:
  // fruita seca i crustacis amb intolerància són tractats com alèrgia perquè
  // típicament són reacció real (no només mala digestió).
  const evita = {
    gluten:     /gluten|cel[ií]a/.test(cliAlergies),
    lactosa:    /lact|llet|leche/.test(cliAlergies),
    fruitsSecs: intol.includes('fruita_seca') || /fruit[a-z]*\s*sec|fruto[a-z]*\s*seco|\bnut/.test(cliAlergies),
    ou:         /\bou\b|\bous\b|huevo/.test(cliAlergies),
    marisc:     intol.includes('crustacis') || /marisc|crustaci|crust[aá]ce|mol·?lusc|molusc/.test(cliAlergies),
    soja:       intol.includes('soja') || /soja|soia/.test(cliAlergies)
  };
  const aptLbl = { gluten:'gluten', lactosa:'lactosa', fruitsSecs:'fruits secs', ou:'ou', marisc:'marisc', soja:'soja' };
  Object.keys(aptLbl).forEach(k => {
    if(evita[k] && apt[k]) razones.push('conté ' + aptLbl[k]);
  });
  // Fallback si la receta no tiene alérgenos ICNS: regex de ingredientes.
  // Aplicat NOMÉS quan hi ha alèrgia formal (no per pref/intolerància).
  if(!(Array.isArray(rec.alergenos) && rec.alergenos.length)){
    const ingText = (rec.ingredientes||[]).map(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      return ing ? ing.nombre.toLowerCase() : '';
    }).join(' ') + ' ' + (rec.nombre || '').toLowerCase();
    if(evita.gluten  && !apt.gluten  && /trigo|\bpa\b|\bpan\b|pasta|harina|gluten/.test(ingText)) razones.push('possible gluten');
    if(evita.lactosa && !apt.lactosa && /leche|llet|queso|formatge|yogur|iogurt|\bnata\b/.test(ingText)) razones.push('possible lactosa');
  }

  return { compat: razones.length === 0, razones };
}

// ── Render: tabs de semanas ─────────────────────────────────────
function tobMcRenderSemanasTabs(){
  const cont = document.getElementById('tobMcSemanasTabs');
  if(!cont || !tobMcState) return;
  cont.innerHTML = '';
  for(let i = 0; i < tobMcState.semanas; i++){
    const btn = document.createElement('button');
    btn.textContent = 'S' + (i+1);
    btn.className = i === tobMcState.semanaActiva ? 'active' : '';
    btn.onclick = () => { tobMcState.semanaActiva = i; tobMcRenderSemanasTabs(); tobMcRenderGrid(); };
    cont.appendChild(btn);
  }
  document.getElementById('tobMcSemanaActiva').textContent = 'Setmana ' + (tobMcState.semanaActiva + 1);
}

// ── Render: tabla del menú (días × comidas) ────────────────────
function tobMcRenderGrid(){
  if(!tobMcState) return;
  // Ajustar semanas si el usuario cambió el número
  const semanasInput = Math.max(1, parseInt(document.getElementById('tobMcSemanas').value) || 1);
  if(semanasInput !== tobMcState.semanas){
    for(let s = tobMcState.semanas; s < semanasInput; s++){
      tobMcState.data[s] = {};
      for(let d = 0; d < 7; d++){
        tobMcState.data[s][d] = {};
        tobMcState.comidasIds.forEach(cid => { tobMcState.data[s][d][cid] = []; });
      }
    }
    if(semanasInput < tobMcState.semanas){
      for(let s = semanasInput; s < tobMcState.semanas; s++) delete tobMcState.data[s];
    }
    tobMcState.semanas = semanasInput;
    if(tobMcState.semanaActiva >= semanasInput) tobMcState.semanaActiva = semanasInput - 1;
    tobMcRenderSemanasTabs();
  }

  const grid = document.getElementById('tobMcGrid');
  if(!grid) return;
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  // Las comidas del menú salen del estado (permite àpats extra), no se
  // re-derivan del cuestionario.
  const comidas = (tobMcState.comidasIds || []).map(id => ({ id, label: tobMcMealLabel(id) }));
  const sem = tobMcState.semanaActiva;

  // grid layout: 1 col label comida + 7 cols días = 8 columnas
  grid.style.gridTemplateColumns = '100px repeat(7, minmax(135px, 1fr))';
  let html = '';
  // Fila header con días
  html += `<div class="tob-mc-grid-row">
    <div class="tob-mc-cell-meal-lbl"></div>
    ${TOB_MC_DIAS.map((d, i) => `<div class="tob-mc-grid-header">${d}</div>`).join('')}
  </div>`;
  // Fila por comida
  comidas.forEach(comida => {
    html += `<div class="tob-mc-grid-row">`;
    html += `<div class="tob-mc-cell-meal-lbl">${tobEsc(comida.label)}</div>`;
    for(let d = 0; d < 7; d++){
      const items = tobMcState.data[sem]?.[d]?.[comida.id] || [];
      const itemsHtml = items.map((recId, ix) => {
        const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
        if(!r) return `<div class="tob-mc-cell-item" data-rec="${recId}"><div class="mc-it-body"><div class="mc-it-nm">(eliminada)</div></div><button class="x" onclick="event.stopPropagation();tobMcRemoveItem(${d},'${comida.id}',${ix})">×</button></div>`;
        const m = tobMcMacros(r);
        const rac = r.raciones || 1;
        const kcalPer = Math.round(m.kcal / rac);
        const protPer = Math.round(m.proteina / rac);
        const aj = (tobMcState.ajustes||{})[recId];
        const ajustada = tobMcAjusteActivo(aj);
        const ajBadge = ajustada ? `<span class="mc-it-aj" title="Ració ajustada: ${tobEsc(tobMcAjusteResumen(aj))}">⚖</span>` : '';
        // ⚠ stale: la recepta s'ha editat al catàleg després de guardar aquest menú.
        // Les macros mostrades són les del catàleg actual; el menú podria no
        // estar quadrant les kcal/prot que es van calcular originalment.
        const savedAtMs = tobMcState._savedAt ? Date.parse(tobMcState._savedAt) : 0;
        const stale = savedAtMs && r._editTs && r._editTs > savedAtMs;
        const staleBadge = stale ? `<span class="mc-it-stale" title="La recepta s'ha modificat després de desar el menú">⚠</span>` : '';
        return `<div class="tob-mc-cell-item${ajustada?' ajustada':''}${stale?' stale':''}" data-rec="${recId}" onclick="tobMcOpenAjuste('${recId}')" title="${tobEsc(r.nombre)} · ${kcalPer} kcal · ${protPer}g prot — clica per ajustar quantitats">
          <button class="swap" onclick="event.stopPropagation();tobMcOpenSwap(${d},'${comida.id}',${ix})" title="Canviar per una alternativa">🔄</button>
          <button class="x" onclick="event.stopPropagation();tobMcRemoveItem(${d},'${comida.id}',${ix})" title="Eliminar">×</button>
          ${staleBadge}
          <div class="mc-it-foto placeholder" data-foto-rec="${recId}">${tobEsc((r.nombre||'?').slice(0,2).toUpperCase())}</div>
          <div class="mc-it-body">
            <div class="mc-it-nm">${ajBadge}${tobEsc(r.nombre || '—')}</div>
            <div class="mc-it-mac">${kcalPer} kcal · ${protPer}g prot</div>
          </div>
        </div>`;
      }).join('');
      // Resumen de macros de la celda (este àpat, este día)
      let ck=0, cp=0, ch=0, cg=0;
      items.forEach(recId => {
        const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
        if(!r) return;
        const m = tobMcMacros(r); const rac = r.raciones || 1;
        ck += m.kcal/rac; cp += m.proteina/rac; ch += m.hc/rac; cg += m.grasa/rac;
      });
      const cellSum = items.length
        ? `<div class="tob-mc-cell-sum">${Math.round(ck)} kcal · ${Math.round(cp)}P · ${Math.round(ch)}H · ${Math.round(cg)}G</div>`
        : '';
      html += `<div class="tob-mc-cell" data-day="${d}" data-meal="${comida.id}">${itemsHtml}${cellSum}</div>`;
    }
    html += `</div>`;
  });
  // Fila totales del día
  html += `<div class="tob-mc-grid-row">`;
  html += `<div class="tob-mc-cell-meal-lbl">Total</div>`;
  for(let d = 0; d < 7; d++){
    html += `<div class="tob-mc-cell-totals" id="tobMcTot_${d}"><div class="row"><span class="kcal-val">—</span></div></div>`;
  }
  html += `</div>`;
  grid.innerHTML = html;
  tobHydrateFotos('#tobMcGrid');

  // Habilitar drag&drop en cada celda
  if(typeof Sortable !== 'undefined'){
    grid.querySelectorAll('.tob-mc-cell').forEach(cell => {
      new Sortable(cell, {
        group: { name: 'menu', pull: true, put: true },
        animation: 150,
        ghostClass: 'tob-sortable-ghost',
        filter: '.tob-mc-cell-sum',   // el resumen de la celda no se arrastra
        onAdd: (ev) => {
          const recId = ev.item.dataset.rec;
          const day = +cell.dataset.day;
          const meal = cell.dataset.meal;
          if(!tobMcState.data[sem][day][meal].includes(recId)){
            tobMcState.data[sem][day][meal].push(recId);
          }
          // Si vino del panel lateral, ev.item se reposiciona en la celda — re-render para limpiar
          tobMcRenderGrid();
          tobMcUpdateAllTotals();
        }
      });
    });
  }

  tobMcUpdateAllTotals();
  tobMcRenderAjustes();
  tobMcRenderChecks();
}

function tobMcRemoveItem(day, mealId, ix){
  if(!tobMcState) return;
  const arr = tobMcState.data[tobMcState.semanaActiva]?.[day]?.[mealId];
  if(arr) arr.splice(ix, 1);
  tobMcRenderGrid();
  tobMcUpdateAllTotals();
}

// Recalcula totales kcal/prot/hc/grasa por día + aplica color semáforo.
function tobMcUpdateAllTotals(){
  if(!tobMcState) return;
  const kcalObj  = parseFloat(document.getElementById('tobMcKcal')?.value) || 0;
  const margen   = parseFloat(document.getElementById('tobMcMargen')?.value) || 10;
  const sem      = tobMcState.semanaActiva;
  for(let d = 0; d < 7; d++){
    let kcal=0, prot=0, hc=0, gras=0;
    tobMcState.comidasIds.forEach(mid => {
      const arr = tobMcState.data[sem]?.[d]?.[mid] || [];
      arr.forEach(recId => {
        const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
        if(!r) return;
        // Macros amb ajustos del menú (factor i grams per ingredient).
        const m = tobMcMacros(r);
        const rac = r.raciones || 1;
        // Asumimos 1 ración del plato por slot
        kcal += m.kcal / rac;
        prot += m.proteina / rac;
        hc   += m.hc / rac;
        gras += m.grasa / rac;
      });
    });
    const el = document.getElementById('tobMcTot_' + d);
    if(!el) continue;
    if(kcal <= 0){
      el.className = 'tob-mc-cell-totals empty';
      el.innerHTML = '<div class="row"><span class="kcal-val">—</span></div>';
      continue;
    }
    // Semáforo: ok si dentro de ±margen del objetivo, warn si dentro de ±2margen, bad fuera
    let cls = 'empty';
    if(kcalObj > 0){
      const delta = Math.abs(kcal - kcalObj);
      const tol1 = kcalObj * margen / 100;
      const tol2 = kcalObj * margen * 2 / 100;
      if(delta <= tol1) cls = 'ok';
      else if(delta <= tol2) cls = 'warn';
      else cls = 'bad';
    } else {
      cls = '';
    }
    el.className = 'tob-mc-cell-totals ' + cls;
    el.innerHTML = `
      <div class="row"><span class="kcal-val">${Math.round(kcal)}</span><span>kcal</span></div>
      <div class="row"><span>P</span><span>${Math.round(prot)}g</span></div>
      <div class="row"><span>H</span><span>${Math.round(hc)}g</span></div>
      <div class="row"><span>G</span><span>${Math.round(gras)}g</span></div>
    `;
  }
  // Repintar el panel de cumplimiento — quan canvia un input del bloc
  // "Objectiu kcal/Margen/Prot" sense re-renderitzar la graella, els checks
  // del compliment han d'actualitzar-se igualment.
  if(typeof tobMcRenderChecks === 'function') tobMcRenderChecks();
}

// ─── Toggle del panel lateral del creador de menús ─────────────
// Sergio: poder plegar el panel per a tenir més espai per a la graella
// del menú. L'estat es manté entre sessions (localStorage).
function tobMcSideToggle(){
  const card = document.getElementById('tobMcSideCard');
  if(!card) return;
  card.classList.toggle('collapsed');
  const collapsed = card.classList.contains('collapsed');
  try { localStorage.setItem('tob_mc_side_collapsed', collapsed ? '1' : '0'); } catch(e){}
  const btn = document.getElementById('tobMcSideToggle');
  if(btn) btn.textContent = collapsed ? '◄' : '►';
  // Si l'usuari plega, també pleguem el layout per a què la graella aprofiti
  // tot l'espai. Si desplega, restaurem.
  const layout = document.querySelector('.tob-mc-layout');
  if(layout) layout.classList.toggle('side-collapsed', collapsed);
}
// Restaurar l'estat plegat/desplegat en cada render del workspace.
function _tobMcSideRestoreState(){
  try {
    const v = localStorage.getItem('tob_mc_side_collapsed');
    if(v === '1'){
      const card = document.getElementById('tobMcSideCard');
      if(card && !card.classList.contains('collapsed')){
        card.classList.add('collapsed');
        const btn = document.getElementById('tobMcSideToggle');
        if(btn) btn.textContent = '◄';
        const layout = document.querySelector('.tob-mc-layout');
        if(layout) layout.classList.add('side-collapsed');
      }
    }
  } catch(e){}
}
// Anar directament al separador d'ingredients simples sense haver de fer scroll.
function tobMcSideGoToIngs(){
  // Si el panel està plegat, el despleguem primer
  const card = document.getElementById('tobMcSideCard');
  if(card && card.classList.contains('collapsed')) tobMcSideToggle();
  const sep = document.querySelector('#tobMcSidePanel .tob-mc-side-sep');
  if(sep){
    sep.scrollIntoView({ behavior:'smooth', block:'start' });
    // Highlight breu per ajudar a localitzar visualment
    sep.style.transition = 'background-color .25s';
    const orig = sep.style.backgroundColor;
    sep.style.backgroundColor = 'var(--acc-soft, rgba(245,167,33,.18))';
    setTimeout(() => { sep.style.backgroundColor = orig || ''; }, 1200);
  } else {
    tobToast('No hi ha ingredients simples al catàleg actual. Marca\'n al modal d\'ingredient.', '');
  }
}

// ── Render: panel lateral con recetas ──────────────────────────
function tobMcFilterMomento(mom, btn){
  _tobMcMomentoFiltro = mom;
  document.querySelectorAll('.tob-mc-mom-btn').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  tobMcRenderSidePanel();
}

function tobMcRenderSidePanel(){
  const panel = document.getElementById('tobMcSidePanel');
  if(!panel || !tobMcState) return;
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  const search = (document.getElementById('tobMcRecSearch')?.value || '').trim().toLowerCase();
  const filtrarPerfil = document.getElementById('tobMcFiltrarPerfil')?.checked;

  // Las recetas descartadas no aparecen en el creador.
  const all = (tobMenusDB.recetas || []).filter(r => !r.descartada);
  const matchSearch = r => !search ||
    (r.nombre || '').toLowerCase().includes(search) ||
    (r.tags || []).some(t => t.toLowerCase().includes(search));
  // Recetes normals: respecten el filtre de moment.
  let listRec = all.filter(r => r.origen !== 'ingrediente' && matchSearch(r));
  if(_tobMcMomentoFiltro){
    listRec = listRec.filter(r => (r.momentos || []).includes(_tobMcMomentoFiltro));
  }
  // Plats solts (origen ingredient): també respecten el filtre de moment ara
  // que tenen _iaMomentos sincronitzats amb r.momentos. Si no tenen moments
  // assignats (legacy), apareixen sempre (comodí).
  let listIng = all.filter(r => r.origen === 'ingrediente' && matchSearch(r));
  if(_tobMcMomentoFiltro){
    listIng = listIng.filter(r => {
      const moms = r.momentos || [];
      return !moms.length || moms.includes(_tobMcMomentoFiltro);
    });
  }

  const evaluar = arr => arr.map(r => ({
    rec: r,
    check: cli ? tobMcCheckCompat(r, cli) : { compat:true, razones:[] }
  })).sort((a,b) => {
    if(a.check.compat !== b.check.compat) return a.check.compat ? -1 : 1;
    return (a.rec.nombre||'').localeCompare(b.rec.nombre||'','es',{sensitivity:'base'});
  });
  let evalRec = evaluar(listRec);
  let evalIng = evaluar(listIng);
  if(filtrarPerfil){
    evalRec = evalRec.filter(e => e.check.compat);
    evalIng = evalIng.filter(e => e.check.compat);
  }

  const cnt = document.getElementById('tobMcRecCount');
  if(cnt) cnt.textContent = `(${evalRec.length + evalIng.length})`;

  const renderItem = ({rec: r, check}) => {
    const m = tobRecMacros(r);
    const kcalPer = Math.round(m.kcal / (r.raciones || 1));
    const thumbInner = (r.nombre || '?').slice(0,2).toUpperCase();
    const incompatBadge = check.compat ? '' :
      `<span class="badge-incompat" title="${tobEsc(check.razones.join(' · '))}">⚠</span>`;
    const favBadge = r.favorito ? '<span class="tob-mc-side-fav" title="Favorita">★</span>' : '';
    const cls = check.compat ? '' : 'incompat';
    return `<div class="tob-mc-side-item ${cls}" data-rec="${r.id}" title="${tobEsc(r.nombre)}${check.razones.length ? '\\n⚠ ' + check.razones.join(' · ') : ''}">
      <div class="thumb placeholder" data-foto-rec="${r.id}">${tobEsc(thumbInner)}</div>
      <div class="info">
        <div class="nm">${favBadge}${tobEsc(r.nombre || '—')}</div>
        <div class="mac">${kcalPer} kcal · ${Math.round(m.proteina / (r.raciones||1))}p</div>
      </div>
      ${incompatBadge}
    </div>`;
  };
  // Plats solts: tipografia més petita i compacta, perquè com diu Sergio
  // "no son tan importantes". Mateixa funcionalitat (drag, click).
  const renderItemMini = ({rec: r, check}) => {
    const m = tobRecMacros(r);
    const kcalPer = Math.round(m.kcal / (r.raciones || 1));
    const thumbInner = (r.nombre || '?').slice(0,2).toUpperCase();
    const incompatBadge = check.compat ? '' :
      `<span class="badge-incompat" title="${tobEsc(check.razones.join(' · '))}">⚠</span>`;
    const cls = check.compat ? '' : 'incompat';
    return `<div class="tob-mc-side-item mini ${cls}" data-rec="${r.id}" title="${tobEsc(r.nombre)}${check.razones.length ? '\\n⚠ ' + check.razones.join(' · ') : ''}">
      <div class="thumb placeholder mini" data-foto-rec="${r.id}">${tobEsc(thumbInner)}</div>
      <div class="info">
        <div class="nm">∙ ${tobEsc(r.nombre || '—')}</div>
        <div class="mac">${kcalPer}k · ${Math.round(m.proteina / (r.raciones||1))}p</div>
      </div>
      ${incompatBadge}
    </div>`;
  };

  let html = evalRec.map(renderItem).join('');
  if(evalIng.length){
    html += `<div class="tob-mc-side-sep">∙ Ingredients solts <span>(${evalIng.length} · arrossega per inserir-los)</span></div>`
          + evalIng.map(renderItemMini).join('');
  }
  panel.innerHTML = html ||
    '<div style="text-align:center;color:var(--mute2);padding:18px;font-family:DM Mono,monospace;font-size:.7rem;">Sin recetas que coincidan con los filtros.</div>';
  tobHydrateFotos('#tobMcSidePanel');

  // Habilitar drag desde el panel lateral
  if(typeof Sortable !== 'undefined'){
    new Sortable(panel, {
      group: { name: 'menu', pull: 'clone', put: false },
      sort: false,
      animation: 150,
      ghostClass: 'tob-sortable-ghost',
      draggable: '.tob-mc-side-item'   // el separador no se arrastra
    });
  }
}

// ── Vaciar / guardar / cargar menús ─────────────────────────────
function tobMcClearSemana(){
  if(!tobMcState) return;
  if(!confirm('Vaciar todas las celdas de esta semana?')) return;
  const sem = tobMcState.semanaActiva;
  Object.keys(tobMcState.data[sem] || {}).forEach(d => {
    tobMcState.comidasIds.forEach(cid => { tobMcState.data[sem][d][cid] = []; });
  });
  tobMcRenderGrid();
}

// ── Àpats del menú: elegir qué comidas tiene (incl. 2ª mig matí/berenar)
function tobMcOpenMealsModal(){
  if(!tobMcState){ tobToast('Selecciona un client primer', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  const apatsCuest = (cli && cli.cuestionario && cli.cuestionario.tags && cli.cuestionario.tags.apats) || [];
  const cur = new Set(tobMcState.comidasIds || []);
  // Indica al costat de cada àpat si el client el té marcat al qüestionari.
  // Així Sergio detecta de seguida quan el menú difereix del qüestionari.
  document.getElementById('tobMcMealsBody').innerHTML = TOB_MEALS.map(d => {
    const enCuest = apatsCuest.includes(d.id);
    const enMenu  = cur.has(d.id);
    const tag = enCuest && !enMenu ? ' <span class="tob-mc-meal-hint warn">⚠ al qüestionari però no al menú</span>' :
                !enCuest && enMenu ? ' <span class="tob-mc-meal-hint info">no al qüestionari</span>' :
                enCuest ? ' <span class="tob-mc-meal-hint ok">✓ al qüestionari</span>' : '';
    return `<label style="display:flex;align-items:center;gap:9px;padding:7px 4px;cursor:pointer;font-size:.86rem;border-bottom:1px solid var(--line);">
      <input type="checkbox" id="tobMcMeal_${d.id}" ${enMenu?'checked':''} style="accent-color:var(--acc);">
      <span>${tobEsc(d.label)}${tag}</span>
    </label>`;
  }).join('');
  // Botó "Sincronitzar amb cuestionario" — útil si Sergio ha canviat els
  // àpats del cliente al qüestionari i vol reflectir-ho al menú actual.
  const syncBtn = document.getElementById('tobMcMealsSyncBtn');
  if(syncBtn){
    syncBtn.style.display = apatsCuest.length ? '' : 'none';
    syncBtn.onclick = () => {
      TOB_MEALS.forEach(d => {
        const el = document.getElementById('tobMcMeal_'+d.id);
        if(el) el.checked = apatsCuest.includes(d.id);
      });
      tobToast('Àpats sincronitzats amb el qüestionari. Prem Aplicar per confirmar.', '');
    };
  }
  document.getElementById('tobMcMealsModalBg').classList.add('on');
}
// ── Notes/recomanacions del menú (apareixen al PDF) ────────────
function tobMcOpenNotasModal(){
  if(!tobMcState){ tobToast('Selecciona un client primer', 'red'); return; }
  document.getElementById('tobMcNotasText').value =
    tobMcState.notas != null ? tobMcState.notas : TOB_MENU_NOTAS_DEFAULT;
  document.getElementById('tobMcNotasModalBg').classList.add('on');
}
function tobMcApplyNotas(){
  if(!tobMcState) return;
  tobMcState.notas = document.getElementById('tobMcNotasText').value;
  document.getElementById('tobMcNotasModalBg').classList.remove('on');
  tobToast('✓ Notes actualitzades', 'green');
}

function tobMcApplyMeals(){
  if(!tobMcState) return;
  const checked = TOB_MEALS
    .filter(d => { const el = document.getElementById('tobMcMeal_'+d.id); return el && el.checked; })
    .map(d => d.id);
  if(!checked.length){ tobToast('Selecciona almenys un àpat', 'red'); return; }
  tobMcState.comidasIds = checked;
  // Asegurar arrays en data para todos los àpats y semanas
  for(let s = 0; s < tobMcState.semanas; s++){
    if(!tobMcState.data[s]) tobMcState.data[s] = {};
    for(let d = 0; d < 7; d++){
      if(!tobMcState.data[s][d]) tobMcState.data[s][d] = {};
      checked.forEach(id => { if(!Array.isArray(tobMcState.data[s][d][id])) tobMcState.data[s][d][id] = []; });
    }
  }
  const cm = document.getElementById('tobMcComidas');
  if(cm) cm.textContent = checked.length + ' (' + checked.map(tobMcMealLabel).join(' · ') + ')';
  document.getElementById('tobMcMealsModalBg').classList.remove('on');
  tobMcRenderGrid();
  tobMcUpdateAllTotals();
  tobToast('✓ Àpats actualitzats', 'green');
}

function tobMcSave(){
  if(!tobMcState){ tobToast('Selecciona un cliente primero', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  if(!cli){ tobToast('Cliente no encontrado', 'red'); return; }
  if(!cli.menus) cli.menus = [];

  const snapshot = {
    id: tobMcState._menuId || tobUid('menu'),
    fecha: new Date().toISOString().slice(0,10),
    cliId: tobMcState.cliId,
    semanas: tobMcState.semanas,
    comidasIds: tobMcState.comidasIds.slice(),
    kcalObj:  parseFloat(document.getElementById('tobMcKcal').value) || null,
    margenPct:parseFloat(document.getElementById('tobMcMargen').value) || 10,
    protObj:  parseFloat(document.getElementById('tobMcProt').value) || null,
    notas:    tobMcState.notas != null ? tobMcState.notas : TOB_MENU_NOTAS_DEFAULT,
    data:     JSON.parse(JSON.stringify(tobMcState.data)),
    ajustes:  JSON.parse(JSON.stringify(tobMcState.ajustes || {})),
    savedAt:  new Date().toISOString()
  };
  // Update si ya existe, insert si no
  const ix = cli.menus.findIndex(m => m.id === snapshot.id);
  if(ix >= 0) cli.menus[ix] = snapshot;
  else cli.menus.unshift(snapshot);
  tobMcState._menuId = snapshot.id;
  tobSave();
  // Refrescar la ficha del cliente (si está abierta) y la pestaña de menús
  if(typeof tobFichaRenderMenus === 'function') tobFichaRenderMenus();
  if(typeof tobMenusGuardadosRender === 'function') tobMenusGuardadosRender();
  tobToast(`✓ Menú guardado en ${cli.nombre}`, 'green');
}

function tobMcShowList(){
  const cliSel = document.getElementById('tobMcCliente').value;
  if(!cliSel){ tobToast('Selecciona un cliente primero', 'red'); return; }
  const cli = tobDB.clientes.find(c => c.id === cliSel);
  if(!cli){ return; }
  const menus = (cli.menus || []).slice().sort((a,b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
  const body = document.getElementById('tobMcListBody');
  if(!menus.length){
    body.innerHTML = '<div style="text-align:center;color:var(--mute2);padding:30px;font-family:DM Mono,monospace;font-size:.8rem;">Este cliente aún no tiene menús guardados.</div>';
  } else {
    body.innerHTML = menus.map(m => {
      const fecha = (m.savedAt || m.fecha || '').slice(0, 10);
      const hora  = (m.savedAt || '').slice(11, 16);
      // Cuenta recetas totales
      let n = 0;
      Object.values(m.data || {}).forEach(sem => {
        Object.values(sem || {}).forEach(dia => {
          Object.values(dia || {}).forEach(arr => { if(Array.isArray(arr)) n += arr.length; });
        });
      });
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);border-radius:5px;margin-bottom:6px;">
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--text);font-size:.85rem;">${tobEsc(fecha)} ${tobEsc(hora)}</div>
          <div style="font-size:.7rem;color:var(--mute);font-family:DM Mono,monospace;">${m.semanas} sem · ${n} recetas · ${m.kcalObj || '—'} kcal/día · ${m.protObj || '—'} g prot</div>
        </div>
        <button class="tob-action ghost btn-xs" onclick="tobMcLoadMenu('${m.id}')">Cargar</button>
        <button class="tob-action ghost btn-xs" onclick="tobMcDeleteMenu('${m.id}')" style="color:#dc6a6a;border-color:#7a2424;">🗑</button>
      </div>`;
    }).join('');
  }
  document.getElementById('tobMcListModalBg').classList.add('on');
}

function tobMcLoadMenu(menuId){
  const cliSel = document.getElementById('tobMcCliente').value;
  const cli = tobDB.clientes.find(c => c.id === cliSel);
  const m = cli?.menus?.find(x => x.id === menuId);
  if(!m){ tobToast('Menú no encontrado', 'red'); return; }
  tobMcState = {
    cliId: cliSel,
    semanas: m.semanas || 1,
    comidasIds: m.comidasIds || tobMcComidasDelCliente(cli).map(c => c.id),
    semanaActiva: 0,
    data: JSON.parse(JSON.stringify(m.data || {})),
    ajustes: JSON.parse(JSON.stringify(m.ajustes || {})),
    notas: m.notas != null ? m.notas : TOB_MENU_NOTAS_DEFAULT,
    _menuId: m.id,
    // Es preserva per comparar amb _editTs de cada receta del catàleg i
    // detectar canvis en la BD posteriors al desament del menú.
    _savedAt: m.savedAt || m.fecha || null
  };
  document.getElementById('tobMcSemanas').value = m.semanas || 1;
  if(m.kcalObj) document.getElementById('tobMcKcal').value = m.kcalObj;
  if(m.margenPct != null) document.getElementById('tobMcMargen').value = m.margenPct;
  if(m.protObj) document.getElementById('tobMcProt').value = m.protObj;
  document.getElementById('tobMcWorkspace').style.display = '';
  document.getElementById('tobMcListModalBg').classList.remove('on');
  tobMcRenderSemanasTabs();
  tobMcRenderGrid();
  tobMcRenderSidePanel();
  tobToast(`✓ Menú del ${(m.savedAt||'').slice(0,10)} cargado`, 'green');
}

function tobMcDeleteMenu(menuId){
  const cliSel = document.getElementById('tobMcCliente').value;
  const cli = tobDB.clientes.find(c => c.id === cliSel);
  if(!cli || !cli.menus) return;
  const m = cli.menus.find(x => x.id === menuId);
  if(!m) return;
  if(!confirm(`Eliminar menú del ${(m.savedAt||'').slice(0,10)}?`)) return;
  cli.menus = cli.menus.filter(x => x.id !== menuId);
  tobSave();
  tobMcShowList();
  tobToast('Menú eliminado', '');
}

// ═════════════════════════════════════════════════════════════════
// MENÚS GUARDADOS — pestaña con todos los menús de todos los clientes
// ═════════════════════════════════════════════════════════════════
function tobMenuCountRecetas(m){
  let n = 0;
  Object.values((m && m.data) || {}).forEach(sem =>
    Object.values(sem || {}).forEach(dia =>
      Object.values(dia || {}).forEach(arr => { if(Array.isArray(arr)) n += arr.length; })));
  return n;
}

// Lista [{m, cli}] de todos los menús guardados, ordenados por fecha desc.
function tobMenusAll(){
  const all = [];
  (tobDB.clientes || []).forEach(cli => (cli.menus || []).forEach(m => all.push({ m, cli })));
  all.sort((a,b) => (b.m.savedAt||b.m.fecha||'').localeCompare(a.m.savedAt||a.m.fecha||''));
  return all;
}

function tobMenuRowHTML(cli, m){
  const fecha = (m.savedAt || m.fecha || '').slice(0,10);
  const hora  = (m.savedAt || '').slice(11,16);
  const n = tobMenuCountRecetas(m);
  return `<div class="tob-menu-row">
    <div class="tob-menu-row-info">
      <div class="nm">${tobEsc(cli.nombre)}</div>
      <div class="meta">${tobEsc(fecha)}${hora?' '+tobEsc(hora):''} · ${m.semanas||1} setm · ${n} receptes · ${m.kcalObj||'—'} kcal/dia · ${m.protObj||'—'} g prot</div>
    </div>
    <div class="tob-menu-row-acts">
      <button class="tob-action ghost btn-xs" onclick="tobMenuGuardadoOpen('${cli.id}','${m.id}')" title="Obrir al creador de menús">✏️ Obrir</button>
      <button class="tob-action ghost btn-xs" onclick="tobMenuPdf('${cli.id}','${m.id}')" title="Exportar el menú a PDF per enviar-lo">📄 PDF</button>
      <button class="tob-action ghost btn-xs" onclick="tobMenuGuardadoDelete('${cli.id}','${m.id}')" style="color:#dc6a6a;border-color:#7a2424;" title="Eliminar">🗑</button>
    </div>
  </div>`;
}

let _tobMenusSearchLimpiado = false;
function tobMenusGuardadosRender(){
  const cont = document.getElementById('tobMenusGuardadosList');
  if(!cont) return;
  const inp = document.getElementById('tobMenusGuardadosSearch');
  // En el primer render, vaciar el buscador por si el navegador le metió
  // un valor (autocompletado/restauración de formulario).
  if(inp && !_tobMenusSearchLimpiado){ inp.value = ''; _tobMenusSearchLimpiado = true; }
  const q = (inp?.value || '').trim().toLowerCase();
  let all = tobMenusAll();
  if(q) all = all.filter(x => (x.cli.nombre||'').toLowerCase().includes(q));
  const cnt = document.getElementById('tobMenusGuardadosCount');
  if(cnt) cnt.textContent = all.length ? `· ${all.length}` : '';
  if(!all.length){
    cont.innerHTML = '<div style="text-align:center;color:var(--mute2);padding:34px;font-family:DM Mono,monospace;font-size:.8rem;line-height:1.7;">'
      + (q ? 'Cap menú per aquest client.' : 'Encara no hi ha menús guardats.<br>Ves al <strong>Creador de menús</strong>, munta un menú i prem 💾 Guardar.')
      + '</div>';
    return;
  }
  cont.innerHTML = all.map(({m, cli}) => tobMenuRowHTML(cli, m)).join('');
}

function tobMenuGuardadoOpen(cliId, menuId){
  const btn = document.querySelector('.tob-sub-tab[data-mtab="creador"]');
  tobMenuShowTab('creador', btn);
  const sel = document.getElementById('tobMcCliente');
  if(sel){
    sel.value = cliId;
    if(typeof tobMcOnClienteChange === 'function') tobMcOnClienteChange();
  }
  tobMcLoadMenu(menuId);
}

function tobMenuGuardadoDelete(cliId, menuId){
  const cli = tobDB.clientes.find(c => c.id === cliId);
  if(!cli || !cli.menus) return;
  const m = cli.menus.find(x => x.id === menuId);
  if(!m) return;
  if(!confirm(`Eliminar el menú de ${cli.nombre} del ${(m.savedAt||'').slice(0,10)}?`)) return;
  cli.menus = cli.menus.filter(x => x.id !== menuId);
  tobSave();
  tobMenusGuardadosRender();
  if(typeof tobFichaRenderMenus === 'function') tobFichaRenderMenus();
  tobToast('Menú eliminat', '');
}

// Clasifica un ingrediente en una sección del súper (heurística por nombre).
function tobSeccionAlimento(nombre){
  const n = (nombre || '').toLowerCase();
  const has = (...ws) => ws.some(w => n.includes(w));
  if(has('aceite','oli ','vinagre',' sal','pebre','azúcar','sucre','miel','mel ','espècie','especia','salsa','tamari','mostaza','mostassa','comino','orégano','albahaca','alfàbrega','perejil','julivert','canela','curry','caldo','tomate frito','ketchup','mayonesa','levadura','llevat','cacao')) return 'Olis, condiments i espècies';
  if(has('pollo','pollastre','pavo','gall dindi','ternera','vedella','cerdo','porc','buey','cordero','xai','conejo','conill','jamón','pernil','bacon','salchich','embut','solomillo','lomo','filete','hamburgues','chuleta','costilla','carne','carn ')) return 'Carn i aviram';
  if(has('salmón','salmon','atún','tonyina','merluza','lluç','bacalao','bacallà','gamba','langostino','marisco','marisc','sepia','calamar','pulpo',' pop','mejill','musclo','almeja','sardina','boquerón','seitó','trucha','dorada','lubina','pescado','peix','anchoa')) return 'Peix i marisc';
  if(has('leche','llet','yogur','iogurt','queso','formatge','nata','mantequilla','mantega','huevo','ou ','ous','kefir','requesón','mató','cuajada')) return 'Ous, làctics i derivats';
  if(has('manzana','poma','plátano','plàtan','naranja','taronja','fresa','maduixa','pera','uva','raïm','kiwi','mango','piña','pinya','melón','meló','sandía','síndria','arándano','nabiu','frambuesa','melocotón','préssec','albaricoque','cereza','cireres','mandarina','limón','llimona','aguacate','alvocat','dátil','dàtil','higo','figa','fruta','fruita')) return 'Fruita';
  if(has('lenteja','llentia','garbanzo','cigró','judía blanca','mongeta','alubia','soja','tofu','tempeh','frijol','guisante','pèsol','almendra','ametlla','nuez','avellana','pistacho','anacardo','cacahuete','cacauet','semilla','llavor','fruto seco','fruits secs')) return 'Llegums i fruits secs';
  if(has('arroz','arròs','pasta','espagueti','macarr','fideo','pan ','pa ','harina','farina','avena','civada','quinoa','cuscús','couscous','trigo','blat','cereal','galleta','copos')) return 'Cereals, pa i pasta';
  if(has('tomate','tomàquet','lechuga','enciam','cebolla','ceba','ajo ','all ','pimiento','pebrot','zanahoria','pastanaga','calabacín','carbassó','berenjena','albergínia','brócoli','bròquil','coliflor','espinac','acelga','bleda','champiñón','xampinyó','seta','bolet','patata','calabaza','carbassa','pepino','cogombre','apio','api ','puerro','porro','espárrago','espàrrec',' col','rúcula','remolacha','remolatxa','verdura','hortaliza')) return 'Verdures i hortalisses';
  return 'Altres';
}

// ── PDF del menú semanal (portada + graella + compra + receptari)
// Se abre en una ventana nueva con CSS de impresión; el usuario lo guarda
// como PDF. Las fotos se resuelven desde IndexedDB → data URLs fiables.
async function tobMenuPdf(cliId, menuId){
  const cli = tobDB.clientes.find(c => c.id === cliId);
  const m = cli && (cli.menus || []).find(x => x.id === menuId);
  if(!cli || !m){ tobToast('Menú no trobat', 'red'); return; }
  tobToast('Generant PDF del menú…', '');

  const recsById = {};
  (tobMenusDB.recetas || []).forEach(r => { recsById[r.id] = r; });

  // IDs usados (con nº de ocurrencias) + resolución de fotos
  const usos = {};
  Object.values(m.data || {}).forEach(sem => Object.values(sem || {}).forEach(dia =>
    Object.values(dia || {}).forEach(arr => (arr || []).forEach(id => { usos[id] = (usos[id]||0) + 1; }))));
  const fotoMap = {};
  for(const id of Object.keys(usos)){
    const r = recsById[id];
    if(!r) continue;
    try { fotoMap[id] = await tobRecFotoResolve(r); } catch(e){ fotoMap[id] = ''; }
  }

  const esc = tobEsc;
  const DIAS = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte','Diumenge'];
  const comidas = (m.comidasIds || []).map(id => ({ id, label: tobMcMealLabel(id) }));
  const semanas = m.semanas || 1;
  // Ajustes guardados en el menú — afectan a graella, totals, llista de la
  // compra i receptari (cantitats per ració). Si una receta no té ajust, es
  // comporta com abans (tobMcMacros cau a tobRecMacros, tobMcEffGramos = base).
  const ajMap = m.ajustes || {};
  // Macros por ración de una receta, honrant els ajustos del menú.
  const macRac = (r) => { const x = tobMcMacros(r, ajMap); const rac = r.raciones || 1; return { kcal:x.kcal/rac, prot:x.proteina/rac, hc:x.hc/rac, gras:x.grasa/rac, fib:x.fibra/rac }; };

  // ── Graella del menú por semana (con fila de totales por día) ──
  let graellaHtml = '';
  for(let s = 0; s < semanas; s++){
    let rows = '';
    const dayTot = Array.from({length:7}, () => ({ kcal:0, prot:0, hc:0, gras:0 }));
    comidas.forEach(c => {
      let cells = '';
      for(let d = 0; d < 7; d++){
        const ids = ((m.data[s]||{})[d]||{})[c.id] || [];
        const platos = ids.map(id => {
          const r = recsById[id];
          if(!r) return '<div class="mp-plato mp-buit">(eliminada)</div>';
          const foto = fotoMap[id];
          const mr = macRac(r);
          dayTot[d].kcal += mr.kcal; dayTot[d].prot += mr.prot;
          dayTot[d].hc += mr.hc; dayTot[d].gras += mr.gras;
          return `<div class="mp-plato">
            ${foto ? `<div class="mp-foto" style="background-image:url('${esc(foto)}')"></div>` : '<div class="mp-foto mp-nofoto"></div>'}
            <div class="mp-plato-txt"><div class="mp-plato-nm">${esc(r.nombre||'—')}</div>
            <div class="mp-plato-kcal">${Math.round(mr.kcal)} kcal · ${Math.round(mr.prot)}g prot</div></div>
          </div>`;
        }).join('');
        cells += `<td>${platos || '<div class="mp-buit">—</div>'}</td>`;
      }
      rows += `<tr><th>${esc(c.label)}</th>${cells}</tr>`;
    });
    const totRow = '<tr class="mp-tot"><th>Total dia</th>' + dayTot.map(t =>
      `<td><b>${Math.round(t.kcal)}</b> kcal · ${Math.round(t.prot)}P · ${Math.round(t.hc)}H · ${Math.round(t.gras)}G</td>`
    ).join('') + '</tr>';
    graellaHtml += `<div class="mp-section mp-blk mp-page-break">
      <h2>Setmana ${s+1}</h2>
      <table class="mp-graella"><thead><tr><th></th>${DIAS.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${rows}${totRow}</tbody></table></div>`;
  }

  // ── Llista de la compra (ingredients agregats, per seccions del súper) ─
  // Suma els grams efectius (respectant ajustos del menú) per cada ració,
  // multiplicat per les ocurrències de la recepta al menú.
  const compra = {};
  Object.keys(usos).forEach(id => {
    const r = recsById[id];
    if(!r || !Array.isArray(r.ingredientes)) return;
    const rac = r.raciones || 1;
    const aj = ajMap[id];
    r.ingredientes.forEach(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      const nom = ing ? ing.nombre : (it._nombreFallback || null);
      if(!nom) return;
      const g = tobMcEffGramos(it, aj) / rac * usos[id];
      const k = nom.toLowerCase();
      if(!compra[k]) compra[k] = { nom, g:0, seccion: tobSeccionAlimento(nom) };
      compra[k].g += g;
    });
  });
  const TOB_SECCIONS = ['Verdures i hortalisses','Fruita','Carn i aviram','Peix i marisc',
    'Ous, làctics i derivats','Cereals, pa i pasta','Llegums i fruits secs',
    'Olis, condiments i espècies','Altres'];
  const porSeccion = {};
  Object.values(compra).forEach(c => { (porSeccion[c.seccion] = porSeccion[c.seccion] || []).push(c); });
  let compraHtml = '';
  const secsAmbDades = TOB_SECCIONS.filter(s => porSeccion[s] && porSeccion[s].length);
  if(secsAmbDades.length){
    compraHtml = '<div class="mp-section mp-blk mp-page-break"><h2>Llista de la compra</h2>';
    secsAmbDades.forEach(sec => {
      const items = porSeccion[sec].sort((a,b) => a.nom.localeCompare(b.nom,'ca',{sensitivity:'base'}));
      compraHtml += '<h4 class="mp-compra-sec">' + esc(sec) + '</h4><ul class="mp-compra">' +
        items.map(c => `<li><span>${esc(c.nom)}</span><span class="mp-g">${c.g >= 1000 ? (c.g/1000).toFixed(2)+' kg' : Math.round(c.g)+' g'}</span></li>`).join('') +
        '</ul>';
    });
    compraHtml += '</div>';
  }

  // ── Receptari ── (cada recepta es un bloc paginable per separat)
  const recetari = Object.keys(usos).map(id => recsById[id]).filter(Boolean)
    .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'','ca',{sensitivity:'base'}));
  const recetariHtml = recetari.length
    ? '<h2 class="mp-blk mp-page-break mp-recetari-h">Receptari</h2>' + recetari.map(r => {
      const foto = fotoMap[r.id];
      const mr = macRac(r);
      const racR = r.raciones || 1;
      const aj = ajMap[r.id];
      const ajActivo = tobMcAjusteActivo(aj);
      const ings = (r.ingredientes||[]).map(it => {
        const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
        const nom = ing ? ing.nombre : (it._nombreFallback || '—');
        const g = tobMcEffGramos(it, aj) / racR;   // per ració (1 persona), amb ajustos del menú
        return `<li>${esc(nom)}${g ? ` · ${Math.round(g)} g` : ''}</li>`;
      }).join('');
      const pasos = Array.isArray(r.instrucciones) ? r.instrucciones
                  : String(r.instrucciones||'').split('\n').filter(Boolean);
      const ajBadge = ajActivo
        ? `<div class="mp-recepta-aj">⚖ Quantitats ajustades per a aquest menú${aj.motiu?': '+esc(aj.motiu):''}</div>`
        : '';
      return `<div class="mp-recepta mp-blk">
        <div class="mp-recepta-head">
          ${foto ? `<div class="mp-recepta-foto" style="background-image:url('${esc(foto)}')"></div>` : '<div class="mp-recepta-foto mp-recepta-nofoto"></div>'}
          <div><div class="mp-recepta-nm">${esc(r.nombre||'—')}</div>
          <div class="mp-recepta-mac">${Math.round(mr.kcal)} kcal · ${Math.round(mr.prot)}g prot · ${Math.round(mr.hc)}g HC · ${Math.round(mr.gras)}g greix${r.tiempoTotal?` · ⏱ ${esc(r.tiempoTotal)}`:''}</div>
          ${(r.alergenos&&r.alergenos.length)?`<div class="mp-recepta-al">⚠ ${esc(r.alergenos.join(' · '))}</div>`:''}
          ${ajBadge}</div>
        </div>
        ${ings ? `<div class="mp-recepta-cols"><div><h4>Ingredients (per ració)</h4><ul>${ings}</ul></div>
          <div><h4>Preparació</h4><ol>${pasos.map(p=>`<li>${esc(p.replace(/^[-·•*\d.\s]+/,''))}</li>`).join('')||'<li>—</li>'}</ol></div></div>` : ''}
      </div>`;
    }).join('')
    : '';

  // ── Notes / recomanacions ──────────────────────────────────────
  const notas = String(m.notas != null ? m.notas : TOB_MENU_NOTAS_DEFAULT).trim();
  // Notes NO força salt de pàgina — sol ser una secció curta, que flueixi
  // amb el que vingui darrere per evitar pàgines amb 80% de buit.
  const notasHtml = notas
    ? `<div class="mp-section mp-blk"><h2>Recomanacions</h2><div class="mp-notas">${esc(notas).replace(/\n/g,'<br>')}</div></div>`
    : '';

  // ── Documento del menú (se renderiza fuera de pantalla y se vuelca
  //    a un PDF descargable con html2canvas + jsPDF) ───────────────
  const hoy = new Date().toLocaleDateString('ca-ES', { day:'numeric', month:'long', year:'numeric' });
  // Tokens visuals iguals al PDF de mediciones — branding consistent.
  // ORANGE #f5a721 · BLACK #0f0f0f · GRAY_LIGHT #f7f7f7 · GRAY_DK #404040.
  // PDF en LANDSCAPE A4 (1123×794 a 96dpi). Més ample = la graella respira,
  // les seccions curtes (notes) no deixen tants buits, i la portada es veu
  // millor centrada amb el logo gros.
  const styleCss = `
    .mp-doc *{box-sizing:border-box;margin:0;padding:0;}
    .mp-doc{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f0f0f;background:#fff;width:1123px;position:relative;}
    .mp-doc h2{font-size:15px;color:#0f0f0f;margin:0 0 14px;padding:7px 14px;background:#f5a721;letter-spacing:.02em;font-weight:800;text-transform:uppercase;}
    .mp-doc h4{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:#8c8c8c;margin:0 0 6px;font-weight:800;}

    /* ── Cover: barra taronja a l'esquerra + logo gros (en landscape) ── */
    .mp-cover{position:relative;padding:90px 80px 70px 160px;background:#fff;min-height:760px;}
    .mp-cover::before{content:'';position:absolute;left:0;top:0;width:80px;height:100%;background:#f5a721;}
    .mp-logo-wrap{display:flex;align-items:baseline;gap:18px;}
    .mp-logo-full{font-size:64px;font-weight:900;letter-spacing:.01em;color:#f5a721;line-height:1;}
    .mp-logo-training{font-size:64px;font-weight:900;letter-spacing:.01em;color:#0f0f0f;line-height:1;}
    .mp-cover-sub{font-size:13px;color:#8c8c8c;letter-spacing:.04em;margin-top:12px;}
    .mp-cover-cli{font-size:42px;font-weight:800;color:#0f0f0f;margin-top:60px;line-height:1.05;}
    .mp-cover-periodo{font-size:13px;color:#404040;margin-top:10px;letter-spacing:.02em;}

    /* ── KPIs estil mediciones: més grans en landscape ── */
    .mp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:60px;max-width:820px;}
    .mp-kpi{background:#f7f7f7;padding:22px 18px 18px;position:relative;}
    .mp-kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:5px;background:#f5a721;}
    .mp-kpi-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#8c8c8c;font-weight:800;}
    .mp-kpi-val{font-size:30px;font-weight:800;color:#0f0f0f;margin-top:8px;line-height:1.1;}
    .mp-kpi-sub{font-size:9.5px;color:#8c8c8c;margin-top:4px;}

    /* ── Body: padding generós perquè no quedi pegat al borde ── */
    .mp-body{padding:30px 60px 0;}
    .mp-section{margin-bottom:30px;}
    /* Seccions que obren pàgina: respiració extra a sobre */
    .mp-section.mp-page-break,h2.mp-page-break{margin-top:36px;}
    .mp-doc table{border-collapse:collapse;width:100%;}

    /* ── Graella (landscape: aprofitem amplada per a fotos i textos més grans) ── */
    .mp-graella{table-layout:fixed;}
    .mp-graella th,.mp-graella td{border:1px solid #ddd;padding:7px;font-size:10px;vertical-align:top;overflow-wrap:anywhere;}
    .mp-graella thead th{background:#f5a721;color:#0f0f0f;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;padding:8px;}
    .mp-graella tbody th{background:#f7f7f7;color:#404040;width:72px;font-size:9.5px;text-transform:uppercase;font-weight:700;letter-spacing:.04em;}
    .mp-plato{display:flex;gap:7px;align-items:center;margin-bottom:5px;}
    .mp-plato:last-child{margin-bottom:0;}
    .mp-foto{width:50px;height:40px;border-radius:3px;background:#eee center/cover;flex:none;border:1px solid #ddd;}
    .mp-nofoto{background:#f7f7f7;}
    .mp-plato-nm{font-weight:700;font-size:9.5px;line-height:1.22;color:#0f0f0f;overflow-wrap:anywhere;}
    .mp-plato-kcal{font-size:8.5px;color:#8c8c8c;margin-top:1px;}
    .mp-buit{color:#ccc;font-size:10px;text-align:center;padding:8px 0;}
    .mp-graella tr.mp-tot th,.mp-graella tr.mp-tot td{background:#f7f7f7;color:#404040;font-weight:700;font-size:9.5px;text-align:center;border-top:2px solid #f5a721;padding:8px 6px;}
    .mp-graella tr.mp-tot b{font-size:13px;color:#0f0f0f;}

    /* ── Llista de la compra (landscape: 4 columnes en lloc de 3) ── */
    .mp-compra-sec{font-size:11.5px;color:#0f0f0f;font-weight:800;margin:16px 0 6px;padding:5px 12px;background:#f5a721;letter-spacing:.04em;text-transform:uppercase;}
    .mp-compra{list-style:none;columns:4;column-gap:28px;}
    .mp-compra li{display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px dotted #ddd;color:#0f0f0f;break-inside:avoid;}
    .mp-compra .mp-g{color:#f5a721;font-weight:800;}

    /* ── Receptari (landscape: 2 receptes per fila amb dos columnes) ── */
    .mp-recepta{background:#fff;border:1px solid #e8e8e8;padding:16px 18px 14px;margin-bottom:16px;position:relative;}
    .mp-recepta::before{content:'';position:absolute;top:0;left:0;width:5px;height:100%;background:#f5a721;}
    .mp-recepta-head{display:flex;gap:16px;align-items:center;margin-bottom:12px;}
    .mp-recepta-foto{width:130px;height:96px;border-radius:5px;background:#eee center/cover;flex:none;border:1px solid #ddd;}
    .mp-recepta-nofoto{background:#f7f7f7;}
    .mp-recepta-nm{font-size:17px;font-weight:800;color:#0f0f0f;}
    .mp-recepta-mac{font-size:11px;color:#404040;margin-top:5px;}
    .mp-recepta-mac b{color:#f5a721;}
    .mp-recepta-al{font-size:10px;color:#d94040;margin-top:4px;font-weight:700;}
    .mp-recepta-aj{font-size:10px;color:#0f0f0f;margin-top:5px;font-weight:700;background:#f5a721;padding:3px 8px;border-radius:2px;display:inline-block;}
    .mp-recepta-cols{display:flex;gap:30px;}
    .mp-recepta-cols>div{flex:1;}
    .mp-recepta-cols ul,.mp-recepta-cols ol{margin-left:18px;font-size:11px;line-height:1.6;color:#404040;}

    /* ── Notes / recomanacions ── */
    .mp-notas{font-size:11.5px;line-height:1.8;color:#404040;background:#f7f7f7;border-left:5px solid #f5a721;padding:16px 20px;}

    /* ── Foot: brand mark a la dreta com el PDF de mediciones ── */
    .mp-foot{margin:32px 60px 28px;text-align:right;font-size:9.5px;color:#8c8c8c;font-style:italic;}
  `;

  // ─── KPIs portada (estil mediciones) ──────────────────────────────
  // Calcular Recetes úniques, kcal mitjana/dia i prot mitjana/dia
  // perquè la cover tingui números reals i no només els objectius.
  const nRecsUnicas = Object.keys(usos).length;
  let totKcalMenu = 0, totProtMenu = 0;
  for(let s = 0; s < semanas; s++) for(let d = 0; d < 7; d++){
    comidas.forEach(c => {
      const ids = ((m.data[s]||{})[d]||{})[c.id] || [];
      ids.forEach(id => {
        const r = recsById[id]; if(!r) return;
        const mr = macRac(r);
        totKcalMenu += mr.kcal; totProtMenu += mr.prot;
      });
    });
  }
  const nDias = semanas * 7;
  const kcalProm = nDias ? Math.round(totKcalMenu / nDias) : 0;
  const protProm = nDias ? Math.round(totProtMenu / nDias) : 0;
  const objKcal = m.kcalObj || 0;
  const objProt = m.protObj || 0;
  const kpiVsObj = (real, obj) => {
    if(!obj || !real) return '';
    const diff = Math.round(real - obj);
    return `${diff>=0?'+':''}${diff} vs objectiu`;
  };

  const bodyHtml = `<div class="mp-doc">
    <div class="mp-cover mp-blk">
      <div class="mp-logo-wrap">
        <span class="mp-logo-full">FULL</span><span class="mp-logo-training">TRAINING</span>
      </div>
      <div class="mp-cover-sub">NUTRICIÓ · Menú setmanal personalitzat</div>
      <div class="mp-cover-cli">${esc(cli.nombre)}</div>
      <div class="mp-cover-periodo">${esc(hoy)} &nbsp;·&nbsp; ${semanas} setmana(es) &nbsp;·&nbsp; ${comidas.length} àpats/dia</div>

      <div class="mp-kpis">
        <div class="mp-kpi">
          <div class="mp-kpi-lbl">Receptes</div>
          <div class="mp-kpi-val">${nRecsUnicas}</div>
          <div class="mp-kpi-sub">úniques al menú</div>
        </div>
        <div class="mp-kpi">
          <div class="mp-kpi-lbl">Kcal / dia</div>
          <div class="mp-kpi-val">${kcalProm || '—'}</div>
          <div class="mp-kpi-sub">${objKcal ? 'objectiu ' + objKcal + ' kcal · ' + kpiVsObj(kcalProm, objKcal) : 'mitjana del menú'}</div>
        </div>
        <div class="mp-kpi">
          <div class="mp-kpi-lbl">Proteïna / dia</div>
          <div class="mp-kpi-val">${protProm || '—'} g</div>
          <div class="mp-kpi-sub">${objProt ? 'objectiu ' + objProt + ' g · ' + kpiVsObj(protProm, objProt) : 'mitjana del menú'}</div>
        </div>
      </div>
    </div>
    <div class="mp-body">
      ${graellaHtml}
      ${notasHtml}
      ${compraHtml}
      ${recetariHtml}
    </div>
    <div class="mp-foot">FULL TRAINING — BIIO System · ${esc(hoy)}</div>
  </div>`;

  // Render fuera de pantalla → html2canvas → jsPDF → descarga directa.
  if(typeof html2canvas === 'undefined' || !window.jspdf){
    tobToast('No s\'han pogut carregar les llibreries del PDF — recarrega la pàgina', 'red');
    return;
  }
  // Layout LANDSCAPE: 297mm × 210mm a A4. En píxels CSS a 96dpi: 1123 × 794.
  const DOC_W_PX = 1123;       // ample del .mp-doc (297mm landscape)
  const PAGE_CSS_H = 794;      // alt d'una pàgina A4 landscape
  const PAGE_MM_W = 297;
  const PAGE_MM_H = 210;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + DOC_W_PX + 'px;background:#fff;z-index:-1;';
  holder.innerHTML = '<style>' + styleCss + '</style>' + bodyHtml;
  document.body.appendChild(holder);
  try {
    await new Promise(r => setTimeout(r, 150));
    const docEl = holder.querySelector('.mp-doc');
    // Punts de tall:
    //   · `mp-page-break` → FORÇA salt de pàgina abans (encara que càpiga).
    //     Així cada setmana, compra i recetari obre pàgina pròpia.
    //   · `mp-blk` sense page-break → talla només si no cap.
    const docTop = docEl.getBoundingClientRect().top;
    const docH = docEl.scrollHeight;
    const cuts = [0];
    let pageStart = 0;
    holder.querySelectorAll('.mp-blk, .mp-page-break').forEach(blk => {
      const rc = blk.getBoundingClientRect();
      const top = rc.top - docTop;
      const bot = rc.bottom - docTop;
      const force = blk.classList.contains('mp-page-break');
      if(force && top > pageStart + 4){
        cuts.push(top); pageStart = top;
      } else if(!force && bot - pageStart > PAGE_CSS_H && top > pageStart + 4){
        cuts.push(top); pageStart = top;
      }
    });
    const uniqueCuts = [];
    cuts.forEach(c => { if(!uniqueCuts.length || c > uniqueCuts[uniqueCuts.length-1] + 2) uniqueCuts.push(c); });
    uniqueCuts.push(docH);
    cuts.length = 0; uniqueCuts.forEach(c => cuts.push(c));

    const canvas = await html2canvas(docEl,
      { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const sc = canvas.width / DOC_W_PX;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');     // LANDSCAPE
    for(let i = 0; i < cuts.length - 1; i++){
      const y0 = Math.round(cuts[i] * sc);
      const y1 = Math.round(cuts[i+1] * sc);
      const segH = Math.min(y1 - y0, canvas.height - y0);
      if(segH <= 1) continue;
      const seg = document.createElement('canvas');
      seg.width = canvas.width; seg.height = segH;
      seg.getContext('2d').drawImage(canvas, 0, y0, canvas.width, segH, 0, 0, canvas.width, segH);
      if(i > 0) pdf.addPage();
      // En landscape: pàgina és 297mm de ample × 210mm de alt.
      let imgW = PAGE_MM_W;
      let imgH = segH * PAGE_MM_W / canvas.width;
      let x = 0;
      if(imgH > PAGE_MM_H){
        const k = PAGE_MM_H / imgH;
        imgH = PAGE_MM_H; imgW = PAGE_MM_W * k;
        x = (PAGE_MM_W - imgW) / 2;
      }
      pdf.addImage(seg.toDataURL('image/jpeg', 0.92), 'JPEG', x, 0, imgW, imgH);
    }
    const fname = 'Menu_' + String(cli.nombre||'client').replace(/[^\w\-]+/g,'_') +
                  '_' + new Date().toISOString().slice(0,10) + '.pdf';
    pdf.save(fname);
    tobToast('✓ PDF del menú descarregat', 'green');
  } catch(e){
    console.warn('[menu pdf]', e);
    tobToast('✗ Error generant el PDF: ' + (e.message || e), 'red');
  } finally {
    document.body.removeChild(holder);
  }
}

// ═════════════════════════════════════════════════════════════════
// IA — configuración + generación automática de menús
// ═════════════════════════════════════════════════════════════════
const TOB_AI_CFG_KEY = 'tob_ai_cfg';
const TOB_AI_DEFAULTS = {
  gemini:     { model:'gemini-2.0-flash',          help:'Clau gratuïta a aistudio.google.com/apikey' },
  groq:       { model:'llama-3.3-70b-versatile',   help:'Clau gratuïta a console.groq.com/keys' },
  anthropic:  { model:'claude-haiku-4-5',          help:'Clau a console.anthropic.com → API Keys (requereix crèdit API, separat de la subscripció de Claude). Cost orientatiu: ~2-5 cèntims/menú amb Haiku 4.5. Per a millor qualitat amb instruccions complexes, posa "claude-sonnet-4-5" al camp Model (~10-15 cèntims/menú).' },
  openrouter: { model:'google/gemini-2.0-flash-001', help:'Clau a openrouter.ai/keys (requereix crèdit). Pots fer servir modelos gratuïts amb sufix ":free" (ex: "deepseek/deepseek-chat-v3-0324:free").' },
  deepseek:   { model:'deepseek-chat',             help:'Clau a platform.deepseek.com/api_keys (requereix crèdit). MOLT econòmic: ~0.5-1 cèntim/menú amb "deepseek-chat" (V3, qualitat comparable a Claude Sonnet en raonament). Per millor raonament posa "deepseek-reasoner" al Model (~2-3 cèntims/menú).' }
};
// Instrucciones (REGLES) del prompt de generación de menús. Editables
// desde ⚙ IA. {kcal} {margen} {prot} se sustituyen al generar.
const TOB_AI_MENU_RULES_DEFAULT =
`Ets el dietista de Sergio. Munta el menú com ho faria ell. Filosofia: flexible, centrat en el client, dia a dia.

═══ OBJECTIUS NUMÈRICS ═══
Cada dia ha d'acostar-se a: {kcal} kcal i {prot} g de proteïna.
- Tolerància: ±200 kcal i ±20 g prot puntuals si la MITJANA SETMANAL compensa. La mitjana setmanal és el que importa, no l'exactitud diària.
- Si TOTS els dies queden per sota, has fallat. Si la mitjana està dins del marge ±{margen}%, has fet bé la feina.

═══ PROCÉS d'AJUST (ordre estricte) ═══
Si un dia està lluny de l'objectiu (>200 kcal o >20 g prot):
  1r. PUJA NOMÉS LA PROTE del plat principal — usa el camp "ing" amb el nom de l'ingredient
      proteic (pollastre, salmó, lluç, vedella, ou…) i el nombre de grams desitjat per ració.
      Ex: "ing": { "pollastre": 200 } puja la carne de ~150g a 200g sense tocar la resta.
  2n. Si la prote ja està bé però falten kcal, PUJA L'ACOMPANYAMENT — "ing" amb el nom
      del cereal/farinaci (arròs, pasta, quinoa, patata…). Ex: "ing": { "arros": 100 }.
  3r. Si tot el plat ha de pujar coherentment, usa "factor" (0.5, 1, 1.5, 2 preferiblement).
  4t. NOMÉS si l'ajust no n'hi ha prou, SUBSTITUEIX el plat per un altre del catàleg.
PROHIBIT: afegir una peça extra solta (un iogurt random, fruits secs random) al final del dia
per quadrar números. Queda sense sentit dins del menú.

═══ FACTORS i CANTITATS ═══
Factors d'ajust permesos: 0.5, 1, 1.5, 2 (i excepcionalment decimals com 1.5 si donen grams nets).
SNAPPING de grams — quan emetis "ing", usa quantitats limpias d'acord amb el tipus d'ingredient:
- Carns/peixos crus: múltiples de 25 g (100, 125, 150, 175, 200, 225…)
- Arròs/pasta/quinoa: sempre en CRU, múltiples de 10 g
- Pa: 1 llesca = 40 g (no fraccionar)
- Oli: 5 ml
- Fruits secs: 30 g = "un grapat"
- Fruita: 1 peça
- Iogurt: 1 unitat
- Ous: per unitats (1, 2, 3…)
Si emetis un valor "lleig" (137 g de pollo), redondea al múltiple net més pròxim (125 o 150 g).

═══ ESMORZAR — la base de Sergio ═══
- Composició diana: ~30% prote · ~50% grasses · ~20% HC (estil low-carb).
- DEFAULT: tostades amb varietat → jamó dolç/salat, ou remenat, alvocat + mozzarella, formatge fresc, etc. Combina ingredients simples (∙) "Llesca de pa" + un proteic + greix saludable.
- CAFÈ: si el recordatori indica "Cafè sol" o "Cafè amb llet", AFEGEIX exactament aquest
  ingredient simple (∙) al mateix àpat. NO l'oblidis — és part de l'esmorzar habitual.
- Si el client marca fruita/fruits secs com a opcionals, suma'ls al plat (no com a peça random — formen part de l'àpat).
- 4 TIPUS típics de esmorzar al menú, repetibles però MAI dies consecutius.

═══ MIG MATÍ / BERENAR ═══
- NOMÉS apareixen si el client els marca explícitament a la seva estructura habitual.
- USA INGREDIENTS SIMPLES (∙) tal com indica el recordatori del client. Si diu
  "Iogurt + Fruits secs", posa exactament aquests dos ingredients simples del
  catàleg. NO posis batuts ni smoothies que continguin iogurt — el client vol
  el iogurt sencer i els fruits secs separats.
- Combinacions típiques (si el client no especifica):
   · Fruita (∙) + Fruits secs (∙) — opció lleugera
   · Iogurt natural (∙) + Fruita (∙) — afegeix prot si fa falta
   · Iogurt proteic (∙) + Fruits secs (∙) — més prot
- 100-350 kcal · ≤15 g prote.

═══ DINAR / SOPAR — patró base ═══
- Patró: 1 plat principal (P) + acompanyament vegetal (ensalada, salteado, crema de verdura).
- Plats principals contundents (guisats, llegums, pasta, arròs, woks, amanides completes amb molta kcal): POT anar sol, sense acompanyament.
- Acompanyaments "cañeros" (molta kcal): aplicar factor 0.5 perquè no es passi.
- COHERÈNCIA DE COCCIÓ: si el principal és AL FORN (alitas, pollastre rostit), l'acompanyament també al forn (escalivada, patates al forn). Aprofita el forn.
- VARIAR dins del dia: si el dinar és pollastre, el sopar NO sigui pollastre. Alterna fonts.

═══ VARIETAT SETMANAL ═══
- Plats principals (rol P) del DINAR: 7 receptes DIFERENTS en 7 dies (és la regla principal). Mateix per a sopar.
- Si una fuente de prote es repeteix (típic amb pollastre, que és comodí), NO en dies consecutius i amb RECEPTA DIFERENT.
- Frequències típiques (depèn del cuestionari del client):
   · Pollastre / carn blanca: comodí, 2-3 dies habitualment
   · Pescat blanc: ~1 dia
   · Pescat blau: 1-2 dies
   · Carn vermella: màxim 2
   · Llegums: fins a 3
   · Ous: fins a 3 dies
   · Pasta/arròs/quinoa: sense tope
- MAI copiis dies sencers. Setmana 1 ≠ Setmana 2.

═══ COMBINACIONS PROHIBIDES ═══
- Dos plats principals junts.
- Dos acompanyaments junts.
- Dos farinacis junts (pasta + arròs, pa + patata generosa…).
- Postre pesat al sopar.

═══ ESTRUCTURA HABITUAL DEL CLIENT — RESPECTA-LA LITERALMENT ═══
El cuestionari indica què menja a cada àpat. Aquesta secció és INNEGOCIABLE.
NO substitueixis amb receptes elaborades (batuts, smoothies, tortilles) si el
client ha indicat clarament ingredients simples. Cerca al catàleg els
ingredients simples (marca ∙) amb noms equivalents:

  · "Iogurt" → posa l'ingredient simple "Iogurt natural" o equivalent (∙).
    NO posis "Batut de iogurt amb fruita". El client vol UN IOGURT.
  · "Fruita" → posa l'ingredient simple "Fruita (peça)" (∙).
    NO posis batuts, smoothies, ni macedònies. Una peça de fruita.
  · "Fruits secs" → posa l'ingredient simple "Fruits secs (mescla)" (∙).
    NO posis "Granola" ni receptes elaborades — un grapat de fruits secs natural.
  · "Cafè sol" o "Cafè amb llet" → afegeix l'ingredient simple corresponent (∙)
    al MATEIX àpat. Sergio té cafè separat en "Cafè sol" i "Cafè amb llet" —
    usa exactament el que el client va marcar.
  · "Torrades / pa" → "Llesca de pa" (∙) + un proteic (jamó, ou, alvocat...).
  · "Carn blanca" → pollastre/gall dindi. "Pescat blanc"/"Pescat blau" igual.
  · Si el client diu "només salmó del pescat blau" o "tot el pescat menys atún",
    RESPECTA-HO al detall.

EXEMPLE concret:
  · Berenar al recordatori: "Iogurt + Fruits secs"
  · Posada CORRECTA: ID_IOGURT_NATURAL + ID_FRUITS_SECS_MESCLA (dos ingredients simples)
  · Posada INCORRECTA: "Batut de plàtan amb fruits secs" (substitució no demanada)

PRINCIPI: si el catàleg té un ingredient simple amb el mateix nom que el chip
del recordatori, USA L'INGREDIENT SIMPLE. Les receptes elaborades són per a
quan el client NO ha especificat res, o és un àpat principal sense recordatori.

═══ RESTRICCIONS ═══
- Al·lèrgies: innegociables.
- Intolerències (gluten, lactosa): adaptar amb versions aptes (pa sense gluten), NO eliminar el grup d'aliments sencer.
- "No li agrada" + "li senta malament": ambdós, FORA del menú.

═══ NO TOCAR ═══
- No alteres composició pre/post entreno (Sergio ho retoca manualment per a pros).
- No marquis "lliure" cap dia: els findes el client ja sap que té flexibilitat fora del menú.

═══ ALTRES ═══
- Prioritza receptes preferides (★).
- Usa només id de la llista de dalt.
- Si un nom suggereix clarament un àpat (Tostada, Bocadillo, Sandvitx → esmorzar/berenar), utilitza-la encara que no estigui classificada en aquest àpat.`;
// ─── Configuració d'IA — multi-clau (una per proveïdor) ───────────────
// El cfg guarda les claus de TOTS els proveïdors per a què Sergio pugui
// canviar entre Gemini / Anthropic / Groq / OpenRouter sense haver de
// retoquinar la clau cada vegada.
//
// Estructura:
//   {
//     provider: 'anthropic',                      // el actiu
//     keys:   { gemini:'AIza..', anthropic:'sk-ant-..', groq:'gsk_..', openrouter:'sk-or-..' },
//     models: { gemini:'', anthropic:'claude-sonnet-4-5', ... },
//     menuRules: '...',
//     // Legacy fields per a compat retroactiu (key/model del proveïdor actiu)
//     key:   '...',
//     model: '...'
//   }
//
// tobAiGetCfg sempre retorna `key` i `model` poblats des del proveïdor
// actiu — així la resta del codi (que llegeix cfg.key i cfg.model)
// segueix funcionant sense canvis.
function tobAiGetCfg(){
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(TOB_AI_CFG_KEY)) || {}; }
  catch(e){}
  // Migració del format antic: si no hi ha `keys` però sí `key`, l'inicialitzem
  // amb la clau actual associada al proveïdor actiu.
  if(!raw.keys || typeof raw.keys !== 'object') raw.keys = {};
  if(!raw.models || typeof raw.models !== 'object') raw.models = {};
  if(raw.key && raw.provider && !raw.keys[raw.provider]){
    raw.keys[raw.provider] = raw.key;
  }
  if(raw.model && raw.provider && !raw.models[raw.provider]){
    raw.models[raw.provider] = raw.model;
  }
  // Poblat dels camps "actius" segons el proveïdor seleccionat (per a què
  // crideres existents com `cfg.key`, `cfg.model` segueixin funcionant).
  const prov = raw.provider || 'gemini';
  raw.key   = raw.keys[prov] || '';
  raw.model = raw.models[prov] || '';
  return raw;
}
function tobAiSaveCfg(cfg){
  try { localStorage.setItem(TOB_AI_CFG_KEY, JSON.stringify(cfg)); } catch(e){}
}
function tobAiOpenConfig(){
  const cfg = tobAiGetCfg();
  document.getElementById('tobAiProvider').value = cfg.provider || 'gemini';
  // tobAiProviderChange s'encarregarà d'omplir key/model des de cfg.keys/cfg.models
  tobAiProviderChange();
  document.getElementById('tobAiTestResult').textContent = '';
  const rulesEl = document.getElementById('tobAiMenuRules');
  if(rulesEl) rulesEl.value = cfg.menuRules || TOB_AI_MENU_RULES_DEFAULT;
  // Passades de correcció — clamp a [0, 3] amb default 3.
  // Bug previ: "parseInt(mp,10) || 3" feia que el 0 es convertís en 3 (perquè
  // 0 és falsy). Ara distingim entre NaN i valor numèric vàlid.
  const mpEl = document.getElementById('tobAiMaxPasadas');
  if(mpEl){
    const parsed = parseInt(cfg.maxPasadas, 10);
    const finalVal = isFinite(parsed) ? Math.max(0, Math.min(3, parsed)) : 3;
    mpEl.value = String(finalVal);
  }
  tobAiRenderFallbackList();
  document.getElementById('tobAiConfigBg').classList.add('on');
}

// ─── Llista d'ordre d'intent (fallback automàtic) ────────────────────
// Renderitza l'ordre de proveïdors. Cada item té:
//   · Posició (1, 2, 3…)
//   · Nom + estat (✓ amb clau / ✗ sense clau)
//   · Botons ↑/↓ per a reordenar (només per als que tenen clau)
// Es desa a cfg.fallbackOrder. Els que no tenen clau apareixen al final
// en gris i no participen al fallback.
const TOB_AI_PROVIDER_LBL = {
  gemini:'Google Gemini', groq:'Groq', deepseek:'DeepSeek',
  anthropic:'Anthropic Claude', openrouter:'OpenRouter'
};
function _tobAiNormalizedOrder(cfg){
  // Ordre desat + completar amb els que falten al final
  const all = Object.keys(TOB_AI_PROVIDER_LBL);
  const saved = Array.isArray(cfg.fallbackOrder) ? cfg.fallbackOrder.filter(p => all.includes(p)) : [];
  all.forEach(p => { if(!saved.includes(p)) saved.push(p); });
  return saved;
}
function tobAiRenderFallbackList(){
  const cont = document.getElementById('tobAiFallbackList');
  if(!cont) return;
  const cfg = tobAiGetCfg();
  const order = _tobAiNormalizedOrder(cfg);
  const keys = cfg.keys || {};
  const disabled = new Set(Array.isArray(cfg.disabled) ? cfg.disabled : []);
  // Separar: amb clau ACTIUS (participen) | amb clau DESACTIVATS | sense clau
  const active   = order.filter(p => keys[p] && !disabled.has(p));
  const inactive = order.filter(p => keys[p] && disabled.has(p));
  const noKey    = order.filter(p => !keys[p]);
  const rows = [];
  active.forEach((p, ix) => {
    const isFirst = ix === 0;
    const isLast  = ix === active.length - 1;
    rows.push(`<div class="tob-ai-fb-row" data-prov="${p}">
      <span class="fb-pos">${ix + 1}</span>
      <span class="fb-nm">${tobEsc(TOB_AI_PROVIDER_LBL[p])}</span>
      <span class="fb-tag ok">✓ actiu</span>
      <button type="button" class="tob-action ghost btn-xs" onclick="tobAiFallbackToggleEnabled('${p}')" title="Desactivar (mantenir la clau però no participar al fallback)">⏻ Desactivar</button>
      <button type="button" class="tob-action ghost btn-xs" onclick="tobAiFallbackMove('${p}', -1)" ${isFirst?'disabled':''} title="Pujar">↑</button>
      <button type="button" class="tob-action ghost btn-xs" onclick="tobAiFallbackMove('${p}', 1)" ${isLast?'disabled':''} title="Baixar">↓</button>
    </div>`);
  });
  inactive.forEach(p => {
    rows.push(`<div class="tob-ai-fb-row off" data-prov="${p}">
      <span class="fb-pos">—</span>
      <span class="fb-nm">${tobEsc(TOB_AI_PROVIDER_LBL[p])}</span>
      <span class="fb-tag off">⏻ desactivat (clau guardada)</span>
      <button type="button" class="tob-action ghost btn-xs" onclick="tobAiFallbackToggleEnabled('${p}')" title="Reactivar">▶ Activar</button>
    </div>`);
  });
  noKey.forEach(p => {
    rows.push(`<div class="tob-ai-fb-row disabled" data-prov="${p}">
      <span class="fb-pos">—</span>
      <span class="fb-nm">${tobEsc(TOB_AI_PROVIDER_LBL[p])}</span>
      <span class="fb-tag off">sense clau — no participa</span>
    </div>`);
  });
  if(!active.length && !inactive.length){
    rows.unshift('<div class="tob-ai-fb-empty">Configura una clau primer (canvia el dropdown de Proveïdor i pega la clau).</div>');
  }
  cont.innerHTML = rows.join('');
}
function tobAiFallbackToggleEnabled(prov){
  const cfg = tobAiGetCfg();
  const disabled = Array.isArray(cfg.disabled) ? cfg.disabled.slice() : [];
  const ix = disabled.indexOf(prov);
  if(ix >= 0) disabled.splice(ix, 1);   // re-activar
  else disabled.push(prov);              // desactivar
  cfg.disabled = disabled;
  tobAiSaveCfg(cfg);
  tobAiRenderFallbackList();
}
function tobAiFallbackMove(prov, delta){
  const cfg = tobAiGetCfg();
  const order = _tobAiNormalizedOrder(cfg);
  const keys = cfg.keys || {};
  const disabled = new Set(Array.isArray(cfg.disabled) ? cfg.disabled : []);
  // Reordena només dins dels que tenen clau I estan ACTIUS.
  const active = order.filter(p => keys[p] && !disabled.has(p));
  const ix = active.indexOf(prov);
  if(ix < 0) return;
  const ni = ix + delta;
  if(ni < 0 || ni >= active.length) return;
  const tmp = active[ix]; active[ix] = active[ni]; active[ni] = tmp;
  // Reconstruim l'ordre total: primer active en el nou ordre, després inactius i sense clau
  const inactive = order.filter(p => keys[p] && disabled.has(p));
  const noKey    = order.filter(p => !keys[p]);
  cfg.fallbackOrder = active.concat(inactive).concat(noKey);
  tobAiSaveCfg(cfg);
  tobAiRenderFallbackList();
}
function tobAiResetMenuRules(){
  const el = document.getElementById('tobAiMenuRules');
  if(el) el.value = TOB_AI_MENU_RULES_DEFAULT;
}
function tobAiProviderChange(){
  const p = document.getElementById('tobAiProvider').value;
  const d = TOB_AI_DEFAULTS[p] || {};
  const help = document.getElementById('tobAiKeyHelp');
  if(help) help.textContent = d.help || '';
  const mi = document.getElementById('tobAiModel');
  if(mi) mi.placeholder = d.model || '(per defecte)';
  // Carregar la clau i model guardats per a aquest proveïdor (si existeixen).
  const cfg = tobAiGetCfg();
  const k = document.getElementById('tobAiKey');
  if(k) k.value = (cfg.keys && cfg.keys[p]) || '';
  if(mi) mi.value = (cfg.models && cfg.models[p]) || '';
  // Indicador visual: si hi ha clau guardada per a aquest proveïdor, ho mostrem
  const res = document.getElementById('tobAiTestResult');
  if(res){
    const tot = Object.keys(cfg.keys || {}).filter(x => cfg.keys[x]).length;
    if(tot > 1){
      res.style.color = 'var(--mute)';
      res.textContent = '💡 Tens claus guardades per a ' + tot + ' proveïdors. Canvia el dropdown per alternar ràpidament.';
    } else {
      res.textContent = '';
    }
  }
}
function tobAiSaveConfigFromModal(){
  const rules = (document.getElementById('tobAiMenuRules')?.value || '').trim();
  const provider = document.getElementById('tobAiProvider').value;
  const newKey   = document.getElementById('tobAiKey').value.trim();
  const newModel = document.getElementById('tobAiModel').value.trim();
  if(!newKey){ tobToast('Falta la clau API per a ' + provider, 'red'); return; }
  // Carregar el cfg existent per preservar les claus dels altres proveïdors.
  const existing = tobAiGetCfg();
  const keys   = Object.assign({}, existing.keys || {});
  const models = Object.assign({}, existing.models || {});
  keys[provider]   = newKey;
  models[provider] = newModel;
  // Passades de correcció — clamp 0-3.
  const mpRaw = parseInt(document.getElementById('tobAiMaxPasadas')?.value, 10);
  const maxPasadas = Math.max(0, Math.min(3, isFinite(mpRaw) ? mpRaw : 3));
  const cfg = {
    provider,
    keys,
    models,
    // Solo se guarda si difiere del default (así futuras mejoras del
    // default llegan a quien no lo haya tocado).
    menuRules: (rules && rules !== TOB_AI_MENU_RULES_DEFAULT.trim()) ? rules : '',
    maxPasadas,
    // Preservar l'ordre de fallback configurat per l'usuari
    fallbackOrder: existing.fallbackOrder || _tobAiNormalizedOrder(existing),
    // Preservar la llista de proveïdors desactivats
    disabled: Array.isArray(existing.disabled) ? existing.disabled : [],
    // Legacy compat (poblats des del provider actiu)
    key:   newKey,
    model: newModel
  };
  tobAiSaveCfg(cfg);
  document.getElementById('tobAiConfigBg').classList.remove('on');
  const tot = Object.keys(keys).filter(p => keys[p]).length;
  tobToast('✓ Clau de ' + provider + ' guardada' + (tot > 1 ? ' (' + tot + ' proveïdors configurats)' : ''), 'green');
}
async function tobAiTestConfig(){
  const res = document.getElementById('tobAiTestResult');
  res.textContent = '⏳ Provant…'; res.style.color = 'var(--mute)';
  const cfg = {
    provider: document.getElementById('tobAiProvider').value,
    key:      document.getElementById('tobAiKey').value.trim(),
    model:    document.getElementById('tobAiModel').value.trim()
  };
  if(!cfg.key){ res.textContent = '✗ Falta la clau'; res.style.color = '#dc6a6a'; return; }
  try {
    await tobAiCall([{ role:'user', content:'Respon només amb aquest JSON exacte: {"ok":true}' }], cfg);
    res.textContent = '✓ Connexió correcta — la IA respon';
    res.style.color = '#3fb68b';
  } catch(e){
    res.textContent = '✗ ' + (e.message || 'error de connexió');
    res.style.color = '#dc6a6a';
  }
}

// Llamada genérica al LLM. messages=[{role,content}]. Devuelve texto.
async function tobAiCall(messages, cfgOverride){
  const cfg = cfgOverride || tobAiGetCfg();
  if(!cfg.key) throw new Error('Falta la clau API — configura la IA');
  const prov = cfg.provider || 'gemini';
  if(prov === 'gemini'){
    const model = cfg.model || TOB_AI_DEFAULTS.gemini.model;
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(cfg.key);
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const body = { contents, generationConfig:{ temperature:0.6, maxOutputTokens:4096, responseMimeType:'application/json' } };
    if(sys) body.systemInstruction = { parts:[{ text: sys }] };
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if(!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()).slice(0,160));
    const j = await r.json();
    return (((j.candidates||[])[0]||{}).content||{}).parts?.[0]?.text || '';
  }
  if(prov === 'anthropic'){
    const model = cfg.model || TOB_AI_DEFAULTS.anthropic.model;
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const msgs = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    const body = { model, max_tokens: 8000, messages: msgs };
    if(sys) body.system = sys;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
    if(!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0,180));
    const j = await r.json();
    return (((j.content||[]).find(c => c.type === 'text')) || {}).text || '';
  }
  const endpoints = {
    openrouter:'https://openrouter.ai/api/v1/chat/completions',
    groq:      'https://api.groq.com/openai/v1/chat/completions',
    deepseek:  'https://api.deepseek.com/chat/completions'
  };
  const url = endpoints[prov];
  if(!url) throw new Error('Proveïdor desconegut: ' + prov);
  const model = cfg.model || (TOB_AI_DEFAULTS[prov] && TOB_AI_DEFAULTS[prov].model);
  // max_tokens acotado: en Groq free el límite de TPM cuenta entrada+salida.
  // DeepSeek i OpenRouter no tenen aquest límit tant estret, però mantenim
  // un sostre raonable per a no disparar la resposta.
  const payload = {
    model,
    messages,
    temperature: 0.6,
    max_tokens: prov === 'groq' ? 2500 : 4096
  };
  // response_format json_object: a Groq és fiable. A DeepSeek causa 400 si el
  // system prompt no conté la paraula "json" exactament, i a vegades altres
  // problemes — preferim no activar-lo per a DeepSeek (el prompt ja demana
  // JSON i el parser amb jsonrepair maneja qualsevol formatat).
  // En OpenRouter depèn del model; el prompt ja demana "només JSON".
  if(prov === 'groq') payload.response_format = { type:'json_object' };
  const r = await fetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + cfg.key },
    body: JSON.stringify(payload)
  });
  if(!r.ok){
    const bodyTxt = await r.text();
    // Loguem el body sencer per debugging (400 de DeepSeek/OpenRouter sol
    // venir amb un error JSON explicat — sense això no sabem què molesta).
    console.warn('[IA call] ' + prov + ' ' + r.status + ' — body:');
    console.warn('  ' + bodyTxt.slice(0, 800).replace(/\n/g, '\n  '));
    throw new Error(prov + ' ' + r.status + ': ' + bodyTxt.slice(0, 220));
  }
  const j = await r.json();
  return (((j.choices||[])[0]||{}).message||{}).content || '';
}

// ─── Fallback automàtic entre proveïdors ──────────────────────────────
// Itera l'ordre desat a cfg.fallbackOrder (filtrant pels que tenen clau).
// Si un proveïdor falla amb 429/413/500-503/error de xarxa, prova el següent.
// Tornem el resultat del primer que funcioni, o llançem l'últim error si tots
// fallen. Errors NO retryables (clau invàlida 401, model inexistent 404, etc.)
// també passen al següent — si no hi ha alternativa, l'usuari veurà l'error.
async function tobAiCallWithFallback(messages){
  const cfg = tobAiGetCfg();
  const disabled = new Set(Array.isArray(cfg.disabled) ? cfg.disabled : []);
  // Només proveïdors amb clau I activats participen al fallback
  const order = _tobAiNormalizedOrder(cfg).filter(p => (cfg.keys||{})[p] && !disabled.has(p));
  if(!order.length){
    const totDisabled = (cfg.disabled||[]).filter(p => (cfg.keys||{})[p]).length;
    const hint = totDisabled > 0
      ? 'Tens ' + totDisabled + ' proveïdor(s) desactivat(s). Obre ⚙ IA i prem "▶ Activar" en algun.'
      : 'Obre ⚙ IA i pega una clau a algun proveïdor.';
    throw new Error('No hi ha cap proveïdor d\'IA actiu. ' + hint);
  }
  // Errors que justifiquen passar al següent proveïdor.
  // 400 = Bad Request (típic quan el payload no és vàlid per a aquest proveïdor —
  //       altres proveïdors poden acceptar el mateix prompt correctament).
  // 401 = Unauthorized (clau invàlida — no podem continuar amb aquest provider).
  // 402 = Insufficient Balance (típic DeepSeek/Anthropic sense saldo).
  // 5xx = Errors del servidor (Gemini 503 "high demand", etc.).
  const isRetryable = (e) => {
    const m = e && e.message ? e.message : '';
    return /\b(400|401|402|408|413|429|500|502|503|504)\b/.test(m) ||
           /network|fetch|timeout|aborted|insufficient|overload/i.test(m);
  };
  let lastErr = null;
  const allErrors = [];   // [{prov, msg}] de tots els fallits per a un missatge útil al final
  for(let i = 0; i < order.length; i++){
    const prov = order[i];
    // Construir un cfg "actiu" per a aquest proveïdor concret
    const provCfg = Object.assign({}, cfg, {
      provider: prov,
      key:   (cfg.keys||{})[prov] || '',
      model: (cfg.models||{})[prov] || ''
    });
    try {
      if(i > 0){
        console.log('[IA fallback] Provant ' + prov + ' (intent ' + (i+1) + '/' + order.length + ')');
        tobToast('🔄 Fallback a ' + (TOB_AI_PROVIDER_LBL[prov] || prov) + '…', '');
      }
      const out = await tobAiCall(messages, provCfg);
      if(i > 0){
        console.log('[IA fallback] ✓ Resposta correcta des de ' + prov);
      }
      return out;
    } catch(e){
      lastErr = e;
      const errCode = (e.message || '').match(/\b(\d{3})\b/);
      allErrors.push({ prov, code: errCode ? errCode[1] : '?', msg: (e.message || String(e)).slice(0, 100) });
      console.warn('[IA fallback] ' + prov + ' ha fallat: ' + (e.message || e));
      // Sempre continuem al següent (l'error pot ser específic d'aquest proveïdor).
    }
  }
  // Tots han fallat — llancem un error informatiu amb el resum de tots els intents.
  const resum = allErrors.map(x => x.prov + ' ' + x.code).join(' · ');
  const enriched = new Error('Tots els proveïdors han fallat (' + resum + '). Detalls al log [IA fallback]. ' + (lastErr ? lastErr.message : ''));
  enriched.allErrors = allErrors;
  throw enriched;
}

// Extrae el objeto JSON de la respuesta del LLM (quita ``` y texto sobrante).
// Aplica reparacions tolerants per a JSON malformat típic de models petits
// (Gemini Flash, Llama 70B…): comentaris, trailing commas, comes FALTANTS
// entre propietats.
function tobAiParseJson(txt){
  let s = String(txt || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if(a >= 0 && b > a) s = s.slice(a, b + 1);
  // Tolerància base: comentaris i trailing commas (segur amb JSON ben format).
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1');
  s = s.replace(/,(\s*[\}\]])/g, '$1');

  // Primer intent: JSON.parse directe
  try { return JSON.parse(s); }
  catch(eFirst){
    // ── Auto-repair: comes faltants entre propietats. Típic de Gemini Flash.
    // Heurísticas — un valor seguit d'una nova propietat ("key":) sense coma:
    //   · "val"  "key":      →  "val", "key":
    //   · 123    "key":      →  123, "key":
    //   · }      "key":      →  }, "key":
    //   · ]      "key":      →  ], "key":
    //   · true/false/null    →  ídem
    // El \s+ inclou salts de línia. Limitem el lookahead al patró exacte de
    // començament de propietat ("\w+":).
    let repaired = s;
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*")(\s+)("[\w_-]+"\s*:)/g, '$1,$2$3');
    repaired = repaired.replace(/(\d+(?:\.\d+)?)(\s+)("[\w_-]+"\s*:)/g, '$1,$2$3');
    repaired = repaired.replace(/(\b(?:true|false|null)\b)(\s+)("[\w_-]+"\s*:)/g, '$1,$2$3');
    repaired = repaired.replace(/(\})(\s+)("[\w_-]+"\s*:)/g, '$1,$2$3');
    repaired = repaired.replace(/(\])(\s+)("[\w_-]+"\s*:)/g, '$1,$2$3');
    // També casos on un array element acabat enganxa amb el següent
    // ("foo", "bar"  "baz"  →  "foo", "bar", "baz")
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*")(\s+)("(?:[^"\\]|\\.)*"\s*[,\]])/g, '$1,$2$3');

    try { return JSON.parse(repaired); }
    catch(eSecond){
      // Tercer intent: jsonrepair (llibreria robusta carregada via CDN al HTML).
      // Maneja casos rars: strings sense tancar, caràcters de control no
      // escapats, comilles dolentes, claus duplicades, comments...
      const jr = (typeof window !== 'undefined') && (window.jsonrepair || (window.JSONRepair && window.JSONRepair.jsonrepair));
      if(typeof jr === 'function'){
        try {
          const fixed = jr(s);
          // Log per debug — útil per veure què va canviar.
          console.log('[tobAiParseJson] reparat amb jsonrepair (' + s.length + ' → ' + fixed.length + ' chars)');
          return JSON.parse(fixed);
        } catch(eThird){
          console.warn('[tobAiParseJson] jsonrepair també ha fallat:', eThird.message);
        }
      }
      // Loguem el JSON crudo per a poder diagnosticar el patró concret.
      console.warn('[tobAiParseJson] tots els repairs han fallat. Raw (primers 500 chars):\n' + s.slice(0, 500));
      const enriched = new Error(eFirst.message + ' (auto-repair també ha fallat — torna-ho a provar o canvia de model)');
      enriched.stack = eFirst.stack;
      throw enriched;
    }
  }
}

// Texto-resumen del perfil del cliente para el prompt de la IA.
function tobMcPerfilTexto(cli){
  const q = cli.cuestionario || {};
  const t = q.tags || {};
  const lbl = (group, id) => {
    const g = TOB_QUEST_CHIPS[group];
    const it = g && g.items.find(x => x.id === id);
    return it ? it.label : id;
  };
  const lbls = (group, ids) => (ids||[]).map(id => lbl(group, id)).join(', ');
  const L = [];
  L.push('Client: ' + cli.nombre + (cli.sexo==='M'?' (dona)':cli.sexo==='H'?' (home)':''));
  if(t.objectiu)      L.push('Objectiu: ' + lbl('objectiu', t.objectiu));
  if(q.kcalObjetivo)  L.push('Objectiu calòric diari: ' + q.kcalObjetivo + ' kcal');
  if(q.protObjetivo)  L.push('Proteïna objectiu diària: ' + q.protObjetivo + ' g');
  if(t.dieta)         L.push('Tipus de dieta: ' + lbl('dieta', t.dieta));
  if(t.proteina && t.proteina.length)   L.push('Proteïna animal: ' + lbls('proteina', t.proteina));
  if(t.pref && t.pref.length)           L.push('Preferències: ' + lbls('pref', t.pref));
  if(t.patologies && t.patologies.length) L.push('Patologies: ' + lbls('patologies', t.patologies));
  if(t.alergies && t.alergies.length)   L.push('AL·LÈRGIES (evitar SEMPRE): ' + t.alergies.join(', '));
  if(t.alimX && t.alimX.length)         L.push('Aliments que NO vol: ' + t.alimX.join(', '));
  if(t.alimOk && t.alimOk.length)       L.push('Aliments preferits: ' + t.alimOk.join(', '));
  if(t.sentenMal && t.sentenMal.length) L.push('Li senten malament: ' + t.sentenMal.join(', '));
  // Intoleràncies a adaptar (no excloure): el client farà servir versions aptes.
  const intol = t.intolerancia || [];
  const adapt = [];
  if(intol.includes('gluten') || (t.patologies||[]).includes('celiaquia')) adapt.push('GLUTEN (usa receptes amb pa/pasta normalment — el client comprarà la versió SENSE GLUTEN)');
  if(intol.includes('lactosa')) adapt.push('LACTOSA (usa receptes amb lactis normalment — el client comprarà versió SENSE LACTOSA)');
  if(intol.includes('fructosa')) adapt.push('FRUCTOSA (limita fruites amb molt sucre fructos, prioritza les baixes)');
  if(intol.includes('histamina')) adapt.push('HISTAMINA (limita peix blau curat, formatges curats, embutits, vi)');
  if(adapt.length){
    L.push('ADAPTAR (NO excloure) — el client té intolerància però el menú els porta amb versions aptes:');
    adapt.forEach(a => L.push('  · ' + a));
  }
  if(intol.length) L.push('Intoleràncies del client: ' + intol.join(', '));
  if(t.cuina)         L.push('Qui cuina: ' + lbl('cuina', t.cuina));
  if(t.tempsCuina)    L.push('Temps per cuinar: ' + lbl('tempsCuina', t.tempsCuina));
  // Estructura habitual de cada àpat (recordatori 24h)
  const rec = q.recChips || {};
  const recLines = TOB_MEALS
    .filter(a => Array.isArray(rec[a.id]) && rec[a.id].length)
    .map(a => '  · ' + a.label + ': ' + rec[a.id].join(', '));
  if(recLines.length){
    L.push('Estructura habitual dels àpats (respecta-la al muntar el menú):');
    recLines.forEach(line => L.push(line));
  }
  // ── Pistes per a la IA: àpat principal · quan té gana · variació · entrenament ──
  if(t.apatPrincipal && t.apatPrincipal !== 'cap'){
    L.push('Àpat MÉS IMPORTANT del client: ' + lbl('apatPrincipal', t.apatPrincipal) +
      ' — dedica-li més kcal i proteïna que als altres.');
  }
  if(t.gana && t.gana !== 'uniforme'){
    L.push('Quan té més gana: ' + lbl('gana', t.gana) + ' — reparteix les kcal coherentment amb això.');
  }
  if(t.variacio){
    const v = lbl('variacio', t.variacio);
    L.push('Tolerància a repetir plats: ' + v +
      (t.variacio === 'poca' ? ' — pots repetir més els plats principals.' :
       t.variacio === 'molta' ? ' — varia molt els plats; mai repeteixis dins de la setmana.' :
       ' — algunes repeticions OK, sense passar-se.'));
  }
  if(t.entrenoDies && t.entrenoDies.length){
    const dMap = { dl:0, dt:1, dc:2, dj:3, dv:4, ds:5, dg:6 };
    const ix = t.entrenoDies.map(d => dMap[d]).filter(x => x != null).sort((a,b)=>a-b);
    const DIAS = ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'];
    L.push('Dies d\'entrenament: ' + ix.map(i => DIAS[i]).join(', ') +
      (t.entrenoMoment ? ' (' + lbl('entrenoMoment', t.entrenoMoment).toLowerCase() + ')' : '') +
      ' — aquests dies poden tenir lleugerament més HC i kcal.');
  }
  if(q.comentari)     L.push('Notes addicionals: ' + q.comentari);
  return L.join('\n');
}

// Recetas candidatas para un momento: compatibles con el cliente + del
// momento. Los "platos sueltos" (origen ingrediente) se excluyen: son solo
// para colocación manual desde el panel, no para la IA ni el cambio de plato.
// strict=true → exige que la receta tenga ESE momento asignado (no vale
// "sin momento"). Se usa al cambiar un plato: solo alternativas del àpat.
function tobMcCandidatas(cli, comidaId, strict){
  const base = tobMcMealBase(comidaId);
  return (tobMenusDB.recetas || []).filter(r => {
    if(r.descartada) return false;
    const moms = r.momentos || [];
    // Receta sense classificar I sense ser favorita → auto-excloïda del catàleg
    // (criteri de Sergio: si no s'ha classificat ni marcat com a favorita, la IA
    // no la fa servir. Les favorites sí poden entrar encara que no tinguin
    // moments — el matching per nom (keyword) decideix on encaixen).
    if(moms.length === 0 && !r.favorito) return false;
    if(strict){ if(!moms.includes(base)) return false; }
    else if(moms.length && !moms.includes(base)) return false;
    return tobMcCheckCompat(r, cli).compat;
  });
}

// ─── Post-procés: forçar que els ingredients del recordatori es vegin al menú ───
// Per a cada àpat del client, si un dia NO té cap match amb els chips del
// recordatori, AFEGEIX un ingredient simple del catàleg que matchegi el chip.
//
// Així garantim que si el cuestionari diu "Iogurt + Fruits secs" al berenar,
// cada dia de berenar tindrà com a mínim un ingredient relacionat.
// No substitueix res — només AFEGEIX el que falta.
//
// Diccionari de keywords per chip del recordatori. La IA i el catàleg poden
// usar variants (català, espanyol, anglès) — aquí hi cabem totes.
const TOB_REC_CHIP_KEYWORDS = {
  'iogurt':         ['iogurt', 'yogur'],
  'cafe sol':       ['cafe sol', 'cafe negre', 'cafe sense llet', 'cafe solo'],
  'cafe amb llet':  ['cafe amb llet', 'cafe con leche', 'tallat', 'cafe llet'],
  'te infusio':     ['te ', ' te', 'infusio', 'infusion', 'tisana'],
  'fruita':         ['fruita', 'fruta', 'poma', 'platan', 'taronja', 'kiwi', 'maduixa', 'pera', 'mandar'],
  'fruits secs':    ['fruits secs', 'frutos secos', 'ametll', 'nous', 'avellan', 'pistatxo'],
  'torrades pa':    ['torrada', 'tostada', 'llesca', ' pa ', 'pan '],
  'cereals civada': ['cereal', 'civada', 'avena', 'muesli', 'granola'],
  'batut':          ['batut', 'batido', 'smoothie'],
  'ous salat':      ['ou ', ' ou', 'huevo', 'truita francesa', 'tortilla francesa', 'salat'],
  'dolc':           ['dolc', 'dulce', 'galeta', 'galleta'],
  'barreta':        ['barreta', 'barrita'],
  'entrepa petit':  ['entrepa', 'bocadillo', 'sandvitx', 'sandwich'],
  'plat unic':      [],   // sense match concret — la IA decideix
  'principal acompanyament': [],
  'porta postre':   ['postre', 'iogurt', 'fruita'],
  'porta pa':       ['pa', 'llesca', 'pan']
};
function _tobMcNormChip(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
}
function _tobMcForçaIngredientsRecordatori(cli){
  const q = cli && cli.cuestionario || {};
  const recChips = q.recChips || {};
  if(!recChips || !Object.keys(recChips).length) return { added:0, log:[] };
  if(!tobMcState) return { added:0, log:[] };

  // Per a un chip del recordatori, troba la millor recepta-ingredient del catàleg
  // (origen='ingrediente') que matcheja per keywords i té el moment correcte.
  const trobaIngForChip = (chipText, momentBase) => {
    const keys = TOB_REC_CHIP_KEYWORDS[_tobMcNormChip(chipText)];
    if(!keys || !keys.length) return null;
    const cand = (tobMenusDB.recetas||[]).filter(r =>
      r.origen === 'ingrediente' && !r.descartada &&
      (Array.isArray(r.momentos) ? r.momentos.includes(momentBase) || r.momentos.length === 0 : true) &&
      tobMcCheckCompat(r, cli).compat
    );
    for(const kw of keys){
      const found = cand.find(r => _tobMcNormChip(r.nombre).includes(kw));
      if(found) return found;
    }
    return null;
  };
  // Match d'un plat existent del dia amb algun chip del recordatori
  const dayHasMatch = (recIds, chips) => {
    if(!recIds.length) return false;
    return recIds.some(recId => {
      const r = (tobMenusDB.recetas||[]).find(x => x.id === recId);
      if(!r) return false;
      const nm = _tobMcNormChip(r.nombre);
      return chips.some(chip => {
        const kws = TOB_REC_CHIP_KEYWORDS[_tobMcNormChip(chip)];
        if(!kws || !kws.length) return false;
        return kws.some(kw => nm.includes(kw));
      });
    });
  };

  const log = [];
  let added = 0;
  const semanas = tobMcState.semanas;
  const DIA_LABEL = ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'];

  tobMcState.comidasIds.forEach(mealId => {
    const base = tobMcMealBase(mealId);
    // recChips usa la base (esmorzar/mig_mati/dinar/...) com a clau
    const chips = (recChips[base] || []).slice();
    if(!chips.length) return;

    // Pre-calculem el match d'ingredient per a cada chip
    const chipsIngs = chips.map(c => ({ chip: c, ing: trobaIngForChip(c, base) }))
                          .filter(x => x.ing);
    const chipsSenseIng = chips.filter(c => {
      const kws = TOB_REC_CHIP_KEYWORDS[_tobMcNormChip(c)];
      return kws && kws.length && !chipsIngs.find(x => x.chip === c);
    });
    chipsSenseIng.forEach(c => {
      log.push('ℹ ' + tobMcMealLabel(mealId) + ': chip "' + c + '" no té cap ingredient simple al catàleg — marca\'l com a "Usar com a plat solt" amb _iaMomentos.');
    });
    if(!chipsIngs.length) return;

    for(let s = 0; s < semanas; s++){
      for(let d = 0; d < 7; d++){
        const arr = ((tobMcState.data[s]||{})[d]||{})[mealId] || [];
        if(dayHasMatch(arr, chips)) continue;
        // No té match — afegim el primer chip disponible
        const toAdd = chipsIngs[0].ing;
        if(!tobMcState.data[s]) tobMcState.data[s] = {};
        if(!tobMcState.data[s][d]) tobMcState.data[s][d] = {};
        if(!Array.isArray(tobMcState.data[s][d][mealId])) tobMcState.data[s][d][mealId] = [];
        tobMcState.data[s][d][mealId].push(toAdd.id);
        added++;
        log.push('+ Setm ' + (s+1) + '·' + DIA_LABEL[d] + ' ' + tobMcMealLabel(mealId) + ': afegit "' + toAdd.nombre + '" (per chip "' + chipsIngs[0].chip + '")');
      }
    }
  });
  return { added, log };
}

// ── Generación automática del menú con IA ──────────────────────
async function tobMcGenerarIA(){
  if(!tobMcState){ tobToast('Selecciona un client primer', 'red'); return; }
  const cfg = tobAiGetCfg();
  if(!cfg.key){ tobToast('Configura la IA primer (botó ⚙ IA)', 'red'); tobAiOpenConfig(); return; }
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  if(!cli){ tobToast('Client no trobat', 'red'); return; }

  // ── PRE-CHECK: detectar desincronització menú ↔ cuestionario ──
  // Si Sergio ha canviat els àpats del cuestionari o els objectius kcal/prot
  // després de tenir el menú obert, l'avisem abans de generar — sinó la IA
  // generarà sobre dades antigues i ell es preguntarà per què no respecta els
  // canvis. Mostrem un sol diàleg amb tots els canvis detectats.
  const apatsCuest = (cli.cuestionario && cli.cuestionario.tags && cli.cuestionario.tags.apats) || [];
  const apatsMenu  = tobMcState.comidasIds || [];
  const apatsDiff  = apatsCuest.length && (
    apatsCuest.length !== apatsMenu.length ||
    apatsCuest.some(a => !apatsMenu.includes(a)) ||
    apatsMenu.some(a => !apatsCuest.includes(a))
  );
  const kcalCuest = (cli.cuestionario||{}).kcalObjetivo;
  const protCuest = (cli.cuestionario||{}).protObjetivo;
  const kcalMenu  = parseFloat(document.getElementById('tobMcKcal').value);
  const protMenu  = parseFloat(document.getElementById('tobMcProt').value);
  const kcalDiff  = kcalCuest && isFinite(kcalMenu) && Math.abs(kcalCuest - kcalMenu) > 50;
  const protDiff  = protCuest && isFinite(protMenu) && Math.abs(protCuest - protMenu) > 10;
  if(apatsDiff || kcalDiff || protDiff){
    const diffs = [];
    if(apatsDiff){
      diffs.push('• ÀPATS:\n   Cuestionari: ' + (apatsCuest.map(tobMcMealLabel).join(', ') || '(buit)') +
                 '\n   Menú actual: ' + (apatsMenu.map(tobMcMealLabel).join(', ') || '(buit)'));
    }
    if(kcalDiff){
      diffs.push('• KCAL/DIA:  Cuestionari ' + kcalCuest + '  vs  Menú ' + kcalMenu);
    }
    if(protDiff){
      diffs.push('• PROTEÏNA/DIA:  Cuestionari ' + protCuest + 'g  vs  Menú ' + protMenu + 'g');
    }
    const sync = confirm(
      'El qüestionari del client té dades diferents que el menú actual:\n\n' +
      diffs.join('\n\n') +
      '\n\nVols SINCRONITZAR (usar els valors del cuestionari) abans de generar?\n' +
      '  · Sí → s\'apliquen els valors del cuestionari, després generem\n' +
      '  · No → generem amb els valors actuals del menú (els que veus a la pantalla)'
    );
    if(sync){
      if(apatsDiff){
        tobMcState.comidasIds = apatsCuest.slice();
        // Crear arrays buits per als àpats nous
        for(let s = 0; s < tobMcState.semanas; s++){
          if(!tobMcState.data[s]) tobMcState.data[s] = {};
          for(let d = 0; d < 7; d++){
            if(!tobMcState.data[s][d]) tobMcState.data[s][d] = {};
            apatsCuest.forEach(id => {
              if(!Array.isArray(tobMcState.data[s][d][id])) tobMcState.data[s][d][id] = [];
            });
          }
        }
      }
      if(kcalDiff) document.getElementById('tobMcKcal').value = kcalCuest;
      if(protDiff) document.getElementById('tobMcProt').value = protCuest;
      tobMcRenderGrid();
      tobToast('✓ Sincronitzat amb el qüestionari', 'green');
    }
  }

  const comidas = (tobMcState.comidasIds || []).map(id => ({ id, label: tobMcMealLabel(id) }));
  if(!comidas.length){ tobToast('El client no té àpats definits al qüestionari', 'red'); return; }
  if(!(tobMenusDB.recetas||[]).length){ tobToast('No hi ha receptes importades', 'red'); return; }

  if(tobMenuCountRecetas({ data: tobMcState.data }) > 0 &&
     !confirm('Això reemplaçarà el menú actual. Continuar?')) return;

  const btn = document.getElementById('tobMcGenerarIA');
  const btnTxt = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Generant…'; }
  try {
    const kcal = parseFloat(document.getElementById('tobMcKcal').value) || (cli.cuestionario||{}).kcalObjetivo || 2000;
    const prot = parseFloat(document.getElementById('tobMcProt').value) || (cli.cuestionario||{}).protObjetivo || null;
    const margen = parseFloat(document.getElementById('tobMcMargen').value) || 10;
    const semanas = tobMcState.semanas;

    // Catálogo de recetas por momento. Groq free tiene un límite de tokens
    // muy bajo (~6000 TPM) → catálogo reducido. El resto de proveedores
    // (Gemini, Anthropic, OpenRouter) admiten prompts grandes.
    const soloFav = !!(document.getElementById('tobMcIaSoloFav') || {}).checked;
    // Ingredients simples (∙) que la IA pot usar com a complement de qualsevol
    // àpat — abans només s'oferien per a mig matí/berenar i això limitava molt:
    // si el client esmorza "torrades + cafè", l'IA necessita poder seleccionar
    // ingredients simples també a l'esmorzar (i a dinar/sopar com a guarnició
    // amb oli, pa, fruita…).
    // Els plats sueltos (origen ingrediente) ara entren via tobMcCandidatas amb
    // els seus _iaMomentos. Ja no necessitem injectar-los a part — el catàleg
    // per moment ja els porta classificats correctament.

    // ── Inferència per nom: si una recepta NO té moment classificat però el
    // seu nom suggereix clarament un àpat (ex: "Tostada amb tomàquet" → esmorzar,
    // "Bocadillo" → esmorzar/berenar), la considerem candidata per a aquest àpat.
    // NOMÉS s'aplica a receptes FAVORITES sense classificar — la resta de
    // receptes sense classificar i sense favorit s'auto-excloen (criteri de
    // Sergio). El canvi manual de plat (swap) segueix usant tobMcCandidatas estricte.
    const TOB_KW = {
      esmorzar: ['tostada','torrada','pa amb','bocadillo','sandvitx','sandwich','sandwitx','pa amb tomaquet','llesca','tortilla','truita','batid','smoothie','iogurt','muesli','porridge','pancake','crep','cereal','barreta','barrita','muffin','xocolata calenta','desdejuni','desayuno','breakfast','pa integral','focaccia'],
      mig_mati: ['fruita','iogurt','barreta','barrita','grapat','fruits secs','snack','olives','pernil','formatge','barrita','tostada','sandvitx','bocadillo','batid','smoothie','infusio'],
      dinar:    ['pollastre','vedella','porc','xai','peix','llen','lluc','bacalla','tonyina','salmo','sardin','llegum','llent','cigro','mongeta','arros','pasta','quinoa','wok','amanida','crema','sopa','guisat','estofat','rostit','planxa','forn','curry','risotto','paella','fideu','tabule','poke'],
      berenar:  ['fruita','iogurt','barreta','barrita','grapat','batid','smoothie','bocadillo','sandvitx','sandwitx','tostada','torrada','xocolata','formatge','pernil','barreta'],
      sopar:    ['truita','tortilla','peix','llen','lluc','salmo','bacalla','amanida','crema','sopa','wok','pollastre','vedella','llegum','pasta','quinoa','arros','planxa','forn','revolt','sandvitx','bocadillo','tabule','poke','quitxe','quiche','pizza']
    };
    const _tobMatchKW = (nom, base) => {
      const n = String(nom||'').toLowerCase();
      const kws = TOB_KW[base] || [];
      return kws.some(kw => n.includes(kw));
    };
    // Catàleg de receptes "inferides per nom" — només receptes SENSE momento
    // classificat (les ja classificades es deixen tal com estan). Es calcula
    // un cop i es reutilitza per cada comida.
    const recsSinMomento = (tobMenusDB.recetas || []).filter(r =>
      r.origen !== 'ingrediente' && !r.descartada
      && !(r.momentos && r.momentos.length)
      && r.favorito                                      // només favorites entren per inferència
      && tobMcCheckCompat(r, cli).compat
    );

    let catalogo = '';
    const validIds = new Set();
    // Groq free tier té un límit de tokens molt baix (~6000 TPM). Per a
    // estalviar tokens, retallem el catàleg I omettem el camp "ings" amb els
    // ingredients de cada recepta. La IA perdrà precisió per a emetre "ing"
    // però evitarem l'error 413.
    const isGroq = cfg.provider === 'groq';
    const totalCap = isGroq ? 80 : 600;
    const capPorMomento = Math.max(8, Math.floor(totalCap / comidas.length));
    let inferidasTotales = 0;
    comidas.forEach(c => {
      const base = tobMcMealBase(c.id);
      let cand = tobMcCandidatas(cli, c.id);   // ya excluye platos sueltos
      if(soloFav) cand = cand.filter(r => r.favorito);
      // Añadir recetas inferidas por keyword (las no clasificadas pero cuyo nombre
      // sugiere claramente este àpat). Si soloFav, solo si la receta es favorita.
      const inferidas = recsSinMomento.filter(r => {
        if(soloFav && !r.favorito) return false;
        if(cand.includes(r)) return false;
        return _tobMatchKW(r.nombre, base);
      });
      inferidasTotales += inferidas.length;
      cand = cand.concat(inferidas);
      const favs = cand.filter(r => r.favorito);
      const rest = cand.filter(r => !r.favorito);
      // Separar ingredients simples (∙) de receptes elaborades dins de "rest".
      // Els ingredients simples NO es barajen i van SEMPRE primer després dels
      // favorits — així la IA els veu primer i els prioritza si el recordatori
      // del client menciona "Iogurt", "Cafè", "Fruita", etc.
      const restIng = rest.filter(r => r.origen === 'ingrediente');
      const restRec = rest.filter(r => r.origen !== 'ingrediente');
      for(let i = restRec.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = restRec[i]; restRec[i] = restRec[j]; restRec[j] = tmp;
      }
      // Favorits + tots els ingredients simples (sempre entren) + receptes barajades fins al tope.
      const minSlice = favs.length + restIng.length;
      cand = favs.concat(restIng).concat(restRec).slice(0, Math.max(capPorMomento, minSlice));
      catalogo += '\n# ' + c.label + ' (id="' + c.id + '")\n';
      cand.forEach(r => {
        validIds.add(r.id);
        const mm = tobRecMacros(r); const rac = r.raciones || 1;
        const tag = r.favorito ? '★' : (r.origen === 'ingrediente' ? '∙' : '');
        const rolCode = ({ principal:'P', acompanyament:'A', postre:'D', basic:'B' })[r.rol] || '?';
        // Top ingredients amb grams — així la IA sap els noms exactes per
        // emetre "ing" correctament. Per a Groq (límit de tokens molt baix)
        // OMETEM aquesta info per estalviar prompt size.
        let ingStr = '';
        if(!isGroq){
          const topIngs = (r.ingredientes || [])
            .map(it => {
              const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
              const nom = (ing && ing.nombre) || it._nombreFallback || '';
              const g = (+it.gramos || 0) / rac;
              return { nom, g };
            })
            .filter(x => x.nom && x.g > 0)
            .sort((a,b) => b.g - a.g)
            .slice(0, 4);
          if(topIngs.length){
            // "Pechuga de pollo" → "pollo" (primera paraula útil).
            const shortNom = s => {
              const w = String(s).toLowerCase()
                .replace(/[,.()]/g,' ')
                .split(/\s+/)
                .filter(x => x.length > 2 && !/^(de|del|la|el|los|las|amb|con|y|i|en|sin|sense)$/.test(x));
              return w[0] || String(s).toLowerCase();
            };
            ingStr = '|ings:' + topIngs.map(x => shortNom(x.nom) + ' ' + Math.round(x.g) + 'g').join(',');
          }
        }
        catalogo += r.id + '|' + tag + r.nombre + '|' + Math.round(mm.kcal/rac) + 'k|' + Math.round(mm.proteina/rac) + 'p|' + rolCode + ingStr + '\n';
      });
    });
    if(inferidasTotales > 0){
      console.log('[IA menú] ' + inferidasTotales + ' recepta(es) afegides al catàleg per inferència del nom (sense classificació explícita).');
    }

    // ── Diagnòstic d'ingredients simples al catàleg ──
    // Llistem què hi ha al catàleg de la IA agrupat per àpat. Sergio podrà
    // veure d'un cop si els seus ingredients (Cafè, Iogurt, Fruita...) entren.
    try {
      const ingsPerApat = {};
      comidas.forEach(c => { ingsPerApat[c.label] = []; });
      // Re-recórrer per separar ingredients simples per àpat (separats per # X (id="..."))
      const sections = catalogo.split(/\n# /).filter(Boolean);
      sections.forEach(sec => {
        const lines = sec.split('\n').filter(Boolean);
        const label = (lines[0] || '').split(' (id=')[0];
        lines.slice(1).forEach(line => {
          if(line.includes('|∙')){
            const nm = (line.split('|')[1] || '').replace(/^∙/,'').trim();
            if(!ingsPerApat[label]) ingsPerApat[label] = [];
            ingsPerApat[label].push(nm);
          }
        });
      });
      const totIngs = Object.values(ingsPerApat).reduce((a,b) => a + b.length, 0);
      console.log('────────── [IA menú] CATÀLEG INGREDIENTS SIMPLES ──────────');
      console.log('  Total ingredients simples (∙) al catàleg de la IA: ' + totIngs);
      Object.entries(ingsPerApat).forEach(([apat, list]) => {
        console.log('  · ' + apat + ' (' + list.length + '): ' + (list.join(', ') || '(cap)'));
      });
      if(totIngs === 0){
        console.warn('  ⚠ Cap ingredient simple al catàleg. Probables causes:');
        console.warn('     · Cap ingredient té comoPlato=true al teu catàleg');
        console.warn('     · Cap té iaMomentos marcats (caixes del modal d\'ingredient)');
        console.warn('     · O has editat els ingredients abans del fix de sync momentos — re-edita i guarda');
      }
      console.log('───────────────────────────────────────────────────────────');
    } catch(e){ console.warn('[diagnòstic ings]', e); }

    const sys = 'Ets un dietista-nutricionista expert. Crees menús setmanals personalitzats, '
      + 'variats i equilibrats. Respons NOMÉS amb un objecte JSON vàlid, sense text addicional.';
    // Reglas editables desde ⚙ IA (con sustitución de {kcal}/{margen}/{prot}).
    const rules = (cfg.menuRules || TOB_AI_MENU_RULES_DEFAULT)
      .replace(/\{margen\}/g, margen)
      .replace(/\{kcal\}/g, Math.round(kcal))
      .replace(/\{prot\}/g, prot ? Math.round(prot) : 'la indicada');
    const user = [
      'PERFIL DEL CLIENT:', tobMcPerfilTexto(cli), '',
      'OBJECTIUS DIARIS: ' + Math.round(kcal) + ' kcal (±' + margen + '%)'
        + (prot ? ', ' + Math.round(prot) + ' g de proteïna' : ''),
      '',
      'ESTRUCTURA: ' + semanas + ' setmana(es) · 7 dies (0=Dilluns … 6=Diumenge) · àpats: '
        + comidas.map(c => '"' + c.id + '"').join(', ') + '.',
      '',
      'RECEPTES DISPONIBLES — tria NOMÉS d\'aquesta llista, pel seu id.',
      'Format de cada línia: id|nom|kcal|proteïna|rol|ings:<top-4 ingredients amb grams per ració>',
      'Ex: rec_x|Truita francesa|320k|18p|P|ings:ous 100g,oli 5g',
      'Marques davant del nom: ★ = preferida del client (prioritza-la). ∙ = ingredient simple (iogurt, fruita, fruits secs).',
      'Rol del plat: P=principal · A=acompanyament · D=postre · B=bàsic/esmorzar · ?=sense classificar.',
      'Camp "ings": els ingredients principals de la recepta. Quan emetis "ing" als ajustes, fes servir EXACTAMENT els noms que apareixen aquí (ex: si veus "ings:pollastre 150g", emet "ing":{"pollastre":200}).',
      '',
      'IMPORTANT — USA EL NOM COM A PISTA quan el rol és "?" o quan el catàleg sembla curt:',
      '· Si una recepta es diu "Tostada amb tomàquet", "Pa amb formatge", "Bocadillo de pollastre", "Sandvitx vegetal" → encaixa perfectament a ESMORZAR (i sovint a BERENAR/SOPAR).',
      '· Si es diu "Iogurt amb fruita", "Batut de proteïna", "Smoothie", "Crep dolç" → ESMORZAR / MIG MATÍ / BERENAR.',
      '· Si es diu "Truita francesa", "Pizza vegetal", "Quitxe" → SOPAR (lleuger).',
      '· Si es diu "Pollastre/Vedella/Peix amb verdures/arròs/quinoa", "Llegums guisats", "Pasta integral" → DINAR / SOPAR.',
      'NO ignoris una recepta que pel nom encaixa òbviament en un àpat només perquè la seva línia del catàleg pertany a un altre.',
      'Pots usar la mateixa recepta a àpats diferents si té sentit (ex: una amanida pot anar a dinar i a sopar).',
      catalogo, '',
      rules,
      '',
      'FORMAT DE RESPOSTA (només JSON vàlid, SENSE comentaris ni text extra):',
      'Un objecte amb una clau numèrica per cada setmana ("0","1",…). Cada setmana és un array de 7 dies (0=Dilluns…6=Diumenge).',
      'Cada dia és un objecte {comida_id:[id_recepta,…]}.',
      'Exemple d\'un dia: {' + comidas.map(c => '"' + c.id + '":["ID_RECEPTA"]').join(',') + '}',
      '',
      'CAMP "ajustes" (al mateix nivell que les setmanes) — IMPORTANT, ÚSAL si fa falta per quadrar:',
      '{',
      '  "ID_RECEPTA": {',
      '    "factor": 1.5,                              ← OPCIONAL · escala TOTA la recepta',
      '    "ing":    { "pollastre": 200, "arros": 80 },← OPCIONAL · grams d\'INGREDIENTS específics (per ració)',
      '    "motiu":  "pujar prot sense afegir kcal innecessàries"',
      '  }',
      '}',
      '',
      'Quan usar "factor" vs "ing":',
      '· FACTOR (escala tota la recepta) → quan vols pujar TOT (kcal+prot+greixos) coherentment.',
      '  Ex: dia de descans, plat senzill, vols ració més gran en general.',
      '  Rangs útils: 0.6 a 1.8. Prefereix valors limpios: 0.5, 1, 1.5, 2 (decimals si donen grams nets).',
      '',
      '· ING (grams d\'ingredients individuals) → quan vols pujar NOMÉS la proteïna.',
      '  Ex: falten 20 g prot al dia — millor pujar el pollastre de 150 a 200 g',
      '  que escalar tot el plat (que afegiria kcal innecessàries de verdures/sallses).',
      '  Usa noms genèrics en cat/cas (pollastre, salmó, lluç, tonyina, vedella, arròs, pasta',
      '  ous, llenties, formatge…). El parser fa match suau contra els ingredients reals.',
      '  Grams permesos: fins ~2× del valor base de cada ingredient (es talla automàticament si et passes).',
      '',
      'PRIORITAT (segons criteri del dietista):',
      '  1r. Si falta proteïna → "ing" amb el protein source del plat principal',
      '  2n. Si falten kcal però la prote ja està → "ing" amb l\'acompanyament (arròs, pasta, patata…)',
      '  3r. Si tot va escalat coherentment → "factor"',
      'PROHIBIT afegir un ingredient simple solt (un iogurt random) al final del dia per quadrar.',
      '',
      '· Aplica a TOTES les aparicions d\'aquesta recepta al menú.',
      '· Pots combinar factor + ing en el mateix ajust si fa falta.',
      '· Pots tenir tants ajustes com vulguis (un per recepta).',
      '· REGLA: si un dia es queda > 10% per sota de l\'objectiu de kcal o prot, AJUSTA abans de tancar el dia.',
      '· Si tot el menú quadra sense ajustar, omet "ajustes" o posa-l\'ho buit ({}).'
    ].join('\n');

    tobToast('🤖 La IA està generant el menú… pot trigar uns segons', '');
    const raw = await tobAiCallWithFallback([{ role:'system', content:sys }, { role:'user', content:user }]);
    const parsed = tobAiParseJson(raw);

    // Vuelca un menú parseado al estado. Devuelve nº de platos colocados.
    // Format esperat: { "0":[día0,...], "1":[...], "ajustes": {...} }
    //   · les claus numèriques són les setmanes
    //   · "ajustes" (opcional) al mateix nivell — mai dins de "data"
    // Compat: si la IA envia { "data": { "0": [...] } } també l'acceptem.
    const aplicar = (pj) => {
      let n = 0;
      let descartados = 0;          // IDs no presents al catàleg (debug)
      let semanasConDatos = 0;
      const dataSrc = (pj && typeof pj === 'object' && pj.data && typeof pj.data === 'object') ? pj.data : pj;
      for(let s = 0; s < semanas; s++){
        const wk = dataSrc[s] != null ? dataSrc[s] : dataSrc[String(s)];
        if(!Array.isArray(wk)) continue;
        semanasConDatos++;
        if(!tobMcState.data[s]) tobMcState.data[s] = {};
        for(let d = 0; d < 7; d++){
          if(!tobMcState.data[s][d]) tobMcState.data[s][d] = {};
          const day = wk[d];
          comidas.forEach(c => {
            const ids = day && typeof day === 'object' ? day[c.id] : null;
            if(Array.isArray(ids)){
              ids.forEach(id => { if(!validIds.has(id)) descartados++; });
            }
            const ok = Array.isArray(ids) ? ids.filter(id => validIds.has(id)) : [];
            tobMcState.data[s][d][c.id] = ok;
            n += ok.length;
          });
        }
      }
      if(!n){
        // Diagnòstic per a Sergio — TOT escrit en línies separades a la consola
        // perquè no calgui expandir objectes. Comprova-ho amb F12 → Console.
        const claus = pj && typeof pj === 'object' ? Object.keys(pj) : [];
        const prim = dataSrc && dataSrc[0];
        const primTipo = Array.isArray(prim) ? 'array(' + prim.length + ')' : typeof prim;
        const primMostra = JSON.stringify(prim).slice(0, 250);
        const primDia = (Array.isArray(prim) ? prim[0] : null);
        const idsCatRandom = Array.from(validIds).slice(0, 5);
        console.warn('────────── [IA menú] DIAGNÒSTIC FALLAT ──────────');
        console.warn('  ⚠ NO s\'ha trobat cap recepta vàlida al JSON de la IA');
        console.warn('  · Setmanes esperades: ' + semanas);
        console.warn('  · Setmanes amb dades: ' + semanasConDatos);
        console.warn('  · IDs descartats (no estan al catàleg): ' + descartados);
        console.warn('  · Claus del JSON rebut: [' + claus.join(', ') + ']');
        console.warn('  · Tipus primera setmana: ' + primTipo);
        console.warn('  · Mostra primera setmana: ' + primMostra);
        if(primDia) console.warn('  · Primer dia (tipus ' + typeof primDia + '): ' + JSON.stringify(primDia).slice(0, 250));
        console.warn('  · IDs catàleg vàlids (5 exemples): [' + idsCatRandom.join(', ') + ']');
        console.warn('  · Total IDs vàlids al catàleg: ' + validIds.size);
        console.warn('  · Raw IA (300 chars):');
        console.warn('    ' + String(raw || '').slice(0, 300).replace(/\n/g, '\n    '));
        console.warn('─────────────────────────────────────────────────');
      }
      // Bolcar ajustos emesos per la IA — només per a receptes que estan al menú
      // i amb factor dins del rang permès. Marquem fuente:'ia' per traçabilitat.
      tobMcState.ajustes = tobMcState.ajustes || {};
      const ajRaw = (pj && typeof pj === 'object' && pj.ajustes && typeof pj.ajustes === 'object') ? pj.ajustes : null;
      if(ajRaw){
        const usadosNow = new Set();
        Object.values(tobMcState.data||{}).forEach(sem =>
          Object.values(sem||{}).forEach(dia =>
            Object.values(dia||{}).forEach(arr =>
              (arr||[]).forEach(id => usadosNow.add(id)))));
        Object.keys(ajRaw).forEach(recId => {
          if(!validIds.has(recId) || !usadosNow.has(recId)) return;
          const a = ajRaw[recId] || {};
          const factor = tobMcClampFactor(a.factor != null ? a.factor : 1);
          // Acceptem ALSO ing (gramos d'ingredients individuals). La IA emet noms
          // genèrics (pollastre, salmó, arròs...). Matchem aquests noms contra els
          // ingredients reals de la recepta amb normalització suau (lowercase, sense
          // accents, comparació per substring en els dos sentits). Si no hi ha
          // match, l'entrada s'ignora silenciosament — millor que aplicar a un
          // ingredient incorrecte.
          const ingMap = {};
          if(a.ing && typeof a.ing === 'object'){
            const rec = (tobMenusDB.recetas||[]).find(x => x.id === recId);
            if(rec && Array.isArray(rec.ingredientes)){
              const norm = s => String(s||'').toLowerCase()
                .normalize('NFD').replace(/[̀-ͯ]/g,'')
                .replace(/[^a-z0-9]+/g,' ').trim();
              const ingNoms = rec.ingredientes.map(it => {
                const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
                return { it, nom: norm((ing && ing.nombre) || it._nombreFallback || '') };
              });
              Object.keys(a.ing).forEach(key => {
                const targetG = parseFloat(a.ing[key]);
                if(!isFinite(targetG) || targetG <= 0) return;
                const keyNorm = norm(key);
                if(!keyNorm) return;
                // Match: el nom del ingredient REAL conté el que diu la IA, o viceversa.
                const found = ingNoms.find(x => x.nom.includes(keyNorm) || keyNorm.includes(x.nom));
                if(!found || !found.it.ingId) return;
                const baseG = +found.it.gramos || 0;
                // Aplicar cap (TOB_MC_ING_CAP = 2.2× del base, per a què no es disparin).
                const capped = baseG > 0 ? Math.min(targetG, baseG * TOB_MC_ING_CAP) : targetG;
                ingMap[found.it.ingId] = Math.round(capped);
              });
            }
          }
          const aj = {
            factor,
            ing: Object.keys(ingMap).length ? ingMap : undefined,
            motiu: String(a.motiu || '').slice(0, 140),
            fuente: 'ia'
          };
          if(tobMcAjusteActivo(aj)) tobMcState.ajustes[recId] = aj;
        });
      }
      tobMcPruneAjustes();
      return n;
    };
    let puestos = aplicar(parsed);
    if(!puestos){
      // Diagnòstic ràpid per a Sergio quan veu aquest error:
      const totRec = (tobMenusDB.recetas || []).filter(r => !r.descartada).length;
      const soloFavOn = !!(document.getElementById('tobMcIaSoloFav') || {}).checked;
      const nFavs = (tobMenusDB.recetas || []).filter(r => r.favorito && !r.descartada).length;
      console.warn('[IA menú] CAUSA possible:', {
        catalegRecetes_totals: totRec,
        soloFav_activat: soloFavOn,
        receptes_favorites: nFavs,
        hint: soloFavOn && nFavs < 10 ? '⚠ "Solo favoritas" actiu i poques favorites — desmarca el checkbox' :
              totRec < 10 ? '⚠ Catàleg molt petit — importa més receptes' :
              'La IA pot haver inventat IDs. Prova un altre proveïdor (DeepSeek, Anthropic).'
      });
      throw new Error('la IA no ha retornat receptes vàlides. Obre F12 → Console i mira [IA menú] per detalls. Possibles causes: catàleg petit, "solo favoritas" sense favorites, o IA inventa IDs (canvia de proveïdor).');
    }

    // ── Corrección 2a pasada: días lejos del objetivo (kcal O prot) ──
    // La IA tendeix a quedar-se curta — sobretot de proteïna. Aquesta 2a passada
    // li diu exactament quins dies van curts i en què, per a què faci servir
    // ajustes (factor 1.0-1.8) o afegeixi ingredients simples (∙) en lloc de
    // substituir plats sencers.
    try {
      const recById = {};
      (tobMenusDB.recetas||[]).forEach(r => { recById[r.id] = r; });
      const dayMacros = (s,d) => {
        let k = 0, p = 0;
        comidas.forEach(c => ((((tobMcState.data[s]||{})[d])||{})[c.id]||[]).forEach(id => {
          const r = recById[id]; if(!r) return;
          const m = tobMcMacros(r, tobMcState.ajustes);
          const rac = r.raciones || 1;
          k += m.kcal / rac; p += m.proteina / rac;
        }));
        return { k, p };
      };
      const kLo = kcal * (1 - margen/100);
      const kHi = kcal * (1 + margen/100);
      const pLo = prot ? prot * 0.90 : null;
      // Funció: identificar dies fora de marge a l'estat actual.
      const detectarFueras = () => {
        const out = [];
        for(let s = 0; s < semanas; s++) for(let d = 0; d < 7; d++){
          const { k, p } = dayMacros(s, d);
          if(k <= 0) continue;
          const problemas = [];
          if(k < kLo) problemas.push('kcal=' + Math.round(k) + ' (falten ~' + Math.round(kcal - k) + ' kcal)');
          else if(k > kHi) problemas.push('kcal=' + Math.round(k) + ' (passat ~' + Math.round(k - kcal) + ' kcal)');
          if(pLo && p < pLo) problemas.push('prot=' + Math.round(p) + 'g (falten ~' + Math.round(prot - p) + 'g)');
          if(problemas.length) out.push({ s, d, problemas, k, p });
        }
        return out;
      };
      // Iteració de correcció: fins a 3 passades. Cada passada veu el resultat
      // de l'anterior i pressiona més fort.
      let conversa = [
        { role:'system', content:sys },
        { role:'user', content:user },
        { role:'assistant', content:raw }
      ];
      // Pasadas configurables des de ⚙ IA (default 3, mínim 0 = sense correcció).
      const MAX_PASADAS = Math.max(0, Math.min(3,
        parseInt(cfg.maxPasadas, 10) != null && isFinite(parseInt(cfg.maxPasadas, 10))
          ? parseInt(cfg.maxPasadas, 10)
          : 3
      ));
      let passada = 0;
      let fueras = detectarFueras();
      while(fueras.length && passada < MAX_PASADAS){
        passada++;
        const muyLejos = fueras.filter(f => f.k > 0 && f.k < kcal * 0.7);
        const prefixe = passada === 1 ? '🤖 Corregint dies que no quadren…'
                      : passada === 2 ? '🤖 Repassant — encara queden ' + fueras.length + ' dies fora…'
                                       : '🤖 Última passada — encara hi ha ' + fueras.length + ' dies fora…';
        tobToast(prefixe, '');
        let fixUser =
          'Passada ' + passada + '/' + MAX_PASADAS + ' de correcció. ' +
          'Objectiu: ' + Math.round(kcal) + ' kcal/dia' + (prot ? ' i ' + Math.round(prot) + ' g prot' : '') + '.\n\n' +
          'Dies que encara NO compleixen:\n' +
          fueras.map(f => '· setmana ' + f.s + ' · dia ' + f.d + ' (' + ['Dl','Dt','Dc','Dj','Dv','Ds','Dg'][f.d] + '): ' + f.problemas.join(' · ')).join('\n');
        if(muyLejos.length){
          fixUser += '\n\n⚠ CRÍTIC: ' + muyLejos.length + ' dia(es) estan a < 70% de l\'objectiu. Has de pujar les racions MOLT, no només una mica.';
        }
        if(passada === 1){
          fixUser +=
            '\n\nUSA EL CAMP "ings" del catàleg de receptes per saber el nom dels ingredients i emetre "ing" amb noms EXACTES.\n' +
            '\nExemple concret: si la línia del catàleg és\n' +
            '  rec_x|Pollastre amb arròs|350k|30p|P|ings:pollastre 150g,arroz 60g\n' +
            'i necessites pujar el dia 600 kcal i 30g prot, emet:\n' +
            '  "ajustes": {\n' +
            '    "rec_x": { "ing": { "pollastre": 250, "arroz": 100 }, "motiu": "pujar prot+kcal del dia" }\n' +
            '  }\n' +
            '\nNO siguis tímid. Pujar de 150g a 200g només dona +25g prot — ja no n\'hi ha prou. Salta a 250g sense por.';
        } else if(passada === 2){
          fixUser +=
            '\n\nLa correcció anterior NO ha quadrat. AUGMENTA encara més les racions, o si el plat no es pot estirar més, ' +
            'SUBSTITUEIX el plat per un altre del catàleg més calòric (mira la columna kcal).\n' +
            '\nSi un plat principal té només 350 kcal i necessites 800 kcal, ja no compensa ajustar — canvia per un de 600+ kcal.';
        } else {
          fixUser +=
            '\n\nÚLTIMA OPORTUNITAT. La correcció anterior segueix sense quadrar. Sigues MOLT més agressiu:\n' +
            '- Canvia els plats principals per altres més calòrics si l\'ajust no n\'hi ha prou\n' +
            '- Combina principal + acompanyament + un altre acompanyament si cal\n' +
            '- factor 2 o ing amb el doble dels grams base — el que sigui';
        }
        fixUser +=
          '\n\nOrdre d\'acció:\n' +
          '1. AJUSTA "ing" amb la prote del plat principal (múltiples de 25g per carns/peixos).\n' +
          '2. AJUSTA "ing" amb l\'acompanyament (múltiples de 10g per cereals).\n' +
          '3. Si l\'ajust no n\'hi ha prou, SUBSTITUEIX el plat per un altre més calòric.\n' +
          '4. PROHIBIT afegir peces soltes random al final del dia.\n' +
          '\nRetorna el menú SENCER en el mateix format JSON. Els dies que ja anaven bé, deixa\'ls igual.';

        const rawN = await tobAiCallWithFallback(conversa.concat([{ role:'user', content:fixUser }]));
        conversa = conversa.concat([
          { role:'user', content:fixUser },
          { role:'assistant', content:rawN }
        ]);
        const n2 = aplicar(tobAiParseJson(rawN));
        if(n2) puestos = n2;
        fueras = detectarFueras();
      }
      if(passada > 0){
        console.log('[IA correcció] ' + passada + ' passada(es) executada(es). Dies encara fora: ' + fueras.length);
      }
    } catch(e){ console.warn('[IA correcció]', e); }

    // ── POST-PROCÉS: ingredients del recordatori del client ──
    // La IA sovint oblida posar el iogurt, fruita, cafè... que el client té
    // marcats al recordatori del cuestionario. Aquí ho garantim manualment:
    // per cada àpat del client, mirem si cada dia té com a mínim UN match
    // amb algun dels chips del recordatori. Si no, afegim l'ingredient simple
    // corresponent del catàleg.
    try {
      const parche = _tobMcForçaIngredientsRecordatori(cli);
      if(parche.added > 0){
        console.log('[IA post-procés] ✓ Afegits ' + parche.added + ' ingredient(s) simple(s) del recordatori que la IA no havia posat.');
        parche.log.forEach(l => console.log('   ' + l));
        tobToast('✓ Post-procés: afegits ' + parche.added + ' ingredients del recordatori que la IA havia oblidat', 'green');
      } else if(parche.log.length){
        // Si hi ha avisos (chips sense ingredient al catàleg), els loguegem
        console.log('[IA post-procés] avisos:');
        parche.log.forEach(l => console.log('   ' + l));
      }
    } catch(e){ console.warn('[IA post-procés]', e); }

    tobMcRenderGrid();
    tobMcUpdateAllTotals();
    tobToast('✓ Menú generat amb IA — ' + puestos + ' plats. Revisa\'l i ajusta el que calgui.', 'green');
  } catch(e){
    console.warn('[IA menú]', e);
    let msg = e.message || String(e);
    if(/\b429\b/.test(msg)){
      msg = 'límit de quota del proveïdor IA — espera uns minuts i torna-ho a provar, o canvia de proveïdor (botó ⚙ IA)';
    } else if(/\b413\b/.test(msg)){
      const prov = (tobAiGetCfg() || {}).provider || 'groq';
      if(prov === 'groq'){
        msg = 'Groq té un límit de tokens molt baix. Solucions:\n' +
              '  1) Canvia a Gemini al ⚙ IA (gratis, prompts grans)\n' +
              '  2) Activa "🤖 solo recetas favoritas" (redueix el catàleg)\n' +
              '  3) Genera 1 setmana en lloc de 4';
      } else {
        msg = 'petició massa gran — prova amb menys setmanes o activa "🤖 solo recetas favoritas"';
      }
    } else if(/\b402\b/.test(msg) || /Insufficient Balance/i.test(msg)){
      msg = 'Saldo insuficient al proveïdor IA. Verifica el dashboard del proveïdor:\n' +
            '  · DeepSeek: platform.deepseek.com → Top up\n' +
            '  · Anthropic: console.anthropic.com → Billing\n' +
            'Pot tardar uns minuts a actualitzar-se després del pagament.';
    } else if(/\b401\b/.test(msg)){
      msg = 'Clau API invàlida o caducada. Revisa la clau al modal ⚙ IA per al proveïdor que falla.';
    }
    tobToast('✗ ' + msg, 'red');
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = btnTxt || '🤖 Generar con IA'; }
  }
}

// ── Cambiar un plato del menú por una alternativa compatible ────
let _tobMcSwapCtx = null;
function tobMcOpenSwap(day, mealId, ix){
  if(!tobMcState) return;
  const sem = tobMcState.semanaActiva;
  const arr = ((tobMcState.data[sem]||{})[day]||{})[mealId];
  if(!arr || arr[ix] == null) return;
  const cli = tobDB.clientes.find(c => c.id === tobMcState.cliId);
  const cur = (tobMenusDB.recetas||[]).find(r => r.id === arr[ix]);
  const curKcal = cur ? tobRecMacros(cur).kcal / (cur.raciones||1) : 0;
  _tobMcSwapCtx = { day, mealId, ix };
  document.getElementById('tobMcSwapInfo').textContent =
    tobMcMealLabel(mealId) + ' · ' + (TOB_MC_DIAS[day]||'') +
    ' — actual: ' + (cur ? cur.nombre : '(cap)') + (curKcal ? ' · ' + Math.round(curKcal) + ' kcal' : '');
  let alts = tobMcCandidatas(cli, mealId, true).filter(r => !cur || r.id !== cur.id);
  alts.sort((a,b) => {
    const ka = tobRecMacros(a).kcal/(a.raciones||1), kb = tobRecMacros(b).kcal/(b.raciones||1);
    if(curKcal){
      const da = Math.abs(ka-curKcal), db = Math.abs(kb-curKcal);
      if(Math.abs(da-db) > 1) return da - db;
    }
    return ((b.favorito?1:0)-(a.favorito?1:0)) || (a.nombre||'').localeCompare(b.nombre||'');
  });
  alts = alts.slice(0, 40);
  const body = document.getElementById('tobMcSwapList');
  body.innerHTML = alts.length ? alts.map(r => {
    const mm = tobRecMacros(r); const rac = r.raciones || 1;
    return `<div class="tob-menu-row" style="cursor:pointer;" onclick="tobMcDoSwap('${r.id}')">
      <div class="tob-menu-row-info">
        <div class="nm">${tobEsc(r.nombre)}</div>
        <div class="meta">${Math.round(mm.kcal/rac)} kcal · ${Math.round(mm.proteina/rac)}g prot · ${Math.round(mm.hc/rac)}g HC${r.favorito?' · ★':''}</div>
      </div>
      <button class="tob-action ghost btn-xs">Triar</button>
    </div>`;
  }).join('') : '<div style="text-align:center;color:var(--mute2);padding:24px;font-family:DM Mono,monospace;font-size:.78rem;">No hi ha alternatives compatibles per aquest àpat.</div>';
  document.getElementById('tobMcSwapBg').classList.add('on');
}
function tobMcDoSwap(newId){
  if(!_tobMcSwapCtx || !tobMcState) return;
  const { day, mealId, ix } = _tobMcSwapCtx;
  const sem = tobMcState.semanaActiva;
  const arr = ((tobMcState.data[sem]||{})[day]||{})[mealId];
  if(arr && ix < arr.length) arr[ix] = newId;
  document.getElementById('tobMcSwapBg').classList.remove('on');
  _tobMcSwapCtx = null;
  tobMcRenderGrid();
  tobMcUpdateAllTotals();
  tobToast('✓ Plat canviat', 'green');
}

// Hook al cambio de sub-tab "creador" — inicializa el selector cliente
const _origTobMenuShowTab2 = tobMenuShowTab;
tobMenuShowTab = function(name, btn){
  _origTobMenuShowTab2(name, btn);
  if(name === 'creador') tobMcInit();
};

// Cerrar modal de listado clicando fuera
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('tobMcListModalBg');
  if(bg) bg.addEventListener('click', e => { if(e.target === bg) bg.classList.remove('on'); });
});

// Auto-init — tobMenusLoad es async (IndexedDB); esperamos a que cargue
// la BD de recetas/ingredientes antes de renderizar la app.
function tobBoot(){
  tobMenusLoad()
    .catch(e => console.warn('[boot] tobMenusLoad:', e))
    .finally(() => {
      tobLoad();
      // Sincronización del catálogo en segundo plano (no bloquea el render).
      setTimeout(() => {
        if(typeof tobMenusSyncPull === 'function') tobMenusSyncPull();
      }, 1500);
    });
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tobBoot);
} else {
  tobBoot();
}
