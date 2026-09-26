import type { CatalogUnit } from '@/types'

/**
 * Catálogo por defecto para España (banda de mercado de la Comunidad de Madrid)
 * que se carga en el catálogo de cada empresa la primera vez que entra en
 * /catalog, para que nadie empiece con el catálogo vacío.
 *
 * Origen de los datos: borrador generado con IA a partir de guías de precios
 * públicas y revisado a mano. Son PRECIOS ORIENTATIVOS y no proceden de bases de
 * precios con licencia (BEDEC, IVE, BCCA, CYPE Generador de precios), por lo que
 * nunca deben presentarse como si vinieran de ellas.
 *
 * `base_price` es el valor de partida; `price_min` / `price_max` son la banda de
 * mercado que la app muestra al revisar el precio.
 */

export interface DefaultCatalogService {
  code: string
  name: string
  description: string
  unit: CatalogUnit
  base_price: number
  price_min: number
  price_max: number
}

export interface DefaultCatalogPhase {
  name: string
  services: DefaultCatalogService[]
}

export const DEFAULT_CATALOG: DefaultCatalogPhase[] = [
  {
    name: 'Demoliciones y Trabajos Previos',
    services: [
      {
        code: 'DEM-001',
        name: 'Demolición de tabique de ladrillo/rasillón',
        description: 'Demolición de tabique de fábrica de ladrillo o rasillón por medios manuales, incluyendo transporte interno a punto de carga.',
        unit: 'm2',
        base_price: 14.5,
        price_min: 12,
        price_max: 18,
      },
      {
        code: 'DEM-002',
        name: 'Picado de alicatado o solado cerámico',
        description: 'Picado y levantado de azulejos o baldosas cerámicas existentes, incluyendo saneado del soporte.',
        unit: 'm2',
        base_price: 11,
        price_min: 9.5,
        price_max: 14,
      },
      {
        code: 'DEM-003',
        name: 'Desmontaje de sanitarios y grifería',
        description: 'Desmontaje de lavabo, inodoro, bidet o bañera/plato de ducha sin recuperación del elemento.',
        unit: 'ud',
        base_price: 25,
        price_min: 20,
        price_max: 35,
      },
      {
        code: 'DEM-004',
        name: 'Carga y retirada de escombros a vertedero autorizado',
        description: 'Carga manual o mecánica de escombros, canon de vertedero autorizado y tasa de gestión de residuos.',
        unit: 'm3',
        base_price: 38,
        price_min: 32,
        price_max: 45,
      },
      {
        code: 'DEM-005',
        name: 'Protección de zonas de paso y ascensor',
        description: 'Protección de suelos, paredes y cabina de ascensor con cartón ondulado y plástico de burbuja.',
        unit: 'ud',
        base_price: 120,
        price_min: 90,
        price_max: 160,
      },
    ],
  },
  {
    name: 'Albañilería y Ayudas de Oficio',
    services: [
      {
        code: 'ALB-001',
        name: 'Levantado de tabique de ladrillo hueco doble (7 cm)',
        description: 'Tabicón de ladrillo hueco doble tomado con mortero de cemento, listo para guarnecido.',
        unit: 'm2',
        base_price: 26,
        price_min: 22,
        price_max: 32,
      },
      {
        code: 'ALB-002',
        name: 'Maestreado y enfoscado de mortero de cemento en paredes',
        description: 'Enfoscado maestreado con mortero de cemento sobre paramentos verticales para posterior alicatado.',
        unit: 'm2',
        base_price: 16.5,
        price_min: 14,
        price_max: 21,
      },
      {
        code: 'ALB-003',
        name: 'Ejecución de solera autonivelante (3-5 cm)',
        description: 'Formación de recrecido de suelo con mortero autonivelante para regularización de base de solado.',
        unit: 'm2',
        base_price: 18,
        price_min: 15,
        price_max: 23,
      },
      {
        code: 'ALB-004',
        name: 'Ayudas de albañilería a instalaciones (fontanería/electricidad)',
        description: 'Apertura y tapado de rozas, rematado de cajas de mecanismos y pasos de tuberías en obra.',
        unit: 'vg',
        base_price: 350,
        price_min: 280,
        price_max: 450,
      },
      {
        code: 'ALB-005',
        name: 'Colocación de premarco de puerta de paso',
        description: 'Suministro y recibida con yeso/mortero de premarco de pino para puerta de paso.',
        unit: 'ud',
        base_price: 35,
        price_min: 28,
        price_max: 45,
      },
    ],
  },
  {
    name: 'Solados y Alicatados',
    services: [
      {
        code: 'SOL-001',
        name: 'Alicatado de paramento vertical con gres cerámico (colocación)',
        description: 'Mano de obra y material de agarre (cemento cola C2TE) para colocación de azulejos (material cerámico no incluido).',
        unit: 'm2',
        base_price: 24,
        price_min: 20,
        price_max: 30,
      },
      {
        code: 'SOL-002',
        name: 'Solado de gres porcelánico gran formato (colocación)',
        description: 'Mano de obra y cemento cola flexible tipo C2TES1 para colocación de porcelánico hasta 120x60 cm con crucetas autonivelantes.',
        unit: 'm2',
        base_price: 29,
        price_min: 25,
        price_max: 36,
      },
      {
        code: 'SOL-003',
        name: 'Rejuntado de azulejos/baldosas con junta deformable',
        description: 'Aplicación de pasta de rejuntar antihumedad en juntas de pared o suelo, limpiado y pulido final.',
        unit: 'm2',
        base_price: 4.5,
        price_min: 3.5,
        price_max: 6,
      },
      {
        code: 'SOL-004',
        name: 'Colocación de rodapié cerámico o de madera',
        description: 'Suministro de agarre/adhesivo y colocación de rodapié en perímetro de estancia.',
        unit: 'ml',
        base_price: 7.5,
        price_min: 6,
        price_max: 10,
      },
      {
        code: 'SOL-005',
        name: 'Impermeabilización de plato de ducha en obra',
        description: 'Aplicación de lámina impermeable tipo Kermate u homóloga en zona de ducha con solape en paredes.',
        unit: 'ud',
        base_price: 110,
        price_min: 85,
        price_max: 140,
      },
    ],
  },
  {
    name: 'Fontanería, Saneamiento y Calefacción',
    services: [
      {
        code: 'FON-001',
        name: 'Instalación completa de fontanería para baño (agua fría/caliente)',
        description: 'Instalación en tubería multicapa o PEX para lavabo, inodoro, bidet y ducha, con llaves de corte individuales.',
        unit: 'ud',
        base_price: 520,
        price_min: 450,
        price_max: 620,
      },
      {
        code: 'FON-002',
        name: 'Instalación completa de fontanería para cocina',
        description: 'Tomas de agua y desagües para fregadero, lavavajillas y lavadora con llaves de escuadra cromadas.',
        unit: 'ud',
        base_price: 420,
        price_min: 350,
        price_max: 500,
      },
      {
        code: 'FON-003',
        name: 'Montaje e instalación de sanitario (inodoro/lavabo)',
        description: 'Fijación, conexión de desagüe y agua, y sellado con silicona neutra antimoho de inodoro o lavabo con pedestal/mueble.',
        unit: 'ud',
        base_price: 75,
        price_min: 60,
        price_max: 95,
      },
      {
        code: 'FON-004',
        name: 'Montaje de plato de ducha de resina/carga mineral',
        description: 'Colocación, nivelado, conexión de válvula de gran caudal y sellado de plato de ducha.',
        unit: 'ud',
        base_price: 130,
        price_min: 100,
        price_max: 160,
      },
      {
        code: 'FON-005',
        name: 'Montaje de mampara de ducha (frontal o angular)',
        description: 'Instalación y fijación a pared de mampara de vidrio templado, ajuste de rodamientos y sellado.',
        unit: 'ud',
        base_price: 95,
        price_min: 80,
        price_max: 120,
      },
      {
        code: 'FON-006',
        name: 'Instalación o sustitución de radiador de aluminio',
        description: 'Montaje de radiador por elementos, llaves termostáticas, detentor, purgador y conexionado a red de calefacción.',
        unit: 'ud',
        base_price: 140,
        price_min: 115,
        price_max: 175,
      },
    ],
  },
  {
    name: 'Electricidad e Iluminación',
    services: [
      {
        code: 'ELE-001',
        name: 'Punto de luz sencillo / conmutado (cableado y tubo ondulado)',
        description: 'Suministro e instalación de punto de luz con tubo corrugado libre de halógenos, cable de 1,5 mm2 y caja de registro.',
        unit: 'ud',
        base_price: 42,
        price_min: 35,
        price_max: 50,
      },
      {
        code: 'ELE-002',
        name: 'Punto de toma de corriente (enchufe 16A con toma de tierra)',
        description: 'Instalación de línea de enchufe con conductor de 2,5 mm2, tubo corrugado y caja de empotrar.',
        unit: 'ud',
        base_price: 45,
        price_min: 38,
        price_max: 55,
      },
      {
        code: 'ELE-003',
        name: 'Sustitución e instalación de Cuadro General de Mando y Protección (CGMP)',
        description: 'Cuadro de superficie o empotrar hasta 24 elementos con IGA, diferencial de alta sensibilidad y PIA por circuito.',
        unit: 'ud',
        base_price: 380,
        price_min: 300,
        price_max: 460,
      },
      {
        code: 'ELE-004',
        name: 'Toma de red de datos (RJ45 Cat 6) o Coaxial TV',
        description: 'Instalación de toma para televisión o datos con cable apantallado Cat 6 hasta cuadro de comunicaciones.',
        unit: 'ud',
        base_price: 55,
        price_min: 45,
        price_max: 68,
      },
      {
        code: 'ELE-005',
        name: 'Montaje de mecanismo eléctrico (marco + tecla/enchufe)',
        description: 'Instalación y conexionado de mecanismo (tipo Simon 27/82, Niessen Zenit o similar).',
        unit: 'ud',
        base_price: 9,
        price_min: 7,
        price_max: 12,
      },
      {
        code: 'ELE-006',
        name: 'Instalación de foco LED empotrable / downlight',
        description: 'Apertura de hueco en falso techo de pladur y montaje de foco LED con driver.',
        unit: 'ud',
        base_price: 18,
        price_min: 14,
        price_max: 24,
      },
    ],
  },
  {
    name: 'Pladur, Techos y Aislamientos',
    services: [
      {
        code: 'PLA-001',
        name: 'Falso techo continuo de placa de cartón yeso (Pladur) 13 mm',
        description: 'Estructura metálica suspendida de perfiles TC60 y placa N13, incluyendo cintas y amasado de juntas.',
        unit: 'm2',
        base_price: 26.5,
        price_min: 22,
        price_max: 32,
      },
      {
        code: 'PLA-002',
        name: 'Tabique de cartón yeso autoportante con aislamiento (15+46+15 mm)',
        description: 'Doble placa a cada lado con perfilería de 46 mm e interior relleno de lana de roca aislante acústico.',
        unit: 'm2',
        base_price: 38,
        price_min: 32,
        price_max: 45,
      },
      {
        code: 'PLA-003',
        name: 'Falso techo hidrófugo para baño/cocina (placa verde WR)',
        description: 'Falso techo continuo con placa resistente a la humedad tipo Pladur WR de 13 mm.',
        unit: 'm2',
        base_price: 29.5,
        price_min: 25,
        price_max: 35,
      },
      {
        code: 'PLA-004',
        name: 'Formación de cortinero o foseado periférico para tiras LED',
        description: 'Ejecución manual de remate en falso techo para alojamiento de cortinero o luz ambiental indirecta.',
        unit: 'ml',
        base_price: 22,
        price_min: 18,
        price_max: 28,
      },
    ],
  },
  {
    name: 'Pintura y Acabados',
    services: [
      {
        code: 'PIN-001',
        name: 'Alisado de gotelé en paredes y techos (2 manos de tendido)',
        description: 'Rascado o fijado de gota existente, tendido de 2 manos de masilla de renovación (tipo Aguaplast) y lijado fino.',
        unit: 'm2',
        base_price: 14.5,
        price_min: 12,
        price_max: 18,
      },
      {
        code: 'PIN-002',
        name: 'Pintado con pintura plástica mate lavable (2 manos)',
        description: 'Aplicación de imprimación selladora y dos manos de pintura plástica de primera calidad en color blanco o suave.',
        unit: 'm2',
        base_price: 8.5,
        price_min: 7,
        price_max: 11,
      },
      {
        code: 'PIN-003',
        name: 'Esmaltado al agua de puertas de paso / armarios',
        description: 'Lijado, imprimación y aplicación de 2 manos de esmalte laca sintético al agua en color blanco sobre puertas existentes.',
        unit: 'ud',
        base_price: 85,
        price_min: 70,
        price_max: 110,
      },
      {
        code: 'PIN-004',
        name: 'Tratamiento fijador antimoho y antihumedad en techos de baño',
        description: 'Limpieza química de manchas de moho, aplicación de fondo fijador e imprimación antimoho.',
        unit: 'm2',
        base_price: 12,
        price_min: 9.5,
        price_max: 15,
      },
    ],
  },
  {
    name: 'Carpintería de Madera y Cerrajería',
    services: [
      {
        code: 'CAR-001',
        name: 'Suministro e instalación de puerta de paso MDF lacada en blanco',
        description: 'Puerta de diseño moderno, tapajuntas de 7/9 cm, bisagras/pernios inox y manilla con condena en baño.',
        unit: 'ud',
        base_price: 240,
        price_min: 200,
        price_max: 290,
      },
      {
        code: 'CAR-002',
        name: 'Instalación de suelo laminado flotante AC5 (mano de obra + aislante)',
        description: 'Colocación de manta aislante de polietileno y montaje de tarima flotante sintética AC5 clase 33.',
        unit: 'm2',
        base_price: 13.5,
        price_min: 11,
        price_max: 17,
      },
      {
        code: 'CAR-003',
        name: 'Frente de armario empotrado corredero o abatible lacado',
        description: 'Fabricación e instalación de frente de armario lacado en blanco con perfiles de aluminio y tiradores embutidos.',
        unit: 'm2',
        base_price: 180,
        price_min: 150,
        price_max: 230,
      },
      {
        code: 'CAR-004',
        name: 'Revestimiento interior de armario en melamina con baldas y cajonera',
        description: 'Forrado de interior de armario empotrado con melamina de 16 mm, módulo de cajones y barra de colgar.',
        unit: 'm2',
        base_price: 140,
        price_min: 115,
        price_max: 170,
      },
    ],
  },
  {
    name: 'Climatización y Aire Acondicionado',
    services: [
      {
        code: 'CLI-001',
        name: 'Preinstalación de aire acondicionado por conductos en vivienda',
        description: 'Tirada de líneas de cobre frigorífico aislado, mangueras eléctricas de interconexión y tubo de desagüe anticondensación hasta 10 m.',
        unit: 'ud',
        base_price: 450,
        price_min: 380,
        price_max: 550,
      },
      {
        code: 'CLI-002',
        name: 'Instalación de equipo de aire acondicionado Split 1x1 (hasta 3 m)',
        description: 'Montaje de unidad interior y exterior, soportes de pared con silentblocks, paso de muro, abocardado y prueba de estanqueidad.',
        unit: 'ud',
        base_price: 220,
        price_min: 180,
        price_max: 270,
      },
      {
        code: 'CLI-003',
        name: 'Fabricación y montaje de red de conductos de fibra tipo Climaver',
        description: 'Conductos de lana de vidrio de alta densidad para distribución de aire en falso techo con rejillas de impulsión y retorno.',
        unit: 'ml',
        base_price: 38,
        price_min: 32,
        price_max: 46,
      },
    ],
  },
]
