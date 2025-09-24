import fs from 'fs';
import path from 'path';

let parser = null;
let traverse = null;
try {
  const parserMod = await import('@babel/parser');
  parser = parserMod.default || parserMod;
  try {
    const traverseModule = await import('@babel/traverse');
    const candidates = [
      traverseModule?.default,
      traverseModule?.default?.default,
      traverseModule?.traverse,
      traverseModule,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'function') {
        traverse = candidate;
        break;
      }
    }
    if (!traverse) {
      console.warn(
        '[translations] Failed to load @babel/traverse; falling back to regex parsing: No traverse function export found.',
      );
      traverse = null;
      parser = null;
    }
  } catch (err) {
    console.warn(
      `[translations] Failed to load @babel/traverse; falling back to regex parsing: ${err.message}`,
    );
    parser = null;
  }
} catch (err) {
  console.warn(
    `[translations] Failed to load @babel/parser; falling back to regex parsing: ${err.message}`,
  );
  parser = null;
}

export function sortObj(o) {
  return Object.keys(o)
    .sort()
    .reduce((acc, k) => ((acc[k] = o[k]), acc), {});
}

const HANGUL_REGEX = /\p{Script=Hangul}/u;
const HIRAGANA_KATAKANA_REGEX = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_IDEOGRAPH_REGEX = /\p{Script=Han}/u;
const CYRILLIC_REGEX = /\p{Script=Cyrillic}/u;
const LATIN_REGEX = /\p{Script=Latin}/u;
const DIACRITIC_MARKS_REGEX = /[\u0300-\u036f]/g;
const SPANISH_DIACRITIC_REGEX = /[áéíóúüñÁÉÍÓÚÜÑ¡¿]/;
const GERMAN_DIACRITIC_REGEX = /[äöüßÄÖÜẞ]/;
const FRENCH_DIACRITIC_REGEX = /[àâæçéèêëîïôœùûüÿÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸ]/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
}

function normalizeForLatinHeuristics(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITIC_MARKS_REGEX, '');
}

function createKeywordMatchers(words = []) {
  const matchers = [];
  const seen = new Set();
  for (const rawWord of words) {
    if (typeof rawWord !== 'string') continue;
    const normalizedWord = normalizeForLatinHeuristics(rawWord);
    if (!normalizedWord || seen.has(normalizedWord)) continue;
    seen.add(normalizedWord);
    const escaped = escapeRegex(normalizedWord).replace(/\s+/g, '\\s+');
    matchers.push(new RegExp(`\\b${escaped}\\b`, 'i'));
  }
  return matchers;
}

const SPANISH_KEYWORDS = [
  'gracias',
  'hola',
  'usuario',
  'usuarios',
  'guardar',
  'guardado',
  'factura',
  'facturas',
  'cliente',
  'clientes',
  'proveedor',
  'proveedores',
  'cuenta',
  'cuentas',
  'pago',
  'pagos',
  'venta',
  'ventas',
  'compra',
  'compras',
  'configuracion',
  'configuraciones',
  'configurar',
  'buscar',
  'busqueda',
  'filtrar',
  'filtro',
  'cancelar',
  'aceptar',
  'aplicar',
  'numero',
  'numeros',
  'monto',
  'estado',
  'mensaje',
  'mensajes',
  'advertencia',
  'descargar',
  'cargar',
  'subir',
  'eliminar',
  'crear',
  'actualizar',
  'actualizado',
  'pendiente',
  'completo',
  'completado',
  'cerrar',
  'cerrado',
  'abrir',
  'abierto',
  'siguiente',
  'anterior',
  'regresar',
  'ingresar',
  'ingrese',
  'seleccionar',
  'seleccione',
  'opcion',
  'opciones',
  'detalles',
  'resumen',
  'facturacion',
  'impuesto',
  'impuestos',
  'descuento',
  'descuentos',
  'articulo',
  'articulos',
  'producto',
  'productos',
  'servicio',
  'servicios',
  'inventario',
  'almacen',
  'almacenes',
  'soporte',
  'ayuda',
  'comentario',
  'comentarios',
  'observaciones',
  'emitir',
  'emitido',
  'credito',
  'creditos',
  'debito',
  'debitos',
  'aprobado',
  'rechazado',
  'propietario',
  'administrador',
  'empleado',
  'empleados',
  'requerido',
  'obligatorio',
  'sincronizar',
  'moneda',
  'ingresos',
  'egresos',
  'adjunto',
  'adjuntos',
  'nota',
  'notas',
  'guardar cambios',
  'por favor',
  'bienvenido',
  'bienvenidos',
];

