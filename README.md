# 🏨 Housekeeping Manager

Système interne et temps réel de communication et gestion hôtelière (Gouvernante / Housekeeping).

## 🚀 Fonctionnalités Principales

1. **💬 Discussion en Direct (Chat)**
   - Messagerie bidirectionnelle instantanée (Roberto ↔ Adélcia) via Socket.io.
   - Envoi de texte, photos, mémos vocaux et émoticônes grand format.
   - Citations de messages, horodatage au fuseau horaire suisse (`Europe/Zurich`).
   - Alertes sonores différenciées.

2. **📋 Ordres de Service**
   - Création et attribution d'ordres prioritaires (`Normal`, `Urgent`, `Urgence`).
   - Signal visuel clignotant en temps réel lors de l'arrivée d'un nouvel ordre.
   - Filtres par statut (`Actifs`, `En Attente`, `En Cours`, `Terminés`, `Archives`).

3. **🛏️ Planning des Chambres**
   - Suivi quotidien des 5 chambres (statuts : `libera`, `in_corso`, `completata`, `restante`, `partenza`, etc.).
   - Navigation temporelle (Hier / Aujourd'hui / Demain / Sélecteur de date).

4. **⏰ Échéances & Liste de Tâches**
   - Suivi des tâches récurrentes (quotidiennes, hebdomadaires) ou ponctuelles.
   - Filtres par échéance et archivage des tâches terminées.

5. **🛒 Achats & Courses**
   - Catalogue de produits d'entretien et fournitures hôtelières avec tri alphabétique.
   - Gestion complète (ajout, modification, suppression).
   - Sélection avec zone de consignes/notes et envoi formaté direct dans le chat.

## 🛠️ Technologies

- **Backend :** Node.js, Express, Socket.io, SQLite3 intégré (Node native sqlite).
- **Frontend :** Vanilla HTML5, CSS3, JavaScript moderne (PWA avec Service Worker et mode hors-ligne).

## 💻 Démarrage Rapide

```bash
# Installation des dépendances
npm install

# Démarrage du serveur
node server.js
```

Par défaut, l'application est accessible sur le port `8765` :
- **PC Roberto :** `http://localhost:8765/?user=Roberto`
- **Tablette Adélcia :** `http://<IP_LOCALE>:8765/?user=Adelcia`
