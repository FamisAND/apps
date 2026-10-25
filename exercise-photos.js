/* Static shared illustrations. Does not read or write client data. */
(function(root){
  'use strict';
  const entries=[
  {
    "id": "barbell-bench-press",
    "name": "Press banca horizontal con barra",
    "aliases": [
      "PRESS BANCA",
      "PRESS BANCA HORIZONTAL"
    ],
    "equipment": "Barra y banco plano",
    "technique": "Apoya pies, gluteos y espalda en el banco. Baja la barra con control hacia el pecho y empuja manteniendo las munecas alineadas.",
    "images": [
      "exercise-barbell-bench-press-start.jpg",
      "exercise-barbell-bench-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "barbell-back-squat",
    "name": "Sentadilla trasera con barra",
    "aliases": [
      "SENTADILLA TRASERA CON BARRA"
    ],
    "equipment": "Barra y rack",
    "technique": "Mantiene abdomen firme y pies estables. Flexiona cadera y rodillas en un rango controlado; sube sin perder la alineacion entre rodillas y pies.",
    "images": [
      "exercise-barbell-back-squat-start.jpg",
      "exercise-barbell-back-squat-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "standing-barbell-press",
    "name": "Press militar de pie con barra",
    "aliases": [
      "PRESS MILITAR CON BARRA",
      "PRESS MILITAR DE PIE"
    ],
    "equipment": "Barra",
    "technique": "Aprieta abdomen y gluteos. Presiona la barra desde las claviculas hasta encima de los hombros, sin impulsar con las piernas ni arquear la espalda.",
    "images": [
      "exercise-standing-barbell-press-start.jpg",
      "exercise-standing-barbell-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "parallel-bar-dip",
    "name": "Fondos en paralelas",
    "aliases": [
      "FONDOS TRICEPS",
      "FONDOS DE TRICEPS",
      "FONDOS ESTRECHOS"
    ],
    "equipment": "Barras paralelas",
    "technique": "Sosten el cuerpo entre las barras. Baja flexionando los codos hasta un rango comodo y vuelve sin balancear las piernas ni encoger los hombros.",
    "images": [
      "exercise-parallel-bar-dip-start.jpg",
      "exercise-parallel-bar-dip-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "lying-leg-curl",
    "name": "Curl femoral tumbado en maquina",
    "aliases": [
      "LEG CURL TUMBADO",
      "CURL FEMORAL TUMBADO"
    ],
    "equipment": "Maquina de curl femoral tumbado",
    "technique": "Alinea las rodillas con el eje de la maquina y situa el rodillo cerca de los tobillos. Flexiona sin levantar la pelvis y regresa con control.",
    "images": [
      "exercise-lying-leg-curl-start.jpg",
      "exercise-lying-leg-curl-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "flat-dumbbell-press",
    "name": "Press horizontal con mancuernas",
    "aliases": [
      "PRESS HORIZONTAL CON MANCUERNAS",
      "PRESS BANCA CON MANCUERNAS"
    ],
    "equipment": "Mancuernas y banco plano",
    "technique": "Apoya pies y espalda. Baja las mancuernas a los lados del pecho con antebrazos verticales y empuja sin chocar las pesas ni despegar los gluteos.",
    "images": [
      "exercise-flat-dumbbell-press-start.jpg",
      "exercise-flat-dumbbell-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "seated-dumbbell-press",
    "name": "Press de hombros sentado con mancuernas",
    "aliases": [
      "PRESS MANCUERNAS SENTADA",
      "PRESS MANCUERNAS SENTADO",
      "PRESS DE HOMBROS SENTADO CON MANCUERNAS"
    ],
    "equipment": "Mancuernas y banco con respaldo",
    "technique": "Apoya la espalda y manten el abdomen firme. Presiona desde los hombros hasta encima de la cabeza sin arquear la zona lumbar; baja con control.",
    "images": [
      "exercise-seated-dumbbell-press-start.jpg",
      "exercise-seated-dumbbell-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "incline-barbell-press",
    "name": "Press inclinado 45 grados con barra",
    "aliases": [
      "PRESS INCLINADO CON BARRA",
      "PRESS INCLINADO 45 CON BARRA"
    ],
    "equipment": "Barra y banco inclinado 45 grados",
    "technique": "Apoya espalda y pies. Baja la barra hacia la parte alta del pecho con antebrazos verticales y empuja manteniendo la posicion del tronco.",
    "images": [
      "exercise-incline-barbell-press-start.jpg",
      "exercise-incline-barbell-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "incline-dumbbell-press",
    "name": "Press inclinado 45 grados con mancuernas",
    "aliases": [
      "PRESS INCLINADO CON MANCUERNAS"
    ],
    "equipment": "Mancuernas y banco inclinado 45 grados",
    "technique": "Apoya la espalda en el respaldo inclinado. Baja las mancuernas junto a la parte alta del pecho y empuja sin juntar violentamente las pesas.",
    "images": [
      "exercise-incline-dumbbell-press-start.jpg",
      "exercise-incline-dumbbell-press-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "leg-press-calf",
    "name": "Gemelos en prensa inclinada",
    "aliases": [
      "CALF EN PRENSA",
      "CALF PRENSA",
      "GEMELOS EN PRENSA"
    ],
    "equipment": "Prensa inclinada",
    "technique": "Apoya el antepie en la plataforma con los seguros ajustados. Mueve solo los tobillos, baja los talones con control y elevalos sin rebotes.",
    "images": [
      "exercise-leg-press-calf-start.jpg",
      "exercise-leg-press-calf-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "pull-up",
    "name": "Dominadas pronas",
    "aliases": [
      "DOMINADAS",
      "DOMINADAS PRONAS"
    ],
    "equipment": "Barra de dominadas",
    "technique": "Agarra la barra con las palmas hacia delante. Baja los hombros y eleva el cuerpo sin impulso; vuelve con control sin dejarte caer.",
    "images": [
      "exercise-pull-up-start.jpg",
      "exercise-pull-up-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "chin-up",
    "name": "Dominadas supinas",
    "aliases": [
      "DOMINADAS SUPINAS",
      "CHIN UP"
    ],
    "equipment": "Barra de dominadas",
    "technique": "Agarra con las palmas hacia ti. Eleva el pecho hacia la barra sin balancear las piernas y desciende de forma controlada.",
    "images": [
      "exercise-chin-up-start.jpg",
      "exercise-chin-up-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "leg-extension",
    "name": "Extension de rodilla en maquina",
    "aliases": [
      "LEG EXTENSION",
      "EXTENSION DE CUADRICEPS"
    ],
    "equipment": "Maquina de extension de rodilla",
    "technique": "Ajusta el respaldo y alinea rodillas con el eje. Extiende sin impulso, manten la pelvis apoyada y baja despacio sin soltar la carga.",
    "images": [
      "exercise-leg-extension-start.jpg",
      "exercise-leg-extension-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "bent-over-barbell-row",
    "name": "Remo inclinado con barra prono",
    "aliases": [
      "REMO CON BARRA PRONO",
      "BENT OVER ROW"
    ],
    "equipment": "Barra",
    "technique": "Inclina el tronco desde la cadera y fija la espalda neutra. Lleva la barra hacia el abdomen sin incorporarte ni dar tirones.",
    "images": [
      "exercise-bent-over-barbell-row-start.jpg",
      "exercise-bent-over-barbell-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "seal-barbell-row",
    "name": "Seal row con barra y banco horizontal",
    "aliases": [
      "SEAL ROW CON BARRA"
    ],
    "equipment": "Banco horizontal alto y barra",
    "technique": "Apoya pecho y abdomen en un banco horizontal elevado. Tira de la barra hacia el banco sin extender la espalda y baja hasta estirar los brazos.",
    "images": [
      "exercise-seal-barbell-row-start.jpg",
      "exercise-seal-barbell-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "t-bar-row",
    "name": "Remo T con barra landmine",
    "aliases": [
      "REMO LANDMINE",
      "REMO BARRA T"
    ],
    "equipment": "Barra anclada y agarre neutro",
    "technique": "Fija la cadera y el tronco. Tira del agarre hacia el abdomen manteniendo los codos cerca y baja la carga sin redondear la espalda.",
    "images": [
      "exercise-t-bar-row-start.jpg",
      "exercise-t-bar-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "one-arm-dumbbell-row",
    "name": "Remo unilateral con mancuerna",
    "aliases": [
      "REMO UNILATERAL CON MANCUERNA",
      "REMO CON MANCUERNA"
    ],
    "equipment": "Mancuerna y banco",
    "technique": "Apoya una mano y una rodilla en el banco. Mantiene el tronco estable y lleva el codo hacia la cadera sin girar el cuerpo.",
    "images": [
      "exercise-one-arm-dumbbell-row-start.jpg",
      "exercise-one-arm-dumbbell-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "forward-lunge",
    "name": "Zancada hacia delante",
    "aliases": [
      "LUNGE",
      "LUNGES",
      "TIJERAS"
    ],
    "equipment": "Peso corporal",
    "technique": "Da un paso amplio al frente y flexiona ambas rodillas con control. Empuja con la pierna adelantada para volver sin perder el equilibrio.",
    "images": [
      "exercise-forward-lunge-start.jpg",
      "exercise-forward-lunge-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "split-squat",
    "name": "Split squat con apoyo en el suelo",
    "aliases": [
      "SPLIT SQUAT"
    ],
    "equipment": "Peso corporal",
    "technique": "Parte de una posicion dividida fija. Desciende flexionando ambas rodillas y sube manteniendo los pies en su sitio, sin elevar el pie trasero en un banco.",
    "images": [
      "exercise-split-squat-start.jpg",
      "exercise-split-squat-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "lying-ez-triceps-extension",
    "name": "Press frances tumbado con barra EZ",
    "aliases": [
      "PRESS FRANCES TUMBADO",
      "PRESS FRANCES CON BARRA EZ"
    ],
    "equipment": "Barra EZ y banco plano",
    "technique": "Mantiene los brazos orientados hacia arriba. Flexiona los codos llevando la barra cerca de la frente y vuelve sin separar en exceso los codos.",
    "images": [
      "exercise-lying-ez-triceps-extension-start.jpg",
      "exercise-lying-ez-triceps-extension-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "glute-ham-raise",
    "name": "Glute ham raise en banco GHD",
    "aliases": [
      "GLUTE HAM RAISE"
    ],
    "equipment": "Banco GHD",
    "technique": "Ajusta tobillos y muslos en el banco. Baja el tronco manteniendo cadera y espalda alineadas, y vuelve flexionando las rodillas sin hiperextender la zona lumbar.",
    "images": [
      "exercise-glute-ham-raise-start.jpg",
      "exercise-glute-ham-raise-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "donkey-calf-machine",
    "name": "Gemelos donkey en maquina",
    "aliases": [
      "DONKEY",
      "DONKEY CALF"
    ],
    "equipment": "Maquina donkey calf",
    "technique": "Inclina el tronco con apoyo estable y situa la almohadilla sobre la pelvis. Eleva y baja los talones sin rebotes manteniendo las rodillas estables.",
    "images": [
      "exercise-donkey-calf-machine-start.jpg",
      "exercise-donkey-calf-machine-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "floor-crunch",
    "name": "Crunch abdominal en suelo",
    "aliases": [
      "CRUNCH"
    ],
    "equipment": "Colchoneta",
    "technique": "Con rodillas flexionadas, acerca las costillas a la pelvis elevando los hombros. Evita tirar del cuello y vuelve con control sin incorporarte del todo.",
    "images": [
      "exercise-floor-crunch-start.jpg",
      "exercise-floor-crunch-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "supinated-lat-pulldown",
    "name": "Jalon al pecho con agarre supino",
    "aliases": [
      "LAT MACHINE SUPINA",
      "JALON SUPINO"
    ],
    "equipment": "Polea alta",
    "technique": "Agarra con las palmas hacia ti y fija los muslos. Lleva la barra hacia el pecho con los codos cerca del tronco, sin balancearte.",
    "images": [
      "exercise-supinated-lat-pulldown-start.jpg",
      "exercise-supinated-lat-pulldown-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "supinated-barbell-row",
    "name": "Remo inclinado con barra supino",
    "aliases": [
      "REMO BARRA INVERTIDO",
      "REMO CON BARRA INVERTIDO"
    ],
    "equipment": "Barra",
    "technique": "Agarra la barra con palmas hacia delante e inclina el tronco desde la cadera. Tira hacia el abdomen manteniendo la espalda neutra y los codos cerca.",
    "images": [
      "exercise-supinated-barbell-row-start.jpg",
      "exercise-supinated-barbell-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "dumbbell-fly",
    "name": "Aperturas con mancuernas en banco plano",
    "aliases": [
      "APERTURAS BANCO HORIZONTAL",
      "APERTURAS CON MANCUERNAS"
    ],
    "equipment": "Mancuernas y banco plano",
    "technique": "Mantiene una ligera flexion de codos. Abre los brazos hasta un rango comodo sin forzar los hombros y junta las mancuernas sobre el pecho.",
    "images": [
      "exercise-dumbbell-fly-start.jpg",
      "exercise-dumbbell-fly-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "cable-fly",
    "name": "Cruces de polea para pectoral",
    "aliases": [
      "CRUCES POLEA",
      "CRUCES EN POLEA"
    ],
    "equipment": "Doble polea",
    "technique": "Adopta una base estable y fija una ligera flexion de codos. Acerca los brazos por delante del pecho sin encoger los hombros y abre con control.",
    "images": [
      "exercise-cable-fly-start.jpg",
      "exercise-cable-fly-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "forearm-plank",
    "name": "Plancha abdominal sobre antebrazos",
    "aliases": [
      "PLANCHA ABDOMEN",
      "PLANCHA ABDOMINAL",
      "PLANCHA"
    ],
    "equipment": "Colchoneta",
    "technique": "Apoya codos bajo los hombros y puntas de los pies. Mantiene cabeza, tronco y pelvis alineados, sin hundir la zona lumbar y respirando.",
    "images": [
      "exercise-forearm-plank-start.jpg",
      "exercise-forearm-plank-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "dumbbell-lateral-raise",
    "name": "Elevaciones laterales con mancuernas",
    "aliases": [
      "ELEVACIONES LATERALES",
      "ELEVACION LATERAL"
    ],
    "equipment": "Mancuernas",
    "technique": "Con el tronco estable, eleva los brazos lateralmente hasta aproximadamente la altura de hombros. Mantiene codos suaves y baja sin impulso.",
    "images": [
      "exercise-dumbbell-lateral-raise-start.jpg",
      "exercise-dumbbell-lateral-raise-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "kneeling-landmine-rotation",
    "name": "Rotacion landmine arrodillado",
    "aliases": [
      "CHOP CON BARRA ARRODILLADO"
    ],
    "equipment": "Barra anclada y colchoneta",
    "technique": "Con ambas rodillas apoyadas y abdomen firme, desplaza el extremo de la barra de un lado a otro en un arco controlado. Evita forzar la zona lumbar.",
    "images": [
      "exercise-kneeling-landmine-rotation-start.jpg",
      "exercise-kneeling-landmine-rotation-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "incline-dumbbell-curl",
    "name": "Curl de biceps en banco inclinado 45 grados",
    "aliases": [
      "CURL 45",
      "CURL INCLINADO"
    ],
    "equipment": "Mancuernas y banco inclinado",
    "technique": "Apoya la espalda y deja los brazos colgar junto al banco. Flexiona los codos sin adelantarlos y baja las mancuernas de forma controlada.",
    "images": [
      "exercise-incline-dumbbell-curl-start.jpg",
      "exercise-incline-dumbbell-curl-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "spider-curl",
    "name": "Spider curl con mancuernas",
    "aliases": [
      "SPIDER CURL CON MANCUERNAS"
    ],
    "equipment": "Mancuernas y banco inclinado",
    "technique": "Apoya el pecho en el banco inclinado y deja colgar los brazos. Flexiona los codos sin mover los hombros ni levantar el pecho del apoyo.",
    "images": [
      "exercise-spider-curl-start.jpg",
      "exercise-spider-curl-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "neutral-grip-pull-up",
    "name": "Dominadas con agarre neutro estrecho",
    "aliases": [
      "DOMINADAS AGARRE NEUTRO ESTRECHO"
    ],
    "equipment": "Barras de dominadas con asas paralelas",
    "technique": "Agarra las asas con palmas enfrentadas. Eleva el cuerpo sin impulso, llevando codos hacia abajo, y vuelve de forma controlada.",
    "images": [
      "exercise-neutral-grip-pull-up-start.jpg",
      "exercise-neutral-grip-pull-up-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "wide-grip-pull-up",
    "name": "Dominadas pronas con agarre ancho",
    "aliases": [
      "DOMINADAS AGARRE ANCHO"
    ],
    "equipment": "Barra de dominadas",
    "technique": "Usa un agarre prono algo mas ancho que los hombros. Sube sin impulso y baja con control; no lleves la barra detras de la cabeza.",
    "images": [
      "exercise-wide-grip-pull-up-start.jpg",
      "exercise-wide-grip-pull-up-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "straight-arm-pulldown",
    "name": "Pulldown con brazos extendidos",
    "aliases": [
      "PULL DOWN BRAZOS EXTENDIDOS"
    ],
    "equipment": "Polea alta y barra corta",
    "technique": "Fija una ligera flexion de codos y el tronco. Lleva la barra desde delante de la cabeza hasta los muslos usando los hombros, sin balancearte.",
    "images": [
      "exercise-straight-arm-pulldown-start.jpg",
      "exercise-straight-arm-pulldown-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "trx-row",
    "name": "Remo en suspension TRX",
    "aliases": [
      "REMO TRX",
      "REMO EN SUSPENSION"
    ],
    "equipment": "Correas de suspension",
    "technique": "Inclina el cuerpo manteniendolo alineado. Acerca el pecho a las manos flexionando los codos y vuelve sin hundir la pelvis.",
    "images": [
      "exercise-trx-row-start.jpg",
      "exercise-trx-row-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "chest-press-machine",
    "name": "Press pectoral en maquina",
    "aliases": [
      "CHEST PRESS",
      "CHEST PRESS MAQUINA"
    ],
    "equipment": "Maquina chest press",
    "technique": "Ajusta el asiento para que los agarres queden a la altura del pecho. Empuja sin despegar la espalda y vuelve sin dejar caer la carga.",
    "images": [
      "exercise-chest-press-machine-start.jpg",
      "exercise-chest-press-machine-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "fitball-crunch",
    "name": "Crunch abdominal sobre fitball",
    "aliases": [
      "CRUNCH FITBALL"
    ],
    "equipment": "Fitball",
    "technique": "Apoya la zona media y lumbar sobre la pelota con los pies estables. Acerca costillas a pelvis elevando el tronco ligeramente, sin tirar del cuello.",
    "images": [
      "exercise-fitball-crunch-start.jpg",
      "exercise-fitball-crunch-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "banded-barbell-hip-thrust",
    "name": "Hip thrust con barra y banda en rodillas",
    "aliases": [
      "HIP THRUST GOMA RODILLA",
      "HIP THRUST CON BANDA EN RODILLAS"
    ],
    "equipment": "Barra, banco y banda elastica",
    "technique": "Apoya la espalda alta en el banco y coloca la banda sobre las rodillas. Extiende la cadera manteniendo rodillas alineadas y costillas controladas, sin arquear la espalda.",
    "images": [
      "exercise-banded-barbell-hip-thrust-start.jpg",
      "exercise-banded-barbell-hip-thrust-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "cable-front-raise",
    "name": "Elevacion frontal en polea baja",
    "aliases": [
      "ELEVACION FRONTAL POLEA BAJA"
    ],
    "equipment": "Polea baja y barra corta",
    "technique": "Con el tronco estable, eleva los brazos hacia delante hasta la altura de hombros. Mantiene codos suaves y baja sin balancearte.",
    "images": [
      "exercise-cable-front-raise-start.jpg",
      "exercise-cable-front-raise-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "reverse-cable-fly",
    "name": "Cruces inversos en polea",
    "aliases": [
      "CRUCES INVERTIDAS",
      "CRUCES INVERSOS EN POLEA"
    ],
    "equipment": "Doble polea",
    "technique": "Con poleas a la altura de hombros, abre los brazos sin arquear el tronco. Mantiene una ligera flexion de codos y vuelve despacio.",
    "images": [
      "exercise-reverse-cable-fly-start.jpg",
      "exercise-reverse-cable-fly-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "cable-glute-kickback",
    "name": "Patada de gluteo unilateral en polea baja",
    "aliases": [
      "PATADAS UNILATERAL POLEA BAJA",
      "PATADA DE GLUTEO EN POLEA"
    ],
    "equipment": "Polea baja y tobillera",
    "technique": "Sujeta el soporte y fija el tronco. Lleva una pierna hacia atras desde la cadera sin arquear la espalda ni girar la pelvis, y vuelve con control.",
    "images": [
      "exercise-cable-glute-kickback-start.jpg",
      "exercise-cable-glute-kickback-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "reverse-lunge",
    "name": "Zancada hacia atras",
    "aliases": [
      "LUNGES STEP BACK",
      "ZANCADA HACIA ATRAS"
    ],
    "equipment": "Peso corporal",
    "technique": "Da un paso atras y baja flexionando ambas rodillas con control. Empuja con la pierna delantera para regresar sin inclinar ni girar el tronco.",
    "images": [
      "exercise-reverse-lunge-start.jpg",
      "exercise-reverse-lunge-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "ab-wheel-rollout",
    "name": "Rollout abdominal de rodillas con rueda",
    "aliases": [
      "AB WHEEL ROLLOUT",
      "RUEDA ABDOMINAL DE RODILLAS"
    ],
    "equipment": "Rueda abdominal y colchoneta",
    "technique": "Desde las rodillas, avanza la rueda sin hundir la zona lumbar. Limita el recorrido al que puedas controlar y vuelve manteniendo abdomen y gluteos firmes.",
    "images": [
      "exercise-ab-wheel-rollout-start.jpg",
      "exercise-ab-wheel-rollout-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "kneeling-cable-crunch",
    "name": "Crunch abdominal arrodillado en polea alta",
    "aliases": [
      "CRUNCH EN POLEA ALTA"
    ],
    "equipment": "Polea alta y cuerda",
    "technique": "Arrodillate frente a la polea con la cuerda junto a la cabeza. Acerca costillas a pelvis sin tirar con los brazos ni sentarte sobre los talones.",
    "images": [
      "exercise-kneeling-cable-crunch-start.jpg",
      "exercise-kneeling-cable-crunch-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  },
  {
    "id": "dead-stop-barbell-curl",
    "name": "Curl con barra desde apoyos",
    "aliases": [
      "CURL CON BARRA DESDE APOYOS"
    ],
    "equipment": "Barra y soportes de seguridad",
    "technique": "Con la barra detenida en apoyos bajos, flexiona los codos sin balancear el tronco. Regresa a los apoyos de forma controlada antes de repetir.",
    "images": [
      "exercise-dead-stop-barbell-curl-start.jpg",
      "exercise-dead-stop-barbell-curl-end.jpg"
    ],
    "generated": true,
    "source": "Ilustracion generada por IA; 2026-10-25"
  }
];
  if(typeof module==='object'&&module.exports)module.exports=entries;
  root.FTExercisePhotos=entries;
})(typeof window==='undefined'?globalThis:window);