const FRENCH_KEYWORDS = [
  'bonjour',
  'merci',
  'utilisateur',
  'utilisateurs',
  'enregistrer',
  'sauvegarder',
  'facture',
  'factures',
  'client',
  'clients',
  'fournisseur',
  'fournisseurs',
  'compte',
  'comptes',
  'paiement',
  'paiements',
  'vente',
  'ventes',
  'achat',
  'achats',
  'parametre',
  'parametres',
  'parametrage',
  'recherche',
  'rechercher',
  'filtrer',
  'filtre',
  'annuler',
  'confirmer',
  'supprimer',
  'telecharger',
  'telechargement',
  'televersement',
  'montant',
  'date',
  'statut',
  'fermer',
  'ouvrir',
  'suivant',
  'precedent',
  'adresse',
  'courriel',
  'rapport',
  'rapports',
  'solde',
  'ajouter',
  'modifier',
  'mise a jour',
  'mettre a jour',
  'connexion',
  'deconnexion',
  'mot de passe',
  'facturation',
  'imprimer',
  'exporter',
  'importer',
  'details',
  'resume',
  'selectionner',
  'selectionnez',
  'valider',
  'erreur',
  'avertissement',
  'echoue',
  'echec',
  'reussi',
  'chargement',
  'traitement',
  'en cours',
  'parametrer',
  'reinitialiser',
  'reinitialisation',
  'prochaine',
  'precedente',
  'televerser',
  'sauvegarde',
];

const GERMAN_KEYWORDS = [
  'danke',
  'hallo',
  'speichern',
  'gespeichert',
  'rechnung',
  'rechnungen',
  'kunde',
  'kunden',
  'lieferant',
  'lieferanten',
  'konto',
  'konten',
  'zahlung',
  'zahlungen',
  'verkauf',
  'verkaeufe',
  'einkauf',
  'einkaeufe',
  'bericht',
  'berichte',
  'suchen',
  'suche',
  'filtern',
  'filter',
  'abbrechen',
  'bestaetigen',
  'bestatigen',
  'bestaetigung',
  'loschen',
  'loeschen',
  'hinzufugen',
  'hinzufuegen',
  'herunterladen',
  'hochladen',
  'betrag',
  'datum',
  'status',
  'schliessen',
  'offnen',
  'oeffnen',
  'zuruck',
  'zurueck',
  'weiter',
  'beschreibung',
  'adresse',
  'passwort',
  'anmelden',
  'abmelden',
  'benutzer',
  'rollen',
  'berechtigungen',
  'uberblick',
  'ueberblick',
  'einstellungen',
  'aktualisieren',
  'aktualisierung',
  'fehlgeschlagen',
  'erfolgreich',
  'genehmigt',
  'abgelehnt',
  'wartend',
  'rechnungsausgang',
  'rechnungseingang',
  'kundennummer',
  'bestellnummer',
  'auftragsnummer',
  'hinweis',
  'hinweise',
  'anhang',
  'anhaenge',
  'projekt',
  'projekte',
  'aufgabe',
  'aufgaben',
  'stunden',
  'arbeitszeit',
  'wochenende',
];

