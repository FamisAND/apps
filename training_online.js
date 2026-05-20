/**
 * training_online.js — BIIO System (formato Full Training, 6 microciclos)
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
const TOB_DESC_VERSION = 5;

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
      'CONSEJOS: 3 entrenos por semana (Lun-Mié-Vie). División A+B (simil full body). En accesorios va circuito sin pausa (jump set). Foco en técnica y recorrido completo.',
    ca:
      'OBJECTIU: Tornar al gimnàs o començar una nova etapa. Recuperes la tècnica, treballes rangs mitjans de repeticions, prepares el cos per a mesociclos més exigents.\n\n' +
      'COM PROGRESSA: 6 microciclos (blocs) — cada parella puja un esglaó. Ona 15/12/10 > 12/10/8 > 10/8/6. Vas al teu ritme, sense calendari fix.\n\n' +
      'REPETICIONS: 3 sèries per exercici principal, amb ona descendent (1a sèrie més reps a pes menor, 3a sèrie menys reps a pes major).\n\n' +
      'PESOS: Que et costi però podent completar totes les repeticions amb tècnica correcta. La 1a sèrie de cada parell de blocs hauria de ser assequible — puja una mica al següent.\n\n' +
      'DESCANSOS: 1\'30" als primers blocs · 1\'45" als del mig · 2\'00" als últims. El circuit accessori amb 30" entre exercicis.\n\n' +
      'CONSELLS: 3 entrenaments per setmana (Dl-Dc-Dv). Divisió A+B (similar full body). Als accessoris va circuit sense pausa (jump set). Focus en tècnica i recorregut complet.',
    en:
      'GOAL: Get back to the gym or start a new phase. Recover technique, work mid-range reps, and prepare the body for more demanding mesocycles.\n\n' +
      'PROGRESSION: 6 microcycles (blocks) — each pair moves up one step. Wave 15/12/10 > 12/10/8 > 10/8/6. Move at your own pace, no fixed calendar.\n\n' +
      'REPS: 3 sets per main exercise, with descending wave (1st set more reps at lower weight, 3rd set fewer reps at higher weight).\n\n' +
      'WEIGHTS: It should be challenging but still allow you to complete every rep with clean technique. The 1st set of each block-pair should feel manageable — bump it up in the next.\n\n' +
      'REST: 1\'30" on early blocks · 1\'45" on middle ones · 2\'00" on the last. Accessory circuit with 30" between exercises.\n\n' +
      'TIPS: 3 sessions per week (Mon-Wed-Fri). A+B split (full-body style). Accessories run as a circuit with no rest (jump set). Focus on technique and full range of motion.'
  },

  'Preparación fuerza': {
    es:
      'OBJETIVO: Trabajar fuerza con ondas 8-6-4 en los ejercicios grandes. Es el paso intermedio antes de Fuerza 1.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO + descarga técnica. En la app salen como 6 bloques: los 1-2 son el "primer micro BIIO" con pausa 2\', los 3-4 son el "segundo micro" con pausa 2\'30, y los 5-6 son la descarga técnica (8 series de 3 reps con pausa corta).\n\n' +
      'REPETICIONES: Onda 8/6/4 en grandes (3 series). En apoyos onda 10/8/6 (3 series). Descarga = 8×3 cluster.\n\n' +
      'PESOS: RPE 10 — al fallo técnico en cada serie. Si en la 1ª serie del 1º bloque consigues las 8 repeticiones target, sube un kg en cada ejercicio para el siguiente bloque.\n\n' +
      'DESCANSOS: 2\'00" en bloques 1-2, 2\'30" en bloques 3-4, 1\'00" en descarga.\n\n' +
      'CONSEJOS: 3 entrenos semanales (Lun-Mié-Vie). División A+B+C: piernas-hombros-abdomen / pecho-tríceps-piernas (recall) / espalda-bíceps-abdomen-cuádriceps.',
    ca:
      'OBJECTIU: Treballar força amb ones 8-6-4 als exercicis grans. És el pas intermedi abans de Força 1.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO + descàrrega tècnica. A l\'app surten com a 6 blocs: els 1-2 són el "primer micro BIIO" amb pausa 2\', els 3-4 són el "segon micro" amb pausa 2\'30, i els 5-6 són la descàrrega tècnica (8 sèries de 3 reps amb pausa curta).\n\n' +
      'REPETICIONS: Ona 8/6/4 als grans (3 sèries). Als auxiliars ona 10/8/6 (3 sèries). Descàrrega = 8×3 clúster.\n\n' +
      'PESOS: RPE 10 — fins a la fallada tècnica a cada sèrie. Si a la 1a sèrie del 1r bloc aconsegueixes les 8 repeticions target, puja un kg a cada exercici per al bloc següent.\n\n' +
      'DESCANSOS: 2\'00" als blocs 1-2, 2\'30" als blocs 3-4, 1\'00" a la descàrrega.\n\n' +
      'CONSELLS: 3 entrenaments setmanals (Dl-Dc-Dv). Divisió A+B+C: cames-espatlles-abdomen / pit-tríceps-cames (recall) / esquena-bíceps-abdomen-quàdriceps.',
    en:
      'GOAL: Build strength with 8-6-4 waves on big lifts. The bridge between Reconditioning and Strength 1.\n\n' +
      'PROGRESSION: 3 BIIO microcycles + technical deload. In the app they show as 6 blocks: 1-2 are the "first BIIO micro" with 2\' rest, 3-4 are the "second micro" with 2\'30 rest, and 5-6 are the technical deload (8 sets of 3 reps with short rest).\n\n' +
      'REPS: 8/6/4 wave on big lifts (3 sets). 10/8/6 wave on accessories (3 sets). Deload = 8×3 cluster.\n\n' +
      'WEIGHTS: RPE 10 — train to technical failure every set. If you hit the target 8 reps on the 1st set of the 1st block, add 1 kg to each exercise for the next block.\n\n' +
      'REST: 2\'00" on blocks 1-2, 2\'30" on blocks 3-4, 1\'00" on deload.\n\n' +
      'TIPS: 3 sessions per week (Mon-Wed-Fri). A+B+C split: legs-shoulders-core / chest-triceps-legs (recall) / back-biceps-core-quads.'
  },

  'Especialización técnica': {
    es:
      'OBJETIVO: Pulir la técnica con peso medio-alto. Ondas 345 BUFFER — 8×3, 7×4, 6×5 al 75% del 1RM, luego repite al 80%, cierra con descarga 8×2 al 85%.\n\n' +
      'CÓMO PROGRESA: 7 microciclos BIIO (mapeados a 6 bloques de la app). Bloques 1-3 al 75% con series clúster decreciente, bloques 4-5 al 80%, bloque 6 = descarga técnica al 85% con buffer.\n\n' +
      'REPETICIONES: 8×3, 7×4, 6×5 alternando — siempre series clúster (varias series de pocas reps con pausa corta).\n\n' +
      'PESOS: Buffer — guarda 1-2 repeticiones en el depósito en cada serie. La idea es velocidad y técnica perfecta, no fallo.\n\n' +
      'DESCANSOS: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). En descarga 1\'30" para todas.\n\n' +
      'CONSEJOS: 3 entrenos por semana. Fase concéntrica explosiva, pausa isométrica abajo y arriba de 1". Es el bloque de calidad técnica antes de Fuerza 1 y 2.',
    ca:
      'OBJECTIU: Polir la tècnica amb pes mig-alt. Ones 345 BUFFER — 8×3, 7×4, 6×5 al 75% del 1RM, després repeteix al 80%, tanca amb descàrrega 8×2 al 85%.\n\n' +
      'COM PROGRESSA: 7 microciclos BIIO (mapejats a 6 blocs de l\'app). Blocs 1-3 al 75% amb sèries clúster decreixents, blocs 4-5 al 80%, bloc 6 = descàrrega tècnica al 85% amb buffer.\n\n' +
      'REPETICIONS: 8×3, 7×4, 6×5 alternant — sempre sèries clúster (diverses sèries de poques reps amb pausa curta).\n\n' +
      'PESOS: Buffer — guarda 1-2 repeticions al dipòsit a cada sèrie. La idea és velocitat i tècnica perfecta, no fallada.\n\n' +
      'DESCANSOS: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). A la descàrrega 1\'30" per a totes.\n\n' +
      'CONSELLS: 3 entrenaments per setmana. Fase concèntrica explosiva, pausa isomètrica abaix i amunt d\'1". És el bloc de qualitat tècnica abans de Força 1 i 2.',
    en:
      'GOAL: Sharpen technique with medium-high weights. 345 BUFFER waves — 8×3, 7×4, 6×5 at 75% of 1RM, then repeat at 80%, finish with 8×2 deload at 85%.\n\n' +
      'PROGRESSION: 7 BIIO microcycles (mapped to 6 app blocks). Blocks 1-3 at 75% with decreasing cluster sets, blocks 4-5 at 80%, block 6 = technical deload at 85% with buffer.\n\n' +
      'REPS: 8×3, 7×4, 6×5 alternating — always cluster sets (multiple sets of few reps with short rest).\n\n' +
      'WEIGHTS: Buffer — keep 1-2 reps in the tank every set. The goal is speed and clean technique, not failure.\n\n' +
      'REST: 1\'00" (8×3) · 1\'15" (7×4) · 1\'30" (6×5). 1\'30" for everything on deload.\n\n' +
      'TIPS: 3 sessions per week. Explosive concentric phase, 1" isometric pause at top and bottom. This is the technical-quality block before Strength 1 and 2.'
  },

  'Fuerza 1': {
    es:
      'OBJETIVO: Subir intensidad real. 4×4 progresivo del 80% al 87.5% del 1RM con RPE creciente.\n\n' +
      'CÓMO PROGRESA: 5 microciclos BIIO (mapeados a 6 bloques de la app). 1º: 80% RPE 7/8. 2º: 82.5% RPE 8/9. 3º: 85% RPE 9/10. 4º: 87.5% RPE 10. Bloques 5-6: descarga técnica 8×3 al 75%.\n\n' +
      'REPETICIONES: 4 series de 4 reps en los grandes. Accesorios con jump set 3×12.\n\n' +
      'PESOS: Sube ~2.5% del 1RM cada bloque. La técnica manda — si se rompe, baja peso. Subida explosiva, control en la bajada.\n\n' +
      'DESCANSOS: 3\'00" entre series en los grandes (necesitas estar fresco). 1\'00" en descarga. 30" entre ejercicios del jump set.\n\n' +
      'CONSEJOS: 3 entrenos por semana. Foco en arrancadas (sin rebote en peso muerto), pausa al pecho en banca, dominadas explosivas hasta el pecho.',
    ca:
      'OBJECTIU: Pujar intensitat de debò. 4×4 progressiu del 80% al 87.5% del 1RM amb RPE creixent.\n\n' +
      'COM PROGRESSA: 5 microciclos BIIO (mapejats a 6 blocs de l\'app). 1r: 80% RPE 7/8. 2n: 82.5% RPE 8/9. 3r: 85% RPE 9/10. 4t: 87.5% RPE 10. Blocs 5-6: descàrrega tècnica 8×3 al 75%.\n\n' +
      'REPETICIONS: 4 sèries de 4 reps als grans. Accessoris amb jump set 3×12.\n\n' +
      'PESOS: Puja ~2.5% del 1RM cada bloc. La tècnica mana — si es trenca, baixa el pes. Pujada explosiva, control a la baixada.\n\n' +
      'DESCANSOS: 3\'00" entre sèries als grans (cal estar fresc). 1\'00" a la descàrrega. 30" entre exercicis del jump set.\n\n' +
      'CONSELLS: 3 entrenaments per setmana. Focus en arrancades (sense rebot al pes mort), pausa al pit al banc, dominades explosives fins al pit.',
    en:
      'GOAL: Real intensity step-up. Progressive 4×4 from 80% to 87.5% of 1RM with rising RPE.\n\n' +
      'PROGRESSION: 5 BIIO microcycles (mapped to 6 app blocks). 1st: 80% RPE 7/8. 2nd: 82.5% RPE 8/9. 3rd: 85% RPE 9/10. 4th: 87.5% RPE 10. Blocks 5-6: technical deload 8×3 at 75%.\n\n' +
      'REPS: 4 sets of 4 reps on the big lifts. Accessories with jump set 3×12.\n\n' +
      'WEIGHTS: Add ~2.5% of 1RM each block. Technique comes first — if it breaks, drop the weight. Explosive lift, controlled descent.\n\n' +
      'REST: 3\'00" between sets on big lifts (you need to be fresh). 1\'00" on deload. 30" between exercises in the jump set.\n\n' +
      'TIPS: 3 sessions per week. Focus on clean starts (no bounce on deadlift), pause at the chest on bench, explosive pull-ups all the way to the chest.'
  },

  'Fuerza 2': {
    es:
      'OBJETIVO: Demostrar la fuerza ganada. Clúster cargado al 87.5% / 90% / 92.5% con rest-pause de 15"/20"/25", y al final 2 sesiones de MAXIMALES para batir tu 1RM.\n\n' +
      'CÓMO PROGRESA: 4 microciclos BIIO + 2 sesiones de máximos. En la app, los bloques 1-2 son el 87.5% con RP 15", el 3 es 90% RP 20", el 4 es 92.5% RP 25", y los 5-6 son la descarga 10×1 al 95%. El entreno "Maximales" va aparte.\n\n' +
      'REPETICIONES: Cada serie son 8 reps simples con una pausa corta entre cada una (rest-pause) — sueltas la barra entre reps pero sin bajar peso. El objetivo es completar las 8 con técnica perfecta.\n\n' +
      'PESOS: % del 1RM. Si completas las 8 reps con técnica correcta en una serie, suma 2.5% al peso para esa serie en el siguiente bloque.\n\n' +
      'DESCANSOS: 4\'00" entre series clúster. 2\'00" en descarga. 5-6\' antes de cada intento de máximo.\n\n' +
      'CONSEJOS: 3 entrenos por semana + 2 sesiones de Maximales separadas (1ª: Squat/Press Militar/Press Estrecho. 2ª: Peso Muerto/Jalones invertidos/Curl con barra). Calentamiento progresivo siempre antes de cada intento de máximo.',
    ca:
      'OBJECTIU: Demostrar la força guanyada. Clúster carregat al 87.5% / 90% / 92.5% amb rest-pause de 15"/20"/25", i al final 2 sessions de MÀXIMS per batre el teu 1RM.\n\n' +
      'COM PROGRESSA: 4 microciclos BIIO + 2 sessions de màxims. A l\'app, els blocs 1-2 són el 87.5% amb RP 15", el 3 és 90% RP 20", el 4 és 92.5% RP 25", i els 5-6 són la descàrrega 10×1 al 95%. L\'entrenament "Màxims" va a part.\n\n' +
      'REPETICIONS: Cada sèrie són 8 reps simples amb una pausa curta entre cadascuna (rest-pause) — deixes anar la barra entre reps però sense baixar el pes. L\'objectiu és completar les 8 amb tècnica perfecta.\n\n' +
      'PESOS: % del 1RM. Si completes les 8 reps amb tècnica correcta en una sèrie, suma 2.5% al pes per a aquella sèrie al bloc següent.\n\n' +
      'DESCANSOS: 4\'00" entre sèries clúster. 2\'00" a la descàrrega. 5-6\' abans de cada intent màxim.\n\n' +
      'CONSELLS: 3 entrenaments per setmana + 2 sessions de Màxims separades (1a: Squat/Press Militar/Press Estret. 2a: Pes Mort/Jalons invertits/Curl amb barra). Escalfament progressiu sempre abans de cada intent màxim.',
    en:
      'GOAL: Show the strength you\'ve built. Loaded cluster at 87.5% / 90% / 92.5% with rest-pause of 15"/20"/25", and 2 final MAXES sessions to beat your 1RM.\n\n' +
      'PROGRESSION: 4 BIIO microcycles + 2 maxes sessions. In the app, blocks 1-2 are 87.5% with RP 15", block 3 is 90% RP 20", block 4 is 92.5% RP 25", and 5-6 are the 10×1 deload at 95%. The "Maxes" workout is separate.\n\n' +
      'REPS: Each set is 8 single reps with a short pause between each (rest-pause) — release the bar between reps but don\'t lower the weight. Goal is to complete all 8 with perfect technique.\n\n' +
      'WEIGHTS: % of 1RM. If you complete the 8 reps with clean technique on a set, add 2.5% to that set\'s weight for the next block.\n\n' +
      'REST: 4\'00" between cluster sets. 2\'00" on deload. 5-6\' before each max attempt.\n\n' +
      'TIPS: 3 sessions per week + 2 separate Maxes sessions (1st: Squat/Overhead Press/Close-Grip Press. 2nd: Deadlift/Inverted Rows/Barbell Curl). Always warm up progressively before each max attempt.'
  },

  'Hibrido': {
    es:
      'OBJETIVO: Mezclar fuerza e hipertrofia en la misma sesión. Trabaja al fallo técnico con ondas 4-6-8 + DROP al final.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO (mapeados a 6 bloques). 1º (bloques 1-2): 3×4/6/8 + DROP al fallo, al 85/75/65% del 1RM. 2º (bloques 3-4): 2×20 Rest-Pause al 70% del 1RM. 3º (bloques 5-6): descarga parcial.\n\n' +
      'REPETICIONES: En el principal, 3 series con onda 4-6-8 reps + serie extra DROP (bajada de peso al fallo). En el Rest-Pause, 20 reps totales con pausa breve de respiración SIN soltar la barra.\n\n' +
      'PESOS: 1ª serie 85% (apunta 4 reps), 2ª 75% (6 reps), 3ª 65% (8 reps). Si llegas al numero target, añade el DROP. En Rest-Pause empieza al 70%.\n\n' +
      'DESCANSOS: 2\'00" entre series en bloque 1, 3\'00" en bloque 2 (Rest-Pause), 2\'30" en descarga.\n\n' +
      'CONSEJOS: 3 entrenos por semana. División A+B+C: piernas-hombros-abdomen / pecho-tríceps / espalda-bíceps. Todas las series al fallo técnico (RPE 10).',
    ca:
      'OBJECTIU: Barrejar força i hipertròfia a la mateixa sessió. Treballa fins a la fallada tècnica amb ones 4-6-8 + DROP al final.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO (mapejats a 6 blocs). 1r (blocs 1-2): 3×4/6/8 + DROP fins a la fallada, al 85/75/65% del 1RM. 2n (blocs 3-4): 2×20 Rest-Pause al 70% del 1RM. 3r (blocs 5-6): descàrrega parcial.\n\n' +
      'REPETICIONS: Al principal, 3 sèries amb ona 4-6-8 reps + sèrie extra DROP (baixada de pes fins a la fallada). Al Rest-Pause, 20 reps totals amb pausa breu de respiració SENSE deixar anar la barra.\n\n' +
      'PESOS: 1a sèrie 85% (apunta 4 reps), 2a 75% (6 reps), 3a 65% (8 reps). Si arribes al número target, afegeix el DROP. Al Rest-Pause comença al 70%.\n\n' +
      'DESCANSOS: 2\'00" entre sèries al bloc 1, 3\'00" al bloc 2 (Rest-Pause), 2\'30" a la descàrrega.\n\n' +
      'CONSELLS: 3 entrenaments per setmana. Divisió A+B+C: cames-espatlles-abdomen / pit-tríceps / esquena-bíceps. Totes les sèries fins a la fallada tècnica (RPE 10).',
    en:
      'GOAL: Blend strength and hypertrophy in the same session. Train to technical failure with 4-6-8 waves + a DROP at the end.\n\n' +
      'PROGRESSION: 3 BIIO microcycles (mapped to 6 blocks). 1st (blocks 1-2): 3×4/6/8 + DROP to failure, at 85/75/65% of 1RM. 2nd (blocks 3-4): 2×20 Rest-Pause at 70% of 1RM. 3rd (blocks 5-6): partial deload.\n\n' +
      'REPS: On the main lift, 3 sets with 4-6-8 rep wave + an extra DROP set (lower weight, lift to failure). On Rest-Pause, 20 total reps with a brief breathing pause WITHOUT releasing the bar.\n\n' +
      'WEIGHTS: 1st set 85% (aim for 4 reps), 2nd 75% (6 reps), 3rd 65% (8 reps). If you hit the target, add the DROP. Start Rest-Pause at 70%.\n\n' +
      'REST: 2\'00" between sets in block 1, 3\'00" in block 2 (Rest-Pause), 2\'30" on deload.\n\n' +
      'TIPS: 3 sessions per week. A+B+C split: legs-shoulders-core / chest-triceps / back-biceps. All sets to technical failure (RPE 10).'
  },

  'Hipertrofia': {
    es:
      'OBJETIVO: Masa muscular pura. Onda 8-6-4 al fallo técnico + Rest Pause 20"/20" para apurar al máximo cada serie.\n\n' +
      'CÓMO PROGRESA: 3 microciclos BIIO (en la app 6 bloques). 1º (bloques 1-2): 3×8/6/4 + Rest Pause al 75% del 1RM. 2º (bloques 3-4): mismo esquema, sube 1% si alcanzaste reps target. 3º (bloques 5-6): descarga parcial 8×3 al 75%.\n\n' +
      'REPETICIONES: 3 series con onda 8-6-4. Después de la última, Rest Pause: descansa 20", coge más reps; descansa 20" otra vez, coge más reps. En apoyos jump set 20/12 reps.\n\n' +
      'PESOS: 75% del 1RM. Si alcanzas las 8/6/4 reps target, +1% para la próxima sesión.\n\n' +
      'DESCANSOS: 2\'00" entre series. 30" entre ejercicios del jump set. En descarga 1\'00".\n\n' +
      'CONSEJOS: 3 entrenos por semana. División A+B+C. Foco en SENTIR el músculo, técnica estricta. Hay BURNS (parciales hasta el fallo) en algunos accesorios.',
    ca:
      'OBJECTIU: Massa muscular pura. Ona 8-6-4 fins a la fallada tècnica + Rest Pause 20"/20" per apurar al màxim cada sèrie.\n\n' +
      'COM PROGRESSA: 3 microciclos BIIO (a l\'app 6 blocs). 1r (blocs 1-2): 3×8/6/4 + Rest Pause al 75% del 1RM. 2n (blocs 3-4): mateix esquema, puja 1% si has assolit les reps target. 3r (blocs 5-6): descàrrega parcial 8×3 al 75%.\n\n' +
      'REPETICIONS: 3 sèries amb ona 8-6-4. Després de l\'última, Rest Pause: descansa 20", aconsegueix més reps; descansa 20" altra vegada, aconsegueix més reps. Als auxiliars jump set 20/12 reps.\n\n' +
      'PESOS: 75% del 1RM. Si assoleixes les 8/6/4 reps target, +1% per a la propera sessió.\n\n' +
      'DESCANSOS: 2\'00" entre sèries. 30" entre exercicis del jump set. A la descàrrega 1\'00".\n\n' +
      'CONSELLS: 3 entrenaments per setmana. Divisió A+B+C. Focus en SENTIR el múscul, tècnica estricta. Hi ha BURNS (parcials fins a la fallada) en alguns accessoris.',
    en:
      'GOAL: Pure muscle mass. 8-6-4 wave to technical failure + Rest Pause 20"/20" to squeeze every set to the max.\n\n' +
      'PROGRESSION: 3 BIIO microcycles (6 app blocks). 1st (blocks 1-2): 3×8/6/4 + Rest Pause at 75% of 1RM. 2nd (blocks 3-4): same scheme, +1% if you hit the target reps. 3rd (blocks 5-6): partial deload 8×3 at 75%.\n\n' +
      'REPS: 3 sets with 8-6-4 wave. After the last, Rest Pause: rest 20", grab more reps; rest 20" again, grab more reps. Accessories with jump set 20/12 reps.\n\n' +
      'WEIGHTS: 75% of 1RM. If you hit the 8/6/4 target reps, +1% for the next session.\n\n' +
      'REST: 2\'00" between sets. 30" between jump-set exercises. 1\'00" on deload.\n\n' +
      'TIPS: 3 sessions per week. A+B+C split. Focus on FEELING the muscle, strict technique. BURNS (partials to failure) on some accessories.'
  },

  'Calidad muscular': {
    es:
      'OBJETIVO: Calidad y definición muscular. Clúster al 75% / 77.5% con tempo 3232, accesorios en SUPERSERIE / TRISERIE buscando MAX PUMP.\n\n' +
      'CÓMO PROGRESA: 6 microciclos BIIO. Bloques 1-3 al 75% del 1RM (8×2, 8×3, 8×3 alternando). Bloques 4-6 al 77.5% (mismo esquema). Cardio progresivo de 15\' a 50\' al 60-70% del FCM.\n\n' +
      'REPETICIONES: Series clúster — 8 series de 2-3 reps con pausa 1\'. Accesorios MAX PUMP 10-12 reps en SUPERSERIE (2 ejs alternados) o TRISERIE (3 ejs alternados).\n\n' +
      'PESOS: % del 1RM. Tempo crítico: 3 segundos eccéntrica · 2 segundos pausa abajo · 3 segundos concéntrica · 2 segundos pausa arriba (3232).\n\n' +
      'DESCANSOS: 1\'00" entre series clúster, 1\'30" entre superseries / triseries. En accesorios solo el tiempo de alternar.\n\n' +
      'CONSEJOS: 3 entrenos por semana. División A+B+C. El tempo 3232 es lo que da la calidad — sin él pierdes el objetivo. En el último ejercicio de cada grupo se hacen STRIPPING (drop sets) para apurar.',
    ca:
      'OBJECTIU: Qualitat i definició muscular. Clúster al 75% / 77.5% amb tempo 3232, accessoris en SUPERSÈRIE / TRISÈRIE buscant MAX PUMP.\n\n' +
      'COM PROGRESSA: 6 microciclos BIIO. Blocs 1-3 al 75% del 1RM (8×2, 8×3, 8×3 alternant). Blocs 4-6 al 77.5% (mateix esquema). Cardio progressiu de 15\' a 50\' al 60-70% del FCM.\n\n' +
      'REPETICIONS: Sèries clúster — 8 sèries de 2-3 reps amb pausa 1\'. Accessoris MAX PUMP 10-12 reps en SUPERSÈRIE (2 exs alternats) o TRISÈRIE (3 exs alternats).\n\n' +
      'PESOS: % del 1RM. Tempo crític: 3 segons excèntrica · 2 segons pausa abaix · 3 segons concèntrica · 2 segons pausa amunt (3232).\n\n' +
      'DESCANSOS: 1\'00" entre sèries clúster, 1\'30" entre supersèries / trisèries. Als accessoris només el temps d\'alternar.\n\n' +
      'CONSELLS: 3 entrenaments per setmana. Divisió A+B+C. El tempo 3232 és el que dóna la qualitat — sense això perds l\'objectiu. A l\'últim exercici de cada grup es fan STRIPPING (drop sets) per apurar.',
    en:
      'GOAL: Muscle quality and definition. Cluster at 75% / 77.5% with 3232 tempo, accessories as SUPERSET / TRISET chasing MAX PUMP.\n\n' +
      'PROGRESSION: 6 BIIO microcycles. Blocks 1-3 at 75% of 1RM (8×2, 8×3, 8×3 alternating). Blocks 4-6 at 77.5% (same scheme). Progressive cardio from 15\' to 50\' at 60-70% of max HR.\n\n' +
      'REPS: Cluster sets — 8 sets of 2-3 reps with 1\' rest. MAX PUMP accessories 10-12 reps in SUPERSET (2 exercises alternated) or TRISET (3 exercises alternated).\n\n' +
      'WEIGHTS: % of 1RM. Critical tempo: 3 seconds eccentric · 2 seconds pause at bottom · 3 seconds concentric · 2 seconds pause at top (3232).\n\n' +
      'REST: 1\'00" between cluster sets, 1\'30" between supersets / trisets. On accessories, just the time to alternate.\n\n' +
      'TIPS: 3 sessions per week. A+B+C split. The 3232 tempo is what brings the quality — without it you lose the goal. On the last exercise of each group, STRIPPING (drop sets) to push past failure.'
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
  a.href = url; a.download = `training_online_${new Date().toISOString().slice(0,10)}.json`;
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

  // ── Bloques adaptativos ──
  document.getElementById('tobFichaEmptyBoth').style.display = (!hasRutinas && !hasMediciones) ? '' : 'none';
  document.getElementById('tobFichaRutinasBlock').style.display = hasRutinas ? '' : 'none';
  document.getElementById('tobFichaMedicionesBlock').style.display = hasMediciones ? '' : 'none';

  if(hasRutinas){
    tobRenderTimeline(cli);
    tobRenderFichaCharts(cli);
  }
  if(hasMediciones){
    tobRenderFichaMediciones(cli);
  }

  // Cuestionario: siempre visible (al final). Se carga con los datos del cliente.
  if(typeof tobQuestLoad === 'function') tobQuestLoad();
  // Menús del cliente
  if(typeof tobFichaRenderMenus === 'function') tobFichaRenderMenus();
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
  if(!cli?.nacimiento || !fecha) return null;
  const n = new Date(cli.nacimiento), f = new Date(fecha);
  if(isNaN(n) || isNaN(f)) return null;
  let age = f.getFullYear() - n.getFullYear();
  const m = f.getMonth() - n.getMonth();
  if(m < 0 || (m === 0 && f.getDate() < n.getDate())) age--;
  return (age >= 0 && age < 130) ? age : null;
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
  // Para una NUEVA medición, mostrar bajo cada input el valor de la anterior
  // (clicable para copiarlo). Si estamos editando, se ocultan los hints porque
  // los valores ya están en los inputs.
  const showPrev = !med;
  const refMed = showPrev ? lastMed : null;
  document.getElementById('tobMedPlecsRow').innerHTML = TOB_MED_PLECS.map(([k,label]) => {
    const prev = refMed?.plecs?.[k];
    const hint = (prev != null)
      ? `<div class="tob-med-prev" onclick="tobMedFillPrev('tobMedPlec_${k}',${prev})" title="Clic para usar el valor de la medición anterior (${refMed.fecha})">ant: <b>${prev}</b> mm</div>`
      : '';
    return `<div><label class="tob-lbl">${label}</label><input class="tob-input" type="number" step="0.1" id="tobMedPlec_${k}" value="${med?.plecs?.[k] ?? ''}" placeholder="mm">${hint}</div>`;
  }).join('');
  document.getElementById('tobMedPerimRow').innerHTML = TOB_MED_PERIM.map(([k,label]) => {
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
      ${TOB_MED_PLECS.map(([k,l]) => row(l, A.plecs?.[k], B.plecs?.[k], 'mm', 1, true)).join('')}
      <tr class="total">${row('Σ 6 Pliegues', sumA, sumB, 'mm').replace(/<tr[^>]*>/,'').replace(/<\/tr>/,'')}</tr>
      ${sectionRow('Perímetros (cm)')}
      ${TOB_MED_PERIM.map(([k,l]) => row(l, A.perimetres?.[k], B.perimetres?.[k], 'cm', 1, true)).join('')}
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

  cfgs.perim = {
    type: 'bar',
    data: {
      labels: TOB_MED_PERIM.map(([,l]) => l),
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
      labels: TOB_MED_PLECS.map(([,l]) => l),
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
  await tobBuildPdfRutina(cli, a, pl, it).catch(e => { console.error(e); tobToast('Error: '+e.message, 'red'); });
}

async function tobBuildPdfRutina(cli, a, pl, it){
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
  (a.rutina?.entrenos||[]).forEach(en => {
    page = doc.addPage([W_L, H_L]);
    const sufijo = (en.nombre && en.nombre !== ('Entreno '+en.letra)) ? ' — ' + en.nombre : '';
    drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('rut.page.entrenamiento', L, { letra: en.letra, sufijo }), rutinaShort, W_L, H_L);
    let y = H_L - 90;

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
      tf.addToPage(page, { x: cellX, y: y-4, width: colW-4, height: 16, borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5 });
    });
    y -= 24;

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
    y -= 16;

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
      const _maxS = Math.max(...microHeaders.map(mn => tobPlanFor(ej, mn).series || 1));
      const _linesN = ej.tipo === 'circuito'
        ? (ej.circuitoLineas?.length || 3)
        : Math.max(1, _maxS);
      const _blockH = 24 + 16 + 10 + _linesN*16 + 18 + 6;
      // 40pt de margen inferior: paginación + descanso del último ejercicio
      if(y - _blockH < 40){
        page = doc.addPage([W_L, H_L]);
        drawHeaderBar(page, fontB, BLACK, ORANGE, GRAY, tobT('rut.page.entrenamiento_cont', L, { letra: en.letra }), rutinaShort, W_L, H_L);
        y = H_L - 90;
      }
      // Header ejercicio — sanitizamos el nombre por si tiene chars Unicode
      // raros (flechas, emojis, símbolos) que romperían pdf-lib WinAnsi.
      const ejNombreSafe = tobPdfSafe((ej.nombre || '').toUpperCase());
      page.drawRectangle({ x: 24, y: y-5, width: W_L-48, height: 22, color: rgb(0.08,0.08,0.08) });
      page.drawText(ejNombreSafe, { x: 30, y: y+2, size: 11, font: fontB, color: ORANGE });
      if(ej.subtitle){
        const nameWidth = tobTextWidth(ejNombreSafe, 11, fontB);
        page.drawText(tobPdfSafe('· ' + ej.subtitle), { x: 30 + nameWidth + 10, y: y+3, size: 8, font: fontO, color: rgb(0.85,0.85,0.85) });
      }
      // Plan info en la derecha del header (mejor que línea "Plan" aparte)
      const planTxt = microHeaders.map(mn => {
        const p = tobPlanFor(ej, mn);
        const reps = Array.isArray(p.repsTarget) ? p.repsTarget.join('/') : p.repsTarget;
        return `${mn}º: ${p.series}×${reps}`;
      }).join('  ·  ');
      // Esto puede ser muy largo, lo omitimos del header y lo dejamos solo en la fila Plan abajo (compacta)
      y -= 24;

      // Fila plan (compacta, sin texto "Plan" — la celda misma es la info)
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        const reps = Array.isArray(plan.repsTarget) ? plan.repsTarget.join('/') : plan.repsTarget;
        page.drawRectangle({ x: startX + i*colW - 1, y: y-3, width: colW-3, height: 13, color: rgb(0.97,0.94,0.85) });
        page.drawText(`${plan.series} × ${reps}`, { x: startX + i*colW + 5, y, size: 9, font: fontB, color: rgb(0.6,0.4,0.05) });
      });
      y -= 16;

      // Cabecera Kg/Reps por columna
      page.drawText(tobT('rut.col.series', L), { x: 30, y, size: 7, font: fontB, color: GRAY_MD });
      microHeaders.forEach((mn, i) => {
        const cellX = startX + i*colW;
        page.drawText(tobT('rut.col.kg', L), { x: cellX+8, y, size: 7, font: fontB, color: GRAY_MD });
        page.drawText(tobT('rut.col.reps', L), { x: cellX+55, y, size: 7, font: fontB, color: GRAY_MD });
      });
      y -= 10;

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
          kgF.addToPage(page, { x: cellX+3, y: y-3, width: 44, height: 12, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
          // Cuadrito reps
          const rpF = form.createTextField(`ej_${ej.id}_${mn}_${en.id}_${arrName}_${s}_reps`);
          if(sr?.reps != null) rpF.setText(String(sr.reps));
          rpF.addToPage(page, { x: cellX+50, y: y-3, width: 44, height: 12, borderColor: rgb(0.55,0.55,0.55), borderWidth: 0.7 });
        });
        y -= 16;
      }

      // Pausa (color visible, NO gris claro)
      page.drawText(tobT('rut.col.descanso', L), { x: 30, y, size: 8, font: fontB, color: rgb(0.6,0.4,0.05) });
      microHeaders.forEach((mn, i) => {
        const plan = tobPlanFor(ej, mn);
        page.drawText(plan.pausa || '—', { x: startX + i*colW + 5, y, size: 8, font: fontB, color: BLACK });
      });
      y -= 18;

      // Línea separadora entre ejercicios
      page.drawLine({ start:{x:24, y:y+4}, end:{x:W_L-24, y:y+4}, thickness:0.3, color: rgb(0.8,0.8,0.8) });
      y -= 4;
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
  apats: { mode:'radio', items:[
    { id:'3', label:'3 àpats' },
    { id:'4', label:'4 àpats' },
    { id:'5', label:'5 àpats' }
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
  pref: { mode:'multi', items:[
    { id:'sense_gluten',   label:'Sense gluten',    neg:true },
    { id:'sense_lactosa',  label:'Sense lactosa',   neg:true },
    { id:'sense_fruita_seca', label:'Sense fruita seca', neg:true },
    { id:'fodmap',         label:'Baix FODMAP' },
    { id:'paleo',          label:'Paleo' },
    { id:'keto',           label:'Keto' },
    { id:'rapida',         label:'Cuina ràpida (<30 min)' },
    { id:'fora',           label:'Menja fora de casa' },
    { id:'sense_cuina',    label:'Sense accés a cuina', neg:true }
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
    { id:'celiaquia',       label:'Celiaquia',               neg:true },
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
  ]}
};
// Container DOM (id del div .tob-quest-chips) por grupo.
const TOB_QUEST_CHIP_EL = {
  objectiu:'qChipsObjectiu', apats:'qChipsApats', dieta:'qChipsDieta',
  proteina:'qChipsProteina', pref:'qChipsPref', patologies:'qChipsPatologies',
  cuina:'qChipsCuina', tempsCuina:'qChipsTempsCuina', treball:'qChipsTreball'
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
const TOB_QUEST_APATS = [
  { key:'apat1', label:'Esmorzar', ph:'ex: cafè amb llet, torrades...' },
  { key:'apat2', label:'Mig matí', ph:'ex: fruita + iogurt' },
  { key:'apat3', label:'Dinar',    ph:'ex: amanida + pollastre + arròs' },
  { key:'apat4', label:'Berenar',  ph:'ex: barreta + plàtan' },
  { key:'apat5', label:'Sopar',    ph:'ex: peix al forn + verdura' }
];
const TOB_QUEST_APATS_BY_COUNT = {
  '3': ['apat1','apat3','apat5'],
  '4': ['apat1','apat3','apat4','apat5'],
  '5': ['apat1','apat2','apat3','apat4','apat5']
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

// Renderiza los campos del recordatori según el nº de àpats elegido.
// Los valores se guardan directamente en cli.cuestionario.apatN.
function tobQuestRenderRecordatori(){
  const cont = document.getElementById('qRecordatoriFields');
  if(!cont) return;
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  const q = (cli && cli.cuestionario) || {};
  const apats = (q.tags && q.tags.apats) || '5';
  const keys = TOB_QUEST_APATS_BY_COUNT[apats] || TOB_QUEST_APATS_BY_COUNT['5'];
  cont.innerHTML = keys.map(k => {
    const def = TOB_QUEST_APATS.find(a => a.key === k);
    const val = q[k] != null ? q[k] : '';
    return `<div><label class="tob-lbl">${tobEsc(def.label)}</label>` +
      `<input class="tob-input" value="${tobEsc(val)}" placeholder="${tobEsc(def.ph)}" ` +
      `oninput="tobQuestApatInput('${k}', this.value)"></div>`;
  }).join('');
}

// Guarda el valor de un àpat del recordatori (input dinámico).
function tobQuestApatInput(key, val){
  const cli = tobDB.clientes.find(c => c.id === tobCurrentFichaId);
  if(!cli) return;
  if(!cli.cuestionario) cli.cuestionario = {};
  const v = (val || '').trim();
  if(v) cli.cuestionario[key] = v;
  else  delete cli.cuestionario[key];
  tobQuestScheduleSave();
  tobUpdateCuestionarioBadge();
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
  const det = document.getElementById('tobFichaCuestionarioDetails');
  if(det) det.open = true;
  const block = document.getElementById('tobFichaCuestionarioBlock');
  if(block) block.scrollIntoView({ behavior:'smooth', block:'start' });
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
let tobMenusDB = { ingredientes: [], recetas: [], menus: [], _v: 1 };
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
function tobMenusSave(){
  tobKvPut(TOB_MENUS_KV, tobMenusDB).catch(e => {
    console.warn('[menus] save IndexedDB falló:', e);
    // Último recurso: localStorage (puede petar por quota)
    try { localStorage.setItem(TOB_MENUS_KEY, JSON.stringify(tobMenusDB)); }
    catch(e2){ tobToast('Error guardant la base de receptes', 'red'); }
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
  document.getElementById('tobIngDelBtn').style.display = 'none';
  document.getElementById('tobIngModalBg').classList.add('on');
}

function tobIngCloseModal(){ document.getElementById('tobIngModalBg').classList.remove('on'); }

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
  document.getElementById('tobIngDelBtn').style.display = '';
  document.getElementById('tobIngModalBg').classList.add('on');
}

function tobIngSave(){
  const nombre = document.getElementById('tobIngNombre').value.trim();
  if(!nombre){ tobToast('Falta el nombre', 'red'); return; }
  const parseN = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const parseList = v => (v||'').split(/[,\n]/).map(s => s.trim()).filter(Boolean);

  const data = {
    nombre,
    kcal:     parseN(document.getElementById('tobIngKcal').value),
    hc:       parseN(document.getElementById('tobIngHc').value),
    proteina: parseN(document.getElementById('tobIngProt').value),
    grasa:    parseN(document.getElementById('tobIngGras').value),
    fibra:    parseN(document.getElementById('tobIngFibra').value),
    tags:     parseList(document.getElementById('tobIngTags').value),
    alergenos:parseList(document.getElementById('tobIngAlergenos').value)
  };

  if(tobIngEditId){
    const ing = tobMenusDB.ingredientes.find(i => i.id === tobIngEditId);
    if(ing) Object.assign(ing, data);
  } else {
    data.id = tobUid('ing');
    data.origen = 'manual';
    tobMenusDB.ingredientes.push(data);
  }
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
    return {
      kcal:     m.kcal     || 0,
      hc:       m.hc       || 0,
      proteina: m.proteina || 0,
      grasa:    m.grasa    || 0,
      fibra:    m.fibra    || 0
    };
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

  let list = (tobMenusDB.recetas||[]).slice();
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
  // Favoritas primero, luego alfabético.
  list.sort((a,b) => {
    if(!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1;
    return (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'});
  });

  const total = list.length;
  const cntEl = document.getElementById('tobRecCount');
  if(cntEl){
    const all = (tobMenusDB.recetas||[]).length;
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
    return `<div class="tob-rec-card" onclick="tobRecEdit('${r.id}')">
      <div class="foto placeholder" data-foto-rec="${r.id}">${fotoTxt}</div>
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
  tobMenusSave();
  tobRecRender();
  tobToast(r.favorito ? '★ Añadida a favoritos' : 'Quitada de favoritos', r.favorito ? 'green' : '');
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
    tiempoTotal:      document.getElementById('tobRecTiempoTotal').value.trim(),
    tiempoElaboracion:document.getElementById('tobRecTiempoElab').value.trim(),
    raciones:         Math.max(1, parseInt(document.getElementById('tobRecRaciones').value) || 1),
    ingredientes:     _tobRecModalIngredientes.slice(),
    instrucciones:    document.getElementById('tobRecInstrucciones').value.trim(),
    comentarios:      document.getElementById('tobRecComentarios').value.trim(),
    autor:            document.getElementById('tobRecAutor').value.trim(),
    tags:             parseList(document.getElementById('tobRecTags').value),
    favorito:         _tobRecModalFav
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

// Cuáles comidas/día tiene el cliente, según los apats rellenos en su cuestionario.
// Devuelve array de { id, label } en orden esmorzar→sopar.
function tobMcComidasDelCliente(cli){
  const q = cli?.cuestionario || {};
  const all = [
    { id:'esmorzar', label:'Esmorzar',  qf:'apat1' },
    { id:'mig_mati', label:'Mig matí',  qf:'apat2' },
    { id:'dinar',    label:'Dinar',     qf:'apat3' },
    { id:'berenar',  label:'Berenar',   qf:'apat4' },
    { id:'sopar',    label:'Sopar',     qf:'apat5' }
  ];
  // Si el cuestionario tiene el chip "Nombre d'àpats", manda ese.
  const apats = q.tags && q.tags.apats;
  if(apats && TOB_QUEST_APATS_BY_COUNT[apats]){
    const keys = TOB_QUEST_APATS_BY_COUNT[apats];
    return all.filter(c => keys.includes(c.qf));
  }
  const filled = all.filter(c => (q[c.qf] || '').trim().length > 0);
  // Si el cliente no tiene NINGÚN apat relleno, asumimos 3 (esmorzar/dinar/sopar)
  return filled.length ? filled : [all[0], all[2], all[4]];
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

  // 4. Restricciones de alérgenos: prefs "sense_X" del perfil + lista de
  //    al·lèrgies del cuestionario, cruzadas con los alérgenos ICNS de la
  //    receta (tobRecAptitud). Fallback a regex de ingredientes si la
  //    receta no trae alérgenos.
  const apt = tobRecAptitud(rec);
  const cliAlergies = (tags.alergies || []).join(' · ').toLowerCase();
  const evita = {
    gluten:     (tags.pref||[]).includes('sense_gluten')      || /gluten|cel[ií]a/.test(cliAlergies),
    lactosa:    (tags.pref||[]).includes('sense_lactosa')     || /lact|llet|leche/.test(cliAlergies),
    fruitsSecs: (tags.pref||[]).includes('sense_fruita_seca') || /fruit[a-z]*\s*sec|fruto[a-z]*\s*seco|\bnut/.test(cliAlergies),
    ou:         /\bou\b|\bous\b|huevo/.test(cliAlergies),
    marisc:     /marisc|crustaci|crust[aá]ce|mol·?lusc|molusc/.test(cliAlergies),
    soja:       /soja|soia/.test(cliAlergies)
  };
  const aptLbl = { gluten:'gluten', lactosa:'lactosa', fruitsSecs:'fruits secs', ou:'ou', marisc:'marisc', soja:'soja' };
  Object.keys(aptLbl).forEach(k => {
    if(evita[k] && apt[k]) razones.push('conté ' + aptLbl[k]);
  });
  // Fallback si la receta no tiene alérgenos ICNS: regex de ingredientes.
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
  const comidas = tobMcComidasDelCliente(cli);
  const sem = tobMcState.semanaActiva;

  // grid layout: 1 col label comida + 7 cols días = 8 columnas
  grid.style.gridTemplateColumns = '90px repeat(7, minmax(110px, 1fr))';
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
        if(!r) return `<div class="tob-mc-cell-item" data-rec="${recId}"><span class="nm">(eliminada)</span><button class="x" onclick="tobMcRemoveItem(${d},'${comida.id}',${ix})">×</button></div>`;
        const m = tobRecMacros(r);
        const kcalPer = Math.round(m.kcal / (r.raciones || 1));
        return `<div class="tob-mc-cell-item" data-rec="${recId}" title="${tobEsc(r.nombre)} · ${kcalPer} kcal/ración">
          <span class="nm">${tobEsc(r.nombre)}</span>
          <span class="kc">${kcalPer}</span>
          <button class="x" onclick="tobMcRemoveItem(${d},'${comida.id}',${ix})" title="Eliminar">×</button>
        </div>`;
      }).join('');
      html += `<div class="tob-mc-cell" data-day="${d}" data-meal="${comida.id}">${itemsHtml}</div>`;
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

  // Habilitar drag&drop en cada celda
  if(typeof Sortable !== 'undefined'){
    grid.querySelectorAll('.tob-mc-cell').forEach(cell => {
      new Sortable(cell, {
        group: { name: 'menu', pull: true, put: true },
        animation: 150,
        ghostClass: 'tob-sortable-ghost',
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
        const m = tobRecMacros(r);
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

  let list = (tobMenusDB.recetas || []).slice();
  if(_tobMcMomentoFiltro){
    list = list.filter(r => (r.momentos || []).includes(_tobMcMomentoFiltro));
  }
  if(search){
    list = list.filter(r => (r.nombre || '').toLowerCase().includes(search) ||
      (r.tags || []).some(t => t.toLowerCase().includes(search)));
  }

  // Compatibilidad: cada receta evaluada vs perfil del cliente
  const evaluadas = list.map(r => ({
    rec: r,
    check: cli ? tobMcCheckCompat(r, cli) : { compat:true, razones:[] }
  }));
  // Ordenar: compatibles primero, luego incompatibles. Dentro de cada bloque, alfabético.
  evaluadas.sort((a,b) => {
    if(a.check.compat !== b.check.compat) return a.check.compat ? -1 : 1;
    return (a.rec.nombre||'').localeCompare(b.rec.nombre||'','es',{sensitivity:'base'});
  });

  // Si "filtrarPerfil" está activo, esconder incompatibles del todo
  const visibles = filtrarPerfil ? evaluadas.filter(e => e.check.compat) : evaluadas;

  const cnt = document.getElementById('tobMcRecCount');
  if(cnt){
    const compatN = evaluadas.filter(e => e.check.compat).length;
    cnt.textContent = filtrarPerfil
      ? `(${compatN} compatibles)`
      : `(${compatN}/${evaluadas.length} compatibles)`;
  }

  panel.innerHTML = visibles.map(({rec: r, check}) => {
    const m = tobRecMacros(r);
    const kcalPer = Math.round(m.kcal / (r.raciones || 1));
    // La foto se hidrata async (data-foto-rec): IndexedDB o URL.
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
  }).join('');
  if(!visibles.length){
    panel.innerHTML = '<div style="text-align:center;color:var(--mute2);padding:18px;font-family:DM Mono,monospace;font-size:.7rem;">Sin recetas que coincidan con los filtros.</div>';
  }
  tobHydrateFotos('#tobMcSidePanel');

  // Habilitar drag desde el panel lateral
  if(typeof Sortable !== 'undefined'){
    new Sortable(panel, {
      group: { name: 'menu', pull: 'clone', put: false },
      sort: false,
      animation: 150,
      ghostClass: 'tob-sortable-ghost'
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
    data:     JSON.parse(JSON.stringify(tobMcState.data)),
    savedAt:  new Date().toISOString()
  };
  // Update si ya existe, insert si no
  const ix = cli.menus.findIndex(m => m.id === snapshot.id);
  if(ix >= 0) cli.menus[ix] = snapshot;
  else cli.menus.unshift(snapshot);
  tobMcState._menuId = snapshot.id;
  tobSave();
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
    _menuId: m.id
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

function tobMenusGuardadosRender(){
  const cont = document.getElementById('tobMenusGuardadosList');
  if(!cont) return;
  const q = (document.getElementById('tobMenusGuardadosSearch')?.value || '').trim().toLowerCase();
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

// ── PDF del menú semanal (portada + graella + nutrició + compra + receptari)
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
  const comidas = (m.comidasIds || []).map(id => ({ id, label: TOB_REC_MOMENTO_LBL[id] || id }));
  const semanas = m.semanas || 1;
  // Macros por ración de una receta
  const macRac = (r) => { const x = tobRecMacros(r); const rac = r.raciones || 1; return { kcal:x.kcal/rac, prot:x.proteina/rac, hc:x.hc/rac, gras:x.grasa/rac, fib:x.fibra/rac }; };

  // ── Graella del menú por semana ────────────────────────────────
  let graellaHtml = '';
  for(let s = 0; s < semanas; s++){
    let rows = '';
    comidas.forEach(c => {
      let cells = '';
      for(let d = 0; d < 7; d++){
        const ids = ((m.data[s]||{})[d]||{})[c.id] || [];
        const platos = ids.map(id => {
          const r = recsById[id];
          if(!r) return '<div class="mp-plato mp-buit">(eliminada)</div>';
          const foto = fotoMap[id];
          const mr = macRac(r);
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
    graellaHtml += `<div class="mp-section">
      <h2>Setmana ${s+1}</h2>
      <table class="mp-graella"><thead><tr><th></th>${DIAS.map(d=>`<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  // ── Resum nutricional (mitjana per dia) ────────────────────────
  let totDias = 0, acc = { kcal:0, prot:0, hc:0, gras:0, fib:0 };
  for(let s = 0; s < semanas; s++){
    for(let d = 0; d < 7; d++){
      let dayHas = false;
      comidas.forEach(c => {
        ((((m.data[s]||{})[d]||{})[c.id]) || []).forEach(id => {
          const r = recsById[id]; if(!r) return;
          const mr = macRac(r);
          acc.kcal+=mr.kcal; acc.prot+=mr.prot; acc.hc+=mr.hc; acc.gras+=mr.gras; acc.fib+=mr.fib;
          dayHas = true;
        });
      });
      if(dayHas) totDias++;
    }
  }
  const avg = k => totDias ? Math.round(acc[k]/totDias) : 0;
  const nutriHtml = `<div class="mp-section"><h2>Resum nutricional · mitjana per dia</h2>
    <table class="mp-nutri"><tbody>
      <tr><td>Energia</td><td><b>${avg('kcal')}</b> kcal</td><td>Objectiu</td><td>${m.kcalObj||'—'} kcal</td></tr>
      <tr><td>Proteïna</td><td><b>${avg('prot')}</b> g</td><td>Objectiu</td><td>${m.protObj||'—'} g</td></tr>
      <tr><td>Hidrats</td><td><b>${avg('hc')}</b> g</td><td>Greixos</td><td>${avg('gras')} g</td></tr>
      <tr><td>Fibra</td><td><b>${avg('fib')}</b> g</td><td>Dies amb menú</td><td>${totDias}</td></tr>
    </tbody></table></div>`;

  // ── Llista de la compra (ingredients agregats) ─────────────────
  const compra = {};
  Object.keys(usos).forEach(id => {
    const r = recsById[id];
    if(!r || !Array.isArray(r.ingredientes)) return;
    const rac = r.raciones || 1;
    r.ingredientes.forEach(it => {
      const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
      const nom = ing ? ing.nombre : (it._nombreFallback || null);
      if(!nom) return;
      const g = (+it.gramos || 0) / rac * usos[id];
      const k = nom.toLowerCase();
      if(!compra[k]) compra[k] = { nom, g:0 };
      compra[k].g += g;
    });
  });
  const compraArr = Object.values(compra).sort((a,b) => a.nom.localeCompare(b.nom,'ca',{sensitivity:'base'}));
  const compraHtml = compraArr.length ? `<div class="mp-section mp-break"><h2>Llista de la compra</h2>
    <ul class="mp-compra">${compraArr.map(c =>
      `<li><span>${esc(c.nom)}</span><span class="mp-g">${c.g >= 1000 ? (c.g/1000).toFixed(2)+' kg' : Math.round(c.g)+' g'}</span></li>`
    ).join('')}</ul></div>` : '';

  // ── Receptari ──────────────────────────────────────────────────
  const recetari = Object.keys(usos).map(id => recsById[id]).filter(Boolean)
    .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||'','ca',{sensitivity:'base'}));
  const recetariHtml = `<div class="mp-section mp-break"><h2>Receptari</h2>
    ${recetari.map(r => {
      const foto = fotoMap[r.id];
      const mr = macRac(r);
      const ings = (r.ingredientes||[]).map(it => {
        const ing = (tobMenusDB.ingredientes||[]).find(i => i.id === it.ingId);
        const nom = ing ? ing.nombre : (it._nombreFallback || '—');
        return `<li>${esc(nom)}${it.gramos ? ` · ${Math.round(it.gramos)} g` : ''}</li>`;
      }).join('');
      const pasos = Array.isArray(r.instrucciones) ? r.instrucciones
                  : String(r.instrucciones||'').split('\n').filter(Boolean);
      return `<div class="mp-recepta">
        <div class="mp-recepta-head">
          ${foto ? `<div class="mp-recepta-foto" style="background-image:url('${esc(foto)}')"></div>` : ''}
          <div><div class="mp-recepta-nm">${esc(r.nombre||'—')}</div>
          <div class="mp-recepta-mac">${Math.round(mr.kcal)} kcal · ${Math.round(mr.prot)}g prot · ${Math.round(mr.hc)}g HC · ${Math.round(mr.gras)}g greix${r.tiempoTotal?` · ⏱ ${esc(r.tiempoTotal)}`:''}</div>
          ${(r.alergenos&&r.alergenos.length)?`<div class="mp-recepta-al">⚠ ${esc(r.alergenos.join(' · '))}</div>`:''}</div>
        </div>
        ${ings ? `<div class="mp-recepta-cols"><div><h4>Ingredients</h4><ul>${ings}</ul></div>
          <div><h4>Preparació</h4><ol>${pasos.map(p=>`<li>${esc(p.replace(/^[-·•*\d.\s]+/,''))}</li>`).join('')||'<li>—</li>'}</ol></div></div>` : ''}
      </div>`;
    }).join('')}</div>`;

  // ── Documento completo ─────────────────────────────────────────
  const hoy = new Date().toLocaleDateString('ca-ES', { day:'numeric', month:'long', year:'numeric' });
  const html = `<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8">
<title>Menú · ${esc(cli.nombre)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;padding:26px 30px;}
  h1{font-size:22px;color:#b8860b;} h2{font-size:15px;color:#b8860b;margin:0 0 9px;border-bottom:2px solid #e8c87a;padding-bottom:3px;}
  h4{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888;margin:0 0 4px;}
  .mp-cover{border:2px solid #e8c87a;border-radius:8px;padding:18px 22px;margin-bottom:22px;}
  .mp-cover .sub{color:#666;font-size:12px;margin-top:3px;}
  .mp-cover .objs{margin-top:10px;font-size:12px;color:#444;}
  .mp-cover .objs b{color:#b8860b;}
  .mp-section{margin-bottom:20px;}
  .mp-break{page-break-before:always;}
  table{border-collapse:collapse;width:100%;}
  .mp-graella th,.mp-graella td{border:1px solid #ddd;padding:4px;font-size:9px;vertical-align:top;}
  .mp-graella thead th{background:#f5ebd2;color:#7a5c10;font-size:9px;text-transform:uppercase;letter-spacing:.03em;}
  .mp-graella tbody th{background:#faf3e0;color:#7a5c10;width:62px;font-size:9px;text-transform:uppercase;}
  .mp-plato{display:flex;gap:4px;align-items:center;margin-bottom:3px;}
  .mp-plato:last-child{margin-bottom:0;}
  .mp-foto{width:34px;height:26px;border-radius:3px;background:#eee center/cover;flex:none;}
  .mp-nofoto{background:#f0e6cc;}
  .mp-plato-nm{font-weight:700;font-size:8.5px;line-height:1.15;}
  .mp-plato-kcal{font-size:7.5px;color:#888;}
  .mp-buit{color:#ccc;font-size:9px;text-align:center;}
  .mp-nutri td{border:1px solid #ddd;padding:5px 9px;font-size:11px;}
  .mp-nutri td:nth-child(odd){background:#faf3e0;color:#7a5c10;font-weight:600;width:130px;}
  .mp-compra{list-style:none;columns:3;column-gap:22px;}
  .mp-compra li{display:flex;justify-content:space-between;font-size:10px;padding:2.5px 0;border-bottom:1px dotted #ddd;break-inside:avoid;}
  .mp-compra .mp-g{color:#b8860b;font-weight:700;}
  .mp-recepta{border:1px solid #e3e3e3;border-radius:7px;padding:11px 13px;margin-bottom:11px;page-break-inside:avoid;}
  .mp-recepta-head{display:flex;gap:11px;align-items:center;margin-bottom:8px;}
  .mp-recepta-foto{width:84px;height:64px;border-radius:5px;background:#eee center/cover;flex:none;}
  .mp-recepta-nm{font-size:14px;font-weight:700;color:#1a1a1a;}
  .mp-recepta-mac{font-size:10px;color:#888;margin-top:2px;}
  .mp-recepta-al{font-size:9px;color:#b23;margin-top:2px;}
  .mp-recepta-cols{display:flex;gap:22px;}
  .mp-recepta-cols>div{flex:1;}
  .mp-recepta-cols ul,.mp-recepta-cols ol{margin-left:15px;font-size:10px;line-height:1.45;}
  .mp-foot{margin-top:20px;text-align:center;font-size:9px;color:#aaa;}
  @page{margin:14mm;}
</style></head><body>
  <div class="mp-cover">
    <h1>Menú nutricional</h1>
    <div class="sub">${esc(cli.nombre)} · generat el ${esc(hoy)}</div>
    <div class="objs">
      <b>${semanas}</b> setmana(es) · <b>${comidas.length}</b> àpats/dia
      &nbsp;·&nbsp; Objectiu: <b>${m.kcalObj||'—'}</b> kcal/dia · <b>${m.protObj||'—'}</b> g proteïna
    </div>
  </div>
  ${graellaHtml}
  ${nutriHtml}
  ${compraHtml}
  ${recetariHtml}
  <div class="mp-foot">Generat amb Full Training · ${esc(hoy)}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if(!w){ tobToast('Permet les finestres emergents per generar el PDF', 'red'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  tobToast('✓ Menú obert — desa\'l com a PDF', 'green');
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
  tobMenusLoad().catch(e => console.warn('[boot] tobMenusLoad:', e)).finally(() => tobLoad());
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', tobBoot);
} else {
  tobBoot();
}
