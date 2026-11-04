# Directives Projet Housekeeping

## 1. Synchronisation Git Automatique (Règle Absolue)
- À la fin de chaque tâche, modification de code ou ajout de fonctionnalité, **effectuer systématiquement et automatiquement** :
  ```bash
  git add .
  git commit -m "<Description claire et concise des modifications>"
  git push origin main
  ```
- L'utilisateur n'a pas besoin de le demander : le dépôt GitHub distant doit être en permanence synchronisé et à jour.

## 2. Langues & Communication
- **Interface utilisateur (UI) :** Strictement en **français** (textes, boutons, statuts, messages système, infobulles).
- **Communication avec l'utilisateur :** En **italien**.

## 3. Fuseau Horaire
- Toutes les dates et heures affichées dans l'application (chat, ordres, tâches, logs) doivent utiliser explicitement le fuseau horaire suisse : **`Europe/Zurich`**.

## 4. Données & Base SQLite
- Ne jamais versionner les fichiers de base de données opérationnels (`data.db`, `data.db-wal`, `data.db-shm`) afin de protéger les données réelles locales.

## 5. Connectivité & IP Dynamique du Serveur
- En cas de problème de connexion, d'absence de synchronisation ou de messages semblant non reçus/lus par les tablettes d'Adélcia, **vérifier systématiquement l'adresse IP locale active du serveur PC** (`ipconfig` / `192.168.20.X`).
- L'IP étant attribuée dynamiquement par le routeur, les favoris ou raccourcis sur les tablettes peuvent pointer vers une ancienne IP et afficher une page hors ligne. Il est primordial de rappeler cette cause potentielle et de vérifier la cohérence des liens/raccourcis des tablettes.