const ENGLISH_KEYWORDS = [
  'save',
  'saved',
  'cancel',
  'cancelled',
  'submit',
  'customer',
  'customers',
  'invoice',
  'invoices',
  'vendor',
  'vendors',
  'account',
  'accounts',
  'payment',
  'payments',
  'sale',
  'sales',
  'purchase',
  'purchases',
  'settings',
  'search',
  'filter',
  'filters',
  'download',
  'downloaded',
  'upload',
  'uploaded',
  'dashboard',
  'report',
  'reports',
  'balance',
  'amount',
  'due',
  'overdue',
  'quantity',
  'price',
  'unit',
  'item',
  'items',
  'tax',
  'discount',
  'shipping',
  'billing',
  'address',
  'addresses',
  'city',
  'state',
  'zip',
  'postal',
  'country',
  'email',
  'emails',
  'phone',
  'phones',
  'message',
  'messages',
  'note',
  'notes',
  'description',
  'descriptions',
  'attachment',
  'attachments',
  'approval',
  'approvals',
  'pending',
  'complete',
  'completed',
  'profile',
  'profiles',
  'user',
  'users',
  'role',
  'roles',
  'permission',
  'permissions',
  'login',
  'logout',
  'password',
  'username',
  'company',
  'companies',
  'department',
  'departments',
  'team',
  'teams',
  'project',
  'projects',
  'task',
  'tasks',
  'order',
  'orders',
  'quote',
  'quotes',
  'estimate',
  'estimates',
  'inventory',
  'warehouse',
  'warehouses',
  'value',
  'enter',
  'please',
  'error',
  'warning',
  'success',
  'failed',
  'failure',
  'retry',
  'apply',
  'next',
  'previous',
  'back',
  'continue',
  'open',
  'close',
  'confirm',
  'decline',
  'approved',
  'rejected',
  'update',
  'updates',
  'print',
  'export',
  'import',
  'summary',
  'details',
  'select',
  'selection',
  'choose',
  'option',
  'options',
  'terms',
  'conditions',
  'customer name',
  'purchase order',
  'billing address',
  'shipping address',
  'due date',
  'issue date',
  'created',
  'modified',
  'delete',
  'deleted',
  'remove',
  'removed',
  'clear',
  'reset',
  'refresh',
  'expand',
  'collapse',
  'allow',
  'allowed',
  'denied',
  'limit',
  'minimum',
  'maximum',
  'range',
  'list',
  'table',
  'chart',
  'graph',
  'map',
  'notification',
  'notifications',
  'reminder',
  'reminders',
  'schedule',
  'schedules',
  'calendar',
  'status',
  'loading',
  'processing',
  'start',
  'finish',
  'owner',
  'assignee',
  'security',
  'support',
  'contact',
  'help',
  'template',
  'templates',
  'document',
  'documents',
  'file',
  'files',
  'folder',
  'folders',
  'rename',
  'duplicate',
  'copy',
  'paste',
  'link',
  'links',
  'print preview',
  'analysis',
  'analytics',
  'performance',
  'target',
  'goal',
  'progress',
  'setup',
  'wizard',
  'guide',
  'instructions',
  'policy',
  'policies',
  'manager',
  'managers',
  'administrator',
  'administrators',
  'history',
  'activity',
  'profile settings',
  'password reset',
  'notification settings',
  'english',
  'overview',
  'insights',
  'select all',
  'deselect all',
  'yes',
  'ok',
  'connected',
  'disconnected',
];

const LANGUAGE_KEYWORD_MATCHERS = {
  es: createKeywordMatchers(SPANISH_KEYWORDS),
  de: createKeywordMatchers(GERMAN_KEYWORDS),
  fr: createKeywordMatchers(FRENCH_KEYWORDS),
  en: createKeywordMatchers(ENGLISH_KEYWORDS),
};

const SPANISH_PATTERN_MATCHERS = [
  /\b[a-z]+cion(?:es)?\b/i,
  /\b[a-z]+mente\b/i,
  /\b[a-z]+idad(?:es)?\b/i,
];

