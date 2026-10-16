import type { Tree } from '../types';

// The dictation: the microphone button, the first use's window, its toasts, its settings.
export default {
  button: {
    start: 'Dicter ({key})',
    stop: 'Arrêter et transcrire ({key})',
    transcribing: 'Transcription…',
  },
  overlay: {
    listening: 'Dictée en cours · {key} pour arrêter',
    transcribing: 'Transcription…',
  },
  nothingHeard: 'Rien entendu',
  limit: 'Dictée arrêtée au bout de 5 minutes',
  muted: 'Escouade n’a pas accès au micro',
  openPrivacy: 'Ouvrir les réglages',
  copied: 'Le terminal est fermé : le texte dicté est dans le presse-papiers',
  model: {
    tiny: { name: 'Tiny', desc: 'le plus rapide, se trompe souvent' },
    base: { name: 'Base', desc: 'rapide, approximatif' },
    small: { name: 'Small', desc: 'juste et rapide' },
    largeTurbo: { name: 'Large turbo', desc: 'le plus juste, pour une machine puissante' },
    recommended: 'recommandé',
    installed: 'Installé',
  },
  setup: {
    title: 'Dictée vocale',
    body: 'La transcription se fait sur ta machine : ni le son ni le texte ne partent en ligne. Elle a besoin d’un modèle de reconnaissance de la parole, à télécharger une fois. Choisis-le :',
    later: 'Tu pourras en changer dans Réglages › Application › Dictée.',
    download: 'Télécharger et dicter',
    dictate: 'Dicter',
    retry: 'Réessayer',
    progress: '{received} sur {total}',
  },
  settings: {
    group: 'Dictée',
    note: 'Le micro est transcrit sur ta machine par Whisper ; rien ne part en ligne.',
    model: 'Modèle',
    modelDesc: 'Plus il est gros, plus il est juste et lent. Celui choisi est téléchargé à la première dictée s’il manque.',
    download: 'Télécharger',
    delete: 'Supprimer',
    cancel: 'Annuler',
    language: 'Langue parlée',
    languageDesc: 'La détection automatique se trompe plus souvent sur un prompt court.',
    languages: {
      ui: 'Langue de l’interface',
      auto: 'Détection automatique',
      fr: 'Français',
      en: 'Anglais',
      es: 'Espagnol',
      de: 'Allemand',
      it: 'Italien',
      pt: 'Portugais',
      nl: 'Néerlandais',
    },
  },
} as const satisfies Tree;
