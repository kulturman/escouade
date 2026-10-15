# Dictée vocale des prompts — design

## But

Dicter un prompt au lieu de le taper (issue GitHub #8, ticket ESC-96 de `docs/TODO-1.8.md`). On clique sur le micro ou on presse `Ctrl+Shift+M`, on parle, on reclique : le texte transcrit s'insère au curseur du compositeur, ou se colle dans le terminal en vue Claude Code. Il ne part jamais seul : on le relit, on le corrige, on envoie.

Choix déjà actés dans le TODO : micro capté côté Rust avec `cpal` (pas dans la webview : les trois webviews se comportent différemment et leur reconnaissance vocale n'est pas fiable) ; transcription en local par Whisper (`whisper-rs`), modèle téléchargé à la demande. Rien ne part en ligne, sauf le téléchargement du modèle.

Points laissés ouverts par le TODO, tranchés le 2026-10-15 :
- bascule (un clic démarre, un clic arrête), pas « appuyer pour parler » : plus simple à la souris, et le raccourci fait de même ;
- raccourci `Ctrl+Shift+M` (`⌘⇧M` sous macOS) ;
- modèle par défaut `small-q5_1` (190 Mo) : mesuré le 2026-10-15 sur un prompt français de 8 s (voix de synthèse, Mac Apple Silicon), `base` (148 Mo) transcrit en 0,6 s mais se trompe (« le composant composait un serre le texte »), `small-q5_1` en 1,4 s et juste (« le composant composé insère le texte ») ;
- service de transcription en ligne : plus tard, dans un autre ticket ;
- formulaire des tickets du Kanban : plus tard, dans un autre ticket. Cette version couvre le compositeur et la vue Claude Code.

Hors sujet : le mode conversation vocale (ESC-97 : synthèse Piper, envoi après un silence).

## Ce que voit l'utilisateur

### Compositeur

- Un bouton micro entre le trombone et « Envoyer » (`Composer.svelte`, barre sous le champ). Infobulle : « Dicter (Ctrl+Shift+M) ». En colonne étroite (`tight`), il garde son icône comme le trombone.
- Pendant l'écoute : le bouton passe au rouge, une petite jauge montre le niveau du micro, l'infobulle dit « Arrêter et transcrire ». `Échap` dans le champ annule la dictée (rien n'est inséré) au lieu d'interrompre Claude ; une fois la dictée finie ou annulée, `Échap` retrouve son rôle.
- Pendant la transcription : le bouton montre un spinner et n'est pas cliquable ; le reste du compositeur reste utilisable.
- Le texte est inséré à la place de la sélection (ou au curseur), avec une espace avant s'il suit un caractère qui n'en est pas une, puis le curseur se place après lui. Un texte vide (silence) n'insère rien et affiche un toast « Rien entendu ».
- Si on a changé d'agent entre le début de la dictée et la fin de la transcription, le texte va quand même à l'agent de départ : ajouté à la fin de son brouillon (`drafts.ts`), comme `addFiles` le fait pour les fichiers lus pendant un changement d'agent.

### Vue Claude Code

- Un bouton micro dans l'en-tête de l'agent, à côté du bouton de changement de vue (`Conversation.svelte`), visible seulement en vue Claude Code. Même raccourci.
- Pendant l'écoute, un petit indicateur flotte en bas à droite du terminal : point rouge, jauge, « Ctrl+Shift+M pour arrêter ». `Échap` ne l'annule pas (il appartient au terminal) ; un second clic sur le bouton ou le raccourci arrête.
- Le texte est collé dans le terminal par `term.paste()` (xterm l'encadre en bracketed paste) ; il n'est pas validé (pas d'Entrée).

### Raccourci

`Ctrl+Shift+M` démarre ou arrête la dictée pour l'agent affiché, quelle que soit sa vue. Ajouté à `handleShortcut` et à `isAppShortcut` (`src/lib/shortcuts.ts`) pour qu'il marche aussi quand le terminal a le focus. Sans agent affiché (vue d'ensemble, Kanban, statistiques…), il ne fait rien.

### Premier usage

Sans modèle installé, le premier clic ouvre une fenêtre :

> **Dictée vocale**
> La transcription se fait sur ta machine : ni le son ni le texte ne partent en ligne. Elle a besoin d'un modèle de reconnaissance de la parole, à télécharger une fois. Choisis-le :
> ○ Tiny · 78 Mo — le plus rapide, se trompe souvent
> ○ Base · 148 Mo — rapide, approximatif
> ● Small · 190 Mo — **recommandé** : juste et rapide
> ○ Large turbo · 574 Mo — le plus juste, pour une machine puissante
> Tu pourras en changer dans Réglages › Application › Dictée.
> [Télécharger et dicter]  [Annuler]

- La liste est celle du catalogue, dans l'ordre de taille ; le modèle du réglage `voiceModel` est présélectionné (`small-q5_1` par défaut), et « recommandé » marque toujours `small-q5_1`. Un modèle déjà installé dit « Installé » et ne se retélécharge pas : le choisir enregistre le réglage et démarre l'écoute.
- « Télécharger et dicter » enregistre le choix dans `voiceModel`, puis télécharge. Pendant le téléchargement : la liste est grisée, barre de progression (Mo reçus / total), « Annuler » (qui garde le choix). À la fin, la fenêtre se ferme et l'écoute démarre seule. Une erreur (réseau, somme de contrôle) s'affiche dans la fenêtre avec « Réessayer » ; on peut alors choisir un autre modèle.
- La fenêtre s'ouvre chaque fois que le modèle choisi n'est pas installé (premier usage, ou modèle supprimé, ou réglage changé vers un modèle absent).

### Réglages › Application › groupe « Dictée »

- **Modèle** : une ligne par modèle du catalogue avec son nom, sa taille, la même phrase que dans la fenêtre du premier usage (« le plus rapide, se trompe souvent » … « le plus juste, pour une machine puissante ») et son état : « Télécharger », la progression, « Installé · Supprimer ». Un bouton radio par ligne choisit le modèle utilisé, installé ou non : s'il ne l'est pas, la prochaine dictée ouvre la fenêtre de premier usage pour lui. Supprimer le modèle choisi ne change pas le choix.
- **Langue parlée** : « Langue de l'interface » (défaut), « Détection automatique », puis une liste fermée (français, anglais, espagnol, allemand, italien, portugais, néerlandais). La détection automatique se trompe plus souvent sur un prompt court : la note du réglage le dit.

### Erreurs

| Cas | Ce que voit l'utilisateur |
|---|---|
| Aucun micro | toast « Aucun micro trouvé » |
| Micro refusé (macOS : cpal reçoit des zéros purs ; au-delà d'1 s de zéros exacts) | l'écoute s'arrête ; toast « Escouade n'a pas accès au micro » avec, sous macOS, « Ouvrir les réglages » vers Confidentialité › Micro |
| Micro débranché pendant l'écoute | l'écoute s'arrête, ce qui a été capté est transcrit |
| Écoute de plus de 5 minutes | arrêt automatique et transcription, toast « Dictée arrêtée au bout de 5 minutes » |
| Modèle corrompu ou illisible | toast d'erreur ; le fichier est supprimé, le prochain clic repropose le téléchargement |
| Dictée déjà en cours ailleurs | le clic arrête celle en cours (un seul micro) |

## Backend (Rust)

Nouveau module `src-tauri/src/voice/` :

### `models.rs` — catalogue et téléchargement

Catalogue figé (URL `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/<fichier>`), tailles et SHA-256 relevés le 2026-10-15 dans l'API de Hugging Face :

| Id | Fichier | Octets | SHA-256 |
|---|---|---|---|
| `tiny` | `ggml-tiny.bin` | 77 691 713 | `be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21` |
| `base` | `ggml-base.bin` | 147 951 465 | `60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe` |
| `small-q5_1` (défaut) | `ggml-small-q5_1.bin` | 190 085 487 | `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb` |
| `large-v3-turbo-q5_0` | `ggml-large-v3-turbo-q5_0.bin` | 574 041 195 | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` |

- Fichiers dans `<dossier de données>/voice/` (`DataDir::voice_dir()`), donc sous `ESCOUADE_DATA_DIR` en développement et en test. L'adresse de base se remplace par `ESCOUADE_VOICE_MODELS_URL` (tests).
- Téléchargement par `usage::download_client(settings)` : le proxy des réglages comme `http_client`, mais sans sa limite de 15 s sur toute la requête (seulement 15 s pour se connecter et 30 s de silence du serveur) ; le corps est lu morceau par morceau (`Response::chunk()`, sans la feature `stream`) vers `<fichier>.part`, SHA-256 calculé au fil de l'eau (`sha2`, déjà là). Somme ou taille fausse : `.part` supprimé, erreur. Juste : renommé en `<fichier>`. Progression (octets reçus, total) sur un `Channel` au plus 10 fois par seconde. Annulable ; l'annulation supprime le `.part`. Un seul téléchargement à la fois par modèle.
- Un modèle installé = son fichier final présent avec la bonne taille (la somme n'est recalculée qu'au téléchargement).

### `audio.rs` — traitement du signal (fonctions pures)

- `to_mono(samples, channels)` : moyenne des canaux.
- `resample(samples, from_hz) -> Vec<f32>` vers 16 kHz : filtre passe-bas (moyenne glissante sur la fenêtre de décimation) puis interpolation linéaire. Suffisant pour la parole ; couvre 48 kHz, 44,1 kHz, 32 kHz, 16 kHz (identité), 8 kHz.
- `level(chunk) -> f32` : RMS ramené entre 0 et 1 (échelle en dB, -60 dB → 0) pour la jauge.
- `is_silent(samples)` : RMS global sous un seuil (-50 dB) → silence. `is_muted(samples)` : plus d'1 s de zéros exacts consécutifs au début → micro refusé.

### `capture.rs` — micro

- `cpal::default_host().default_input_device()`, `default_input_config()`, flux construit pour son format (`F32`, `I16`, `I32`… convertis en `f32` par `FromSample`), puis `play()` (cpal 0.18 rend les flux en pause).
- Le flux cpal ne change pas de fil : il vit dans un fil dédié qui le crée, reçoit les ordres (arrêter, annuler) par un canal et rend les échantillons à la fin. Le rappel audio ne fait que copier ses échantillons vers ce fil, qui les réduit en mono, mesure le niveau et s'arrête à 5 minutes.
- Le niveau part vers la fenêtre sur un `Channel<f32>` environ 20 fois par seconde.
- Une seule capture à la fois (état global dans `Core`).

### `transcribe.rs` — Whisper

- `WhisperContext` chargé à la première transcription et gardé ; libéré après 5 minutes sans dictée (minuteur Tokio) ou quand le modèle choisi change. Environ 300 Mo de mémoire pour `small-q5_1` pendant qu'il est chargé.
- Transcription dans `spawn_blocking`. Paramètres : `Greedy { best_of: 1 }`, langue du réglage (`None` pour la détection automatique), `n_threads` = cœurs logiques (`available_parallelism`) bornés à 8, impressions coupées, `suppress_blank`, `no_speech_thold` à 0,6.
- Garde-fous contre les phrases que Whisper invente sur un silence (« Sous-titres réalisés par la communauté d'Amara.org », « Merci d'avoir regardé ») : un enregistrement `is_silent` n'est pas transcrit et rend un texte vide ; le texte rendu est `clean_text` : segments mis bout à bout, espaces normalisées, rognés, marques entre crochets ou parenthèses seules (`[Musique]`, `(silence)`) retirées.

### Commandes Tauri (`commands.rs`, `lib.rs`)

| Commande | Effet |
|---|---|
| `voice_models()` | catalogue avec l'état de chaque modèle (installé ou non) |
| `voice_download(model, on_progress: Channel)` | télécharge ; rend quand c'est fini ou en erreur |
| `voice_cancel_download(model)` | annule |
| `voice_delete_model(model)` | supprime le fichier (et décharge le modèle s'il était chargé) |
| `voice_start(on_level: Channel)` | ouvre le micro ; erreur si aucun micro |
| `voice_stop()` | arrête, transcrit, rend le texte nettoyé (vide si silence) |
| `voice_cancel()` | arrête sans transcrire |
| `voice_open_privacy()` | macOS : ouvre Réglages Système › Confidentialité › Micro (le plugin opener n'autorise que http, https, mailto et tel) ; ailleurs, rien |

### Réglages (`model.rs` `Settings`, `types.ts`)

- `voiceModel: String`, défaut `"small-q5_1"`.
- `voiceLanguage: String`, défaut `"ui"` (langue de l'interface) ; `"auto"` ou un code ISO 639-1 de la liste fermée.

## Front

- `src/lib/voice.svelte.ts` : la machine d'états unique `idle → (downloading) → recording(level) → transcribing → idle`, plus `error`. Retient la cible fixée au démarrage : `{ kind: 'composer', agentId }` ou `{ kind: 'terminal', agentId }`. Expose `toggle(target)`, `cancel()`, et l'état pour les boutons.
- Insertion : pour le compositeur, un rappel enregistré par le `Composer` monté (`registerInsert(agentId, fn)`) insère au curseur ; s'il n'est pas monté pour cet agent, ajout à la fin du brouillon (`getDraft` / `setDraft`). Pour le terminal, `getXTerm(id)?.paste(text)` (`src/lib/terminals.ts`).
- `src/lib/ipc.ts` : les sept appels. `src/test/ipc.ts` : `SETTINGS` complété.
- `VoiceSetupModal.svelte` (premier usage), groupe « Dictée » dans `ApplicationTab.svelte`, `SETTINGS_OF` complété.
- Textes dans `src/lib/i18n/{fr,en}/` (zones `composer`, `settings`, et une zone `voice` pour la fenêtre et les toasts). Termes ajoutés à `GLOSSARY.md` : dictée / dictation, modèle de reconnaissance / speech model.

## Plateformes, build et CI

- macOS : `NSMicrophoneUsageDescription` dans `src-tauri/Info.plist`, en anglais (« Escouade uses the microphone to dictate prompts; the sound is transcribed on your Mac. »), et sa traduction française dans `src-tauri/macos/fr.lproj/InfoPlist.strings`, copié dans `Contents/Resources/fr.lproj/` par `bundle.macOS.files` (le dépôt n'a pas encore de `.lproj` ; `CFBundleLocalizations` déclare déjà `en` et `fr`) ; fichier `src-tauri/Entitlements.plist` avec `com.apple.security.device.audio-input`, référencé par `bundle.macOS.entitlements` dans `tauri.macos.conf.json` (sans lui, l'app notarisée avec le runtime durci n'a pas le micro). En développement, l'autorisation est demandée pour le terminal qui lance `tauri dev`.
- Linux : `libasound2-dev` ajouté aux `apt-get install` de `ci.yml` et `release.yml`. cmake est déjà sur les runners.
- Windows : rien à ajouter a priori (cmake, MSVC et LLVM sont sur `windows-latest`) ; la CI le confirme.
- macOS universel : whisper.cpp compile pour `aarch64` et `x86_64-apple-darwin` (essayé le 2026-10-15 : 42 s et 31 s en release). Le binaire grossit d'environ 1,5 Mo.
- Pas de feature Cargo : `tauri dev` compile avec `--no-default-features`, une feature par défaut y serait absente ; la dictée est toujours compilée.
- Dépendances : `whisper-rs = "0.16"` avec la feature `log_backend` (ses messages vont dans `app.log` ; licence Unlicense), `cpal = "0.18"` (Apache-2.0). Compatibles avec la GPL-3.0-or-later d'Escouade. Les modèles Whisper sont sous licence MIT (OpenAI).

## Vie privée

Le son reste en mémoire le temps de la transcription, n'est jamais écrit sur le disque ni envoyé. Seul le téléchargement du modèle sort, vers Hugging Face. Rien n'est collecté par l'éditeur d'Escouade : `docs/registre-rgpd.md` ne change pas. Aucun événement de télémétrie ajouté.

## Tests

- Rust (un `#[cfg(test)] mod tests` dans chaque fichier de `voice/`, comme la plupart des modules) :
  - `to_mono`, `resample` (48 kHz et 44,1 kHz → 16 kHz : longueur attendue, une sinusoïde de 440 Hz garde sa fréquence), `level`, `is_silent`, `is_muted` ;
  - `clean_text` (espaces, marques `[Musique]`, segments vides) ;
  - catalogue : ids uniques, défaut présent, sommes en hexadécimal de 64 caractères ;
  - téléchargement contre un serveur HTTP local (`tokio`) : fichier juste → installé ; somme fausse → `.part` supprimé et erreur ; annulation → `.part` supprimé ; progression croissante jusqu'au total.
  - La capture (cpal) et la transcription (Whisper) ne sont pas testées en CI : pas de micro sur les runners, modèle trop lourd.
- Front (Vitest, `fakeBackend`) :
  - `voice.svelte.ts` : enchaînement des états, modèle absent → fenêtre de premier usage, erreurs, annulation, une seule dictée à la fois ;
  - fenêtre de premier usage : les 4 modèles, le réglage présélectionné, « recommandé » sur `small-q5_1`, le choix enregistré dans `voiceModel` avant le téléchargement, un modèle déjà installé qui démarre l'écoute sans téléchargement, la liste grisée pendant le téléchargement, « Réessayer » après une erreur ;
  - `Composer` : bouton, jauge, insertion au curseur et à la place de la sélection, espace ajoutée, `Échap` qui annule la dictée, changement d'agent → brouillon de l'agent de départ ;
  - vue Claude Code : `paste` sur le terminal de l'agent ;
  - `shortcuts.test.ts` : `Ctrl+Shift+M` (et `⌘⇧M`), présent dans `isAppShortcut` ;
  - groupe « Dictée » des réglages, textes en anglais.
- À la main, sous macOS avec un vrai micro : dictée en français et en anglais, premier usage avec téléchargement, micro refusé, changement d'agent pendant la transcription, vue Claude Code. La PR dit ce qui n'a pas été essayé sous Windows et Linux.

## Documentation

- `CHANGELOG.md` (« Non publié › Ajouts »), `docs/SPEC.md` (compositeur, vue Claude Code, réglages, raccourcis), `docs/TODO-1.8.md` (ESC-96 coché, avec ce qui a été essayé), README (une ligne dans « Chat natif », le raccourci, `voice/` dans « Données locales »).
- Site, en français et en anglais : `chat.md`, `claude-code-view.md`, `shortcuts.md`, la page des réglages de l'application.