const GERMAN_PATTERN_MATCHERS = [
  /\b[a-z]+keit\b/i,
  /\b[a-z]+lich\b/i,
  /\b[a-z]+schaft\b/i,
];

const ENGLISH_PATTERN_MATCHERS = [
  /\bthe\b/i,
  /\band\b/i,
  /\bwith\b/i,
  /\bfor\b/i,
  /\bplease\b/i,
  /\benter\b/i,
  /\bselect\b/i,
  /\bchoose\b/i,
  /\bshould\b/i,
  /\bwould\b/i,
  /\b[a-z]{4,}ing\b/i,
  /\b[a-z]{4,}ed\b/i,
];

const LANGUAGE_HEURISTICS = [
  {
    lang: 'es',
    accentRegex: SPANISH_DIACRITIC_REGEX,
    accentScore: 5,
    keywordMatchers: LANGUAGE_KEYWORD_MATCHERS.es,
    patternMatchers: SPANISH_PATTERN_MATCHERS,
    minScore: 1,
  },
  {
    lang: 'de',
    accentRegex: GERMAN_DIACRITIC_REGEX,
    accentScore: 5,
    keywordMatchers: LANGUAGE_KEYWORD_MATCHERS.de,
    patternMatchers: GERMAN_PATTERN_MATCHERS,
    minScore: 1,
  },
  {
    lang: 'fr',
    accentRegex: FRENCH_DIACRITIC_REGEX,
    accentScore: 5,
    keywordMatchers: LANGUAGE_KEYWORD_MATCHERS.fr,
    patternMatchers: [],
    minScore: 1,
  },
  {
    lang: 'en',
    accentRegex: null,
    accentScore: 0,
    keywordMatchers: LANGUAGE_KEYWORD_MATCHERS.en,
    patternMatchers: ENGLISH_PATTERN_MATCHERS,
    minScore: 1,
    wordCountThreshold: { count: 3, minScore: 2 },
  },
];

const MONGOLIAN_EXTRA_CYRILLIC = new Set([0x0401, 0x0451, 0x04ae, 0x04af, 0x04e8, 0x04e9]);
const MONGOLIAN_SPECIFIC_CYRILLIC = new Set([0x04ae, 0x04af, 0x04e8, 0x04e9]);

const MONGOLIAN_POSITIVE_SEQUENCES = [
  ' САЙН ',
  ' БАЙН',
  ' БАЙХ',
  ' БАЙГ',
  ' БАЙГУ',
  ' АЖИЛ',
  ' АЖИГ',
  ' ХЭРЭГ',
  ' ХОЛБ',
  ' БАРИХ',
  ' ТОВЧ',
  ' ДАНС',
  ' ХАЯГ',
  ' МОНГОЛ',
  ' НЭГ ',
  ' ОЛОН ',
  ' ВЭ ',
  ' ГАРЫН',
  ' АВЛАГ',
  ' ТОХИРГ',
  ' ГҮЙЛ',
  ' ҮЙЛГ',
  ' ЛЭГЧ',
  ' ГЧИЙ',
  ' ЧИЙН',
  ' ЛГЭЭ',
  ' ЙЛГЭ',
  ' ГЭЭ ',
  ' ГЭЖ',
  ' ЗАХИ',
  ' АХИА',
  ' ХИАЛ',
  ' ЛБАР',
  ' УГАА',
  ' ГААР',
  ' ХЯМД',
  ' ОГНО',
  ' ЛЫН ',
  ' ИЙН ',
  ' ГУУЛ',
  ' УУЛЛ',
  ' УЛЛА',
  ' ТАЛБ',
  ' ТАЛХ',
  ' ХОЙЛ',
  ' ХИЙХ',
  ' ХИЙД',
  ' ХИЙЖ',
  ' АМЖИ',
  'ОМЖ',
  ' УТАС',
  ' МЭДЭ',
];

const MONGOLIAN_POSITIVE_BIGRAMS = new Set([
  'ЙЛ',
  'ТГ',
  'ГЧ',
  'МЖ',
  'ХЯ',
  'ЛБ',
  'ЛЭ',
  'ЙХ',
  'РХ',
  'НЭ',
  'ЭГ',
  'ЭН',
  'ЭР',
  'ЭХ',
  'СЭ',
  'УУ',
]);

function isAllowedMongolianCyrillicCodePoint(codePoint) {
  return (
    (codePoint >= 0x0410 && codePoint <= 0x044f) ||
    MONGOLIAN_EXTRA_CYRILLIC.has(codePoint)
  );
}

function isLikelyMongolianCyrillic(value) {
  if (typeof value !== 'string') return false;

  let hasCyrillic = false;
  let hasMongolianSpecificLetter = false;

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (typeof codePoint !== 'number') continue;
    if (codePoint >= 0x0400 && codePoint <= 0x04ff) {
      hasCyrillic = true;
      if (!isAllowedMongolianCyrillicCodePoint(codePoint)) {
        return false;
      }
      if (MONGOLIAN_SPECIFIC_CYRILLIC.has(codePoint)) {
        hasMongolianSpecificLetter = true;
      }
    }
  }

  if (!hasCyrillic) return false;
  if (hasMongolianSpecificLetter) return true;

  const normalized = value
    .toUpperCase()
    .replace(/[^\u0400-\u04FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return false;

  const padded = ` ${normalized} `;
  let signalScore = 0;

  const sequenceMatches = new Set();
  for (const seq of MONGOLIAN_POSITIVE_SEQUENCES) {
    if (padded.includes(seq)) {
      sequenceMatches.add(seq);
    }
  }
  if (sequenceMatches.size) {
    signalScore += sequenceMatches.size * 2;
  }

  const lettersOnly = normalized.replace(/\s+/g, '');
  const bigramMatches = new Set();
  for (let i = 0; i < lettersOnly.length - 1; i++) {
    const bigram = lettersOnly.slice(i, i + 2);
    if (MONGOLIAN_POSITIVE_BIGRAMS.has(bigram)) {
      bigramMatches.add(bigram);
    }
  }
  if (bigramMatches.size) {
    signalScore += Math.min(bigramMatches.size, 3);
  }

  return signalScore >= 2;
}

export function isValidMongolianCyrillic(value) {
  if (typeof value !== 'string') return true;
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (
      typeof codePoint === 'number' &&
      codePoint >= 0x0400 &&
      codePoint <= 0x04ff &&
      !isAllowedMongolianCyrillicCodePoint(codePoint)
    ) {
      return false;
    }
  }
  return true;
}

export function detectLang(str) {
  if (typeof str !== 'string') return undefined;
  if (HANGUL_REGEX.test(str)) return 'ko';
  if (HIRAGANA_KATAKANA_REGEX.test(str)) return 'ja';
  if (CJK_IDEOGRAPH_REGEX.test(str)) return 'cjk';
  if (CYRILLIC_REGEX.test(str)) {
    return isLikelyMongolianCyrillic(str) ? 'mn' : 'ru';
  }
  if (!LATIN_REGEX.test(str)) return undefined;

  const normalized = normalizeForLatinHeuristics(str);
  const wordMatches = normalized.match(/[a-z0-9]+/g);
  const wordCount = wordMatches ? wordMatches.length : 0;

  let bestLang = null;
  let bestScore = 0;

  for (const rule of LANGUAGE_HEURISTICS) {
    const {
      lang,
      accentRegex,
      accentScore = 0,
      keywordMatchers = [],
      patternMatchers = [],
      minScore = 1,
      wordCountThreshold,
    } = rule;

    let score = 0;
    if (accentRegex && accentRegex.test(str)) {
      score += accentScore;
    }
    for (const matcher of keywordMatchers) {
      if (matcher.test(normalized)) score++;
    }
    for (const matcher of patternMatchers) {
      if (matcher.test(normalized)) score++;
    }

    let threshold = minScore;
    if (
      wordCountThreshold &&
      typeof wordCountThreshold.count === 'number' &&
      wordCount >= wordCountThreshold.count
    ) {
      threshold = Math.max(threshold, wordCountThreshold.minScore ?? threshold);
    }

    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  if (bestLang) return bestLang;

  return 'latin';
}

function defaultModuleResolver(rootDir, filePath) {
  if (!filePath) return '';
  const rel = path.relative(rootDir, filePath);
  if (!rel) return '';
  const normalized = rel.split(path.sep).join('/');
  return normalized.replace(/\.[^.]+$/, '');
}

export function collectPhrasesFromPages(dir, options = {}) {
  const { moduleResolver } = options;
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  }
  walk(dir);
  const pairs = [];
  const uiTags = new Set(['button', 'label', 'option']);
  const seen = new Set();
  const addPairFactory = (moduleId) => (key, text, context = '') => {
    if (key == null || text == null) return;
    const normalized = `${key}:::${text}:::${moduleId ?? ''}:::${context ?? ''}`;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    pairs.push({
      key,
      text,
      module: moduleId ?? '',
      context: context ?? '',
    });
  };
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const moduleId =
      typeof moduleResolver === 'function'
        ? moduleResolver({ file, dir })
        : defaultModuleResolver(dir, file);
    const addPair = addPairFactory(moduleId);
    if (parser && traverse) {
      let ast;
      try {
        ast = parser.parse(content, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript', 'classProperties', 'dynamicImport'],
        });
      } catch (err) {
        console.warn(`[translations] Failed to parse ${file}: ${err.message}`);
        continue;
      }
      traverse(ast, {
        CallExpression(path) {
          const callee = path.get('callee');
          if (callee.isIdentifier({ name: 't' })) {
            const args = path.get('arguments');
            if (args.length >= 1 && args[0].isStringLiteral()) {
              const key = args[0].node.value;
              const text =
                args.length > 1 && args[1].isStringLiteral()
                  ? args[1].node.value
                  : key;
              addPair(key, text, 'translation_call');
            }
          }
        },
        JSXElement(path) {
          const namePath = path.get('openingElement.name');
          if (!namePath.isJSXIdentifier()) return;
          const tag = namePath.node.name;
          if (!uiTags.has(tag)) return;
          for (const child of path.get('children')) {
            if (child.isJSXText()) {
              const val = child.node.value.trim();
              if (val) addPair(val, val, tag);
            } else if (child.isJSXExpressionContainer()) {
              const expr = child.get('expression');
              if (expr.isStringLiteral()) {
                const val = expr.node.value.trim();
                if (val) addPair(val, val, tag);
              }
            }
          }
        },
      });
      continue;
    }

    const tagRegex = /<(button|label|option)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(content))) {
      const raw = match[2].replace(/<[^>]*>/g, '').trim();
      if (raw) addPair(raw, raw, match[1]);
    }
    const callRegex = /t\(\s*['"]([^'"\\]+)['"](?:\s*,\s*['"]([^'"\\]+)['"])?/gi;
    while ((match = callRegex.exec(content))) {
      const key = match[1];
      const text = match[2] ?? match[1];
      addPair(key, text, 'translation_call');
    }
  }
  return pairs;
}

export async function fetchModules() {
  try {
    const db = await import('../../db/index.js');
    try {
      const [rows] = await db.pool.query(
        'SELECT module_key AS moduleKey, label FROM modules',
      );
      return rows.map((r) => ({ moduleKey: r.moduleKey, label: r.label }));
    } catch (err) {
      console.warn(
        `[translations] DB query failed; falling back to defaults: ${err.message}`,
      );
    }
  } catch (err) {
    console.warn(
      `[translations] Failed to load DB modules; falling back: ${err.message}`,
    );
  }
  const fallback = await import('../../db/defaultModules.js');
  return fallback.default.map(({ moduleKey, label }) => ({ moduleKey, label }));
}
